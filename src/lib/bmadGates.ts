/**
 * QA gate files, from `{qaLocation}/gates/`.
 *
 * BMAD's qa-gate-tmpl: a flat YAML document whose `gate:` key carries one of
 * four verdicts. This is the evidence that decides Done, so a gate it cannot
 * read is reported rather than ignored — silently dropping one would let a
 * story claim Done with nothing behind it, which is the single thing the board
 * exists to prevent.
 */
export type GateVerdict = "PASS" | "CONCERNS" | "FAIL" | "WAIVED";

const VERDICTS: GateVerdict[] = ["PASS", "CONCERNS", "FAIL", "WAIVED"];

export interface Gate {
  file: string;
  storyId: string;
  /** Null when absent or unrecognised; `error` then says why. */
  verdict: GateVerdict | null;
  reason: string;
  waived: boolean;
  /** ISO timestamp from the file, or "" — used to break ties between gates. */
  updated: string;
  error: string | null;
}

/**
 * The scalar after `key:`, with a trailing comment removed and quotes stripped.
 *
 * Order matters, and getting it wrong is not a near miss. The shipped
 * `qa-gate-tmpl.yaml` writes `gate: "PASS" # PASS|CONCERNS|FAIL|WAIVED`;
 * stripping quotes first leaves `PASS"`, the verdict is rejected, and every
 * story renders as claimed — the exact inverse of what this file is for. A `#`
 * inside the quotes is content, not a comment: QA reasons cite `AC #3`.
 */
function topLevel(yaml: string, key: string): string | null {
  // [^\S\n] is "whitespace that is not a newline". \s* here matched the line
  // break, so `status_reason:` with no value captured the NEXT line as its
  // value - and an empty `gate:` produced a verdict made of the line below it.
  const m = new RegExp(`^${key}:[^\\S\\n]*(.*)$`, "m").exec(yaml);
  if (!m) return null;
  const raw = m[1].trim();

  // Walk the value so a # inside quotes is kept and one outside ends it.
  let quote: string | null = null;
  let end = raw.length;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#") {
      end = i;
      break;
    }
  }
  return raw.slice(0, end).trim().replace(/^(["'])(.*)\1$/, "$2");
}

/**
 * "2.1-ledger-write-path.yml" -> "2.1" (v4); "1.6a.yml" -> "1.6a" (a v6 ref).
 *
 * A v6 ticket id may carry letters (`6a`, a ticket split off `6`). Stopping at
 * the digits read `1.6a.yml` as "1.6", crediting 1.6a's verdict to 1.6 — a
 * done 1.6 then rendered verified on someone else's evidence.
 *
 * The name alone cannot tell the two apart: a v6 id is any letters and digits,
 * so `2.1slug` could be a v4 story with its slug or a v6 ref. The directory
 * can. ADE's `.ade/gates/` holds only v6 verdicts, named by ref (a ref never
 * contains `-`, so a slug after one is dropped); anywhere else is v4, read up
 * to the digits exactly as v4 always was.
 */
function idFromFilename(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  const stem = base.replace(/\.ya?ml$/, "");
  if (/(^|\/)\.ade\/gates\/[^/]+$/.test(file)) return stem.split("-")[0];
  return /^(\d+\.\d+)/.exec(base)?.[1] ?? stem;
}

/**
 * Whether an active waiver applies to this gate.
 *
 * BMAD documents two forms: inline (`waiver: { active: true }`, the template)
 * and block (`waiver:` then an indented `active: true`, tasks/qa-gate.md).
 *
 * The block form must be read within its own indentation. Scanning ahead for
 * any later `active: true` matches the template's own `when_waived: |` example,
 * which marks a PASS gate as waived.
 */
function isWaived(yaml: string): boolean {
  const lines = yaml.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const inline = /^waiver:[^\S\n]*\{([^}]*)\}/.exec(lines[i]);
    if (inline) return /\bactive:\s*true\b/.test(inline[1]);

    if (!/^waiver:[^\S\n]*$/.test(lines[i])) continue;
    // Consume only the lines indented under this key.
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === "") continue;
      if (!/^\s/.test(line)) break;
      if (/^\s+active:[^\S\n]*true\s*$/.test(line)) return true;
      // A nested block (`when_waived: |`) opens a deeper scope that is an
      // example, not this waiver.
      if (/^\s+\w[\w-]*:[^\S\n]*[|>]\s*$/.test(line)) break;
    }
    return false;
  }
  return false;
}

export function parseGate(file: string, yaml: string): Gate {
  const raw = topLevel(yaml, "gate");
  const verdict = raw && VERDICTS.includes(raw as GateVerdict) ? (raw as GateVerdict) : null;

  let error: string | null = null;
  if (raw === null) error = "no gate: key in this file";
  else if (verdict === null) error = `unrecognised gate verdict "${raw}"`;

  return {
    file,
    storyId: topLevel(yaml, "story") || idFromFilename(file),
    verdict,
    reason: topLevel(yaml, "status_reason") ?? "",
    waived: isWaived(yaml),
    updated: topLevel(yaml, "updated") ?? "",
    error,
  };
}

/**
 * The gate for a story, newest first.
 *
 * A story renamed after review leaves a stale gate beside the current one, both
 * carrying the same story id. Taking whichever came first in the array makes
 * the verdict depend on directory listing order, so a superseded PASS can
 * outrank a later FAIL. `updated` decides; files without it sort oldest.
 */
/** Least-believing first: a verdict we should doubt outranks one we should not. */
const CAUTION: Record<string, number> = { FAIL: 0, CONCERNS: 1, WAIVED: 2, PASS: 3 };
const caution = (g: Gate) => (g.verdict ? CAUTION[g.verdict] : -1);

export function gateFor(storyId: string, gates: Gate[]): Gate | undefined {
  const matches = gates.filter((g) => g.storyId === storyId);
  if (matches.length <= 1) return matches[0];

  return [...matches].sort((a, b) => {
    // Both timestamped: the newer one supersedes.
    if (a.updated && b.updated && a.updated !== b.updated) {
      return a.updated < b.updated ? 1 : -1;
    }
    // Otherwise there is no ordering to trust. Treating a missing timestamp as
    // "older" let a stale PASS outrank a current FAIL, which is the dangerous
    // direction: believing a pass. Prefer the verdict that doubts.
    if (caution(a) !== caution(b)) return caution(a) - caution(b);
    return a.file.localeCompare(b.file);
  })[0];
}

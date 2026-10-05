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
  const m = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(yaml);
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

/** "2.1-ledger-write-path.yml" -> "2.1" */
function idFromFilename(file: string): string {
  const base = file.slice(file.lastIndexOf("/") + 1);
  return /^(\d+\.\d+)/.exec(base)?.[1] ?? base.replace(/\.ya?ml$/, "");
}

export function parseGate(file: string, yaml: string): Gate {
  const raw = topLevel(yaml, "gate");
  const verdict = raw && VERDICTS.includes(raw as GateVerdict) ? (raw as GateVerdict) : null;

  let error: string | null = null;
  if (raw === null) error = "no gate: key in this file";
  else if (verdict === null) error = `unrecognised gate verdict "${raw}"`;

  return {
    file,
    storyId: topLevel(yaml, "story") ?? idFromFilename(file),
    verdict,
    reason: topLevel(yaml, "status_reason") ?? "",
    // BMAD documents both an inline waiver (`waiver: { active: true }`, the
    // template) and a block one (`waiver:\n  active: true`, tasks/qa-gate.md).
    // Only matching the first reports a real waiver as not waived.
    waived:
      /waiver:\s*\{[^}]*active:\s*true/.test(yaml) ||
      /^waiver:\s*$[\s\S]*?^\s+active:\s*true\s*$/m.test(yaml),
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
export function gateFor(storyId: string, gates: Gate[]): Gate | undefined {
  const matches = gates.filter((g) => g.storyId === storyId);
  if (matches.length <= 1) return matches[0];
  return [...matches].sort((a, b) => b.updated.localeCompare(a.updated))[0];
}

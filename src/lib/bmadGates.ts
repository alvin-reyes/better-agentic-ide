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
  error: string | null;
}

function topLevel(yaml: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.*)$`, "m");
  const m = re.exec(yaml);
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, "").replace(/#.*$/, "").trim();
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
    waived: /waiver:\s*\{[^}]*active:\s*true/.test(yaml),
    error,
  };
}

export function gateFor(storyId: string, gates: Gate[]): Gate | undefined {
  return gates.find((g) => g.storyId === storyId);
}

/**
 * Shrink terminal output and logs before they go to an agent: the agent
 * rereads everything in its context on every turn, so a noisy paste costs
 * tokens for the rest of the session.
 */

/** Rough token count (about 4 characters per token for English and code). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// CSI (colors, cursor moves), OSC (titles, hyperlinks) and other escapes.
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

/** A line redrawn with \r (progress bars, spinners) shows only its last state. */
function lastRedraw(line: string): string {
  const parts = line.split("\r");
  for (let i = parts.length - 1; i >= 0; i--) if (parts[i].trim()) return parts[i];
  return "";
}

/** Lines that differ only in numbers (percentages, counters, timings) are the same step. */
const shape = (line: string) => line.replace(/\d+(\.\d+)?/g, "#");

const IMPORTANT = /error|fail|panic|exception|traceback|fatal|warning|denied|not found|cannot|undefined|expected|assert/i;

export interface CompactOptions {
  /** Keep at most this many lines; the middle is dropped except for important lines. */
  maxLines?: number;
  head?: number;
  tail?: number;
}

export interface CompactResult {
  text: string;
  before: number;
  after: number;
}

export function compactText(input: string, opts: CompactOptions = {}): CompactResult {
  const maxLines = opts.maxLines ?? 300;
  const head = opts.head ?? 60;
  const tail = opts.tail ?? 160;

  const raw = stripAnsi(input).replace(/\r\n/g, "\n").split("\n").map(lastRedraw).map((l) => l.replace(/\s+$/, ""));

  // Collapse runs of repeated lines, and of lines that only differ in numbers
  // (keeping the last, which carries the final count).
  const lines: string[] = [];
  let run = 0;
  for (const line of raw) {
    const prev = lines[lines.length - 1];
    const base = prev?.replace(/ \[×\d+\]$/, "");
    // Errors that differ only in a line number are different errors: collapse exact repeats only.
    const same = base !== undefined && line !== "" && (line === base || (!IMPORTANT.test(line) && shape(line) === shape(base)));
    if (same) {
      run++;
      lines[lines.length - 1] = `${line} [×${run + 1}]`;
      continue;
    }
    run = 0;
    // At most one blank line in a row.
    if (line === "" && prev === "") continue;
    lines.push(line);
  }
  // A single repeat marker adds noise without saving anything.
  const deduped = lines.map((l) => l.replace(/ \[×1\]$/, ""));
  while (deduped.length && deduped[0] === "") deduped.shift();
  while (deduped.length && deduped[deduped.length - 1] === "") deduped.pop();

  let out = deduped;
  if (deduped.length > maxLines) {
    const middle = deduped.slice(head, deduped.length - tail);
    const kept = middle.filter((l) => IMPORTANT.test(l)).slice(0, 40);
    const omitted = middle.length - kept.length;
    out = [
      ...deduped.slice(0, head),
      `… ${omitted} lines omitted${kept.length ? `; ${kept.length} lines with errors or warnings kept below` : ""} …`,
      ...kept,
      ...(kept.length ? ["…"] : []),
      ...deduped.slice(deduped.length - tail),
    ];
  }
  const text = out.join("\n");
  return { text, before: estimateTokens(input), after: estimateTokens(text) };
}

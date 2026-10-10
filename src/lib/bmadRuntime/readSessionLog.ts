import type { Fs } from "./fs";
import { compareStrings, isDirectory, pyJson } from "./knowledge";
import { pySplitJoin, pySplitLines } from "./compat";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-toolsmith/scripts/read_session_log.py` — digest Claude
 * Code transcripts and memlogs into the compact JSON the from-logs approach
 * reads: requests with counts, tool sequences, corrections, files touched and
 * skills invoked. The goldens in
 * `__tests__/goldens/helpers/readSessionLog-*.json` are the contract.
 *
 * Two substitutions. `Fs` carries no mtimes, so a folder's `*.jsonl`
 * transcripts are read in name order where the Python ordered them by
 * modification time — the difference shows only in the `sources` list of a
 * folder holding several transcripts. And a path that cannot be read reports
 * the synthesized `[Errno 2] …` text rather than the interpreter's.
 */

const TEXT_LIMIT = 300;
const CORRECTION_RE =
  /^(?:no|nope|not|don'?t|do not|stop|wrong|wait|actually|instead|undo|revert|never|hold on|that'?s (?:not|wrong)|that is (?:not|wrong)|why did you|i said|i asked|not what)\b/i;
const INTERRUPTED_RE = /^\[Request interrupted by user/;
const COMMAND_RE = /<command-name>\s*\/?([^<\s]+)\s*<\/command-name>/g;
const MEMLOG_ENTRY_RE = /^- (?:\(([^)]*)\) )?(.*)$/;
const FILE_INPUT_KEYS = ["file_path", "notebook_path", "path"];

/** `truncate`: whitespace collapsed, then cut to 300 characters. */
export function truncate(text: string): string {
  const collapsed = pySplitJoin(text);
  return collapsed.length <= TEXT_LIMIT ? collapsed : collapsed.slice(0, TEXT_LIMIT - 3) + "...";
}

/** `encode_cwd`: every `/` and `.` becomes `-`. */
export function encodeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, "-");
}

export function projectsDir(home: string, configDir: string | undefined): string {
  const base = configDir ? configDir : `${home}/.claude`;
  return `${base}/projects`;
}

/** A `Counter`: counts, with `most_common`'s stable order (first seen wins a tie). */
class Counter<T> {
  private counts = new Map<T, number>();
  bump(key: T): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  mostCommon(limit: number): [T, number][] {
    // Python's Counter.most_common sorts by count descending; the sort is
    // stable, so items with equal counts keep insertion order.
    const entries = [...this.counts.entries()].map((entry, index) => ({ entry, index }));
    entries.sort((a, b) => b.entry[1] - a.entry[1] || a.index - b.index);
    return entries.slice(0, limit).map((item) => item.entry);
  }
  values(): number[] {
    return [...this.counts.values()];
  }
}

export class Digest {
  sources: { path: string; format: string; entries: number }[] = [];
  private requests = new Counter<string>();
  private requestText = new Map<string, string>();
  private sequences = new Counter<string>();
  private corrections: string[] = [];
  private files = new Set<string>();
  private skills = new Counter<string>();

  addRequest(text: string): void {
    const key = pySplitJoin(text.toLowerCase());
    if (!key) return;
    this.requests.bump(key);
    if (!this.requestText.has(key)) this.requestText.set(key, truncate(text));
    const stripped = text.trim();
    if (CORRECTION_RE.test(stripped) || INTERRUPTED_RE.test(stripped)) this.addCorrection(text);
  }

  addCorrection(text: string): void {
    const short = truncate(text);
    if (!this.corrections.includes(short)) this.corrections.push(short);
  }

  addSequence(tools: string[]): void {
    const collapsed: string[] = [];
    for (const tool of tools) if (collapsed[collapsed.length - 1] !== tool) collapsed.push(tool);
    if (collapsed.length) this.sequences.bump(collapsed.join("\u0000"));
  }

  addFile(path: string): void {
    this.files.add(path);
  }

  addSkill(name: string): void {
    this.skills.bump(name);
  }

  render(maxItems: number): Record<string, unknown> {
    return {
      sources: this.sources,
      user_requests: this.requests
        .mostCommon(maxItems)
        .map(([key, count]) => ({ text: this.requestText.get(key) ?? key, count })),
      tool_sequences: this.sequences
        .mostCommon(maxItems)
        .map(([sequence, count]) => ({ tools: sequence.split("\u0000"), count })),
      corrections: this.corrections.slice(0, maxItems),
      files_touched: [...this.files].sort(compareStrings).slice(0, maxItems),
      skills_invoked: this.skills.mostCommon(maxItems).map(([name, count]) => ({ name, count })),
    };
  }
}

/** `user_text`: the prompt text of a user record, or null for tool results. */
function userText(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter((block): block is Record<string, unknown> => block !== null && typeof block === "object")
      .filter((block) => block.type === "text")
      .map((block) => (typeof block.text === "string" ? block.text : ""));
    if (!texts.length) return null;
    const joined = texts.filter(Boolean);
    return joined.length ? joined.join("\n") : null;
  }
  return null;
}

/** `read_claude_code`: one transcript, one JSON object per line. */
export function readClaudeCode(text: string, digest: Digest): number {
  let entries = 0;
  let turnTools: string[] = [];
  for (const line of pySplitLines(text)) {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record === null || typeof record !== "object" || Array.isArray(record)) continue;
    const row = record as Record<string, unknown>;
    if (row.isMeta || row.isSidechain) continue;
    const message = row.message !== null && typeof row.message === "object" && !Array.isArray(row.message) ? (row.message as Record<string, unknown>) : null;
    if (message === null) continue;
    const content = message.content;
    if (row.type === "user") {
      const prompt = userText(content);
      if (prompt === null) continue;
      entries += 1;
      digest.addSequence(turnTools);
      turnTools = [];
      for (const match of prompt.matchAll(COMMAND_RE)) digest.addSkill(match[1]);
      const stripped = prompt.trim();
      if (INTERRUPTED_RE.test(stripped)) digest.addCorrection(stripped);
      else if (stripped && !stripped.startsWith("<")) digest.addRequest(stripped);
    } else if (row.type === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (block === null || typeof block !== "object") continue;
        const item = block as Record<string, unknown>;
        if (item.type !== "tool_use") continue;
        entries += 1;
        const name = String(item.name ?? "");
        turnTools.push(name);
        const input = item.input !== null && typeof item.input === "object" && !Array.isArray(item.input) ? (item.input as Record<string, unknown>) : {};
        if (name === "Skill" && input.skill) digest.addSkill(String(input.skill));
        for (const key of FILE_INPUT_KEYS) {
          if (typeof input[key] === "string" && input[key]) digest.addFile(input[key] as string);
        }
      }
    }
  }
  digest.addSequence(turnTools);
  return entries;
}

/** `read_memlog`: a `.memlog.md`'s entries. */
export function readMemlog(text: string, digest: Digest): number {
  let entries = 0;
  for (const line of pySplitLines(text)) {
    const match = MEMLOG_ENTRY_RE.exec(line);
    if (!match) continue;
    entries += 1;
    const tag = (match[1] ?? "").trim().toLowerCase();
    const kind = tag.split(" by ")[0].trim();
    const byUser = ` ${tag}`.includes(" by user") || tag.startsWith("by user");
    const body = match[2].trim();
    if (kind === "gap" || kind === "correction") digest.addCorrection(body);
    else if (kind === "direction" || kind === "decision" || byUser) digest.addRequest(body);
    else if (CORRECTION_RE.test(body)) digest.addCorrection(body);
  }
  return entries;
}

/** `detect_format`: by request, or by the file's own name under `auto`. */
export function detectFormat(path: string, requested: string): string | null {
  if (requested !== "auto") return requested;
  if (path.endsWith(".jsonl")) return "claude-code";
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name.endsWith(".memlog.md") || name === ".memlog.md") return "memlog";
  return null;
}

async function expand(fs: Fs, paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const path of paths) {
    if (await isDirectory(fs, path)) {
      const names = (await fs.list(path)).sort(compareStrings);
      for (const name of names) if (name.endsWith(".jsonl")) files.push(`${path}/${name}`);
      for (const name of names) if (name.endsWith(".memlog.md")) files.push(`${path}/${name}`);
    } else files.push(path);
  }
  return files;
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function readSessionLog(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "read_session_log";
  const paths: string[] = [];
  let project: string | null = null;
  let format = "auto";
  let maxItems = 20;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --project: expected one argument");
      project = taken;
    } else if (flag === "--format") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --format: expected one argument");
      if (!["auto", "claude-code", "memlog"].includes(taken)) {
        return usageError(script, `argument --format: invalid choice: '${taken}'`);
      }
      format = taken;
    } else if (flag === "--max-items") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --max-items: expected one argument");
      const parsed = Number.parseInt(taken, 10);
      if (Number.isNaN(parsed)) return usageError(script, `argument --max-items: invalid int value: '${taken}'`);
      maxItems = parsed;
    } else if (flag === "--skill-root") {
      if (value() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    } else paths.push(argv[i]);
  }

  if (project !== null) {
    const { homedir } = await import("node:os");
    const { resolve: resolvePath } = await import("node:path");
    const expanded = project.startsWith("~") ? `${homedir()}${project.slice(1)}` : project;
    const folder = `${projectsDir(homedir(), process.env.CLAUDE_CONFIG_DIR)}/${encodeCwd(resolvePath(expanded))}`;
    if (!(await isDirectory(fs, folder))) {
      return usageError(script, `no transcripts for ${project} at ${folder}`);
    }
    paths.push(folder);
  }
  if (!paths.length) return usageError(script, "give at least one path or --project");
  const missing: string[] = [];
  for (const path of paths) if (!(await fs.exists(path))) missing.push(path);
  if (missing.length) return usageError(script, `not found: ${missing.join(", ")}`);

  const digest = new Digest();
  for (const path of await expand(fs, paths)) {
    const detected = detectFormat(path, format);
    if (detected === null) continue; // the Python warned on stderr; this shape has none
    const text = await fs.readText(path);
    const entries = detected === "claude-code" ? readClaudeCode(text, digest) : readMemlog(text, digest);
    digest.sources.push({ path, format: detected, entries });
  }
  return { stdout: `${pyJson(digest.render(maxItems), { indent: 2, ensureAscii: true })}\n`, exitCode: 0 };
}

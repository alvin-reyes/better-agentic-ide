import type { Fs } from "./fs";

/**
 * Port of `skills/bmad/scripts/memlog.py` at bda3c59. The Python is the
 * specification, and so is the way the pinned tree calls it: `memlog init
 * --workspace {doc_workspace} --field topic=…` (bmad-prd, bmad-ux) and `memlog
 * append --workspace {doc_workspace} --type … --text …`. The log is
 * `{workspace}/.memlog.md` — one frontmatter block and one flat, chronological
 * list — and every command echoes the new state as one JSON line so the caller
 * never re-reads the file. There is no `read` subcommand: the host skill reads
 * the file itself on resume, and there is no edit or delete by design. The
 * goldens under `__tests__/goldens/memlog` are the contract.
 *
 * Seams, all substitutions of things a port cannot share:
 * - a crash the Python never caught — a missing log, a log with no frontmatter —
 *   is reported as the Python's own exception line, exit 1: the last line of
 *   its traceback is the only portable part of it;
 * - argparse's usage block wraps to the terminal and is not reproduced; its
 *   error line is (the same ruling Task 4 recorded for tickets.py);
 * - output goes to one channel — stdout — and this function returns it, so the
 *   caller prints exactly what the Python printed on either channel;
 * - the Python's writes are atomic (temp file + fsync + rename, and O_APPEND for
 *   `append`); `Fs` has no rename and no append mode, so the port reads and
 *   rewrites through `writeText`. The bytes on disk are the Python's; two
 *   processes appending at the same instant could lose one entry, which the
 *   Python's OS-level append prevents.
 */

const MEMLOG = ".memlog.md";
const PROG = "memlog.py";
const COMMANDS = ["init", "append", "set"] as const;
type Command = (typeof COMMANDS)[number];

/** The Python prints an argparse error as `<prog> <subcommand>: error: <text>`. */
class UsageError extends Error {}

/** A refusal the Python's own commands print: `error: <text>`, exit 2. */
class CommandError extends Error {}

/** A crash the Python never caught. Its traceback is the interpreter's, not the
 * tool's, so the port keeps the one part that was ever visible: the exception
 * line, class name included, with the Python's exit 1. */
class CrashError extends Error {}

// ---------------------------------------------------------------- python shapes

/** `json.dumps(value)`: ", "/": " separators, in insertion order. */
function pyJson(value: unknown): string {
  const write = (value: unknown): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(write).join(", ")}]`;
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${JSON.stringify(k)}: ${write(v)}`);
    return `{${entries.join(", ")}}`;
  };
  return write(value);
}

/** `str.splitlines()`: every line ending Python's own splitter knows. */
const splitlines = (text: string): string[] => text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);

/** `repr()` of a string, as argparse and the command errors print it. */
const pyRepr = (text: string): string => `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** `datetime.now().strftime("%Y-%m-%dT%H:%M")`, in local time. */
function now(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------- the log

type Meta = Record<string, string>;

/** `split`: frontmatter in source order, and the body after it. The closing
 * fence is the first line that is *exactly* `---`, so a `---` inside a field
 * value (topic and goal are free user text) never truncates the frontmatter. */
function split(text: string): [Meta, string] {
  const lines = splitlines(text);
  if (!lines.length || lines[0] !== "---") throw new CrashError("ValueError: .memlog.md has no frontmatter");
  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) throw new CrashError("ValueError: .memlog.md frontmatter is not terminated");
  const meta: Meta = {};
  for (const line of lines.slice(1, end)) {
    const cut = line.indexOf(":");
    if (cut !== -1) meta[line.slice(0, cut).trim()] = line.slice(cut + 1).trim();
  }
  return [meta, lines.slice(end + 1).join("\n").replace(/^\n+/, "")];
}

/** `render`: the file's own shape — fence, fields, blank line, body, newline. A
 * multi-line value cannot break the fence on re-read. */
function render(meta: Meta, body: string): string {
  const fields = Object.entries(meta)
    .map(([key, value]) => `${key}: ${value.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/).join(" ")}`)
    .join("\n");
  return `---\n${fields}\n---\n\n${body.replace(/\n+$/, "")}\n`;
}

/** `touch`: stamp `updated` and keep it last so the field order stays predictable. */
function touch(meta: Meta): void {
  delete meta.updated;
  meta.updated = now();
}

/** `entry_count`: every line that is one entry. */
const entryCount = (body: string): number => splitlines(body).filter((line) => line.startsWith("- ")).length;

/** `ack`: echo the new state so the caller never re-reads the file. */
const ack = (path: string, body: string): string => pyJson({ ok: true, memlog: path, entries: entryCount(body) }) + "\n";

// ---------------------------------------------------------------- the commands

async function cmdInit(path: string, fields: string[], fs: Fs): Promise<string> {
  if (await fs.exists(path)) throw new CommandError(`${path} already exists; use append/set to update it`);
  const parent = path.slice(0, path.lastIndexOf("/"));
  if (parent) await fs.mkdir(parent);
  const meta: Meta = {};
  for (const pair of fields) {
    const cut = pair.indexOf("=");
    if (cut === -1) throw new CommandError(`--field expects key=value, got ${pyRepr(pair)}`);
    meta[pair.slice(0, cut).trim()] = pair.slice(cut + 1).trim();
  }
  touch(meta);
  await fs.writeText(path, render(meta, ""));
  return ack(path, "");
}

async function cmdAppend(path: string, text: string, type: string | undefined, by: string | undefined, fs: Fs): Promise<string> {
  const raw = await readLog(path, fs);
  split(raw); // a missing or malformed log fails here, before anything is written
  const entryText = text.split(/\s+/).filter(Boolean).join(" "); // one-line entry, no prose bloat
  let label = type ?? "";
  if (by) label = `${label} by ${by}`.trim();
  const tag = label ? `(${label}) ` : "";
  const entry = `- ${tag}${entryText}`;
  // `append_line` adds the entry at the end of the file, in one write.
  await fs.writeText(path, raw + (raw.endsWith("\n") ? "" : "\n") + entry + "\n");
  return ack(path, split(await fs.readText(path))[1]);
}

async function cmdSet(path: string, key: string, value: string, fs: Fs): Promise<string> {
  const [meta, body] = split(await readLog(path, fs));
  meta[key] = value;
  touch(meta);
  await fs.writeText(path, render(meta, body));
  return ack(path, body);
}

/** `Path.read_text`: a missing file is the Python's FileNotFoundError, whose
 * line is what the caller sees. */
async function readLog(path: string, fs: Fs): Promise<string> {
  if (!(await fs.exists(path))) {
    throw new CrashError(`FileNotFoundError: [Errno 2] No such file or directory: ${pyRepr(path)}`);
  }
  return fs.readText(path);
}

// ---------------------------------------------------------------- the command line

const splitFlag = (token: string): [string, string | undefined] => {
  const cut = token.indexOf("=");
  return cut === -1 || !token.startsWith("--") ? [token, undefined] : [token.slice(0, cut), token.slice(cut + 1)];
};

/** `add_target`'s mutually exclusive group: a log is named by a run folder or by
 * its own path, never both. */
function requireTarget(workspace: string | undefined, path: string | undefined): string {
  if (workspace === undefined && path === undefined) throw new UsageError("one of the arguments --workspace --path is required");
  return path ?? `${(workspace as string).replace(/\/+$/, "")}/${MEMLOG}`;
}

/** The options a subcommand takes, in the order it takes them: what argparse
 * reports when a required one is missing. */
function flagsOf(argv: string[]): Record<string, string | string[]> {
  const options: Record<string, string | string[]> = {};
  const takesValue = new Set(["--workspace", "--path", "--text", "--type", "--by", "--field", "--key", "--value"]);
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (!takesValue.has(flag)) throw new UsageError(`unrecognized arguments: ${argv[i]}`);
    const value = inline ?? argv[++i];
    if (value === undefined) throw new UsageError(`argument ${flag}: expected one argument`);
    if (flag === "--field") options[flag] = [...((options[flag] as string[]) ?? []), value];
    else {
      if (options[flag] !== undefined) throw new UsageError(`argument ${flag}: expected one argument`);
      options[flag] = value;
    }
  }
  if (options["--workspace"] !== undefined && options["--path"] !== undefined) {
    throw new UsageError("argument --path: not allowed with argument --workspace");
  }
  return options;
}

/** `main`: parse the Python's own command line and run it. */
export async function memlog(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }> {
  const [command, ...rest] = argv;
  if (command === undefined) {
    return { stdout: `${PROG}: error: the following arguments are required: cmd\n`, exitCode: 2 };
  }
  if (!COMMANDS.includes(command as Command)) {
    return {
      stdout: `${PROG}: error: argument cmd: invalid choice: ${pyRepr(command)} (choose from init, append, set)\n`,
      exitCode: 2,
    };
  }
  const name = command as Command;
  const prog = `${PROG} ${name}`;
  try {
    const options = flagsOf(rest);
    const required = name === "append" ? ["--text"] : name === "set" ? ["--key", "--value"] : [];
    const missing = required.filter((flag) => !(flag in options));
    if (missing.length) throw new UsageError(`the following arguments are required: ${missing.join(", ")}`);
    const path = requireTarget(options["--workspace"] as string, options["--path"] as string);
    if (name === "init") return { stdout: await cmdInit(path, (options["--field"] as string[]) ?? [], fs), exitCode: 0 };
    if (name === "append") {
      const stdout = await cmdAppend(path, options["--text"] as string, options["--type"] as string, options["--by"] as string, fs);
      return { stdout, exitCode: 0 };
    }
    return { stdout: await cmdSet(path, options["--key"] as string, options["--value"] as string, fs), exitCode: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) return { stdout: `${prog}: error: ${message}\n`, exitCode: 2 };
    if (error instanceof CommandError) return { stdout: `error: ${message}\n`, exitCode: 2 };
    if (error instanceof CrashError) return { stdout: `${message}\n`, exitCode: 1 };
    throw error;
  }
}

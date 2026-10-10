import { parse as parseToml } from "smol-toml";
import { hasOwn } from "./compat";
import { loadCentralConfig } from "./config";
import type { Fs } from "./fs";
import {
  isAbsolutePath,
  joinPath,
  normalizePath as normalizeShared,
  pathBasename as baseName,
  pathDirname as parentOf,
} from "./paths";

/**
 * Port of `skills/bmad-ticket/scripts/tickets.py` (and `read_store.py`, which
 * the runtime dispatches here as `read_store`) at bda3c59. The Python is the
 * specification: commands, JSON keys, error strings, exit codes (0 ok, 1 a
 * malformed tree, 2 a store refusal or a usage error) and the files `pull`,
 * `mark` and `mirror` write all follow it. The goldens under
 * `__tests__/goldens/tickets` are the contract.
 *
 * Three deliberate substitutions, all seams with earlier tasks:
 * - config comes from the Task 3 `loadCentralConfig`, not the project's own
 *   `_bmad/scripts/config_utils.py` (so a missing config names itself in
 *   different words);
 * - output goes to `stdout` alone; the Python splits errors onto stderr;
 * - `read_store.py` finds its store starters at its own `../config`, which a
 *   bundle cannot know: the port takes `--skill-root` (what the patched call
 *   sites pass, defaulting to `<skill-root>/config`) or `--starters-dir`, and
 *   refuses a run that names neither rather than dropping the starter layer.
 * argparse's usage line wraps to the terminal and is not reproduced; its error
 * line is.
 */

// ---------------------------------------------------------------- constants

const STATUSES = ["draft", "ready-for-dev", "in-progress", "in-review", "built", "done", "blocked", "dropped"] as const;
const STATES = ["backlog", "in-progress", "review", "done", "dropped"] as const;
const CONTAINER_STATUSES = ["in-progress", "done", "dropped"] as const;
const STATE_OF: Record<string, string> = {
  "": "backlog",
  draft: "backlog",
  "ready-for-dev": "backlog",
  "in-progress": "in-progress",
  blocked: "in-progress",
  "in-review": "review",
  built: "review",
  done: "done",
  dropped: "dropped",
};
const LEAF_TYPES = ["story", "spike", "bug"] as const;
const CONTAINER_TYPES = ["initiative", "epic"] as const;
const NAME_RE = /^(story|spike|bug)-(.+)\.md$/;
const ID_RE = /^[0-9A-Za-z]+$/;
const CROSS_RE = /^([0-9A-Za-z]+)\.([0-9A-Za-z]+)$/;
const EPIC_RE = /^epic-[^/]+$/;
const BREAKDOWN = "tickets.toml";
const QUOTED_COMMENT_RE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')\s+#.*$/;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const PLAN_FIELDS = ["status", "assignee", "blocked_at", "blocked_reason"] as const;
const COMMENT_RE = /<!--[\s\S]*?-->/g; // a template's example sits in one
const UNKNOWN_RE = /^[ \t]*(?:[-*][ \t]+)?Unknown:[ \t]*(\S.*)$/gm;
const MIRROR_KEYS = ["ref", "tracker_id", "remote", "tracker_status", "assignee", "after"];

class TicketError extends Error {
  /** Extra keys the Python adds to the error object it prints. */
  data: Record<string, unknown> = {};
}

class NoMatch extends TicketError {}

class StoreRefusal extends Error {}

// ---------------------------------------------------------------- python value shapes

/** `str(value)`, the way an f-string renders a value. */
function pyStr(value: unknown): string {
  if (value === undefined || value === null) return "None";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  return pyRepr(value);
}

/** `value or ""` — Python truthiness, so `[]`, `0` and `False` fall through. */
function pyOr<T, U>(value: T, fallback: U): T | U {
  return pyTruthy(value) ? value : fallback;
}

function pyTruthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

/** `repr(value)`, for the errors that quote one back. */
function pyRepr(value: unknown): string {
  if (typeof value === "string") {
    const quote = value.includes("'") && !value.includes('"') ? '"' : "'";
    let out = quote;
    for (const ch of value) {
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += "\\" + quote;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else out += ch;
    }
    return out + quote;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === undefined || value === null) return "None";
  if (Array.isArray(value)) return "[" + value.map(pyRepr).join(", ") + "]";
  return String(value);
}

/** `json.dumps(value, ensure_ascii=...)` for a string, as a JSON literal. */
function pyJsonString(value: string, ensureAscii: boolean): string {
  let out = '"';
  const escape = (code: number) => "\\u" + code.toString(16).padStart(4, "0");
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20) out += escape(code);
    else if (ensureAscii && code > 0x7e) {
      if (code > 0xffff) {
        const pair = code - 0x10000;
        out += escape(0xd800 + (pair >> 10)) + escape(0xdc00 + (pair & 0x3ff));
      } else out += escape(code);
    } else out += ch;
  }
  return out + '"';
}

/** `json.dumps(value, ...)`: ", "/": " separators, or ",\\n"/": " with an indent. */
function pyJson(value: unknown, opts: { ensureAscii?: boolean; indent?: number } = {}): string {
  const ensureAscii = opts.ensureAscii ?? false;
  const indent = opts.indent;
  const write = (value: unknown, depth: number): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
    if (typeof value === "string") return pyJsonString(value, ensureAscii);
    const open = indent === undefined ? "" : "\n";
    const close = indent === undefined ? "" : "\n" + " ".repeat(indent * depth);
    const inner = indent === undefined ? "" : " ".repeat(indent * (depth + 1));
    const separator = indent === undefined ? ", " : ",\n";
    if (Array.isArray(value)) {
      if (!value.length) return "[]";
      return "[" + open + value.map((v) => inner + write(v, depth + 1)).join(separator) + close + "]";
    }
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => inner + pyJsonString(k, ensureAscii) + ": " + write(v, depth + 1),
    );
    if (!entries.length) return "{}";
    return "{" + open + entries.join(separator) + close + "}";
  };
  return write(value, 0);
}

// ---------------------------------------------------------------- paths

/** This store's fold: `.` is the empty relative path (the Python's answer). */
const normalizePath = (p: string): string => normalizeShared(p, ".");

/** `os.path.relpath(target, root)`, posix flavor. */
function relativePath(target: string, root: string): string {
  const t = normalizePath(target);
  const r = normalizePath(root);
  if (isAbsolutePath(t) !== isAbsolutePath(r)) throw new Error("no relative path between the two");
  const ts = t.split("/").filter(Boolean);
  const rs = r.split("/").filter(Boolean);
  let shared = 0;
  while (shared < ts.length && shared < rs.length && ts[shared] === rs[shared]) shared += 1;
  const parts = [...rs.slice(shared).map(() => ".."), ...ts.slice(shared)];
  return parts.length ? parts.join("/") : ".";
}

function cwd(): string {
  return typeof process !== "undefined" && typeof process.cwd === "function" ? process.cwd() : "/";
}

/** Local calendar date, as `date.today().isoformat()`. */
function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ---------------------------------------------------------------- fs probes

/** `Path.is_dir()`: the Fs has no stat, so ask the directory listing. */
async function isDir(path: string, fs: Fs): Promise<boolean> {
  try {
    await fs.list(path);
    return true;
  } catch {
    return false;
  }
}

/** `Path.is_file()`: exists and is not a directory. */
async function isFile(path: string, fs: Fs): Promise<boolean> {
  return (await fs.exists(path)) && !(await isDir(path, fs));
}

/** `read_text(encoding="utf-8-sig")` with Python's universal newlines. */
async function readText(path: string, fs: Fs): Promise<string> {
  const raw = await fs.readText(path);
  const text = raw.startsWith("﻿") ? raw.slice(1) : raw;
  return text.replace(/\r\n/g, "\n");
}

// ---------------------------------------------------------------- frontmatter

/** Minimal YAML subset: `key: value`, lists as `[a, b]`, quoted or bare scalars. */
function parseFrontmatter(text: string, lenient = false): Record<string, unknown> {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return {};
  const data: Record<string, unknown> = {};
  for (const line of m[1].split("\n")) {
    if (lenient && (/\s/.test(line[0] ?? "") || line.startsWith("- "))) continue;
    if (line.replace(/^\s+/, "").startsWith("- ")) throw new TicketError("frontmatter lists must be inline: `key: [a, b]`");
    if (!line.trim() || line.replace(/^\s+/, "").startsWith("#") || !line.includes(":")) continue;
    const at = line.indexOf(":");
    const key = line.slice(0, at);
    const value = line.slice(at + 1).split("   #")[0].trim();
    const quotedValue = QUOTED_COMMENT_RE.exec(value);
    data[key.trim()] = scalar(quotedValue ? quotedValue[1] : value);
  }
  return data;
}

function scalar(value: string): unknown {
  if (value.startsWith("[") && value.endsWith("]")) {
    const inner = value.slice(1, -1).trim();
    return inner === "" ? [] : inner.split(",").map((v) => scalar(v.trim()));
  }
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
    if (value[0] === '"') {
      try {
        return String(JSON.parse(value));
      } catch {
        return value.slice(1, -1);
      }
    }
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === "true" || value === "false") return value === "true";
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

function setFrontmatterValue(text: string, key: string, value: string): string {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) throw new TicketError("ticket has no frontmatter");
  const start = "---\n".length;
  const end = start + m[1].length;
  let block = m[1];
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const everyLine = new RegExp(`^${escaped}:.*$\\n?`, "gm");
  const firstLine = new RegExp(`^${escaped}:.*$\\n?`, "m");
  if (value === "") {
    block = block.replace(everyLine, "").replace(/\n+$/, "");
  } else if (firstLine.test(block)) {
    block = block.replace(firstLine, () => `${key}: ${value}\n`).replace(/\n+$/, "");
  } else {
    block = `${block}\n${key}: ${value}`;
  }
  return text.slice(0, start) + block + text.slice(end);
}

/** `_list(value, where)`: absent and empty read as the empty list. */
function listValue(value: unknown, where: string): unknown[] {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value)) throw new TicketError(`${where}: after must be a list`);
  return value;
}

function asFlag(value: unknown): boolean {
  return pyStr(value).toLowerCase() === "true";
}

/** `_one_of(value, allowed, where, field)`. */
function oneOf(value: unknown, allowed: readonly string[], where: string, field: string): string {
  if (value !== "" && !(allowed as readonly unknown[]).includes(value)) {
    throw new TicketError(`${where}: ${field} ${pyRepr(value)} is not one of ${allowed.join(", ")}`);
  }
  return value as string;
}

// ---------------------------------------------------------------- loading

/** `_id(value)`: a number, or letters and digits; digits alone are the number. */
function asId(value: unknown): string | number | null {
  if (typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  if (typeof value === "string" && ID_RE.test(value) && value !== "true" && value !== "false") {
    return /^\d+$/.test(value) ? parseInt(value, 10) : value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function loadBreakdown(folder: string, fs: Fs): Promise<Record<string, any>> {
  const path = joinPath(folder, BREAKDOWN);
  if (!(await isFile(path, fs))) return {};
  const where = `${baseName(folder)}/${BREAKDOWN}`;
  let data: Record<string, unknown>;
  try {
    data = parseToml(await readText(path, fs)) as Record<string, unknown>;
  } catch (e) {
    throw new TicketError(`${where}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const floor = data["next_id"] === undefined ? 0 : data["next_id"];
  if (typeof floor === "boolean" || typeof floor !== "number" || !Number.isInteger(floor)) {
    throw new TicketError(`${where}: \`next_id\` must be a whole number`);
  }
  for (const table of ["entry", "epic"]) {
    const rows = data[table] === undefined ? [] : data[table];
    if (!Array.isArray(rows) || !rows.every(isRecord)) {
      throw new TicketError(`${where}: write \`[[${table}]]\` tables, one per ${table}`);
    }
    for (const row of rows as Record<string, any>[]) {
      for (const key of ["covers", "after", "references", "notes"]) {
        const value = row[key] === undefined ? [] : row[key];
        if (!Array.isArray(value)) throw new TicketError(`${where}: \`${key}\` must be a list`);
      }
      const id = asId(row["id"]);
      row["id"] = id;
      if (id === null) {
        throw new TicketError(`${where}: every ${table} needs an \`id\`: a number, or letters and digits`);
      }
      if (table === "epic") {
        if (typeof row["slug"] !== "string" || !row["slug"]) {
          throw new TicketError(`${where}: epic ${row["id"]} needs a \`slug\``);
        }
        for (const a of row["after"] ?? []) {
          if (!isRecord(a) || (asId(a["epic"]) === null && typeof a["epic"] !== "string")) {
            throw new TicketError(
              `${where}: an epic's \`after\` takes tables: [{ epic = <id or slug>, needs = "..." }]`,
            );
          }
        }
      }
    }
  }
  return data;
}

async function loadContainer(folder: string, fs: Fs): Promise<Record<string, any>> {
  const name = baseName(folder);
  const path = joinPath(folder, `${name}.md`);
  if (!(await isFile(path, fs))) throw new TicketError(`${name}: no ${name}.md`);
  const fm = parseFrontmatter(await readText(path, fs));
  if (!(CONTAINER_TYPES as readonly unknown[]).includes(fm["type"])) {
    throw new TicketError(
      `${name}/${name}.md: type ${pyRepr(fm["type"] ?? null)} is not one of ${CONTAINER_TYPES.join(", ")}`,
    );
  }
  const status = oneOf(fm["status"] ?? "", CONTAINER_STATUSES, `${name}/${name}.md`, "status");
  return {
    slug: name,
    tracker_id: pyStr(pyOr(fm["tracker_id"] ?? "", "")),
    status,
    raw_after: listValue(fm["after"], `${name}.md`),
  };
}

/** The `Unknown:` lines of a leaf file's body, as `pull` writes an entry's `unknown` into Notes. */
function fileUnknown(text: string): string {
  const body = text.replace(FRONTMATTER_RE, "").replace(COMMENT_RE, "");
  const found: string[] = [];
  for (const m of body.matchAll(UNKNOWN_RE)) found.push(m[1].trim());
  return found.join("; ");
}

type Row = Record<string, any>;

async function loadFolder(folder: string, problems: string[], fs: Fs): Promise<Row[]> {
  /** One row per ticket in a folder, in build order: every breakdown entry, joined to its
   * leaf file when one exists, then leaf files the breakdown does not list. Plans then set
   * the status fields of the rows they join. */
  const where = baseName(folder);
  const rows = new Map<string | number, Row>();
  for (const e of ((await loadBreakdown(folder, fs))["entry"] ?? []) as Record<string, any>[]) {
    const n = e["id"] as string | number;
    const kind = e["type"];
    if (!(LEAF_TYPES as readonly unknown[]).includes(kind)) {
      throw new TicketError(`${where}/${BREAKDOWN}: entry ${n} type ${pyRepr(kind ?? null)} is not one of ${LEAF_TYPES.join(", ")}`);
    }
    if (rows.has(n)) throw new TicketError(`${where}/${BREAKDOWN}: two entries with id ${n}`);
    rows.set(n, {
      epic: where,
      id: n,
      file: null,
      type: kind,
      tracker_id: "",
      title: pyStr(e["title"] ?? ""),
      status: "",
      tracker_status: "",
      state: "planned",
      assignee: "",
      refined: false,
      refine: kind === "bug" || asFlag(e["refine"] ?? false),
      description: pyStr(e["description"] ?? ""),
      verify: pyStr(e["verify"] ?? ""),
      unknown: pyStr(e["unknown"] ?? ""),
      references: ((e["references"] ?? []) as unknown[]).map(pyStr),
      notes: ((e["notes"] ?? []) as unknown[]).map(pyStr),
      risk: pyStr(e["risk"] ?? ""),
      hitl: asFlag(e["hitl"] ?? false),
      plan_checkpoint: asFlag(e["plan_checkpoint"] ?? false),
      done_checkpoint: asFlag(e["done_checkpoint"] ?? false),
      covers: ((e["covers"] ?? []) as unknown[]).map(pyStr),
      estimate: e["estimate"] ?? "",
      blocked_at: "",
      blocked_reason: "",
      raw_after: listValue(e["after"], `${where}/${BREAKDOWN} entry ${n}`),
      entry_after: null,
    });
  }
  const unlisted = new Map<string | number, Row>();
  const stray: Row[] = [];
  const plans: [string, Record<string, any>][] = [];
  const seen = new Map<string | number, string>();
  const names = (await fs.list(folder)).filter((n) => n.endsWith(".md")).sort();
  for (const name of names) {
    const text = await readText(joinPath(folder, name), fs);
    let fm = parseFrontmatter(text, true);
    if (Object.keys(fm).length === 0 && text.startsWith("---") && NAME_RE.test(name)) {
      throw new TicketError(`${where}/${name}: frontmatter does not close`);
    }
    if (!(LEAF_TYPES as readonly unknown[]).includes(fm["type"])) {
      if (hasOwn(fm, "ticket")) plans.push([name, fm]);
      continue;
    }
    try {
      fm = parseFrontmatter(text);
    } catch (e) {
      if (e instanceof TicketError) throw new TicketError(`${where}/${name}: ${e.message}`);
      throw e;
    }
    const status = oneOf(fm["status"] ?? "", STATUSES, `${where}/${name}`, "status");
    const trackerStatus = oneOf(fm["tracker_status"] ?? "", STATES, `${where}/${name}`, "tracker_status");
    const n = asId(fm["id"]);
    if (n !== null) {
      if (seen.has(n)) throw new TicketError(`${seen.get(n)} and ${name} share the id ${n}`);
      seen.set(n, name);
    }
    let row: Row | undefined = n !== null ? rows.get(n) : undefined;
    if (row === undefined) {
      row = { epic: where, id: n, raw_after: [], entry_after: null, covers: [], title: "" };
      row["refine"] = true;
      if (n === null) stray.push(row);
      else unlisted.set(n, row);
    } else {
      row["entry_after"] = row["raw_after"];
      row["entry_hitl"] = row["hitl"];
    }
    Object.assign(row, {
      file: name,
      type: fm["type"],
      tracker_id: pyStr(pyOr(fm["tracker_id"] ?? "", "")),
      title: pyStr(pyOr(fm["title"] ?? "", row["title"])),
      status,
      tracker_status: trackerStatus,
      state: trackerStatus || STATE_OF[status],
      assignee: pyStr(pyOr(fm["assignee"] ?? "", "")),
      refined: asFlag(fm["refined"] ?? false),
      refine: row["refine"] || fm["type"] === "bug",
      hitl: asFlag(fm["hitl"] ?? false),
      covers: Array.isArray(fm["covers"]) ? (fm["covers"] as unknown[]).map(pyStr) : row["covers"],
      estimate: fm["estimate"] !== undefined ? fm["estimate"] : pyOr(row["estimate"] ?? "", ""),
      risk: typeof fm["risk"] === "string" ? fm["risk"] : pyOr(row["risk"] ?? "", ""),
      blocked_at: fm["blocked_at"] !== undefined ? fm["blocked_at"] : "",
      blocked_reason: pyStr(pyOr(fm["blocked_reason"] ?? "", "")),
      unknown: fileUnknown(text),
    });
    row["raw_after"] = listValue(fm["after"], `${where}/${name}`);
  }
  const order = [...unlisted.keys()].sort(idSort);
  const out = [...rows.values(), ...order.map((n) => unlisted.get(n)!), ...stray];
  joinPlans(out, plans, where, problems);
  return out;
}

/** Python's `sorted(key=(isinstance(n, str), n))`: numbers first, then letters. */
function idSort(a: string | number, b: string | number): number {
  const ka = typeof a === "string" ? 1 : 0;
  const kb = typeof b === "string" ? 1 : 0;
  if (ka !== kb) return ka - kb;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Set each plan's status fields on the one row its `ticket` names; a bad plan is a problem, not an error. */
function joinPlans(rows: Row[], plans: [string, Record<string, any>][], where: string, problems: string[]): void {
  for (const [name, fm] of plans) {
    let ticket: unknown = fm["ticket"];
    let row: Row | undefined;
    if (asId(ticket) !== null) {
      ticket = asId(ticket);
      row = rows.find((r) => r["id"] === ticket);
    }
    if (row === undefined && typeof ticket === "string" && ticket) {
      row = rows.find((r) => r["file"] === `${ticket}.md`);
    }
    if (row === undefined) {
      problems.push(`${where}/${name}: ticket ${pyRepr(ticket)} names no entry or leaf file in ${where}; skipped`);
      continue;
    }
    if (hasOwn(row, "plan")) {
      throw new TicketError(`${where}/${row["plan"]} and ${name} are both plans for ticket ${pyRepr(ticket)}`);
    }
    const fields: Record<string, string> = {};
    for (const key of PLAN_FIELDS) fields[key] = pyStr(pyOr(fm[key] ?? "", ""));
    if (!hasOwn(fm, "assignee")) {
      // A tracker's assignee is mirrored into the leaf file; the builds' plans carry no assignee.
      fields["assignee"] = row["assignee"] ?? "";
    }
    try {
      oneOf(fields["status"], STATUSES, `${where}/${name}`, "status");
    } catch (e) {
      if (!(e instanceof TicketError)) throw e;
      problems.push(`${e.message}; the ticket reads as blocked until the plan is fixed`);
      fields["blocked_reason"] = `${name} has an unknown status ${pyRepr(fields["status"])}`;
      fields["status"] = "blocked";
    }
    row["plan"] = name;
    row["state"] = row["tracker_status"] || STATE_OF[fields["status"]];
    Object.assign(row, fields);
  }
}

/** Every epic folder under an initiative: one that has its own file or a tickets.toml. */
async function epicFolders(initiative: string, fs: Fs): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.list(initiative);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names.filter((n) => n.startsWith("epic-")).sort()) {
    const dir = joinPath(initiative, name);
    if ((await isFile(joinPath(dir, `${name}.md`), fs)) || (await isFile(joinPath(dir, BREAKDOWN), fs))) out.push(dir);
  }
  return out;
}

interface Tree {
  scope: string | null;
  initiative: string | null;
  folders: Record<string, string>;
  epicIds: Record<string, any>;
  containers: Record<string, Row>;
  tickets: Row[];
  problems: string[];
  fallback?: boolean;
}

/** The folder asked about plus every epic its tickets can name. */
async function loadTree(folder: string, fs: Fs): Promise<Tree> {
  let epics = await epicFolders(folder, fs);
  let scope: string | null;
  let initiative: string | null;
  let folders: string[] | null;
  if (epics.length > 0 || hasOwn(await loadBreakdown(folder, fs), "epic")) {
    scope = null;
    initiative = folder;
    folders = null;
  } else if ((await epicFolders(parentOf(folder), fs)).includes(folder)) {
    scope = baseName(folder);
    initiative = parentOf(folder);
    folders = await epicFolders(initiative, fs);
    epics = folders;
  } else {
    scope = baseName(folder);
    initiative = null;
    folders = [folder];
  }
  const listed: Record<string, any>[] = initiative ? ((await loadBreakdown(initiative, fs))["epic"] ?? []) : [];
  const order = listed.map((e) => e["slug"]);
  epics.sort((a, b) => {
    const ia = order.indexOf(baseName(a));
    const ib = order.indexOf(baseName(b));
    const ka = ia === -1 ? order.length : ia;
    const kb = ib === -1 ? order.length : ib;
    if (ka !== kb) return ka - kb;
    return baseName(a) < baseName(b) ? -1 : baseName(a) > baseName(b) ? 1 : 0;
  });
  if (folders === null) folders = [...epics, folder];
  const epicIds: Record<string, any> = Object.create(null);
  for (const e of listed) {
    if (Object.values(epicIds).includes(e["id"])) {
      throw new TicketError(`${baseName(initiative!)}/${BREAKDOWN}: two epics with id ${e["id"]}`);
    }
    if (hasOwn(epicIds, String(e["slug"]))) {
      throw new TicketError(`${baseName(initiative!)}/${BREAKDOWN}: two epics with slug ${e["slug"]}`);
    }
    epicIds[e["slug"]] = e["id"];
  }
  const problems: string[] = [];
  const tickets: Row[] = [];
  for (const f of folders) tickets.push(...(await loadFolder(f, problems, fs)));
  for (const t of tickets) t["key"] = t["id"] !== null ? `${t["epic"]}/${t["id"]}` : `${t["epic"]}/${t["file"]}`;
  const tree: Tree = {
    scope,
    initiative,
    folders: Object.fromEntries(folders.map((f) => [baseName(f), f])),
    epicIds,
    containers: Object.create(null),
    tickets,
    problems,
  };
  for (const f of epics) tree.containers[baseName(f)] = await loadContainer(f, fs);
  resolveRefs(tree);
  checkCycles(tickets, tree.containers);
  return tree;
}

/** Resolve every `after` reference to a key, gate each epic, and flag the drift a leaf files adds. */
function resolveRefs(tree: Tree): void {
  const tickets = tree.tickets;
  const containers = tree.containers;
  const byKey = new Map<string, Row>(tickets.map((t) => [t["key"], t]));
  const slugs = new Map<any, string>(Object.entries(tree.epicIds).map(([slug, id]) => [id, slug]));
  const ids = new Map<string, string>();
  for (const [slug, c] of Object.entries(containers)) if (c["tracker_id"]) ids.set(c["tracker_id"], slug);
  for (const t of tickets) if (t["tracker_id"]) ids.set(t["tracker_id"], t["key"]);
  const owners = new Map<string, string[]>();
  const carriers: [string, string][] = [
    ...Object.entries(containers).map(([slug, c]) => [slug, c["tracker_id"]] as [string, string]),
    ...tickets.map((t) => [t["key"], t["tracker_id"]] as [string, string]),
  ];
  for (const [key, tid] of carriers) {
    if (!tid) continue;
    owners.set(tid.toLowerCase(), [...(owners.get(tid.toLowerCase()) ?? []), key]);
  }
  for (const [tid, keys] of owners) {
    if (keys.length > 1) throw new TicketError(`tracker_id ${pyRepr(tid)} is on more than one ticket: ${keys.join(", ")}`);
  }

  /** A bare number is always a sibling's id and a quoted one never is; an id with a letter is one when a sibling has it. */
  const sibling = (t: Row, ref: unknown, where: string): string | null => {
    const mates = tickets.filter((o) => o["epic"] === t["epic"]);
    if (typeof ref === "number") {
      const hit = mates.find((o) => o["id"] === ref);
      if (hit === undefined) throw new TicketError(`${where}: after ${pyRepr(ref)} names no entry in ${t["epic"]}`);
      return hit["key"];
    }
    for (const o of mates) if (typeof o["id"] === "string" && o["id"] === ref) return o["key"];
    for (const o of mates) {
      if (o["file"] && (ref === o["file"] || ref === o["file"].slice(0, -3))) return o["key"];
    }
    return null;
  };

  const resolve = (t: Row, refs: unknown[], where: string): string[] => {
    const keys: string[] = [];
    for (const ref of refs) {
      const text = pyStr(ref);
      let key: string | null = hasOwn(t, "id") ? sibling(t, ref, where) : null;
      const m = CROSS_RE.exec(text);
      const slug = m ? slugs.get(asId(m[1])) ?? null : null;
      if (key === null && slug) {
        key = `${slug}/${asId(m![2])}`;
        if (!byKey.has(key)) throw new TicketError(`${where}: after ${pyRepr(ref)} names no entry in ${slug}`);
      }
      if (key === null && EPIC_RE.test(text)) {
        if (!hasOwn(containers, text)) throw new TicketError(`${where}: after ${pyRepr(ref)} names no epic in this initiative`);
        key = text;
      }
      if (key === null) key = ids.get(text) ?? null;
      if (key === null && m) {
        throw new TicketError(`${where}: after ${pyRepr(ref)} names no epic id in this initiative's ${BREAKDOWN}`);
      }
      if (key === null && NAME_RE.test(text.endsWith(".md") ? text : `${text}.md`)) {
        throw new TicketError(
          `${where}: after ${pyRepr(ref)} matches no ticket in ${t["epic"]}; a file name names a pulled ticket in the ` +
            "same folder only: use the entry's id, or move a backlog ticket into the epic as an entry",
        );
      }
      if (key === null) throw new TicketError(`${where}: after ${pyRepr(ref)} matches no ticket`);
      if (!keys.includes(key)) keys.push(key);
    }
    return keys;
  };

  for (const t of tickets) {
    const where = t["file"] ? `${t["epic"]}/${t["file"]}` : `${t["epic"]}/${BREAKDOWN} entry ${t["id"]}`;
    t["after"] = resolve(t, t["raw_after"], where);
    delete t["raw_after"];
    const planned = t["entry_after"];
    delete t["entry_after"];
    t["gated_by"] = [];
    const entryHitl = t["entry_hitl"];
    delete t["entry_hitl"];
    t["drift"] = {};
    if (planned !== null && planned !== undefined) {
      const entryAfter = resolve(t, planned, where);
      if (sortedKeys(entryAfter) !== sortedKeys(t["after"])) {
        t["drift"]["after"] = { file: t["after"], entry: entryAfter };
      }
      if (entryHitl !== t["hitl"]) t["drift"]["hitl"] = { file: t["hitl"], entry: entryHitl };
    }
  }
  for (const [slug, c] of Object.entries(containers)) {
    const gates = resolve({ epic: slug }, c["raw_after"], `${slug}.md`);
    delete c["raw_after"];
    c["after"] = gates;
    for (const t of tickets) if (t["epic"] === slug) t["gated_by"] = gates;
  }
}

function sortedKeys(keys: string[]): string {
  return [...keys].sort().join("\u0000");
}

function checkCycles(tickets: Row[], containers: Record<string, Row>): void {
  const graph = new Map<string, string[]>();
  for (const t of tickets) graph.set(t["key"], [...t["after"], ...t["gated_by"]]);
  const members = new Map<string, string[]>();
  for (const t of tickets) members.set(t["epic"], [...(members.get(t["epic"]) ?? []), t["key"]]);
  for (const [slug, c] of Object.entries(containers)) {
    members.set(slug, [...(members.get(slug) ?? []), ...c["after"]]);
  }
  const state = new Map<string, string>();
  const visit = (node: string, path: string[]): void => {
    if (state.get(node) === "done") return;
    if (state.get(node) === "active") throw new TicketError("cycle through " + [...path, node].join(" -> "));
    state.set(node, "active");
    for (const b of graph.get(node) ?? members.get(node) ?? []) visit(b, [...path, node]);
    state.set(node, "done");
  };
  for (const node of graph.keys()) visit(node, []);
}

// ---------------------------------------------------------------- views

function doneKeys(tree: Tree): Set<string> {
  const done = new Set(tree.tickets.filter((t) => t["state"] === "done").map((t) => t["key"]));
  for (const [slug, c] of Object.entries(tree.containers)) if (c["status"] === "done") done.add(slug);
  return done;
}

function inScope(tree: Tree): Row[] {
  return tree.tickets.filter((t) => tree.scope === null || t["epic"] === tree.scope);
}

interface Classified {
  ready_to_refine: Row[];
  ready_to_start: Row[];
  in_progress: Row[];
  blocked: Row[];
}

function classify(tree: Tree): Classified {
  const done = doneKeys(tree);
  // A ticket in review meets an `after`; an epic gate still waits for the epic to be done.
  const met = new Set([...done, ...tree.tickets.filter((t) => t["state"] === "review").map((t) => t["key"])]);
  const groups: Classified = { ready_to_refine: [], ready_to_start: [], in_progress: [], blocked: [] };
  for (const t of inScope(tree)) {
    const state = t["state"];
    if (state === "done" || state === "dropped") continue;
    const unmet = [
      ...t["after"].filter((b: string) => !met.has(b)),
      ...t["gated_by"].filter((b: string) => !done.has(b)),
    ];
    if (t["status"] === "blocked" || pyTruthy(t["blocked_at"])) {
      t["waiting_on"] = unmet;
      groups.blocked.push(t);
    } else if (state === "in-progress" || state === "review") {
      groups.in_progress.push(t);
    } else if (unmet.length) {
      t["waiting_on"] = unmet;
      groups.blocked.push(t);
    } else if (t["refine"] && !t["refined"]) {
      groups.ready_to_refine.push(t); // refining is where its unknown gets settled
    } else if (pyTruthy(t["unknown"])) {
      groups.blocked.push(t);
    } else {
      groups.ready_to_start.push(t);
    }
  }
  return groups;
}

function longestRemainingChain(tree: Tree): (string | number)[] {
  const remaining = new Map(
    tree.tickets.filter((t) => t["state"] !== "done" && t["state"] !== "dropped").map((t) => [t["key"], t]),
  );
  const memo = new Map<string, string[]>();
  const chain = (k: string): string[] => {
    const hit = memo.get(k);
    if (hit) return hit;
    let best: string[] = [];
    for (const b of [...remaining.get(k)!["after"], ...remaining.get(k)!["gated_by"]]) {
      if (!remaining.has(b)) continue;
      const c = chain(b);
      if (c.length > best.length) best = c;
    }
    const out = [...best, k];
    memo.set(k, out);
    return out;
  };
  let longest: string[] = [];
  for (const t of inScope(tree)) {
    if (!remaining.has(t["key"])) continue;
    const c = chain(t["key"]);
    if (c.length > longest.length) longest = c;
  }
  return longest.map((k) => ref(k, null, tree));
}

/** A key as the plan writes it: a sibling's id, `<epic id>.<id>` elsewhere, an epic's slug. */
function ref(key: string, epic: string | null, tree: Tree): string | number {
  const cut = key.indexOf("/");
  const slug = cut === -1 ? key : key.slice(0, cut);
  const n = cut === -1 ? "" : key.slice(cut + 1);
  if (!n) return slug;
  if (asId(n) === null) return key;
  if (slug === epic) return asId(n)!;
  if (hasOwn(tree.epicIds, slug)) return `${tree.epicIds[slug]}.${n}`;
  return key;
}

type Declared = Record<string, { epic: string; needs: unknown }[]>;

/** Each epic the initiative's `tickets.toml` lists, in build order, with its `after` as `[{epic, needs}]`. */
async function declaredAfter(tree: Tree, fs: Fs): Promise<Declared> {
  if (!tree.initiative) return {};
  const listed: Record<string, any>[] = (await loadBreakdown(tree.initiative, fs))["epic"] ?? [];
  const slugs = listed.map((e) => e["slug"]);
  const byId = new Map<any, string>(Object.entries(tree.epicIds).map(([slug, i]) => [i, slug]));
  const out: Declared = Object.create(null);
  for (const e of listed) {
    out[e["slug"]] = [];
    for (const a of e["after"] ?? []) {
      const needed = byId.get(asId(a["epic"])) ?? a["epic"];
      if (!slugs.includes(needed)) {
        throw new TicketError(
          `${baseName(tree.initiative)}/${BREAKDOWN}: ${e["slug"]} is after ${pyRepr(a["epic"] ?? null)}, which is no epic listed`,
        );
      }
      out[e["slug"]].push({ epic: needed, needs: a["needs"] ?? "" });
    }
  }
  return out;
}

/** Declared `after` lines whose waiting epic has tickets but none waiting on the named epic. */
function unpinnedAfter(tree: Tree, declared: Declared): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [slug, edges] of Object.entries(declared)) {
    const mine = tree.tickets.filter((t) => t["epic"] === slug);
    for (const a of edges) {
      const needed = a["epic"];
      const pinned = mine.some((t) =>
        [...t["after"], ...t["gated_by"]].some((b) => b === needed || String(b).startsWith(`${needed}/`)),
      );
      if (mine.length && !pinned && (tree.scope === null || tree.scope === slug)) {
        out.push({ epic: slug, after: needed, needs: a["needs"] });
      }
    }
  }
  return out;
}

/** `undeclared_after`: an entry's `after` into an epic its epic does not declare. `order_conflict`: an epic
 * that waits, declared or through its tickets, on an epic later in the initiative's build order. */
function crossEpicAfter(tree: Tree, declared: Declared): { undeclared_after: unknown[]; order_conflict: unknown[] } {
  const order = Object.keys(declared);
  const undeclared: unknown[] = [];
  const conflicts: unknown[] = [];
  const conflict = (epic: string, needed: string): void => {
    const pair = { epic, after: needed };
    if (
      order.indexOf(needed) > order.indexOf(epic) &&
      !conflicts.some((c) => JSON.stringify(c) === JSON.stringify(pair)) &&
      (tree.scope === null || tree.scope === epic)
    ) {
      conflicts.push(pair);
    }
  };
  for (const [slug, edges] of Object.entries(declared)) for (const a of edges) conflict(slug, a["epic"]);
  for (const [slug, c] of Object.entries(tree.containers)) {
    for (const b of c["after"]) {
      const needed = String(b).split("/")[0];
      if (hasOwn(declared, slug) && hasOwn(declared, needed)) conflict(slug, needed);
    }
  }
  for (const t of tree.tickets) {
    if (!hasOwn(declared, String(t["epic"]))) continue;
    const allowed = new Set(declared[t["epic"]].map((a) => a["epic"]));
    for (const b of t["after"]) {
      const needed = String(b).split("/")[0];
      if (needed === t["epic"] || !hasOwn(declared, needed)) continue;
      conflict(t["epic"], needed);
      if (!allowed.has(needed) && (tree.scope === null || tree.scope === t["epic"])) {
        undeclared.push({
          epic: t["epic"],
          after: needed,
          ref: rowRef(t, tree),
          names: ref(b, t["epic"], tree),
        });
      }
    }
  }
  return { undeclared_after: undeclared, order_conflict: conflicts };
}

/** What `find` resolves to this ticket in the folder the command ran on; never the title,
 * which can repeat across epics. */
function rowRef(t: Row, tree: Tree): string | null {
  if (t["id"] !== null && hasOwn(tree.epicIds, t["epic"])) return `${tree.epicIds[t["epic"]]}.${t["id"]}`;
  if (t["id"] !== null && t["epic"] === tree.scope) return pyStr(t["id"]);
  return t["file"];
}

const PUBLIC_KEYS = [
  "epic",
  "id",
  "file",
  "type",
  "tracker_id",
  "title",
  "status",
  "tracker_status",
  "state",
  "assignee",
  "hitl",
  "risk",
  "covers",
  "estimate",
  "refine",
  "refined",
  "blocked_at",
  "blocked_reason",
] as const;

function publicRow(t: Row, tree: Tree, blocks?: Record<string, string[]>): Record<string, any> {
  const row: Record<string, any> = {};
  for (const key of PUBLIC_KEYS) row[key] = t[key];
  row["ref"] = rowRef(t, tree);
  row["after"] = t["after"].map((b: string) => ref(b, t["epic"], tree));
  if (t["gated_by"].length) row["gated_by"] = t["gated_by"];
  if (blocks !== undefined) row["blocks"] = (blocks[t["key"]] ?? []).map((b) => ref(b, t["epic"], tree));
  if (Object.keys(t["drift"]).length) {
    row["drift"] = { ...t["drift"] };
    if ("after" in row["drift"]) {
      row["drift"]["after"] = Object.fromEntries(
        Object.entries(t["drift"]["after"] as Record<string, string[]>).map(([k, v]) => [
          k,
          v.map((b) => ref(b, t["epic"], tree)),
        ]),
      );
    }
  }
  if (pyTruthy(t["waiting_on"])) row["waiting_on"] = t["waiting_on"].map((b: string) => ref(b, t["epic"], tree));
  for (const key of ["unknown", "plan_checkpoint", "done_checkpoint"]) {
    if (pyTruthy(t[key])) row[key] = t[key];
  }
  return row;
}

// ---------------------------------------------------------------- store

async function findProjectRoot(start: string, fs: Fs): Promise<string | null> {
  let p = normalizePath(start);
  for (;;) {
    if (await isDir(joinPath(p, "_bmad"), fs)) return p;
    // The walk ends at a root — `/` on POSIX, `C:/` or a UNC share on Windows —
    // which is the one path that is its own parent.
    const parent = parentOf(p);
    if (parent === p) return null;
    p = parent;
  }
}

async function projectRootFor(args: Args, start: string, fs: Fs): Promise<string | null> {
  return args.projectRoot !== undefined ? normalizePath(args.projectRoot) : findProjectRoot(start, fs);
}

/** The `[tickets]` table of the project's store config, empty when there is none. */
async function storeConfig(projectRoot: string | null, fs: Fs): Promise<Record<string, any>> {
  if (projectRoot === null) return {};
  const path = joinPath(projectRoot, "_bmad/custom/ticketing-store-config.toml");
  if (!(await isFile(path, fs))) return {};
  const parsed = parseToml(await readText(path, fs)) as Record<string, any>;
  const tickets = parsed["tickets"] ?? {};
  return isRecord(tickets) ? tickets : {};
}

async function storeName(projectRoot: string | null, fs: Fs): Promise<string> {
  const store = (await storeConfig(projectRoot, fs))["store"] ?? "repo";
  return typeof store === "string" && store ? store : "repo";
}

/** The BMad config; the Python loads the project's own config_utils.py, the port uses Task 3. */
async function centralConfig(projectRoot: string, fs: Fs): Promise<Record<string, any>> {
  try {
    return await loadCentralConfig(projectRoot, fs);
  } catch (e) {
    throw new TicketError(e instanceof Error ? e.message : String(e));
  }
}

/** `{output_folder}` for the project: the ticket tree lives beside the documents. */
async function ticketsRoot(projectRoot: string, config: Record<string, any>): Promise<string> {
  const core = config["core"];
  const output = pyStr(isRecord(core) ? core["output_folder"] ?? "" : "");
  return joinPath(projectRoot, output.replaceAll("{project-root}", projectRoot));
}

/** `{output_folder}/{active_initiative}` for the project. */
async function activeInitiative(projectRoot: string, fs: Fs): Promise<string> {
  const config = await centralConfig(projectRoot, fs);
  const core = config["core"];
  const name = isRecord(core) ? core["active_initiative"] : null;
  if (typeof name !== "string" || !name.trim()) {
    throw new TicketError(
      "no active initiative: set core.active_initiative in _bmad/custom/config.user.toml, or pass a folder",
    );
  }
  const folder = normalizePath(joinPath(await ticketsRoot(projectRoot, config), name.trim()));
  if (!(await isDir(folder, fs))) throw new TicketError(`active initiative folder not found: ${folder}`);
  return folder;
}

// ---------------------------------------------------------------- the command line

interface Args {
  projectRoot?: string;
  skillRoot?: string;
  dir?: string;
  backlog?: string | null;
  ref?: string;
  id?: string;
  status?: string;
  assignee?: string;
  blocked?: string;
  synced?: boolean;
}

/** The folder a command runs on: `<dir>`, else the active initiative (and its backlog). */
async function commandFolder(args: Args, fs: Fs): Promise<string> {
  if (args.dir === undefined) {
    const root = await projectRootFor(args, cwd(), fs);
    if (root === null) {
      throw new TicketError("no project root found: no _bmad/ at or above the working directory; pass --project-root");
    }
    // The store is then read from this project even when output_folder lies outside it.
    args.projectRoot = root;
    const folder = await activeInitiative(root, fs);
    const backlog = normalizePath(joinPath(await ticketsRoot(root, await centralConfig(root, fs)), "backlog"));
    args.backlog = (await isDir(backlog, fs)) && backlog !== folder ? backlog : null;
    return folder;
  }
  const given = args.dir;
  const candidate = normalizePath(isAbsolutePath(given) ? given : joinPath(cwd(), given));
  let root: string | null = null;
  if (!(await isDir(candidate, fs)) && !isAbsolutePath(given)) root = await projectRootFor(args, cwd(), fs);
  if (root !== null) {
    let config: Record<string, any> | null = null;
    let bases: string[];
    try {
      config = await centralConfig(root, fs);
      bases = [await ticketsRoot(root, config), root];
    } catch {
      bases = [root];
    }
    if (config !== null) {
      try {
        bases.splice(1, 0, await activeInitiative(root, fs));
      } catch {
        // none set: the store and the project root
      }
    }
    for (const base of bases) {
      const joined = normalizePath(joinPath(base, given));
      if (await isDir(joined, fs)) return joined;
    }
  }
  if (!(await isDir(candidate, fs))) throw new TicketError(`not a folder: ${candidate}`);
  return candidate;
}

/** Add the backlog's view to a command that ran on the active initiative. */
async function withBacklog(
  args: Args,
  out: Record<string, any>,
  view: (folder: string) => Promise<Record<string, any>>,
): Promise<Record<string, any>> {
  const backlog = args.backlog ?? null;
  if (backlog !== null) {
    try {
      out["backlog"] = await view(backlog);
    } catch (e) {
      out["backlog"] = { folder: baseName(backlog), error: pyStr(e instanceof Error ? e.message : e) };
    }
    for (const group of ["ready_to_refine", "ready_to_start", "in_progress", "blocked", "tickets"]) {
      for (const row of (out["backlog"][group] ?? []) as Record<string, any>[]) {
        // An id here could also name a ticket in the initiative; the file name cannot.
        row["ref"] = row["file"] || row["ref"];
      }
    }
  }
  return out;
}

/** The ticket a reference names and the tree holding it: the folder's, else, with no `<dir>`, the backlog's. */
async function locate(args: Args, folder: string, text: string, fs: Fs): Promise<[Row, Tree]> {
  const tree = await loadTree(folder, fs);
  try {
    return [resolveTicket(tree, text), tree];
  } catch (miss) {
    if (!(miss instanceof NoMatch)) throw miss;
    const backlog = args.backlog ?? null;
    if (backlog === null) throw miss;
    try {
      const other = await loadTree(backlog, fs);
      other["fallback"] = true;
      return [resolveTicket(other, text), other];
    } catch {
      throw miss; // not there, or a backlog that cannot be read
    }
  }
}

async function nextView(folder: string, fs: Fs): Promise<Record<string, any>> {
  const tree = await loadTree(folder, fs);
  const declared = await declaredAfter(tree, fs);
  const out: Record<string, any> = { folder: baseName(folder) };
  for (const [group, rows] of Object.entries(classify(tree))) {
    out[group] = (rows as Row[]).map((t) => publicRow(t, tree));
  }
  out["unpinned_after"] = unpinnedAfter(tree, declared);
  Object.assign(out, crossEpicAfter(tree, declared));
  if (tree.problems.length) out["problems"] = tree.problems;
  return out;
}

async function cmdNext(args: Args, fs: Fs): Promise<Record<string, any>> {
  const folder = await commandFolder(args, fs);
  const store = await storeName(await projectRootFor(args, folder, fs), fs);
  if (store !== "repo" && !args.synced) {
    throw new StoreRefusal(`store is ${store}: sync ticket status from the tracker first, then rerun with --synced`);
  }
  const out = { store, ...(await nextView(folder, fs)) };
  return withBacklog(args, out, (f) => nextView(f, fs));
}

/** The id a new ticket in the folder takes: one past the highest number its entries and leaf files use, or
 * `next_id` at the top of its `tickets.toml` when that is higher. */
async function nextId(tree: Tree, folder: string, fs: Fs): Promise<number> {
  // `6a` uses up 6: a lettered id is a split of that number.
  const used = tree.tickets
    .filter((t) => t["epic"] === folder)
    .map((t) => /^\d+/.exec(pyStr(t["id"])));
  // An entry moved to another folder took its id along; the counter it left keeps that id from coming back.
  const floor = (await loadBreakdown(tree.folders[folder], fs))["next_id"] ?? 0;
  const highest = used.reduce((acc: number, m) => (m ? Math.max(acc, parseInt(m[0], 10)) : acc), 0);
  return Math.max(highest + 1, floor);
}

async function statusView(folder: string, fs: Fs): Promise<Record<string, any>> {
  const tree = await loadTree(folder, fs);
  const declared = await declaredAfter(tree, fs);
  const tickets = inScope(tree);
  const counts: Record<string, number> = {};
  for (const t of tickets) counts[t["state"]] = (counts[t["state"]] ?? 0) + 1;
  const blocks: Record<string, string[]> = {};
  for (const t of tree.tickets) {
    for (const b of t["after"]) (blocks[b] ??= []).push(t["key"]);
  }
  const out: Record<string, any> = {
    folder: baseName(folder),
    tickets: tickets.map((t) => publicRow(t, tree, blocks)),
    counts: { total: tickets.length, ...counts },
    longest_remaining_chain: longestRemainingChain(tree),
    unpinned_after: unpinnedAfter(tree, declared),
    ...crossEpicAfter(tree, declared),
  };
  if (tree.problems.length) out["problems"] = tree.problems;
  if (tree.scope === null) {
    const epics: Record<string, any>[] = [];
    for (const [slug, c] of Object.entries(tree.containers)) {
      epics.push({
        slug,
        id: tree.epicIds[slug] ?? null,
        status: c["status"],
        after: declared[slug] ?? [],
        gated_by: c["after"],
        blocks: (blocks[slug] ?? []).map((b) => ref(b, null, tree)),
        next_id: await nextId(tree, slug, fs),
      });
    }
    out["epics"] = epics;
  } else {
    out["next_id"] = await nextId(tree, tree.scope, fs);
  }
  return out;
}

async function cmdStatus(args: Args, fs: Fs): Promise<Record<string, any>> {
  const folder = await commandFolder(args, fs);
  const store = await storeName(await projectRootFor(args, folder, fs), fs);
  const out = { store, ...(await statusView(folder, fs)) };
  return withBacklog(args, out, (f) => statusView(f, fs));
}

const PULLED = `---
{frontmatter}
---

# {heading}

## Description

{description}

## Acceptance Criteria

Verify: {verify}

## References

- parent — {parent}
{references}{notes}`;

function titleSlug(title: string): string {
  const ascii = title.normalize("NFKD").replace(/[^\x00-\x7f]/g, "");
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "untitled";
}

/** The one row a reference names; see `<ref>` in the Python's module docstring. */
function resolveTicket(tree: Tree, text: string): Row {
  const tickets = tree.tickets;
  const needle = text.trim();
  if (!needle) throw new TicketError("the ticket reference is empty");
  const low = needle.toLowerCase();
  let hits: Row[] = [];
  const m = CROSS_RE.exec(needle);
  if (m) {
    const slug = new Map(Object.entries(tree.epicIds).map(([s, i]) => [i, s])).get(asId(m[1]) as any) ?? null;
    hits = tickets.filter((t) => slug && t["epic"] === slug && t["id"] === asId(m[2]));
  } else if (asId(needle) !== null && tree.scope) {
    hits = tickets.filter((t) => t["epic"] === tree.scope && t["id"] === asId(needle));
  }
  if (!hits.length && typeof asId(needle) === "string") {
    // An id with a letter names its ticket in any epic before the words of a title can match it.
    hits = tickets.filter((t) => t["id"] === asId(needle));
  }
  for (const pool of [inScope(tree), tickets]) {
    if (!hits.length) {
      hits = pool.filter(
        (t) => t["file"] && (low === t["file"].toLowerCase() || low === t["file"].slice(0, -3).toLowerCase()),
      );
    }
  }
  if (!hits.length) hits = tickets.filter((t) => t["tracker_id"] && low === t["tracker_id"].toLowerCase());
  if (!hits.length && !/^\d+$/.test(needle)) {
    hits = inScope(tree).filter((t) => t["title"].toLowerCase().includes(low));
  }
  if (!hits.length) throw new NoMatch(`no ticket matches ${pyRepr(needle)}`);
  if (hits.length > 1) {
    throw new TicketError(`${pyRepr(needle)} matches more than one ticket: ${hits.map((t) => refName(t)).join(", ")}`);
  }
  return hits[0];
}

/** The leaf file's stem, or the one `pull` gives it: `<type>-<slug of the title>`, with `-<id>` added when a
 * file or an earlier entry in the folder already has that name. */
function leafStem(t: Row, tree: Tree): string {
  if (t["file"]) return t["file"].slice(0, -3);
  const stem = `${t["type"]}-${titleSlug(pyStr(t["title"]))}`;
  const taken = new Set<string>();
  for (const o of tree.tickets) {
    if (o === t) break;
    if (o["epic"] === t["epic"] && !o["file"]) taken.add(`${o["type"]}-${titleSlug(pyStr(o["title"]))}`);
  }
  for (const o of tree.tickets) if (o["epic"] === t["epic"] && o["file"]) taken.add(o["file"].slice(0, -3));
  return taken.has(stem) ? `${stem}-${t["id"]}` : stem;
}

/** The joined plan, else `<leaf stem>-plan.md`. */
function planPath(t: Row, tree: Tree): string {
  const folder = tree.folders[t["epic"]];
  if (t["plan"]) return joinPath(folder, t["plan"]);
  return joinPath(folder, `${leafStem(t, tree)}-plan.md`);
}

async function cmdFind(args: Args, fs: Fs): Promise<Record<string, any>> {
  const folder = await commandFolder(args, fs);
  const [t, tree] = await locate(args, folder, args.ref!, fs);
  const home = tree.folders[t["epic"]];
  const row = publicRow(t, tree);
  if (tree.fallback && t["file"]) row["ref"] = t["file"]; // as the backlog view names it
  // Once a leaf file exists it holds the text and the entry's copy is no longer kept up. Unlisted and stray
  // leaves have no entry.
  const entry: Row = t["file"] ? {} : t;
  const container = joinPath(home, `${baseName(home)}.md`); // an epic's file, or the initiative's for a leaf under one
  return {
    ...row,
    folder: baseName(home),
    description: entry["description"] ?? "",
    verify: entry["verify"] ?? "",
    references: entry["references"] ?? [],
    notes: entry["notes"] ?? [],
    unknown: t["unknown"] ?? "",
    epic_file: (await isFile(container, fs)) ? container : null,
    story_file: t["file"] ? joinPath(home, t["file"]) : null,
    plan: planPath(t, tree),
  };
}

function refName(t: Row): string {
  return `${t["file"] || t["id"]} in ${t["epic"]}`;
}

async function cmdPull(args: Args, fs: Fs): Promise<Record<string, any>> {
  const folder = await commandFolder(args, fs);
  const tree = await loadTree(folder, fs);
  const n = asId(args.id);
  const t = inScope(tree).find((c) => c["epic"] === baseName(folder) && c["id"] === n);
  if (n === null || t === undefined) throw new TicketError(`${baseName(folder)}/${BREAKDOWN} has no entry ${args.id}`);
  if (t["file"]) throw new TicketError(`entry ${args.id} is already pulled: ${t["file"]}`);
  const path = await writeLeaf(t, tree, await projectRootFor(args, folder, fs), fs);
  return { file: baseName(path), refine: t["refine"] };
}

/** Write an entry's leaf file from the entry and name it on the row. */
async function writeLeaf(t: Row, tree: Tree, root: string | null, fs: Fs): Promise<string> {
  const folder = tree.folders[t["epic"]];
  const path = joinPath(folder, `${leafStem(t, tree)}.md`);
  if (await fs.exists(path)) throw new TicketError(`${baseName(path)} exists already; change entry ${t["id"]}'s title`);
  const after = t["after"].map((b: string) => pyStr(ref(b, t["epic"], tree)));
  const epicFile = joinPath(folder, `${baseName(folder)}.md`);
  let parent: string;
  if (root !== null) {
    try {
      parent = relativePath(epicFile, root);
    } catch {
      parent = epicFile; // another root: the absolute path it already is
    }
  } else {
    parent = epicFile;
  }
  const notes = [...(pyTruthy(t["unknown"]) ? [`Unknown: ${t["unknown"]}`] : []), ...t["notes"]];
  // Other empty fields are left out; `after` and `hitl` stay because `status` compares them with the entry.
  // No status: the build writes it when it starts.
  const fields: [string, string][] = [
    ["id", pyStr(t["id"])],
    ["type", t["type"]],
    ["title", pyJsonString(pyStr(t["title"]), false)],
    ["parent", t["epic"]],
    ["covers", t["covers"].length ? `[${t["covers"].join(", ")}]` : ""],
    ["after", `[${after.join(", ")}]`],
    ["refined", t["refine"] ? "false" : ""],
    ["hitl", t["hitl"] ? "true" : "false"],
    ["risk", t["risk"]],
    ["estimate", t["estimate"] !== "" ? pyJsonString(pyStr(t["estimate"]), false) : ""],
  ];
  const values: Record<string, string> = {
    frontmatter: fields
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    heading: pyStr(t["title"]),
    parent,
    description: pyStr(t["description"]),
    verify: pyStr(t["verify"]),
    references: t["references"].map((r: string) => `- ${r}\n`).join(""),
    notes: notes.length ? "\n## Notes\n\n" + notes.map((n: string) => `- ${n}\n`).join("") : "",
  };
  const body = PULLED.replace(/\{(\w+)\}/g, (_, key: string) => values[key]);
  await fs.writeText(path, body);
  t["file"] = baseName(path);
  return path;
}

/** A double-quoted scalar that `parseFrontmatter` reads back exactly. */
function quoted(value: string): string {
  // parseFrontmatter cuts a value at "   #" and splits lines on these characters, so they go in as escapes.
  const text = pyJsonString(value, false).replaceAll("   #", "   \\u0023");
  const separators = new RegExp(
    `[${String.fromCharCode(0x85, 0x2028, 0x2029)}]`,
    "g",
  );
  return text.replace(separators, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** Set frontmatter values in a file, keeping its line endings and byte-order mark; an empty value removes
 * the line. Returns the new text. */
async function editFrontmatter(path: string, values: Record<string, string>, fs: Fs): Promise<string> {
  const raw = await fs.readText(path);
  const bom = raw.startsWith("﻿");
  let text = (bom ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
  for (const [key, value] of Object.entries(values)) text = setFrontmatterValue(text, key, value);
  let data = text;
  if (raw.includes("\r\n")) data = data.replace(/\n/g, "\r\n");
  if (bom) data = "﻿" + data;
  await fs.writeText(path, data);
  return text;
}

/** Write status, assignee, and the blocked fields to the ticket's plan; never to its leaf file. */
async function cmdMark(args: Args, fs: Fs): Promise<Record<string, any>> {
  const folder = await commandFolder(args, fs);
  const store = await storeName(await projectRootFor(args, folder, fs), fs);
  if (store !== "repo") {
    throw new StoreRefusal(`store is ${store}: change status through the store's write verb, not this script`);
  }
  const [t, tree] = await locate(args, folder, args.ref!, fs);
  const path = planPath(t, tree);
  let blocked: Record<string, string> = { blocked_at: "", blocked_reason: "" };
  if (args.blocked !== undefined) {
    blocked = { blocked_at: quoted(todayIso()), blocked_reason: quoted(args.blocked) };
  }
  const created = !t["plan"];
  let text: string;
  if (created) {
    const assignee = args.assignee !== undefined ? args.assignee : t["assignee"];
    const fields: [string, string][] = [
      ["title", quoted(pyStr(t["title"]))],
      ["ticket", t["id"] !== null ? pyStr(t["id"]) : quoted(t["file"].slice(0, -3))],
      ["status", args.status!],
      ["assignee", pyTruthy(assignee) ? quoted(pyStr(assignee)) : ""],
      ...Object.entries(blocked),
    ];
    text = "---\n" + fields.filter(([, v]) => v !== "").map(([k, v]) => `${k}: ${v}\n`).join("") + "---\n";
    // The Python opens "xb" so a name already taken fails; the Fs has no exclusive create.
    if (await fs.exists(path)) {
      throw new TicketError(`${baseName(path)} exists already and is not the plan for ${refName(t)}`);
    }
    await fs.writeText(path, text);
  } else {
    const values: Record<string, string> = { status: args.status!, ...blocked };
    if (args.assignee !== undefined) values["assignee"] = quoted(args.assignee);
    text = await editFrontmatter(path, values, fs);
  }
  const fm = parseFrontmatter(text, true);
  const out: Record<string, any> = { plan: path, created };
  for (const key of PLAN_FIELDS) out[key] = fm[key] ?? "";
  return out;
}

/** The frontmatter lines one mirrored ticket sets, each validated. */
function mirrorValues(item: Record<string, any>, where: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of ["tracker_id", "remote", "assignee"]) {
    if (!(key in item)) continue;
    let value = item[key];
    // A tracker that numbers its items returns a number.
    if (key === "tracker_id" && typeof value === "number" && Number.isInteger(value)) value = pyStr(value);
    if (typeof value !== "string") throw new TicketError(`${where}: ${key} must be a string`);
    values[key] = pyTruthy(value) ? quoted(value) : "";
  }
  if ("tracker_status" in item) {
    values["tracker_status"] = oneOf(item["tracker_status"], STATES, where, "tracker_status");
  }
  if ("after" in item) {
    if (!Array.isArray(item["after"])) throw new TicketError(`${where}: after must be a list`);
    const parts: string[] = [];
    for (const b of item["after"]) {
      const ok = (typeof b === "number" && Number.isInteger(b)) || typeof b === "string";
      if (!ok || (typeof b === "string" && (b.includes(",") || !b))) {
        throw new TicketError(`${where}: after takes ids and names without commas, not ${pyRepr(b)}`);
      }
      // A number stays bare, a sibling's id; a string is quoted, so a tracker id of digits stays one.
      parts.push(typeof b === "number" ? pyStr(b) : quoted(b));
    }
    values["after"] = `[${parts.join(", ")}]`;
  }
  return values;
}

/** The one ticket that already carries a tracker id; nothing else about it is matched. */
function byTrackerId(tree: Tree, trackerId: string): Row {
  const hits = tree.tickets.filter((t) => t["tracker_id"] && t["tracker_id"].toLowerCase() === trackerId.toLowerCase());
  if (!hits.length) throw new NoMatch(`no ticket carries tracker_id ${pyRepr(trackerId)}`);
  if (hits.length > 1) throw new TicketError(`tracker_id ${pyRepr(trackerId)} is on more than one ticket`);
  return hits[0];
}

/** Write what the tracker returned into each ticket's leaf file; never `status`, which is the build's. */
async function cmdMirror(args: Args, stdin: string, fs: Fs): Promise<Record<string, any>> {
  const folder = await commandFolder(args, fs);
  const root = await projectRootFor(args, folder, fs);
  const store = await storeName(root, fs);
  if (store === "repo") throw new StoreRefusal("store is repo: there is no tracker to mirror");
  let items: unknown;
  try {
    items = JSON.parse(stdin);
  } catch (e) {
    throw new TicketError(`mirror reads a JSON array of objects on stdin: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(items) || !items.every(isRecord)) {
    throw new TicketError("mirror reads a JSON array of objects on stdin");
  }
  const folders = [folder];
  const trees = [await loadTree(folder, fs)];
  if (args.backlog) {
    try {
      trees.push(await loadTree(args.backlog, fs));
      folders.push(args.backlog);
    } catch {
      // a backlog that cannot be read holds no match
    }
  }
  const work: [Row, Tree, Record<string, string>][] = [];
  const unmatched: Record<string, unknown>[] = [];
  const seen = new Set<Row>();
  for (const [index, item] of items.entries()) {
    const n = index + 1;
    const name = "ref" in item ? item["ref"] : item["tracker_id"];
    const where = `item ${n} (${pyRepr(name)})`;
    const unknown = Object.keys(item).filter((k) => !MIRROR_KEYS.includes(k));
    if (unknown.length) {
      const hint = unknown.includes("status") ? "; status is the build's and is never mirrored" : "";
      throw new TicketError(`${where}: unknown key ${pyRepr(unknown[0])}${hint}`);
    }
    if (typeof name === "boolean" || !(typeof name === "number" || typeof name === "string") || name === "") {
      throw new TicketError(`item ${n}: give a ref, or the tracker_id of a ticket that already carries it`);
    }
    const values = mirrorValues(item, where);
    let hit: [Row, Tree] | null = null;
    let miss: NoMatch | null = null;
    for (const tree of trees) {
      try {
        // A tracker id alone never falls back to an entry id or a title that happens to match it.
        const t = "ref" in item ? resolveTicket(tree, pyStr(name)) : byTrackerId(tree, pyStr(name));
        hit = [t, tree];
        break;
      } catch (e) {
        if (!(e instanceof NoMatch)) throw e;
        miss = miss ?? e;
      }
    }
    if (hit === null) {
      unmatched.push({ ref: name, error: miss ? miss.message : "None" });
      continue;
    }
    if (seen.has(hit[0])) throw new TicketError(`${where}: ${refName(hit[0])} is named twice`);
    seen.add(hit[0]);
    work.push([hit[0], hit[1], values]);
  }
  const undo: [string, string | null][] = [];
  const mirrored: Record<string, unknown>[] = [];
  try {
    for (const [t, tree, values] of work) {
      const pulled = !t["file"];
      let path: string;
      if (pulled) {
        path = await writeLeaf(t, tree, root, fs);
        undo.push([path, null]);
      } else {
        path = joinPath(tree.folders[t["epic"]], t["file"]);
        undo.push([path, await fs.readText(path)]);
      }
      await editFrontmatter(path, values, fs);
      const refOut = tree === trees[0] ? rowRef(t, tree) : baseName(path);
      mirrored.push({ ref: refOut, file: baseName(path), pulled, set: Object.keys(values).sort() });
    }
    for (const f of folders) await loadTree(f, fs);
  } catch (e) {
    for (const [path, raw] of undo) {
      try {
        // A leaf this call pulled is removed again; everything it edited is restored byte for byte.
        if (raw === null) await fs.delete(path);
        else await fs.writeText(path, raw);
      } catch {
        // keep restoring the rest; the first failure is the one reported
      }
    }
    // The discovery procedure needs `unmatched` even when a known ticket's `after` named one of them.
    const error = new TicketError(`nothing was mirrored: ${e instanceof Error ? e.message : e}`);
    if (unmatched.length) error.data["unmatched"] = unmatched;
    throw error;
  }
  return { folder: baseName(folder), store, mirrored, unmatched };
}

// ---------------------------------------------------------------- argv

const COMMANDS = ["next", "status", "find", "pull", "mark", "mirror"] as const;

const HELP: Record<string, string> = {
  next: `Tickets grouped by what can happen next, in build order.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, \`backlog\` holds the same view of the backlog folder, each row's \`ref\`
its file name.

Output: \`ready_to_refine\` (needs full criteria first), \`ready_to_start\`, \`in_progress\`, and \`blocked\`; a
\`blocked\` row has \`waiting_on\`, its unmet prerequisites, \`blocked_reason\`, or \`unknown\`, a question to
settle before it starts. A prerequisite is met when it is done or in review; an epic's own gate
(\`gated_by\`) waits for that epic to be done. \`unpinned_after\`, \`undeclared_after\`, \`order_conflict\`, and
\`problems\` report a tree that needs fixing. Every row carries \`ref\`, which find resolves, \`state\`, and
\`risk\`; a row has \`drift\` when the leaf file's \`after\` or \`hitl\` differs from the entry's, and \`plan_checkpoint\` or
\`done_checkpoint\` when the entry sets it.`,
  status: `Every ticket in build order.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, \`backlog\` holds the same view of the backlog folder, each row's \`ref\`
its file name.

Output: \`tickets\` (each with \`status\`, \`tracker_status\`, \`state\`, \`blocks\`, and \`drift\` when the leaf file's
\`after\` or \`hitl\` differs from the entry's, with both values), \`counts\` by state, \`next_id\` (the id a new
ticket in the folder takes: one past the highest number used, or \`next_id\` at the top of the folder's
\`tickets.toml\` when that is higher; on an initiative, in each \`epics\` row), \`longest_remaining_chain\`, and
on an initiative \`epics\` with each epic's declared \`after\`.`,
  find: `The one ticket a reference names.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, a ticket the initiative does not hold is looked for in the backlog folder.
<ref> is \`<epic id>.<entry id>\`, an entry id inside an epic folder (one with a letter, from any
folder), a tracker id, a file name, or an unbroken phrase from the title that matches one ticket.

Output: the ticket's row; its entry's \`description\`, \`verify\`, \`references\`, and \`notes\`, all empty once
the entry is pulled, when \`story_file\` holds them; \`unknown\`; its \`folder\`; and the absolute paths
\`epic_file\` (the file of the container it is under, null in a backlog folder), \`story_file\` (null until
the entry is pulled), and \`plan\` (where its plan is or goes; it may not exist yet).`,
  pull: `Write an entry's leaf file from its entry.

<dir> is the epic folder and <id> the entry's id. The file is \`<type>-<slug of the title>.md\`: \`after\` and
\`hitl\` always, other fields only when the entry sets them, no status.`,
  mark: `Set a ticket's status in its plan; never in its leaf file. Repo store only.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, a ticket the initiative does not hold is looked for in the backlog folder.
<ref> is \`<epic id>.<entry id>\`, an entry id inside an epic folder (one with a letter, from any
folder), a tracker id, a file name, or an unbroken phrase from the title that matches one ticket.

A ticket with no plan gets one holding only frontmatter. \`--blocked\` sets \`blocked_at\` (today) and
\`blocked_reason\`; without it both are cleared.`,
  mirror: `Write what a tracker returned into leaf files. Tracker stores only.

<dir> is an epic folder, a backlog folder, or an initiative folder (all its epics): a path, or a
folder's name under the store or the active initiative. Left out, it is the active initiative.
With no <dir>, a ticket the initiative does not hold is looked for in the backlog folder.

Stdin is a JSON array, one object per ticket: \`ref\` (or \`tracker_id\` alone, which matches only a ticket
that already carries that id) and any of \`tracker_id\`, \`remote\`, \`tracker_status\` (${STATES.join(", ")}),
\`assignee\`, and \`after\` (a list: a number is a sibling's id, a string any other prerequisite form, a
tracker id included). Only the keys given are written, an empty string removes the line, and \`status\` is
never written. An entry with no leaf file is pulled first. A ticket the tree does not hold is listed under
\`unmatched\` and the rest are written; values that would leave the tree unreadable write nothing, and the
error then still lists \`unmatched\`.`,
};

const USAGE = "usage: tickets.py {next|status|find|pull|mark|mirror} [--project-root <root>] [<args>]";

/** argparse's usage errors, minus its exact usage-line wrapping: exit 2. */
class UsageError extends Error {
  prog = "tickets.py";
}

/** Pull `--project-root` and `--skill-root` out of argv wherever they sit. */
function takeGlobal(argv: string[]): { rest: string[]; args: Args } {
  const rest: string[] = [];
  const args: Args = {};
  const values: Record<string, keyof Args> = { "--project-root": "projectRoot", "--skill-root": "skillRoot" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    if (values[flag]) {
      const value = eq === -1 ? argv[++i] : token.slice(eq + 1);
      if (value === undefined) throw new UsageError(`argument ${flag}: expected one argument`);
      (args as Record<string, unknown>)[values[flag]] = value;
      continue;
    }
    rest.push(token);
  }
  return { rest, args };
}

/** Split a command's remaining argv into positionals and the flags it accepts. */
function takeOptions(
  rest: string[],
  spec: Record<string, "flag" | "value">,
): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("-") || token === "-") {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    const kind = spec[flag];
    if (kind === undefined) throw new UsageError(`unrecognized arguments: ${token}`);
    if (kind === "flag") {
      flags[flag] = true;
      continue;
    }
    const value = eq === -1 ? rest[++i] : token.slice(eq + 1);
    if (value === undefined) throw new UsageError(`argument ${flag}: expected one argument`);
    flags[flag] = value;
  }
  return { positional, flags };
}

function required(positional: string[], count: number, names: string[]): void {
  if (positional.length < count) {
    throw new UsageError(`the following arguments are required: ${names.slice(positional.length).join(", ")}`);
  }
}

/** Point `tickets()` at the command's argv: the Python's argparse, minus its exact usage wrapping. */
function parseTicketArgs(command: string, rest: string[], args: Args): Args {
  switch (command) {
    case "next": {
      const { positional, flags } = takeOptions(rest, { "--synced": "flag" });
      if (positional.length > 1) throw new UsageError(`unrecognized arguments: ${positional.slice(1).join(" ")}`);
      args.dir = positional[0];
      args.synced = flags["--synced"] === true;
      return args;
    }
    case "status":
    case "mirror": {
      const { positional } = takeOptions(rest, {});
      if (positional.length > 1) throw new UsageError(`unrecognized arguments: ${positional.slice(1).join(" ")}`);
      args.dir = positional[0];
      return args;
    }
    case "find": {
      const { positional } = takeOptions(rest, {});
      if (positional.length > 2) throw new UsageError(`unrecognized arguments: ${positional.slice(2).join(" ")}`);
      required(positional, 1, ["ref"]);
      [args.dir, args.ref] = positional.length === 2 ? positional : [undefined, positional[0]];
      return args;
    }
    case "pull": {
      const { positional } = takeOptions(rest, {});
      if (positional.length > 2) throw new UsageError(`unrecognized arguments: ${positional.slice(2).join(" ")}`);
      required(positional, 2, ["dir", "id"]);
      [args.dir, args.id] = positional;
      return args;
    }
    case "mark": {
      const { positional, flags } = takeOptions(rest, { "--assignee": "value", "--blocked": "value" });
      if (positional.length > 3) throw new UsageError(`unrecognized arguments: ${positional.slice(3).join(" ")}`);
      required(positional, 2, ["ref", "status"]);
      [args.dir, args.ref, args.status] = positional.length === 3 ? positional : [undefined, ...positional];
      if (!(STATUSES as readonly string[]).includes(args.status!)) {
        throw new UsageError(
          `argument status: invalid choice: ${pyRepr(args.status)} (choose from ${STATUSES.join(", ")})`,
        );
      }
      if (flags["--assignee"] !== undefined) args.assignee = flags["--assignee"] as string;
      if (flags["--blocked"] !== undefined) args.blocked = flags["--blocked"] as string;
      return args;
    }
    default:
      throw new UsageError(`argument command: invalid choice: ${pyRepr(command)}`);
  }
}

// ---------------------------------------------------------------- read_store.py

const STORE_RE = /^[a-z0-9][a-z0-9-]*$/;
const PROJECT_FILE = "_bmad/custom/ticketing-store-config.toml";

function mergeShallow(base: Record<string, any>, over: Record<string, any>): Record<string, any> {
  const out = { ...base };
  for (const [key, value] of Object.entries(over)) {
    out[key] = isRecord(value) && isRecord(out[key]) ? mergeShallow(out[key], value) : value;
  }
  return out;
}

/** read_store.py's `store_config`: the store's starter under the project's own file. */
async function storeConfigMerged(
  projectRoot: string,
  starters: string,
  fs: Fs,
): Promise<Record<string, any>> {
  const path = joinPath(projectRoot, PROJECT_FILE);
  let project: Record<string, any> = {};
  if (await isFile(path, fs)) project = parseToml(await readText(path, fs)) as Record<string, any>;
  const tickets = project["tickets"];
  const raw: unknown = isRecord(tickets) ? tickets["store"] : null;
  const store: string = typeof raw === "string" && raw ? raw : "repo"; // as tickets.py reads it
  const starter = joinPath(starters, `${store}-ticketing.toml`);
  let config = project;
  if (STORE_RE.test(store) && (await isFile(starter, fs))) {
    config = mergeShallow(parseToml(await readText(starter, fs)) as Record<string, any>, project);
  }
  if (isRecord(config["tickets"])) config["tickets"]["store"] = store;
  return config;
}

function extractKey(data: unknown, dotted: string): unknown {
  let current: any = data;
  for (const part of dotted.split(".")) {
    if (isRecord(current) && part in current) current = current[part];
    else return undefined; // the Python's _MISSING
  }
  return current;
}

/** `Path.expanduser` for the shapes a project is likely to write. */
function expandHome(p: string): string {
  if (p !== "~" && !p.startsWith("~/")) return p;
  const env = typeof process !== "undefined" ? process.env : undefined;
  const home = env?.HOME || env?.USERPROFILE || "";
  if (!home) return p;
  return p === "~" ? home : joinPath(home, p.slice(2));
}

/** The read_store.py CLI, which the runtime dispatches as `read_store`. Its store
 * starters come from `--starters-dir`, or `<skill-root>/config` (the Python's own
 * default, spelled out by the patched call sites); with neither flag it refuses. */
async function readStore(
  argv: string[],
  fs: Fs,
  globals: Args,
): Promise<{ stdout: string; exitCode: number }> {
  const keys: string[] = [];
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];
  const valued: Record<string, string> = {
    "--project-root": "root",
    "--starters-dir": "startersDir",
    "--skill-root": "skill",
    "-k": "key",
    "--key": "key",
  };
  const tokens = argv[0] === "read_store" ? argv.slice(1) : argv;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const eq = token.indexOf("=");
    const flag = eq === -1 ? token : token.slice(0, eq);
    if (flag === "--starters") {
      flags["starters"] = true;
      continue;
    }
    if (valued[flag]) {
      const value = eq === -1 ? tokens[++i] : token.slice(eq + 1);
      if (value === undefined) throw new UsageError(`argument ${flag}: expected one argument`);
      if (valued[flag] === "key") keys.push(value);
      else flags[valued[flag]] = value;
      continue;
    }
    positional.push(token);
  }
  if (positional.length) throw new UsageError(`unrecognized arguments: ${positional.join(" ")}`);
  // The entry point lifts `--project-root`/`--skill-root` out first; keep them.
  if (globals.projectRoot !== undefined && flags["root"] === undefined) flags["root"] = globals.projectRoot;
  if (globals.skillRoot !== undefined && flags["skill"] === undefined) flags["skill"] = globals.skillRoot;

  // The Python's starters dir is its own `../config`, which a bundle cannot know:
  // the patched call sites pass `--skill-root`, so that is the default here, and a
  // run that names neither flag is refused rather than quietly losing the layer.
  const startersDir = flags["startersDir"] as string | undefined;
  const skillRoot = flags["skill"] as string | undefined;
  if (startersDir === undefined && skillRoot === undefined) {
    throw new UsageError(
      "one of --skill-root or --starters-dir is required: the store's starters are the skill's config/ folder",
    );
  }
  const starters = expandHome(startersDir ?? `${skillRoot}/config`);
  try {
    if (flags["starters"]) {
      const found: Record<string, string> = {};
      const names = (await fs.list(starters)).filter((n) => n.endsWith("-ticketing.toml")).sort();
      for (const name of names) {
        const data = parseToml(await readText(joinPath(starters, name), fs)) as Record<string, any>;
        const store: unknown = isRecord(data["tickets"]) ? data["tickets"]["store"] : null;
        found[(store ?? name) as string] = data["description"] ?? "";
      }
      return { stdout: pyJson(found, { indent: 2 }) + "\n", exitCode: 0 };
    }
    if (!flags["root"]) throw new UsageError("--project-root is required");
    const data = await storeConfigMerged(flags["root"] as string, starters, fs);
    if (!keys.length) return { stdout: pyJson(data, { indent: 2 }) + "\n", exitCode: 0 };
    const found: Record<string, unknown> = {};
    const missing: string[] = [];
    for (const key of keys) {
      const value = extractKey(data, key);
      if (value === undefined) missing.push(key);
      else found[key] = value;
    }
    let out = missing.map((key) => `missing: ${key}\n`).join("");
    if (keys.length === 1) {
      if (missing.length) return { stdout: out, exitCode: 2 };
      const value = found[keys[0]];
      out += typeof value === "string" ? value.replace(/\n+$/, "") + "\n" : pyJson(value, { indent: 2 }) + "\n";
      return { stdout: out, exitCode: 0 };
    }
    out += pyJson(found, { indent: 2 }) + "\n";
    return { stdout: out, exitCode: missing.length ? 2 : 0 };
  } catch (e) {
    if (e instanceof UsageError) throw e;
    return { stdout: `error: cannot read the store config: ${e instanceof Error ? e.message : String(e)}\n`, exitCode: 1 };
  }
}

// ---------------------------------------------------------------- entry

function errorJson(e: Error): string {
  const body: Record<string, unknown> = { error: e.message };
  if (e instanceof TicketError) Object.assign(body, e.data);
  return pyJson(body, { ensureAscii: false }) + "\n";
}

/** Read the mirror's stdin: the plan's CLI passes one Fs and no stream. */
async function readStdin(): Promise<string> {
  if (typeof process === "undefined" || !process.stdin) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The ticket tree's commands, plus `read_store` (which Task 6's dispatcher
 * routes here) and `-h/--help`. Prints one JSON object, as the Python does,
 * and returns its exit code: 0 ok, 1 a malformed tree, 2 a refusal or a usage
 * error. `stdin` carries `mirror`'s JSON; left out, it is read from the
 * process's own stdin.
 */
export async function tickets(
  argv: string[],
  fs: Fs,
  stdin?: string,
): Promise<{ stdout: string; exitCode: number }> {
  const { rest, args } = takeGlobal(argv);
  const command = rest[0];
  if (command === undefined) return { stdout: "usage: tickets.py {next|status|find|pull|mark|mirror}\n", exitCode: 2 };
  if (!(COMMANDS as readonly string[]).includes(command)) {
    if (command === "-h" || command === "--help") {
      return { stdout: `${USAGE}\n\n${HELP["next"]}\n`, exitCode: 0 };
    }
    // No subcommand: the Python's read_store.py, which the runtime routes here.
    try {
      return await readStore(rest, fs, args);
    } catch (e) {
      if (e instanceof UsageError) return { stdout: `${USAGE}\nread_store.py: error: ${e.message}\n`, exitCode: 2 };
      return { stdout: errorJson(e as Error), exitCode: 1 };
    }
  }
  if (rest.slice(1).includes("-h") || rest.slice(1).includes("--help")) {
    return { stdout: `${USAGE}\n\n${HELP[command]}\n`, exitCode: 0 };
  }
  try {
    const parsed = parseTicketArgs(command, rest.slice(1), args);
    let out: Record<string, any>;
    if (command === "next") out = await cmdNext(parsed, fs);
    else if (command === "status") out = await cmdStatus(parsed, fs);
    else if (command === "find") out = await cmdFind(parsed, fs);
    else if (command === "pull") out = await cmdPull(parsed, fs);
    else if (command === "mark") out = await cmdMark(parsed, fs);
    else out = await cmdMirror(parsed, stdin ?? (await readStdin()), fs);
    return { stdout: pyJson(out, { ensureAscii: false }) + "\n", exitCode: 0 };
  } catch (e) {
    if (e instanceof UsageError) {
      return { stdout: `${USAGE}\ntickets.py ${command}: error: ${e.message}\n`, exitCode: 2 };
    }
    if (e instanceof StoreRefusal) return { stdout: pyJson({ error: e.message }, { ensureAscii: true }) + "\n", exitCode: 2 };
    return { stdout: errorJson(e as Error), exitCode: 1 };
  }
}

import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";
import { normalizePath, pathDirname, toForwardSlashes } from "./paths";

/**
 * Port of `skills/bmad/scripts/knowledge.py` — report the knowledge documents
 * the installed modules offer. Every output is the Python's, byte for byte:
 * `json.dumps(..., ensure_ascii=False)` on one line, exit 0 with the report in
 * stdout, exit 2 for the refusals argparse used to write. Where a golden in
 * `__tests__/goldens/misc/` disagrees with this file, this file changes.
 *
 * The Python is also the shared module its neighbours import: `roster.py` reads
 * `scan`, `read_document`, `install_command` and `ROSTER_NAME` from it, and
 * `validate_manifests.py` reads `HELP_NAME`, `TOPICS_DIR`, `ROSTER_NAME` and
 * `read_document`. Those are exported here for the same reason, with the same
 * shapes.
 *
 * Substitutions a bundle cannot share, all documented at the capture script:
 * a missing path's OSError text is synthesized as `[Errno 2] No such file or
 * directory: '<path>'`; a malformed TOML file's message is smol-toml's, not
 * tomllib's; and the `--skill-root` argument Task 1's patcher added to the call
 * sites — argparse refused it, the runtime accepts it and, like the Python
 * would have (it used its own location for nothing), ignores it.
 */

// ---------------------------------------------------------------- python plumbing

export function isTable(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Python `repr(value)`, for the error messages that quote one back. */
export function pyRepr(value: unknown): string {
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
  const entries = Object.entries(value as Record<string, unknown>);
  return "{" + entries.map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`).join(", ") + "}";
}

export function pyJsonString(value: string, ensureAscii: boolean): string {
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
export function pyJson(value: unknown, opts: { ensureAscii?: boolean; indent?: number } = {}): string {
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

/** `Path(text).resolve()` as far as a filesystem-free port can go: absolute
 * and dot-segment-normalized, symlinks left alone. Windows roots (`C:\…`, a
 * UNC share) are recognized and folded to the runtime's `/` strings. */
export function resolvePath(text: string): string {
  return normalizePath(text);
}

export function dirname(p: string): string {
  return pathDirname(p);
}

/** Python `PurePosixPath(entry)`: empty and "." components are dropped. */
export function purePosixParts(entry: string): string[] {
  return entry.split("/").filter((part) => part !== "" && part !== ".");
}

export function posixName(parts: string[]): string {
  return parts.length ? parts[parts.length - 1] : "";
}

/** A path's last segment — `Path(folder).name`. Windows separators fold first
 * so a `C:\a\skill` folder names its skill on either host. */
export function folderName(path: string): string {
  return posixName(purePosixParts(toForwardSlashes(path)));
}

export function posixStem(name: string): string {
  const cut = name.lastIndexOf(".");
  return cut <= 0 ? name : name.slice(0, cut);
}

// ---------------------------------------------------------------- fs probes

/** `Path.is_dir()` for an `Fs`: a path is a directory when it can be listed. */
export async function isDirectory(fs: Fs, path: string): Promise<boolean> {
  try {
    await fs.list(path);
    return true;
  } catch {
    return false;
  }
}

/** `Path.is_file()` for an `Fs`: it exists and is not a directory. */
export async function isFile(fs: Fs, path: string): Promise<boolean> {
  if (!(await fs.exists(path))) return false;
  return !(await isDirectory(fs, path));
}

/** Python's OSError text for a path that is not there — the one read failure a
 * caller can see through `Fs`, which reports no errno. */
export function missingPathError(path: string): string {
  return `[Errno 2] No such file or directory: '${path}'`;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** UTF-8 byte length, the unit `READ_LIMIT` counts in. */
function byteLength(text: string): number {
  if (!/[^\x00-\x7f]/.test(text)) return text.length;
  return new TextEncoder().encode(text).length;
}

// ---------------------------------------------------------------- constants

export const MANIFEST_NAME = "bmod.toml";
export const TOPICS_DIR = "help";
export const HELP_NAME = `${TOPICS_DIR}/help.md`;
export const ROSTER_NAME = "roster.toml";
export const RETIRED_NAME = "retired.toml";
export const MIGRATION_TABLE = "migration";
const MIGRATION_FIELDS = ["module", "from", "to", "title", "summary", "detect", "guide"] as const;
const MIGRATION_NAME = /^migration-([0-9]+)\.toml$/;
export const READ_LIMIT = 1024 * 1024;

export interface Problem {
  kind: string;
  [key: string]: unknown;
}

export interface ModuleRecord {
  code: string;
  folder: string;
  table: Record<string, unknown>;
  skills: string[];
}

interface SkillEntry {
  skill: string;
  module: string | null;
  bmod: string | null;
  root: string;
  source?: unknown;
}

export interface Scan {
  folders: Map<string, string>;
  modules: ModuleRecord[];
  skills: SkillEntry[];
  problems: Problem[];
}

// ---------------------------------------------------------------- documents

/**
 * `read_document`: refuse anything that is not a plain file inside the folder.
 * The Python resolves symlinks; `Fs` has none, so the containment check is
 * lexical — every path this port builds is joined from a safe relative part.
 */
export async function readDocument(fs: Fs, path: string, folder: string): Promise<string> {
  const resolved = resolvePath(path);
  const base = resolvePath(folder);
  if (!(resolved === base || resolved.startsWith(base.endsWith("/") ? base : base + "/"))) {
    throw new Error("resolves outside the skill folder");
  }
  if (!(await fs.exists(path))) throw new Error(missingPathError(path));
  if (await isDirectory(fs, path)) throw new Error("is not a regular file");
  const text = await fs.readText(path);
  if (byteLength(text) > READ_LIMIT) throw new Error(`is larger than ${READ_LIMIT} bytes`);
  return text;
}

/** `safe_skill_relative`: a bmod.toml path that cannot escape the skill
 * folder, or null if it can. Shared by the three scripts, as in the Python. */
export function safeSkillRelative(entry: string): string[] | null {
  if (!entry || entry.includes("://") || entry.includes("\\") || entry.includes(":")) return null;
  if (entry.startsWith("/")) return null;
  const parts = purePosixParts(entry);
  if (parts.includes("..") || posixName(parts) === "") return null;
  return parts;
}

/** `install_command`: the `npx skills` command that installs a github source,
 * or null when the source has no such command. */
export function installCommand(source: unknown, skill: string): string | null {
  if (typeof source !== "string" || !source.startsWith("github:")) return null;
  const parts = source.slice("github:".length).split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return `npx skills add ${parts[0]}/${parts[1]} --skill ${skill}`;
}

// ---------------------------------------------------------------- scan

function manifestProblem(folder: string, problem: string): Problem {
  return {
    kind: "manifest",
    skill: folder.slice(folder.lastIndexOf("/") + 1),
    manifest: `${folder}/${MANIFEST_NAME}`,
    problem,
  };
}

export async function scan(fs: Fs, roots: string[]): Promise<Scan> {
  const folders = new Map<string, string>();
  const modules: ModuleRecord[] = [];
  const problems: Problem[] = [];
  const recordCodes = new Map<string, string>();
  const pending: { root: string; folder: string; table: Record<string, unknown>; ownRecord: boolean }[] = [];

  for (const root of roots) {
    let entries: string[];
    try {
      entries = await fs.list(root);
    } catch (error) {
      // Python iterates the root; a missing root is an OSError it reports, an
      // unreadable one the same way. The message is synthesized for the case
      // `Fs` can distinguish (the path is not there at all).
      const text = (await fs.exists(root)) ? errorText(error) : missingPathError(root);
      problems.push({ kind: "root", root, problem: `cannot read root ${root}: ${text}` });
      continue;
    }
    entries.sort(compareStrings);
    for (const name of entries) {
      const folder = `${root}/${name}`;
      if (!(await isDirectory(fs, folder))) continue;
      // The first root wins a folder name outright: a project copy shadows a
      // user copy even when the project copy carries no bmod.toml.
      if (folders.has(name)) continue;
      folders.set(name, folder);
      const manifest = `${folder}/${MANIFEST_NAME}`;
      if (!(await isFile(fs, manifest))) continue;
      let data: Record<string, unknown>;
      try {
        data = parseToml(await fs.readText(manifest)) as Record<string, unknown>;
      } catch (error) {
        problems.push(manifestProblem(folder, `cannot use ${manifest}: ${errorText(error)}`));
        continue;
      }
      if (!("bmod" in data) && !("skill" in data)) {
        problems.push(manifestProblem(folder, `${manifest} has neither a [bmod] nor a [skill] table`));
        continue;
      }
      let skill: Record<string, unknown> | null = isTable(data.skill) ? data.skill : null;
      if ("skill" in data && !isTable(data.skill)) {
        problems.push(manifestProblem(folder, `${manifest}: 'skill' is not a table`));
        skill = null;
      }
      if ("bmod" in data) {
        const module = readRecord(folder, data.bmod, skill !== null, problems);
        if (module !== null) {
          recordCodes.set(name, module.code);
          const first = modules.find((other) => other.code.toLowerCase() === module.code.toLowerCase());
          if (first === undefined) modules.push(module);
          else {
            problems.push({
              kind: "module",
              skill: name,
              problem:
                `${name}: module ${pyRepr(module.code)} is already recorded by ` +
                `${first.folder.slice(first.folder.lastIndexOf("/") + 1)}; ` +
                `${first.folder.slice(first.folder.lastIndexOf("/") + 1)} is used`,
            });
          }
        }
      }
      if (skill !== null) pending.push({ root, folder, table: skill, ownRecord: "bmod" in data });
    }
  }

  const skills: SkillEntry[] = pending.map(({ root, folder, table, ownRecord }) =>
    resolveSkill(root, folder, table, ownRecord, recordCodes),
  );
  problems.push(...absentRecords(skills, folders));
  for (const entry of skills) delete entry.source;
  return { folders, modules, skills, problems };
}

function readRecord(
  folder: string,
  table: unknown,
  hasSkill: boolean,
  problems: Problem[],
): ModuleRecord | null {
  const manifest = `${folder}/${MANIFEST_NAME}`;
  if (!isTable(table)) {
    problems.push(manifestProblem(folder, `${manifest}: 'bmod' is not a table`));
    return null;
  }
  const code = table.code;
  if (typeof code !== "string" || !code) {
    problems.push(manifestProblem(folder, `${manifest}: [bmod] has no usable 'code'`));
    return null;
  }
  const listed = table.skills;
  let members: string[];
  if (listed === undefined) {
    // A record that is also a skill, with no list, is its own one member.
    members = hasSkill ? [folderName(folder)] : [];
  } else if (Array.isArray(listed) && listed.every((name) => typeof name === "string" && name)) {
    members = [...new Set(listed as string[])];
  } else {
    problems.push(manifestProblem(folder, `${manifest}: [bmod] 'skills' is not a list of skill names`));
    members = [];
  }
  return { code, folder, table, skills: members };
}

function resolveSkill(
  root: string,
  folder: string,
  table: Record<string, unknown>,
  ownRecord: boolean,
  recordCodes: Map<string, string>,
): SkillEntry {
  const name = folderName(folder);
  let bmod: string | null = ownRecord ? name : ((table.bmod as string | undefined) ?? null);
  if (typeof bmod !== "string" || !bmod) bmod = null;
  return {
    skill: name,
    module: bmod !== null && recordCodes.has(bmod) ? recordCodes.get(bmod)! : null,
    bmod,
    root,
    source: table.source,
  };
}

/** One problem per module record that skills name and no root holds. */
function absentRecords(skills: SkillEntry[], folders: Map<string, string>): Problem[] {
  const problems: Problem[] = [];
  const byBmod = new Map<string, SkillEntry[]>();
  for (const entry of skills) {
    if (entry.module !== null) continue;
    if (entry.bmod === null) {
      problems.push({
        kind: "manifest",
        skill: entry.skill,
        problem: `${entry.skill}: [skill] does not name its module record under 'bmod'`,
      });
      continue;
    }
    const group = byBmod.get(entry.bmod);
    if (group) group.push(entry);
    else byBmod.set(entry.bmod, [entry]);
  }
  for (const bmod of [...byBmod.keys()].sort(compareStrings)) {
    const entries = byBmod.get(bmod)!;
    const names = entries.map((entry) => entry.skill).sort(compareStrings);
    const state = folders.has(bmod) ? "has no usable module record" : "is not installed";
    const problem: Problem = {
      kind: "module",
      bmod,
      skills: names,
      problem: `module record ${bmod} ${state}; it is named by ${names.join(", ")}`,
    };
    const command = folders.has(bmod) ? null : installCommand(entries[0].source, bmod);
    if (command) {
      problem.install = command;
      problem.problem = `${problem.problem}; install it with \`${command}\``;
    }
    problems.push(problem);
  }
  return problems;
}

// ---------------------------------------------------------------- collect

interface KnowledgeDocument {
  module: string;
  path: string;
  skills: string[];
  installed_skills: string[];
  reported_from: string;
  content?: string;
}

interface Topic {
  module: string;
  topic: string;
  path: string;
  file: string;
}

interface Migration {
  module: string;
  path: string;
  file: string;
  from: string;
  to: string;
  title: string;
}

export interface KnowledgeReport {
  roots: string[];
  skills: SkillEntry[];
  documents: KnowledgeDocument[];
  topics: Topic[];
  migrations: Migration[];
  problems: Problem[];
}

export async function collect(fs: Fs, roots: string[], includeContent = false): Promise<KnowledgeReport> {
  const found = await scan(fs, roots);
  const problems = found.problems;
  const documents = new Map<string, KnowledgeDocument>();

  for (const module of found.modules) {
    const declared = module.table.knowledge ?? [];
    if (!Array.isArray(declared)) {
      problems.push({
        kind: "knowledge",
        skill: folderName(module.folder),
        problem: "[bmod] 'knowledge' is not a list",
      });
      continue;
    }
    let entries: unknown[] = declared;
    if (await isFile(fs, `${module.folder}/${HELP_NAME}`)) entries = [{ path: HELP_NAME }, ...entries];
    for (const entry of entries) {
      await recordDocument(fs, documents, problems, found.folders, module, entry, includeContent);
    }
  }

  const topics: Topic[] = [];
  for (const module of found.modules) {
    for (const topic of await moduleTopics(fs, module, problems)) {
      if (!documents.has(`${module.code}\u0000${topic.path}`)) topics.push(topic);
    }
  }

  const migrations: Migration[] = [];
  for (const module of found.modules) migrations.push(...(await moduleMigrations(fs, module, problems)));

  return {
    roots: roots.map((root) => root),
    skills: [...found.skills].sort((a, b) => compareStrings(String(a.skill), String(b.skill))),
    documents: [...documents.values()].sort(
      (a, b) => compareStrings(a.module, b.module) || compareStrings(a.path, b.path),
    ),
    topics: [...topics].sort((a, b) => compareStrings(a.module, b.module) || compareStrings(a.path, b.path)),
    migrations: [...migrations].sort(
      (a, b) => compareStrings(a.module, b.module) || (migrationNumber(a.path)! - migrationNumber(b.path)!),
    ),
    problems,
  };
}

async function recordDocument(
  fs: Fs,
  documents: Map<string, KnowledgeDocument>,
  problems: Problem[],
  folders: Map<string, string>,
  module: ModuleRecord,
  entry: unknown,
  includeContent: boolean,
): Promise<void> {
  const own = folderName(module.folder);
  const name = isTable(entry) ? entry.path : undefined;
  if (typeof name !== "string") {
    problems.push({
      kind: "knowledge",
      skill: own,
      problem: `knowledge entry ${pyRepr(entry)} has no path`,
    });
    return;
  }
  const relative = safeSkillRelative(name);
  if (relative === null) {
    problems.push({
      kind: "knowledge",
      skill: own,
      problem: `knowledge names unsafe path ${pyRepr(name)}`,
    });
    return;
  }
  const covered = isTable(entry) ? (entry.skills ?? "*") : "*";
  let skills: string[];
  if (covered === "*") {
    skills = [...module.skills];
  } else if (Array.isArray(covered) && covered.every((skill) => typeof skill === "string" && skill)) {
    skills = [...new Set(covered as string[])];
  } else {
    problems.push({
      kind: "knowledge",
      skill: own,
      problem: `knowledge entry ${pyRepr(name)}: 'skills' is neither "*" nor a list of skill names`,
    });
    return;
  }
  const key = `${module.code}\u0000${relative.join("/")}`;
  if (documents.has(key)) {
    problems.push({ kind: "knowledge", skill: own, problem: `knowledge names ${pyRepr(name)} twice` });
    return;
  }

  const path = `${module.folder}/${relative.join("/")}`;
  let text: string;
  try {
    text = await readDocument(fs, path, module.folder);
  } catch (error) {
    problems.push({
      kind: "document",
      skill: own,
      document: path,
      problem: `${path}: ${errorText(error)}`,
    });
    return;
  }

  const document: KnowledgeDocument = {
    module: module.code,
    path: relative.join("/"),
    skills,
    installed_skills: skills.filter((skill) => folders.has(skill)),
    reported_from: own,
  };
  if (includeContent) document.content = text;
  documents.set(key, document);
}

async function moduleTopics(fs: Fs, module: ModuleRecord, problems: Problem[]): Promise<Topic[]> {
  const own = folderName(module.folder);
  let names: string[];
  try {
    names = await fs.list(`${module.folder}/${TOPICS_DIR}`);
  } catch {
    return [];
  }
  names.sort(compareStrings);
  const topics: Topic[] = [];
  for (const name of names) {
    if (!name.endsWith(".md") || name === "help.md") continue;
    const path = `${module.folder}/${TOPICS_DIR}/${name}`;
    try {
      await readDocument(fs, path, module.folder);
    } catch (error) {
      problems.push({
        kind: "document",
        skill: own,
        document: path,
        problem: `${path}: ${errorText(error)}`,
      });
      continue;
    }
    topics.push({
      module: module.code,
      topic: posixStem(name),
      path: `${TOPICS_DIR}/${name}`,
      file: path,
    });
  }
  return topics;
}

async function moduleMigrations(fs: Fs, module: ModuleRecord, problems: Problem[]): Promise<Migration[]> {
  let names: string[];
  try {
    names = await fs.list(module.folder);
  } catch {
    return [];
  }
  names = names
    .filter((name) => name.endsWith(".toml") && ![MANIFEST_NAME, ROSTER_NAME, RETIRED_NAME].includes(name))
    .sort(compareStrings);
  const migrations: Migration[] = [];
  for (const name of names) {
    const path = `${module.folder}/${name}`;
    let data: Record<string, unknown>;
    try {
      data = parseToml(await readDocument(fs, path, module.folder)) as Record<string, unknown>;
    } catch (error) {
      problems.push(migrationProblem(module.folder, path, errorText(error)));
      continue;
    }
    if (!(MIGRATION_TABLE in data)) continue;
    const table = data[MIGRATION_TABLE];
    if (!isTable(table)) {
      problems.push(migrationProblem(module.folder, path, "'migration' is not a table"));
      continue;
    }
    const fields: Record<string, unknown> = {};
    for (const field of MIGRATION_FIELDS) fields[field] = table[field];
    const missing: string[] = MIGRATION_FIELDS.filter(
      (field) => typeof fields[field] !== "string" || !(fields[field] as string).trim(),
    );
    const checklist = table.checklist;
    if (
      !Array.isArray(checklist) ||
      !checklist.length ||
      !checklist.every((item) => typeof item === "string" && item.trim())
    ) {
      missing.push("checklist");
    }
    if (missing.length) {
      problems.push(migrationProblem(module.folder, path, `[migration] needs non-empty ${missing.join(", ")}`));
      continue;
    }
    if (fields.module !== module.code) {
      problems.push(
        migrationProblem(
          module.folder,
          path,
          `[migration] module ${pyRepr(fields.module)} is not this record's ${pyRepr(module.code)}`,
        ),
      );
      continue;
    }
    if (migrationNumber(name) === null) {
      problems.push(migrationProblem(module.folder, path, "a migration file must be named migration-<n>.toml"));
      continue;
    }
    migrations.push({
      module: module.code,
      path: name,
      file: path,
      from: fields.from as string,
      to: fields.to as string,
      title: fields.title as string,
    });
  }
  const numbers = migrations.map((migration) => migrationNumber(migration.path));
  const duplicated = new Set(numbers.filter((number) => numbers.filter((n) => n === number).length > 1));
  for (const item of migrations) {
    if (duplicated.has(migrationNumber(item.path))) {
      problems.push(migrationProblem(module.folder, item.file, "another migration of this module has the same number"));
    }
  }
  return migrations
    .filter((item) => !duplicated.has(migrationNumber(item.path)))
    .sort((a, b) => migrationNumber(a.path)! - migrationNumber(b.path)!);
}

export function migrationNumber(name: string): number | null {
  const match = MIGRATION_NAME.exec(name);
  return match ? Number(match[1]) : null;
}

function migrationProblem(folder: string, path: string, problem: string): Problem {
  return {
    kind: "migration",
    skill: folderName(folder),
    document: path,
    problem: `${path}: ${problem}`,
  };
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------------------------------------------------------------- the command

/** The uniform port shape: the Python's stdout and exit code out. */
export async function knowledge(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }> {
  const roots: string[] = [];
  let content = false;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--root") {
      const value = argv[++i];
      if (value === undefined) return usageError("argument --root: expected one argument");
      roots.push(value);
    } else if (token.startsWith("--root=")) {
      roots.push(token.slice("--root=".length));
    } else if (token === "--content") {
      content = true;
    } else if (token === "--skill-root") {
      // Task 1's patch artifact: the call site invoked the script from the
      // skill's own folder. knowledge.py never used its own location, so the
      // Python would have ignored it too — argparse simply refused the flag.
      const value = argv[++i];
      if (value === undefined) return usageError("argument --skill-root: expected one argument");
    } else if (!token.startsWith("--skill-root=")) {
      return usageError(`unrecognized arguments: ${token}`);
    }
  }
  if (!roots.length) return usageError("the following arguments are required: --root");
  const report = await collect(fs, roots, content);
  return { stdout: `${pyJson(report)}\n`, exitCode: 0 };
}

function usageError(message: string): { stdout: string; exitCode: number } {
  return { stdout: `knowledge: error: ${message}`, exitCode: 2 };
}

import { parse as parseToml } from "smol-toml";
import { absolutePath } from "./compat";
import type { Fs } from "./fs";
import {
  HELP_NAME,
  TOPICS_DIR,
  collect,
  compareStrings,
  dirname,
  errorText,
  folderName,
  installCommand,
  isDirectory,
  isFile,
  isTable,
  missingPathError,
  purePosixParts,
  pyRepr,
  readDocument,
  resolvePath,
  safeSkillRelative,
} from "./knowledge";

/**
 * Port of `skills/bmad/scripts/validate_manifests.py` — check every bmod.toml
 * under a repository's `skills/` against the runtime that has to read it. The Python
 * loads two neighbours from the same folder: `knowledge.py` (Task 5b's port)
 * and `setup.py`, whose reader owns the `bmod.toml` shape (`parse_bmod_file`,
 * `read_retired_file`, `discover_installation`, the SemVer rules). Everything
 * this script uses from `setup.py` is ported below under the same names, so the
 * file keeps the Python's own framing.
 *
 * Where a golden in `__tests__/goldens/misc/` disagrees with this file, this
 * file changes. Substitutions a bundle cannot share, all documented at the
 * capture script: smol-toml's parse-error text in place of tomllib's (no golden
 * carries one), and `Path.is_symlink()` checks, which `Fs` cannot answer — a
 * tree with symlinks in `skills/` would be judged as if they were plain files.
 */

const MANIFEST_NAME = "bmod.toml";
const RETIRED_NAME = "retired.toml";
const ROSTER_NAME = "roster.toml";
const RECORD_PREFIX = "bmod-";
const STAMP_PROBE = "0.0.0-stamp-check";
const MESSAGE_KEYS = ["pre_install_message", "post_install_message"] as const;

const QUESTION_KEYS = ["key", "prompt", "default"] as const;
const OPTIONAL_QUESTION_KEYS = ["scope"] as const;
const QUESTION_SCOPES = ["team", "user"] as const;
const UPDATE_SOURCE_PREFIXES = ["github:", "https://", "file:", "plugin:"] as const;
const MODULE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const RESERVED_MODULE_DIRS = new Set(["_config", "custom", "modules", "scripts"]);

const TABLE_HEADER = /[ \t]*\[\[?[^\[\]\n]+\]\]?[ \t]*(?:#[^\n]*)?\r?\n?/;
const BMOD_HEADER = /[ \t]*\[[ \t]*bmod[ \t]*\][ \t]*(?:#[^\n]*)?\r?\n?/;
const VERSION_LINE =
  /(?<head>[ \t]*version[ \t]*=[ \t]*)"[^"\n]*"(?<tail>[ \t]*(?:#[^\n]*)?\r?\n?)/;

const SEMVER =
  /(?<major>0|[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)(?:-(?<prerelease>(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+(?<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?/;

/** `re.fullmatch(pattern, text)` for the SemVer rules and the stamped line checks. */
function fullmatch(re: RegExp, text: string): RegExpExecArray | null {
  return new RegExp(`^(?:${re.source})$`).exec(text);
}

// ---------------------------------------------------------------- the bmod.toml reader (setup.py)

interface Requirement {
  skill: string;
  version: string | null;
  source: string | null;
}

interface KnowledgeEntry {
  path: string;
  skills: string[] | null;
}

interface Rename {
  old: string;
  new: string;
}

interface ConfigQuestion {
  module: string;
  key: string;
  prompt: string;
  default: string;
  scope: string;
}

export interface ParsedBmod {
  code: string;
  version: string;
  update_source: string;
  skills: string[] | null;
  knowledge: KnowledgeEntry[];
  questions: ConfigQuestion[];
  required_skills: Requirement[];
  recommended_skills: Requirement[];
  pre_install_message: string;
  post_install_message: string;
}

interface ParsedRetired {
  renamed: Rename[];
  removed: string[];
}

export interface ParsedSkill {
  bmod: string | null;
  source: string | null;
  scripts: string[][];
  required_skills: Requirement[];
  recommended_skills: Requirement[];
}

export interface ParsedFile {
  bmod: ParsedBmod | null;
  skill: ParsedSkill | null;
}

interface InstalledFile {
  folder: string;
  source: string;
  file: string;
  parsed: ParsedFile;
}

interface Installation {
  files: InstalledFile[];
  // The module and duplicate entries carry what `setup.py status` reads; the
  // only ported consumer here — `runtime_problems` — reads the two below.
  modules: unknown[];
  missing_records: Record<string, unknown>[];
  problems: Record<string, unknown>[];
  roots: string[];
  folders: Map<string, string>;
  duplicates: Record<string, unknown>[];
}

/** `parse_bmod_file`: the fields BMad uses, every other key ignored. */
export function parseBmodFile(path: string, text: string): ParsedFile {
  const data = parseTomlText(text, path);
  const bmodTable = data.bmod;
  const skillTable = data.skill;
  if (bmodTable === undefined && skillTable === undefined) {
    throw new Error(`bmod file ${path} must hold a [bmod] table, a [skill] table, or both`);
  }
  for (const [name, table] of [
    ["bmod", bmodTable],
    ["skill", skillTable],
  ] as const) {
    if (table !== undefined && !isTable(table)) {
      throw new Error(`bmod file ${path} field ${pyRepr(name)} must be a table`);
    }
  }
  const bmod = bmodTable !== undefined ? parseBmodTable(bmodTable as Record<string, unknown>, path) : null;
  const skill =
    skillTable !== undefined
      ? parseSkillTable(skillTable as Record<string, unknown>, path, bmod === null)
      : null;
  return { bmod, skill };
}

function parseBmodTable(table: Record<string, unknown>, path: string): ParsedBmod {
  const code = requiredString(table, "bmod", "code", path);
  if (!MODULE_NAME.test(code) || RESERVED_MODULE_DIRS.has(code.toLowerCase())) {
    throw new Error(`bmod file ${path} field 'bmod.code' has unsafe value ${pyRepr(code)}`);
  }
  const version = requiredString(table, "bmod", "version", path);
  const updateSource = requiredString(table, "bmod", "update_source", path);
  validateSource(updateSource, "bmod.update_source", path);
  const skills = table.skills;
  return {
    code,
    version,
    update_source: updateSource,
    skills: skills !== undefined ? parseSkillNames(skills, "bmod.skills", path) : null,
    knowledge: parseKnowledge(table.knowledge, path),
    questions: parseQuestions(table.config_questions, code, path),
    required_skills: parseRequirements(table.required_skills, "bmod.required_skills", path),
    recommended_skills: parseRequirements(table.recommended_skills, "bmod.recommended_skills", path),
    pre_install_message: optionalString(table, "bmod", "pre_install_message", path),
    post_install_message: optionalString(table, "bmod", "post_install_message", path),
  };
}

/** The skills a module renamed or removed, from the `retired.toml` beside its record. */
async function readRetiredFile(fs: Fs, folder: string): Promise<ParsedRetired> {
  const path = `${folder}/${RETIRED_NAME}`;
  if (!(await isFile(fs, path))) return { renamed: [], removed: [] };
  const data = parseTomlText(await fs.readText(path), path);
  const renamed = parseRenamed(data.renamed, path);
  const removed = parseSkillNames(data.removed ?? [], "removed", path);
  const retired = [...renamed.map((rename) => rename.old), ...removed];
  const repeated = retired.find((name) => retired.filter((other) => other === name).length > 1);
  if (repeated !== undefined) {
    throw new Error(`bmod file ${path} retires ${pyRepr(repeated)} more than once in renamed and removed`);
  }
  return { renamed, removed };
}

/** Skills the module renamed, as `{ from, to }` tables. */
function parseRenamed(value: unknown, path: string): Rename[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'renamed' must be a list of tables`);
  }
  const renamed: Rename[] = [];
  value.forEach((entry, index) => {
    const field = `renamed[${index}]`;
    if (!isTable(entry)) throw new Error(`bmod file ${path} field ${field} must be a table`);
    const names: string[] = [];
    for (const key of ["from", "to"]) {
      const name = entry[key];
      if (typeof name !== "string" || !SKILL_NAME.test(name)) {
        throw new Error(`bmod file ${path} field '${field}.${key}' must be a skill name; found ${pyRepr(name)}`);
      }
      names.push(name);
    }
    if (names[0] === names[1]) {
      throw new Error(`bmod file ${path} field ${field} renames ${pyRepr(names[0])} to itself`);
    }
    renamed.push({ old: names[0], new: names[1] });
  });
  return renamed;
}

function parseSkillTable(table: Record<string, unknown>, path: string, standalone: boolean): ParsedSkill {
  let bmod: string | null = null;
  let source: string | null = null;
  if (standalone) {
    bmod = requiredString(table, "skill", "bmod", path);
    if (!SKILL_NAME.test(bmod)) {
      throw new Error(`bmod file ${path} field 'skill.bmod' has unsafe value ${pyRepr(bmod)}`);
    }
    source = requiredString(table, "skill", "source", path);
    validateSource(source, "skill.source", path);
  }
  return {
    bmod,
    source,
    scripts: parseScripts(table.scripts, path),
    required_skills: parseRequirements(table.required_skills, "skill.required_skills", path),
    recommended_skills: parseRequirements(table.recommended_skills, "skill.recommended_skills", path),
  };
}

function validateSource(value: string, field: string, path: string): void {
  const prefix = UPDATE_SOURCE_PREFIXES.find((candidate) => value.startsWith(candidate));
  if (prefix === undefined || !value.slice(prefix.length)) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} must name a source`);
  }
  if (prefix === "github:") {
    const parts = value.slice(prefix.length).split("/");
    if (parts.length < 2 || parts.some((part) => !part)) {
      throw new Error(`bmod file ${path} field ${pyRepr(field)} github source must name owner/repo`);
    }
  }
  if (prefix === "https://" && [...value].some((character) => /\s/.test(character))) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} must be a valid HTTPS URL`);
  }
}

function parseSkillNames(value: unknown, field: string, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} must be a list of skill names`);
  }
  const names: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !SKILL_NAME.test(entry)) {
      throw new Error(`bmod file ${path} field ${pyRepr(field)} has unsafe skill name ${pyRepr(entry)}`);
    }
    if (names.includes(entry)) {
      throw new Error(`bmod file ${path} field ${pyRepr(field)} repeats ${pyRepr(entry)}`);
    }
    names.push(entry);
  }
  return names;
}

function parsePath(entry: unknown, field: string, path: string, seen: string[][]): string[] {
  if (typeof entry !== "string" || !entry) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} has invalid value ${pyRepr(entry)}`);
  }
  const relative = safeSkillRelative(entry);
  if (relative === null) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} has unsafe value ${pyRepr(entry)}`);
  }
  if (seen.some((other) => other.join("/") === relative.join("/"))) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} repeats ${pyRepr(entry)}`);
  }
  return relative;
}

/** The module's help documents, as paths inside the bmod folder. */
function parseKnowledge(value: unknown, path: string): KnowledgeEntry[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'bmod.knowledge' must be a list of tables`);
  }
  const knowledge: KnowledgeEntry[] = [];
  value.forEach((entry, index) => {
    const field = `bmod.knowledge[${index}]`;
    if (!isTable(entry)) throw new Error(`bmod file ${path} field ${field} must be a table`);
    const relative = parsePath(entry.path, `${field}.path`, path, knowledge.map((item) => item.path.split("/")));
    const skills = entry.skills ?? "*";
    const asPath = relative.join("/");
    if (skills === "*") {
      knowledge.push({ path: asPath, skills: null });
      return;
    }
    if (typeof skills === "string") {
      throw new Error(`bmod file ${path} field '${field}.skills' must be "*" or a list of skill names`);
    }
    knowledge.push({ path: asPath, skills: parseSkillNames(skills, `${field}.skills`, path) });
  });
  return knowledge;
}

/** A flat list of skills. A plain name comes from the declaring file's own source. */
function parseRequirements(value: unknown, field: string, path: string): Requirement[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field ${pyRepr(field)} must be a list of skills`);
  }
  const requirements: Requirement[] = [];
  value.forEach((entry, index) => {
    const item = `${field}[${index}]`;
    let requirement: Requirement;
    if (typeof entry === "string") {
      requirement = { skill: entry, version: null, source: null };
    } else if (isTable(entry)) {
      const skill = entry.skill;
      if (typeof skill !== "string") {
        throw new Error(`bmod file ${path} field '${item}.skill' must be a string and is required`);
      }
      const source = entry.source;
      if (typeof source !== "string") {
        throw new Error(`bmod file ${path} field '${item}.source' must be a string and is required`);
      }
      validateSource(source, `${item}.source`, path);
      const minimum = entry.version;
      if (minimum !== undefined) {
        if (typeof minimum !== "string") {
          throw new Error(`bmod file ${path} field '${item}.version' must be a string`);
        }
        if (parseOrderableSemver(minimum) === null) {
          throw new Error(
            `bmod file ${path} field '${item}.version' must be an orderable version; found ${pyRepr(minimum)}`,
          );
        }
      }
      requirement = { skill, version: (minimum as string | undefined) ?? null, source };
    } else {
      throw new Error(`bmod file ${path} field ${pyRepr(item)} must be a skill name or a table`);
    }
    if (!SKILL_NAME.test(requirement.skill)) {
      throw new Error(`bmod file ${path} field ${pyRepr(item)} has unsafe skill name ${pyRepr(requirement.skill)}`);
    }
    if (requirements.some((other) => other.skill === requirement.skill)) {
      throw new Error(`bmod file ${path} field ${pyRepr(field)} repeats ${pyRepr(requirement.skill)}`);
    }
    requirements.push(requirement);
  });
  return requirements;
}

function requiredString(table: Record<string, unknown>, name: string, field: string, path: string): string {
  const value = table[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`bmod file ${path} field '${name}.${field}' must be a non-empty string`);
  }
  return value;
}

function optionalString(table: Record<string, unknown>, name: string, field: string, path: string): string {
  const value = table[field] ?? "";
  if (typeof value !== "string") {
    throw new Error(`bmod file ${path} field '${name}.${field}' must be a string`);
  }
  return value;
}

function parseQuestions(value: unknown, module: string, path: string): ConfigQuestion[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'bmod.config_questions' must be a list`);
  }
  const questions: ConfigQuestion[] = [];
  const seen: string[] = [];
  value.forEach((question, index) => {
    const field = `bmod.config_questions[${index}]`;
    if (!isTable(question)) throw new Error(`bmod file ${path} field ${field} must be a mapping`);
    const keys = Object.keys(question);
    const allowed = new Set<string>([...QUESTION_KEYS, ...OPTIONAL_QUESTION_KEYS]);
    if (!QUESTION_KEYS.every((key) => keys.includes(key)) || keys.some((key) => !allowed.has(key))) {
      const missing = QUESTION_KEYS.filter((key) => !keys.includes(key)).sort();
      const unknown = keys.filter((key) => !allowed.has(key)).sort();
      const detail = missing.length ? `missing key ${pyRepr(missing[0])}` : `unknown key ${pyRepr(unknown[0])}`;
      throw new Error(`bmod file ${path} field ${field} has ${detail}`);
    }
    for (const key of QUESTION_KEYS) {
      if (typeof question[key] !== "string") {
        throw new Error(`bmod file ${path} field ${field}.${key} must be a string`);
      }
    }
    const scope = question.scope ?? "team";
    if (!(QUESTION_SCOPES as readonly string[]).includes(scope as string)) {
      throw new Error(`bmod file ${path} field ${field}.scope must be "team" or "user"; found ${pyRepr(scope)}`);
    }
    const prompt = question.prompt as string;
    const key = question.key as string;
    if (!prompt.trim()) {
      throw new Error(`bmod file ${path} field ${field}.prompt must be non-empty`);
    }
    if (!key || key.split(".").some((part) => !part || part !== part.trim())) {
      throw new Error(`bmod file ${path} field ${field}.key must be a non-empty dotted key`);
    }
    if (key === module || key.startsWith(`${module}.`)) {
      throw new Error(`bmod file ${path} field ${field}.key ${pyRepr(key)} must not start with module ${pyRepr(module)}`);
    }
    const conflict = conflictingQuestionKey(seen, key);
    if (conflict !== null) {
      throw new Error(`bmod file ${path} config question key ${pyRepr(key)} conflicts with ${pyRepr(conflict)}`);
    }
    seen.push(key);
    questions.push({
      module,
      key,
      prompt,
      default: question.default as string,
      scope: scope as string,
    });
  });
  return questions;
}

function conflictingQuestionKey(keys: string[], candidate: string): string | null {
  for (const key of keys) {
    if (key === candidate || key.startsWith(`${candidate}.`) || candidate.startsWith(`${key}.`)) return key;
  }
  return null;
}

function parseScripts(value: unknown, path: string): string[][] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`bmod file ${path} field 'skill.scripts' must be a list`);
  }
  const scripts: string[][] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry) {
      throw new Error(`bmod file ${path} field 'skill.scripts' has invalid value ${pyRepr(entry)}`);
    }
    const parts = purePosixParts(entry);
    if (
      entry.startsWith("/") ||
      entry.includes("\\") ||
      parts.length < 2 ||
      parts[0] !== "scripts" ||
      parts.includes("..")
    ) {
      throw new Error(`bmod file ${path} field 'skill.scripts' has unsafe value ${pyRepr(entry)}`);
    }
    scripts.push(parts);
  }
  return scripts;
}

/** `parse_toml`: tomllib's shape, smol-toml's error text (documented seam). */
function parseTomlText(text: string, source: string): Record<string, unknown> {
  try {
    return parseToml(text) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`cannot parse TOML ${source}: ${errorText(error)}`);
  }
}

function parseOrderableSemver(value: string): [[number, number, number], string[] | null] | null {
  const match = fullmatch(SEMVER, value);
  if (match === null || value.toLowerCase().includes("-dev")) return null;
  const prerelease = match.groups!.prerelease;
  return [
    [Number(match.groups!.major), Number(match.groups!.minor), Number(match.groups!.patch)],
    prerelease !== undefined ? prerelease.split(".") : null,
  ];
}

// ---------------------------------------------------------------- discovery (setup.py)

/** `discover_installation`: every bmod.toml in the active roots, sorted into
 * module records, their skills, and problems. The folder the bmad skill runs
 * from is always a root. */
export async function discoverInstallation(fs: Fs, skillRoot: string, roots: string[] = []): Promise<Installation> {
  const problems: Record<string, unknown>[] = [];
  const allRoots = uniqueFolders([...roots, dirname(skillRoot)]);
  const [folders, duplicates] = await locateSkills(fs, allRoots, dirname(skillRoot));
  const files = await discoverInstalledFiles(fs, folders, problems);
  const byFolder = new Map(files.map((installed) => [installed.folder, installed]));
  const winners = selectModuleRecords(files, problems);

  const modules: unknown[] = [];
  for (const code of [...winners.keys()].sort(compareStrings)) {
    const recordFile = winners.get(code)!;
    const record = recordFile.parsed.bmod!;
    const listed = memberNames(recordFile);
    const present = listed.filter((name) => folders.has(name));
    const members: InstalledFile[] = [];
    for (const name of present) {
      const member = byFolder.get(name);
      if (member === undefined || member.parsed.skill === null) continue;
      if (member === recordFile || (member.parsed.bmod === null && member.parsed.skill.bmod === recordFile.folder)) {
        members.push(member);
        continue;
      }
      const detail =
        member.parsed.bmod === null
          ? `names ${pyRepr(member.parsed.skill.bmod)} as its bmod`
          : "is a module record of its own";
      problems.push({
        kind: "membership",
        skill: name,
        bmod: recordFile.folder,
        message: `${recordFile.file} lists the skill ${pyRepr(name)}, but ${member.file} ${detail}`,
      });
    }
    let retired: ParsedRetired = { renamed: [], removed: [] };
    try {
      retired = await readRetiredFile(fs, recordFile.source);
    } catch (error) {
      problems.push({ kind: "retired-file", folder: recordFile.folder, message: errorText(error) });
    }
    modules.push({
      code,
      folder: recordFile.folder,
      source: recordFile.source,
      file: recordFile.file,
      parsed: record,
      skills: present,
      absent_skills: listed.filter((name) => !present.includes(name)),
      members,
      questions: record.questions,
      retired,
    });
  }

  const missingRecords: Record<string, unknown>[] = [];
  for (const installed of files) {
    const skill = installed.parsed.skill;
    if (skill !== null && installed.parsed.bmod !== null && !memberNames(installed).includes(installed.folder)) {
      problems.push({
        kind: "membership",
        skill: installed.folder,
        bmod: installed.folder,
        message: `${installed.file} holds [bmod] and [skill], but its skills list leaves out ${pyRepr(installed.folder)}`,
      });
    }
    if (skill === null || installed.parsed.bmod !== null || skill.bmod === null) continue;
    const recordFile = byFolder.get(skill.bmod);
    if (recordFile === undefined || recordFile.parsed.bmod === null) {
      const source = skill.source ?? "";
      missingRecords.push({
        skill: installed.folder,
        bmod: skill.bmod,
        source,
        channel: requirementChannel(source),
        install: installCommand(source, skill.bmod),
      });
    } else if (!memberNames(recordFile).includes(installed.folder)) {
      problems.push({
        kind: "membership",
        skill: installed.folder,
        bmod: skill.bmod,
        message:
          `${installed.file} names ${pyRepr(skill.bmod)} as its bmod, but ` +
          `${recordFile.file} does not list the skill ${pyRepr(installed.folder)}`,
      });
    }
  }
  return {
    files,
    modules,
    missing_records: missingRecords,
    problems,
    roots: allRoots,
    folders,
    duplicates,
  };
}

/** The folders in order, each once, however it is reached. */
function uniqueFolders(folders: string[]): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    const resolved = resolvePath(folder);
    if (!seen.has(resolved)) {
      seen.add(resolved);
      unique.push(folder);
    }
  }
  return unique;
}

/** Each skill's folder in the first root that holds it, and the BMad skills
 * installed in more than one. The bmad skill's own folder must be readable; an
 * unreadable extra root is skipped. */
async function locateSkills(fs: Fs, roots: string[], ownFolder: string): Promise<[Map<string, string>, Record<string, unknown>[]]> {
  const copies = new Map<string, string[]>();
  for (const root of roots) {
    let entries: string[];
    try {
      entries = await fs.list(root);
    } catch (error) {
      const text = (await fs.exists(root)) ? errorText(error) : missingPathError(root);
      if (resolvePath(root) === resolvePath(ownFolder)) {
        throw new Error(`cannot inspect installed skills ${root}: ${text}`);
      }
      continue;
    }
    entries.sort(compareStrings);
    for (const name of entries) {
      const path = `${root}/${name}`;
      if (await isDirectory(fs, path)) {
        const group = copies.get(name);
        if (group) group.push(path);
        else copies.set(name, [path]);
      }
    }
  }
  const folders = new Map<string, string>();
  for (const [name, paths] of copies) folders.set(name, paths[0]);
  const duplicates: Record<string, unknown>[] = [];
  for (const name of [...copies.keys()].sort(compareStrings)) {
    const distinct = uniqueFolders(copies.get(name)!);
    if (distinct.length > 1) {
      let anyManifest = false;
      for (const path of distinct) if (await isFile(fs, `${path}/${MANIFEST_NAME}`)) anyManifest = true;
      if (anyManifest) duplicates.push({ skill: name, folders: distinct });
    }
  }
  return [folders, duplicates];
}

/** One unusable file must not stop the install: it becomes a problem and its folder is skipped. */
async function discoverInstalledFiles(
  fs: Fs,
  folders: Map<string, string>,
  problems: Record<string, unknown>[],
): Promise<InstalledFile[]> {
  const files: InstalledFile[] = [];
  for (const name of [...folders.keys()].sort(compareStrings)) {
    const sibling = folders.get(name)!;
    const path = `${sibling}/${MANIFEST_NAME}`;
    let parsed: ParsedFile | null;
    try {
      parsed = await readBmodFile(fs, path);
    } catch (error) {
      problems.push({ kind: "bmod-file", folder: folderName(sibling), message: errorText(error) });
      continue;
    }
    if (parsed !== null) files.push({ folder: name, source: sibling, file: path, parsed });
  }
  return files;
}

async function readBmodFile(fs: Fs, path: string): Promise<ParsedFile | null> {
  if (!(await isFile(fs, path))) return null;
  let text: string;
  try {
    text = await fs.readText(path);
  } catch (error) {
    throw new Error(`cannot read bmod file ${path}: ${errorText(error)}`);
  }
  return parseBmodFile(path, text);
}

/** One record per module code. Files arrive sorted by folder name, so the first one wins. */
function selectModuleRecords(
  files: InstalledFile[],
  problems: Record<string, unknown>[],
): Map<string, InstalledFile> {
  const casefolded = new Map<string, InstalledFile>();
  const winners = new Map<string, InstalledFile>();
  for (const installed of files) {
    const record = installed.parsed.bmod;
    if (record === null) continue;
    const previous = casefolded.get(record.code.toLowerCase());
    if (previous === undefined) {
      casefolded.set(record.code.toLowerCase(), installed);
      winners.set(record.code, installed);
      continue;
    }
    if (previous.parsed.bmod!.code !== record.code) {
      throw new Error(
        "installed module codes differ only by case: " +
          `${pyRepr(previous.parsed.bmod!.code)} from ${previous.file} and ` +
          `${pyRepr(record.code)} from ${installed.file}`,
      );
    }
    problems.push({
      kind: "duplicate-module",
      module: record.code,
      folder: installed.folder,
      kept: previous.folder,
      message: `module code ${pyRepr(record.code)} is declared by ${previous.file} and by ${installed.file}; the first is used`,
    });
  }
  return winners;
}

function memberNames(recordFile: { folder: string; parsed: ParsedFile }): string[] {
  const record = recordFile.parsed.bmod!;
  if (record.skills !== null) return record.skills;
  return recordFile.parsed.skill !== null ? [recordFile.folder] : [];
}

function requirementChannel(source: string): string {
  if (source.startsWith("plugin:")) return "plugin";
  if (source.startsWith("file:")) return "local";
  return "skills-cli";
}

// ---------------------------------------------------------------- the checks (validate_manifests.py)

interface RepoReport {
  records: string[];
  skills: number;
  documents: number;
  problems: string[];
}

function rel(folder: string): string {
  return `skills/${folder}/${MANIFEST_NAME}`;
}

function retiredRel(folder: string): string {
  return `skills/${folder}/${RETIRED_NAME}`;
}

export async function checkRepo(fs: Fs, projectRoot: string): Promise<RepoReport> {
  const skillsDir = `${projectRoot}/skills`;
  let entries: string[];
  try {
    entries = await fs.list(skillsDir);
  } catch {
    entries = [];
  }
  entries.sort(compareStrings);
  const folders: string[] = [];
  for (const name of entries) if (await isDirectory(fs, `${skillsDir}/${name}`)) folders.push(name);
  if (!folders.length) {
    return {
      records: [],
      skills: 0,
      documents: 0,
      problems: [
        `no skills/*/${MANIFEST_NAME} found under ${projectRoot}: pass the repository root with --project-root`,
      ],
    };
  }

  const problems: string[] = [];
  const files = new Map<string, ParsedFile>();
  for (const name of folders) {
    const manifest = `${skillsDir}/${name}/${MANIFEST_NAME}`;
    if (!(await isFile(fs, manifest))) {
      problems.push(`skills/${name}: missing ${MANIFEST_NAME}`);
      continue;
    }
    try {
      files.set(name, parseBmodFile(manifest, await fs.readText(manifest)));
    } catch (error) {
      problems.push(`${rel(name)}: the runtime parser rejects this file: ${errorText(error)}`);
    }
  }

  const shipped = new Set(folders);
  const records = new Map<string, ParsedBmod>();
  for (const [name, parsed] of files) if (parsed.bmod !== null) records.set(name, parsed.bmod);
  const members = new Map<string, string[]>();
  for (const name of records.keys()) members.set(name, memberNames({ folder: name, parsed: files.get(name)! }));

  problems.push(...(await recordProblems(fs, files, records, skillsDir)));
  problems.push(...membershipProblems(files, records, members, shipped));
  const retired = new Map<string, ParsedRetired>();
  for (const name of records.keys()) {
    try {
      retired.set(name, await readRetiredFile(fs, `${skillsDir}/${name}`));
    } catch (error) {
      problems.push(`skills/${name}/${RETIRED_NAME}: the runtime parser rejects this file: ${errorText(error)}`);
    }
  }
  problems.push(...retiredProblems(retired, shipped));
  for (const [name, parsed] of files) {
    for (const [table, source] of [
      ["bmod", parsed.bmod],
      ["skill", parsed.skill],
    ] as const) {
      if (source !== null) problems.push(...requirementProblems(name, table, source, shipped));
    }
  }
  let documents = 0;
  for (const [name, record] of records) {
    const folder = `${skillsDir}/${name}`;
    documents += record.knowledge.length + ((await isFile(fs, `${folder}/${HELP_NAME}`)) ? 1 : 0);
    problems.push(...(await knowledgeProblems(fs, name, record, folder, members.get(name)!)));
    problems.push(...(await topicProblems(fs, name, folder)));
    problems.push(...(await rosterFileProblems(fs, name, record, folder, skillsDir)));
    problems.push(...(await stampProblems(fs, name, `${folder}/${MANIFEST_NAME}`)));
    problems.push(...(await messageProblems(fs, name, `${folder}/${MANIFEST_NAME}`)));
  }

  if (!problems.length) problems.push(...(await runtimeProblems(fs, skillsDir)));

  const recordFiles = [...records.keys()].sort(compareStrings).map((name) => `${skillsDir}/${name}/${MANIFEST_NAME}`);
  const skillCount = [...files.values()].filter((parsed) => parsed.skill !== null).length;
  return { records: recordFiles, skills: skillCount, documents, problems };
}

/** Why an installed module could not use this record version, or null. */
function versionProblem(version: string): string | null {
  const match = fullmatch(SEMVER, version);
  if (match === null) {
    return `invalid version ${pyRepr(version)}: must be SemVer (MAJOR.MINOR.PATCH, optional prerelease), e.g. 6.12.0`;
  }
  // setup.py refuses to order any version containing "-dev".
  if (version.toLowerCase().includes("-dev")) {
    return (
      `invalid version ${pyRepr(version)}: setup.py cannot order "-dev" ` +
      "versions, so an installed module would never compare as current — " +
      "pick a different prerelease label"
    );
  }
  // setup.py drops build metadata when ordering, so "1.2.0+x" compares equal to "1.2.0".
  if (match.groups!.build !== undefined) {
    const base = version.split("+", 1)[0];
    return (
      `invalid version ${pyRepr(version)}: setup.py ignores build metadata when ` +
      `ordering, so this compares equal to ${pyRepr(base)} and an installed module ` +
      "would never see the release — change the major, minor, patch, or " +
      "prerelease part"
    );
  }
  return null;
}

/** The file with only the `version` line inside [bmod] rewritten. */
export function stampText(original: string, version: string): string {
  const lines = splitLines(original);
  const headers = lines.map((line, index) => (fullmatch(BMOD_HEADER, line) ? index : -1)).filter((index) => index >= 0);
  if (headers.length !== 1) {
    throw new Error(`expected exactly one '[bmod]' table header line, found ${headers.length}`);
  }
  const start = headers[0] + 1;
  // Only the [bmod] table itself: a table further down may have a `version` of its own.
  let end = lines.length;
  for (let index = start; index < lines.length; index++) {
    if (fullmatch(TABLE_HEADER, lines[index])) {
      end = index;
      break;
    }
  }
  const matches: number[] = [];
  for (let index = start; index < end; index++) if (fullmatch(VERSION_LINE, lines[index])) matches.push(index);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one 'version = "..."' line inside [bmod], found ${matches.length}`);
  }
  const match = fullmatch(VERSION_LINE, lines[matches[0]])!;
  lines[matches[0]] = `${match.groups!.head}"${version}"${match.groups!.tail}`;
  const stamped = lines.join("");
  if (!deepEqual(parseToml(stamped), withVersion(parseToml(original), version))) {
    throw new Error("rewriting the version line would change something other than [bmod] version");
  }
  return stamped;
}

/** Python's `str.splitlines(keepends=True)` for the line endings TOML files use. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    current += ch;
    if (ch === "\n") {
      lines.push(current);
      current = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") current += text[++i];
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

function withVersion(data: unknown, version: string): unknown {
  const expected = structuredClone(data) as Record<string, unknown>;
  (expected.bmod as Record<string, unknown>).version = version;
  return expected;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isTable(left) && isTable(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every((key) => deepEqual(left[key], right[key]));
  }
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

/** Records in this repo carry both install messages, empty or not, so authors see the fields exist. */
async function messageProblems(fs: Fs, name: string, manifest: string): Promise<string[]> {
  const table = (parseToml(await fs.readText(manifest)) as Record<string, unknown>).bmod as Record<string, unknown>;
  return MESSAGE_KEYS.filter((key) => !(key in table)).map(
    (key) => `${rel(name)}: [bmod] is missing ${pyRepr(key)}; add it, empty if the module has no message`,
  );
}

/** A record the stamper could not stamp fails here, at commit time. */
async function stampProblems(fs: Fs, name: string, manifest: string): Promise<string[]> {
  try {
    stampText(await fs.readText(manifest), STAMP_PROBE);
  } catch (error) {
    return [`${rel(name)}: stamp_release.py cannot stamp this file: ${errorText(error)}`];
  }
  return [];
}

async function recordProblems(
  fs: Fs,
  files: Map<string, ParsedFile>,
  records: Map<string, ParsedBmod>,
  skillsDir: string,
): Promise<string[]> {
  const problems: string[] = [];
  for (const [name, parsed] of files) {
    if (name.startsWith(RECORD_PREFIX) && parsed.bmod === null) {
      problems.push(`${rel(name)}: a ${RECORD_PREFIX}* folder holds a module record, but this file has no [bmod]`);
    }
  }
  const firstByCode = new Map<string, string>();
  for (const [name, record] of records) {
    const problem = versionProblem(record.version);
    if (problem !== null) problems.push(`${rel(name)}: [bmod] ${problem}`);
    const skillMd = `${skillsDir}/${name}/SKILL.md`;
    if (!(await isFile(fs, skillMd))) {
      problems.push(`skills/${name}: a module record folder must ship SKILL.md as a plain file`);
    }
    if (files.get(name)!.skill === null && name !== RECORD_PREFIX + record.code) {
      problems.push(
        `${rel(name)}: a module record folder is named ${pyRepr(RECORD_PREFIX + record.code)} ` +
          `after its code; this one is ${pyRepr(name)}`,
      );
    }
    const first = firstByCode.get(record.code.toLowerCase()) ?? name;
    if (!firstByCode.has(record.code.toLowerCase())) firstByCode.set(record.code.toLowerCase(), name);
    if (first !== name) {
      problems.push(
        `${rel(name)}: module code ${pyRepr(record.code)} is already declared by ${rel(first)}; one record per code`,
      );
    }
  }
  const versions = [...records.entries()].map(([name, record]) => `${name}\u0000${record.version}`);
  const distinct = new Set(versions.map((entry) => entry.split("\u0000")[1]));
  if (distinct.size > 1) {
    const listed = [...records.entries()].map(([name, record]) => `${name} has ${pyRepr(record.version)}`).join(", ");
    problems.push(`skills/: every module record carries one version, stamped together; ${listed}`);
  }
  return problems;
}

function membershipProblems(
  files: Map<string, ParsedFile>,
  records: Map<string, ParsedBmod>,
  members: Map<string, string[]>,
  shipped: Set<string>,
): string[] {
  const problems: string[] = [];
  for (const [name, parsed] of files) {
    if (parsed.skill === null) continue;
    if (parsed.bmod !== null) {
      if (!members.get(name)!.includes(name)) {
        problems.push(`${rel(name)}: holds [skill], but its own [bmod] skills list leaves ${pyRepr(name)} out`);
      }
      continue;
    }
    const bmod = parsed.skill.bmod!;
    const record = records.get(bmod);
    if (record !== undefined && parsed.skill.source !== record.update_source) {
      problems.push(
        `${rel(name)}: [skill] source ${pyRepr(parsed.skill.source)} differs from ${rel(bmod)} ` +
          `update_source ${pyRepr(record.update_source)}`,
      );
    }
    if (record === undefined) {
      problems.push(`${rel(name)}: [skill] bmod names ${pyRepr(bmod)}, which is not a module record in this repository`);
    } else if (!members.get(bmod)!.includes(name)) {
      problems.push(`${rel(name)}: [skill] bmod names ${pyRepr(bmod)}, but ${rel(bmod)} does not list ${pyRepr(name)}`);
    }
  }
  for (const [name, listed] of members) {
    for (const member of listed) {
      const parsed = files.get(member);
      if (!shipped.has(member)) {
        problems.push(`${rel(name)}: lists the skill ${pyRepr(member)}, which this repository does not ship`);
      } else if (parsed === undefined) {
        continue;
      } else if (parsed.skill === null || (parsed.bmod !== null && member !== name)) {
        problems.push(`${rel(name)}: lists ${pyRepr(member)}, which is a module record and not a skill of this module`);
      } else if (member !== name && parsed.skill.bmod !== name) {
        problems.push(
          `${rel(name)}: lists the skill ${pyRepr(member)}, but ${rel(member)} names ${pyRepr(parsed.skill.bmod)} as its bmod`,
        );
      }
    }
  }
  return problems;
}

/** A retired name is never shipped again, and a rename points at a skill this repository ships. */
function retiredProblems(records: Map<string, ParsedRetired>, shipped: Set<string>): string[] {
  const problems: string[] = [];
  const retiredBy = new Map<string, string>();
  for (const [name, record] of records) {
    const retired = [...record.renamed.map((rename) => rename.old), ...record.removed];
    for (const old of retired) {
      if (shipped.has(old)) {
        problems.push(
          `${retiredRel(name)}: retires ${pyRepr(old)}, but skills/${old} still ships; a retired name is never reused`,
        );
      }
      if (!retiredBy.has(old)) retiredBy.set(old, name);
      const first = retiredBy.get(old)!;
      if (first !== name) {
        problems.push(`${retiredRel(name)}: retires ${pyRepr(old)}, which ${retiredRel(first)} already retires`);
      }
    }
    const targets = record.renamed.map((rename) => rename.new);
    for (const target of [...new Set(targets.filter((t) => targets.filter((o) => o === t).length > 1))]) {
      problems.push(
        `${retiredRel(name)}: renames more than one skill to ${pyRepr(target)}; ` +
          "their customizations would collide, so list the extras under removed",
      );
    }
    for (const rename of record.renamed) {
      if (!shipped.has(rename.new)) {
        problems.push(
          `${retiredRel(name)}: renames ${pyRepr(rename.old)} to ${pyRepr(rename.new)}, which this repository does not ship`,
        );
      }
    }
  }
  return problems;
}

/** Shape is the runtime parser's job. These are the rules only the repository can decide. */
function requirementProblems(
  folder: string,
  table: string,
  source: ParsedBmod | ParsedSkill,
  shipped: Set<string>,
): string[] {
  const problems: string[] = [];
  for (const field of ["required_skills", "recommended_skills"] as const) {
    for (const requirement of source[field]) {
      const where = `${rel(folder)}: ${table}.${field} entry ${pyRepr(requirement.skill)}`;
      // setup.py drops build metadata when ordering, so such a minimum could never be told apart.
      if (requirement.version !== null && requirement.version.includes("+")) {
        problems.push(
          `${where} version ${pyRepr(requirement.version)} carries build metadata, which setup.py ignores ` +
            `when ordering; it would compare equal to ${pyRepr(requirement.version.split("+", 1)[0])}`,
        );
      }
      if (requirement.source === null && !shipped.has(requirement.skill)) {
        problems.push(`${where} names no skill in this repository and gives no source to fetch it from`);
      }
    }
  }
  return problems;
}

async function knowledgeProblems(
  fs: Fs,
  name: string,
  record: ParsedBmod,
  folder: string,
  members: string[],
): Promise<string[]> {
  const problems: string[] = [];
  const helpPath = `${folder}/${HELP_NAME}`;
  if (name.startsWith("bmod-") || (await fs.exists(helpPath))) {
    const problem = await plainFileProblem(fs, folder, HELP_NAME);
    if (problem !== null) {
      problems.push(`skills/${name}/${HELP_NAME}, which every bmod-* folder holds, ${problem}`);
    }
  }
  for (const entry of record.knowledge) {
    if (entry.path === HELP_NAME) {
      problems.push(`${rel(name)}: knowledge names ${pyRepr(HELP_NAME)}, which is always read`);
      continue;
    }
    const problem = await plainFileProblem(fs, folder, entry.path);
    if (problem !== null) {
      problems.push(`${rel(name)}: knowledge names ${pyRepr(entry.path)}, which ${problem}`);
    }
    for (const skill of entry.skills ?? []) {
      if (!members.includes(skill)) {
        problems.push(
          `${rel(name)}: knowledge ${pyRepr(entry.path)} names ${pyRepr(skill)}, which is not a skill of ` +
            `module ${pyRepr(record.code)}`,
        );
      }
    }
  }
  return problems;
}

const TOPIC_REFERENCE = /`help\/([^`/<>]+\.md)`/g;

/** A topic `help.md` never points to is never read, and a pointer to no file misleads the reader. */
async function topicProblems(fs: Fs, name: string, folder: string): Promise<string[]> {
  let text = "";
  try {
    text = await fs.readText(`${folder}/${HELP_NAME}`);
  } catch {
    text = "";
  }
  const helpFile = "help.md";
  const named = new Set([...text.matchAll(TOPIC_REFERENCE)].map((match) => match[1]));
  named.delete(helpFile);
  let helpEntries: string[];
  try {
    helpEntries = await fs.list(`${folder}/${TOPICS_DIR}`);
  } catch {
    helpEntries = [];
  }
  const shipped = new Set(helpEntries.filter((entry) => entry.endsWith(".md") && entry !== helpFile));
  const where = `skills/${name}/${TOPICS_DIR}`;
  const problems = [...shipped]
    .filter((topic) => !named.has(topic))
    .sort(compareStrings)
    .map((topic) => `${where}/${topic} is never named in ${HELP_NAME}`);
  problems.push(
    ...[...named]
      .filter((topic) => !shipped.has(topic))
      .sort(compareStrings)
      .map((topic) => `skills/${name}/${HELP_NAME} names ${where}/${topic}, which does not exist`),
  );
  for (const topic of [...shipped].sort(compareStrings)) {
    let body: string;
    try {
      body = await fs.readText(`${folder}/${TOPICS_DIR}/${topic}`);
    } catch {
      continue;
    }
    const others = new Set([...body.matchAll(TOPIC_REFERENCE)].map((match) => match[1]));
    for (const other of [...others].filter((o) => !shipped.has(o) && o !== helpFile).sort(compareStrings)) {
      problems.push(`${where}/${topic} names ${where}/${other}, which does not exist`);
    }
  }
  for (const topic of [...shipped].filter((t) => named.has(t)).sort(compareStrings)) {
    const problem = await plainFileProblem(fs, folder, `${TOPICS_DIR}/${topic}`);
    if (problem !== null) problems.push(`${where}/${topic} ${problem}`);
  }
  return problems;
}

async function plainFileProblem(fs: Fs, folder: string, relative: string): Promise<string | null> {
  const path = `${folder}/${relative}`;
  if (!(await fs.exists(path))) return "the module record does not ship";
  try {
    await readDocument(fs, path, folder);
  } catch (error) {
    return errorText(error);
  }
  return null;
}

async function rosterFileProblems(
  fs: Fs,
  name: string,
  _record: ParsedBmod,
  folder: string,
  skillsDir: string,
): Promise<string[]> {
  const path = `${folder}/${ROSTER_NAME}`;
  if (!(await fs.exists(path))) return [];
  const where = `skills/${name}/${ROSTER_NAME}`;
  const problem = await plainFileProblem(fs, folder, ROSTER_NAME);
  if (problem !== null) return [`${where} ${problem}`];
  let party: Record<string, unknown>;
  try {
    party = parseToml(await fs.readText(path)) as Record<string, unknown>;
  } catch (error) {
    return [`${where}: cannot read roster: ${errorText(error)}`];
  }
  return (await rosterProblems(fs, party, skillsDir)).map((entry) => `${where}: ${entry}`);
}

/** A group naming a member nobody defines, or a member naming a skill this repo lacks, is a typo. */
async function rosterProblems(fs: Fs, party: Record<string, unknown>, skillsDir: string): Promise<string[]> {
  const problems: string[] = [];
  const members = asList(party.members).filter(isTable);
  const codes = members.map((member) => member.code);
  const strings = codes.filter((code): code is string => typeof code === "string");
  const repeated = [...new Set(strings.filter((code) => strings.filter((other) => other === code).length > 1))].sort(
    compareStrings,
  );
  for (const code of repeated) problems.push(`member code ${pyRepr(code)} is defined twice`);
  for (const member of members) {
    const skill = member.skill;
    if (
      skill !== undefined &&
      !(typeof skill === "string" && (await isFile(fs, `${skillsDir}/${skill}/SKILL.md`)))
    ) {
      problems.push(`member ${pyRepr(member.code)} names skill ${pyRepr(skill)}, which this repository does not ship`);
    }
  }
  for (const group of asList(party.groups)) {
    if (!isTable(group)) continue;
    for (const code of asList(group.members)) {
      if (!codes.includes(code)) {
        problems.push(`group ${pyRepr(group.id)} lists ${pyRepr(code)}, which no member defines`);
      }
    }
  }
  return problems;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The tree as `bmad` itself would discover it. Runs only on a tree the checks above accept. */
async function runtimeProblems(fs: Fs, skillsDir: string): Promise<string[]> {
  const problems: string[] = [];
  let installation: Installation;
  try {
    installation = await discoverInstallation(fs, `${skillsDir}/bmad`);
  } catch (error) {
    return [`skills/: setup.py cannot discover the modules: ${errorText(error)}`];
  }
  problems.push(...installation.problems.map((problem) => `skills/: setup.py reports: ${problem.message}`));
  problems.push(
    ...installation.missing_records.map(
      (missing) => `skills/: setup.py finds no module record ${pyRepr(missing.bmod)} for ${pyRepr(missing.skill)}`,
    ),
  );
  const report = await collect(fs, [skillsDir]);
  problems.push(...report.problems.map((problem) => `skills/: knowledge.py reports: ${problem.problem}`));
  return problems;
}

// ---------------------------------------------------------------- the command

/** The uniform port shape: the Python's stdout and exit code out. The Python
 * prints its problems to stderr; this port carries the same text in stdout,
 * the one stream the runtime has. */
export async function validateManifests(
  argv: string[],
  fs: Fs,
): Promise<{ stdout: string; exitCode: number }> {
  let projectRoot: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--project-root") {
      const value = argv[++i];
      if (value === undefined) return usageError("argument --project-root: expected one argument");
      projectRoot = value;
    } else if (token.startsWith("--project-root=")) {
      projectRoot = token.slice("--project-root=".length);
    } else {
      return usageError(`unrecognized arguments: ${token}`);
    }
  }
  // `args.project_root.resolve()`: `.` is the folder the caller stands in, and
  // an empty result would name nothing at all.
  const root = absolutePath(projectRoot ?? ".");
  const report = await checkRepo(fs, root);
  if (report.problems.length) {
    return {
      stdout:
        `bmod file validation failed (${report.problems.length}):\n` +
        report.problems.map((problem) => `  ${problem}\n`).join(""),
      exitCode: 1,
    };
  }
  return {
    stdout:
      `bmod files valid: ${report.skills} skills, ${report.records.length} module records, ` +
      `${report.documents} knowledge documents.\n`,
    exitCode: 0,
  };
}

function usageError(message: string): { stdout: string; exitCode: number } {
  return { stdout: `validate_manifests: error: ${message}`, exitCode: 2 };
}

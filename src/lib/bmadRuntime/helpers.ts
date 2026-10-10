import type { Fs } from "./fs";
import {
  absolutePath,
  processConditionals,
  processVariables,
  splitFlag,
  usageError,
  type PortResult,
} from "./compat";
import {
  dirname,
  errorText,
  folderName,
  isDirectory,
  isFile,
  missingPathError,
  pyJson,
  pyRepr,
} from "./knowledge";

/**
 * The bundled late ports, dispatched by cli.ts through `import("./helpers")`:
 * one export per ported script, named by the Python stem in camelCase, each
 * with the uniform shape
 * `(argv: string[], fs: Fs) => Promise<{ stdout: string; exitCode: number }>`.
 * cli.ts also reads the camelCase spelling, and the bundler inlines this module
 * into `dist-runtime/ade-runtime.mjs`, so every port that lands here ships in
 * the single-file runtime with no dispatcher change.
 *
 * This file holds the small ports — `process_template` and `wake` — beside the
 * re-exports; every helper whose port runs past ~150 lines keeps the same
 * export shape in its own module (the Python's neighbours do the same with
 * `knowledge.py` and `config_utils.py`). The Task 5b trio is re-exported for
 * the same reason.
 *
 * The shared refusal convention is the Task 6 one: `<script>: error: <message>`
 * on stdout, exit 2 — the Python's argparse answered a malformed command line
 * with its own usage text, which is not reproduced (capture.sh's header).
 */
export type { PortResult } from "./compat";
export { brain } from "./brain";
export { gitEvidence } from "./gitEvidence";
export { initSkill } from "./initSkill";
export { lintSpine } from "./lintSpine";
export { listCustomizableSkills } from "./listCustomizableSkills";
export { pickMethods } from "./pickMethods";
export { readSessionLog } from "./readSessionLog";
export { reconKit } from "./reconKit";
export { registry } from "./registry";
export { resolveParty } from "./resolveParty";
export { resolvePersonas } from "./resolvePersonas";
export { runTriggers } from "./runTriggers";
export { scanLegacyModule } from "./scanLegacyModule";
export { scanPaths } from "./scanPaths";
export { scanScripts } from "./scanScripts";
export { knowledge } from "./knowledge";
export { roster } from "./roster";
export { validateManifests } from "./validateManifests";

// ---------------------------------------------------------------- process_template

const MARKER_RE = /\{\/?if-[a-zA-Z0-9_-]+\}/g;
const TOKEN_RE = /\{[a-zA-Z][a-zA-Z0-9_.-]*\}/g;

const sortedUnique = (matches: string[]): string[] => [...new Set(matches)].sort();

/**
 * Port of `skills/bmad-toolsmith/scripts/process_template.py`: fill a
 * template's `{name}` variables and `{if-X}…{/if-X}` blocks. The goldens in
 * `__tests__/goldens/helpers/processTemplate-*.json` are the contract.
 */
export async function processTemplate(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "process_template";
  const positionals: string[] = [];
  const variables: [string, string][] = [];
  const truths: string[] = [];
  let output: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const [flag, inline] = splitFlag(token);
    if (flag === "-o" || flag === "--output") {
      const value = inline ?? argv[++i];
      if (value === undefined) return usageError(script, `argument ${flag}: expected one argument`);
      output = value;
    } else if (flag === "--var") {
      const value = inline ?? argv[++i];
      if (value === undefined) return usageError(script, "argument --var: expected one argument");
      const cut = value.indexOf("=");
      if (cut <= 0) return usageError(script, `argument --var: expected key=value, got ${pyRepr(value)}`);
      variables.push([value.slice(0, cut), value.slice(cut + 1)]);
    } else if (flag === "--true") {
      const value = inline ?? argv[++i];
      if (value === undefined) return usageError(script, "argument --true: expected one argument");
      truths.push(value);
    } else if (flag === "--json" && inline === null) {
      // The Python wrote the run metadata to stderr under this flag; the
      // runtime's one return shape has no stderr, so it changes nothing here.
    } else if (token.startsWith("-") && token !== "-") {
      return usageError(script, `unrecognized arguments: ${token}`);
    } else {
      positionals.push(token);
    }
  }
  const template = positionals[0];
  if (template === undefined) return usageError(script, "the following arguments are required: template");

  let content: string;
  try {
    content = await fs.readText(template);
  } catch (error) {
    const text = (await fs.exists(template)) ? errorText(error) : missingPathError(template);
    return { stdout: `process_template: cannot read ${template}: ${text}\n`, exitCode: 2 };
  }

  const conditional = processConditionals(content, new Set(truths));
  const variable = processVariables(conditional.text, new Map(variables));
  const leftover = sortedUnique(variable.text.match(MARKER_RE) ?? []);
  if (leftover.length) {
    return { stdout: `process_template: leftover conditional markers: ${leftover.join(", ")}\n`, exitCode: 3 };
  }

  const metadata = {
    output_file: output ?? "<stdout>",
    vars_substituted: variable.substituted,
    conditions_true: conditional.kept,
    conditions_false: conditional.removed,
    tokens_remaining: sortedUnique(variable.text.match(TOKEN_RE) ?? []),
  };

  if (output !== null) {
    const parent = dirname(output);
    if (parent !== "/" && !(await fs.exists(parent))) await fs.mkdir(parent);
    await fs.writeText(output, variable.text);
    return { stdout: `${pyJson(metadata, { ensureAscii: true })}\n`, exitCode: 0 };
  }
  // `--json` wrote its metadata to the Python's stderr, which the runtime's
  // one return shape does not carry; the processed text is what a caller reads.
  return { stdout: variable.text, exitCode: 0 };
}

/** `--flag` / `--flag=value` / `-o` in one place: `compat.splitFlag`. */

// ---------------------------------------------------------------- wake

const IDENTITY_FILES = ["PERSONA.md", "CREED.md", "BOND.md", "HOW-I-REMEMBER.md", "CAPABILITIES.md"];
const DATED_RE = /^(\d{4}-\d{2}-\d{2})/;
const STATUS_RAW_RE = /^status:\s*raw\s*$/m;
const RECENT_COUNT = 8;

/** Every directory under `root`, recursively, sorted by path — `sorted(root.rglob("*"))` filtered to dirs. */
async function directoriesUnder(fs: Fs, root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries: string[];
    try {
      entries = await fs.list(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = `${dir}/${name}`;
      if (!(await isDirectory(fs, path))) continue;
      out.push(path);
      await walk(path);
    }
  };
  await walk(root);
  return out.sort();
}

async function filesUnder(fs: Fs, root: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of [root, ...(await directoriesUnder(fs, root))]) {
    for (const path of await listOrEmpty(fs, dir)) {
      if (await isFile(fs, path)) out.push(path);
    }
  }
  return out;
}

async function listOrEmpty(fs: Fs, dir: string): Promise<string[]> {
  try {
    return (await fs.list(dir)).map((name) => `${dir}/${name}`);
  } catch {
    return [];
  }
}

/** `path.relative_to(parent)` in posix spelling. */
function relativeTo(path: string, parent: string): string {
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** `folder_lines`: one line per folder under `root`, with its file count. */
async function folderLines(fs: Fs, root: string, label: string): Promise<string[]> {
  if (!(await isDirectory(fs, root))) return [];
  const lines: string[] = [];
  const directFiles: string[] = [];
  for (const path of await listOrEmpty(fs, root)) if (await isFile(fs, path)) directFiles.push(path);
  const named = directFiles.filter((path) => !folderName(path).startsWith("."));
  if (named.length) lines.push(`${label}/ (${named.length} files)`);
  for (const folder of await directoriesUnder(fs, root)) {
    const files = (await listOrEmpty(fs, folder)).filter((path) => !folderName(path).startsWith("."));
    const count = (await Promise.all(files.map((path) => isFile(fs, path)))).filter(Boolean).length;
    lines.push(`${relativeTo(folder, dirname(root))}/ (${count} files)`);
  }
  return lines;
}

/** `recent_dated`: the newest dated files under `root`, by name. */
async function recentDated(fs: Fs, root: string): Promise<string[]> {
  if (!(await isDirectory(fs, root))) return [];
  const dated = (await filesUnder(fs, root)).filter((path) => DATED_RE.test(folderName(path)));
  dated.sort((a, b) => {
    const nameA = folderName(a);
    const nameB = folderName(b);
    if (nameA !== nameB) return nameA < nameB ? 1 : -1;
    return a < b ? 1 : a > b ? -1 : 0;
  });
  return dated.slice(0, RECENT_COUNT).map((path) => relativeTo(path, dirname(root)));
}

/** `undistilled`: raw files whose head still says `status: raw`. */
async function undistilled(fs: Fs, raw: string): Promise<string[]> {
  if (!(await isDirectory(fs, raw))) return [];
  const out: string[] = [];
  for (const path of (await listOrEmpty(fs, raw)).sort()) {
    if (!(await isFile(fs, path))) continue;
    const head = (await fs.readText(path)).slice(0, 2000);
    if (STATUS_RAW_RE.test(head)) out.push(folderName(path));
  }
  return out;
}

/** `tending_line`: when memory was last tended and how many notes came after. */
async function tendingLine(fs: Fs, sanctum: string): Promise<string> {
  const stamp = `${sanctum}/memory/.tended`;
  const tended = (await isFile(fs, stamp)) ? (await fs.readText(stamp)).trim().slice(0, 10) : "";
  const sessions = `${sanctum}/memory/sessions`;
  const notes = (await isDirectory(fs, sessions))
    ? (await listOrEmpty(fs, sessions)).filter((path) => DATED_RE.test(folderName(path)))
    : [];
  const since = tended ? notes.filter((path) => (DATED_RE.exec(folderName(path))?.[1] ?? "") > tended) : notes;
  if (tended) return `Tended: ${tended}; session notes since: ${since.length}`;
  return `Never tended; session notes: ${since.length}`;
}

/** `emit`: a heading with the file's name, then the file with its tail trimmed. */
async function emit(fs: Fs, path: string): Promise<string> {
  return `\n===== ${folderName(path)} =====\n${(await fs.readText(path)).replace(/\s+$/, "")}\n`;
}

/**
 * Port of the memory-agent shape's `scripts/wake.py` (shipped as
 * `assets/wake-template.py`): load the agent's self in one pass, or route to
 * First Breath. The Python read the skill's name from its own folder
 * (`.../<skill>/scripts/wake.py`); a bundled runtime has no such folder, so the
 * name comes from `--skill-root`, which the patched call site supplies and the
 * pin's argparse would have refused (capture.sh's header).
 */
export async function wake(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "wake";
  const positionals: string[] = [];
  let skillRoot: string | null = null;
  let pulse = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--pulse" && inline === null) pulse = true;
    else if (flag === "--skill-root") {
      skillRoot = inline ?? argv[++i] ?? null;
      if (skillRoot === null) return usageError(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("--")) return usageError(script, `unrecognized arguments: ${argv[i]}`);
    else positionals.push(argv[i]);
  }

  if (!positionals.length) return { stdout: "Usage: wake.py <project-root> [--pulse]\n", exitCode: 2 };
  if (skillRoot === null) {
    // The pin named the sanctum after the skill folder it lived in; nothing in
    // the argv named it, so there is nothing to fall back to.
    return usageError(script, "--skill-root is required (the pin read the skill name from its own folder)");
  }

  // `Path(positional[0]).resolve()`: a relative root means the working directory.
  const projectRoot = absolutePath(positionals[0]);
  const skillName = folderName(skillRoot);
  const sanctum = `${projectRoot}/_bmad/memory/${skillName}`;

  const missing: string[] = [];
  for (const name of IDENTITY_FILES) if (!(await isFile(fs, `${sanctum}/${name}`))) missing.push(name);
  if (missing.length) {
    const lines = ["MODE: FIRST_BREATH"];
    if (await isDirectory(fs, sanctum)) lines.push(`INCOMPLETE SANCTUM at ${sanctum}: missing ${missing.join(", ")}`);
    else lines.push(`NO SANCTUM at ${sanctum}`);
    lines.push("This is your one birth. Load references/first-breath.md and follow it.");
    return { stdout: lines.join("\n") + "\n", exitCode: 0 };
  }

  let out = pulse ? "MODE: PULSE\n" : "MODE: WAKING\n";
  out += `Sanctum: ${sanctum}\n`;
  for (const name of IDENTITY_FILES) out += await emit(fs, `${sanctum}/${name}`);
  if (pulse && (await isFile(fs, `${sanctum}/PULSE.md`))) out += await emit(fs, `${sanctum}/PULSE.md`);

  out += "\n===== memory map =====\n";
  const lines = (await folderLines(fs, `${sanctum}/memory`, "memory")).concat(
    await folderLines(fs, `${sanctum}/raw`, "raw"),
  );
  out += (lines.length ? lines.join("\n") : "(empty: nothing remembered yet)") + "\n";
  const recent = await recentDated(fs, `${sanctum}/memory`);
  if (recent.length) out += "\nNewest:\n" + recent.map((path) => `  ${path}`).join("\n") + "\n";
  out += `\n${await tendingLine(fs, sanctum)}\n`;
  const raw = await undistilled(fs, `${sanctum}/raw`);
  if (raw.length) out += `\nUndistilled raw (${raw.length}):\n` + raw.map((name) => `  raw/${name}`).join("\n") + "\n";
  const pending = `${sanctum}/memory/pending.md`;
  if ((await isFile(fs, pending)) && (await fs.readText(pending)).trim()) out += await emit(fs, pending);

  return { stdout: out, exitCode: 0 };
}

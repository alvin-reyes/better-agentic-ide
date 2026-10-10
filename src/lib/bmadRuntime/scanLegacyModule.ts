import type { Fs } from "./fs";
import { compareStrings, folderName, isDirectory, pyJson, pyRepr } from "./knowledge";
import { csvDictRows, loadYaml } from "./compat";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-toolsmith/scripts/scan_legacy_module.py` — parse an
 * old-format module (`module.yaml`, `module-help.csv`, a `<code>-setup` skill,
 * merge scripts) so the migrate mode can convert it. The goldens in
 * `__tests__/goldens/helpers/scanLegacyModule-*.json` are the contract.
 *
 * PyYAML is not a dependency the runtime can carry, so `compat.loadYaml`
 * parses the dialect these files are written in (capture.sh lists what that
 * covers); a fuller YAML document is the documented divergence. The rest is
 * literal: the walk order, the shallowest-file rule, the deletion set and the
 * `error`/exit pair for a folder with no `module.yaml`.
 */

const SKIP_DIRS = [".git", "__pycache__", "node_modules", ".venv", "venv", ".pytest_cache"];
const MODULE_META_KEYS = [
  "code",
  "name",
  "header",
  "subheader",
  "description",
  "module_version",
  "default_selected",
  "module_greeting",
  "agents",
  "directories",
  "post-install-notes",
];
const LEGACY_FILE_NAMES = ["module.yaml", "module-help.csv", "merge-config.py", "merge-help-csv.py", "cleanup-legacy.py"];
const LEGACY_READ_RE = /_bmad\/config\.yaml|config\.user\.yaml|\bbmad-[a-z0-9-]+-setup\b|module-setup\.md/;

/** Every file under `root`, sorted by path, the skip folders pruned. */
async function walk(fs: Fs, root: string): Promise<string[]> {
  const out: string[] = [];
  const visit = async (dir: string, parts: string[]): Promise<void> => {
    for (const name of await fs.list(dir)) {
      if (SKIP_DIRS.includes(name)) continue;
      const path = `${dir}/${name}`;
      const next = [...parts, name];
      if (await isDirectory(fs, path)) await visit(path, next);
      else out.push(path);
    }
  };
  await visit(root, []);
  return out.sort(compareStrings);
}

/** `find_one`: the shallowest file with this name, or null. */
async function findOne(fs: Fs, root: string, name: string): Promise<string | null> {
  const matches = (await walk(fs, root)).filter((path) => folderName(path) === name);
  matches.sort((a, b) => a.split("/").length - b.split("/").length || compareStrings(a, b));
  return matches[0] ?? null;
}

function rel(root: string, path: string): string {
  return path.slice(root.length + 1);
}

function isTable(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function configKey(key: string, spec: Record<string, unknown>): Record<string, unknown> {
  const reasons: string[] = [];
  let kind = "text";
  if ("single-select" in spec) {
    kind = "single-select";
    reasons.push("single-select options; ask as free text and name the choices in the prompt");
  } else if ("multi-select" in spec) {
    kind = "multi-select";
    reasons.push("multi-select options; a bmod answer is one scalar");
  } else if (typeof spec.default === "boolean") {
    kind = "confirm";
    reasons.push("boolean default; store the answer as a string or drop the question");
  }
  const result = spec.result;
  if (typeof result === "string" && result !== "{value}" && result !== "") {
    reasons.push(`result template ${pyRepr(result)}; fold it into the default and the skill that reads it`);
  }
  for (const extra of ["regex", "required", "example"]) {
    if (extra in spec) reasons.push(`${extra} has no bmod equivalent`);
  }
  return {
    key,
    prompt: spec.prompt ?? "",
    default: spec.default ?? null,
    user_setting: spec.user_setting === true,
    kind,
    unconvertible: reasons,
  };
}

async function readHelpRows(fs: Fs, path: string | null): Promise<Record<string, unknown>[]> {
  if (path === null) return [];
  const rows = csvDictRows(await fs.readText(path));
  return rows.map((row) => {
    const out: Record<string, unknown> = { skill: row.skill ?? "" };
    for (const [key, value] of Object.entries(row)) {
      if (key === "skill" || key === "null") continue;
      out[key] = value;
    }
    return out;
  });
}

async function skillDirs(fs: Fs, root: string): Promise<string[]> {
  const dirs = new Set<string>();
  for (const path of await walk(fs, root)) {
    if (folderName(path) === "SKILL.md") dirs.add(path.slice(0, path.lastIndexOf("/")));
  }
  return [...dirs].sort(compareStrings);
}

function skillOf(root: string, path: string, skills: string[]): string {
  const pathParent = path.slice(0, path.lastIndexOf("/"));
  for (const skill of [...skills].sort((a, b) => b.split("/").length - a.split("/").length)) {
    if (skill === pathParent || pathParent.startsWith(`${skill}/`)) return folderName(skill);
  }
  return folderName(root);
}

export async function scanLegacy(fs: Fs, root: string): Promise<Record<string, unknown> | null> {
  const moduleYaml = await findOne(fs, root, "module.yaml");
  if (moduleYaml === null) return null;
  const parsed = loadYaml(await fs.readText(moduleYaml), rel(root, moduleYaml));
  const meta = isTable(parsed) ? parsed : {};
  const helpCsv = await findOne(fs, root, "module-help.csv");
  const skills = await skillDirs(fs, root);

  const setupSkill = skills.find((skill) => folderName(skill).endsWith("-setup")) ?? null;
  const setupName = setupSkill === null ? null : folderName(setupSkill);
  const moduleSetup = await findOne(fs, root, "module-setup.md");

  let toDelete = new Set<string>();
  for (const path of await walk(fs, root)) {
    if (LEGACY_FILE_NAMES.includes(folderName(path))) toDelete.add(rel(root, path));
  }
  if (setupSkill !== null) {
    const prefix = `${rel(root, setupSkill)}/`;
    toDelete = new Set([...toDelete].filter((path) => !path.startsWith(prefix)));
    toDelete.add(prefix);
  }
  if (moduleSetup !== null) toDelete.add(rel(root, moduleSetup));

  const reads: Record<string, unknown>[] = [];
  for (const path of await walk(fs, root)) {
    if (!path.endsWith(".md")) continue;
    const relative = rel(root, path);
    const dropped = toDelete.has(relative) || [...toDelete].some((entry) => entry.endsWith("/") && relative.startsWith(entry));
    if (dropped) continue;
    const lines = (await fs.readText(path)).split("\n");
    lines.forEach((line, index) => {
      if (LEGACY_READ_RE.test(line)) {
        reads.push({ skill: skillOf(root, path, skills), path: relative, line: index + 1, text: line.trim().slice(0, 200) });
      }
    });
  }

  const greeting = meta.module_greeting ?? "";
  const configKeys = Object.entries(meta)
    .filter(([key, value]) => !MODULE_META_KEYS.includes(key) && isTable(value) && "prompt" in value)
    .map(([key, value]) => configKey(key, value as Record<string, unknown>));

  return {
    module: {
      code: meta.code ?? "",
      name: meta.name ?? "",
      version: String(meta.module_version ?? ""),
      greeting: typeof greeting === "string" ? greeting.trim() : "",
      agents: Array.isArray(meta.agents) ? meta.agents : [],
    },
    config_keys: configKeys,
    help_rows: await readHelpRows(fs, helpCsv),
    skills: skills.filter((skill) => skill !== setupSkill).map((skill) => folderName(skill)),
    legacy_reads: reads,
    setup_skill: setupName,
    files_to_delete: [...toDelete].sort(compareStrings),
  };
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function scanLegacyModule(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "scan_legacy_module";
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill-root") {
      // The patched call sites carry it and the Python never read its own
      // location; the value is consumed the way argparse would consume it.
      if ((inline ?? argv[++i]) === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  const module = positionals[0];
  if (module === undefined) return usageError(script, "the following arguments are required: module");
  if (!(await isDirectory(fs, module))) return usageError(script, `not a directory: ${module}`);
  const result = await scanLegacy(fs, module);
  if (result === null) {
    return { stdout: `scan_legacy_module: no module.yaml under ${module}\n`, exitCode: 1 };
  }
  return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}\n`, exitCode: 0 };
}

import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";
import { compareStrings, isDirectory, isFile, pyJson, pyJsonString, pyRepr } from "./knowledge";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-toolsmith/scripts/init_skill.py` — scaffold a new skill
 * folder, or check an existing one. The goldens in
 * `__tests__/goldens/helpers/initSkill-*.json` are the contract: the create
 * JSON (and the files it wrote), the clean check, the check with findings, and
 * the refusal when the target folder is already there.
 *
 * `--skill-root` is the Task 1 patch artifact and is accepted and ignored, as
 * the Python would have (it never read its own location). One substitution: a
 * malformed `bmod.toml` reports smol-toml's message where tomllib's appeared —
 * no golden carries one.
 */

const SHAPES = [
  "plain-skill",
  "script-utility",
  "rendered-skill",
  "agent",
  "memory-agent",
  "single-skill-module",
  "multi-skill-module",
];
const KNOWN_DIRS = ["references", "scripts", "assets", "help", "evals"];
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BMAD_NAME_RE = /^(?:bmad|bmad-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const RECORD_NAME_RE = /^bmod-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_DESCRIPTION = "Required bmod metadata. Never invoke this skill.";
const USE_WHEN_RE = /\buse\s+(?:when|if)\b/i;
const TODO_RE = /\[TODO:/;
const TEXT_SUFFIXES = [".md", ".toml", ".py", ".json", ".yaml", ".yml", ".txt", ".html", ".csv"];
const DESCRIPTION_PLACEHOLDER =
  "[TODO: what the skill does, one sentence. Use when <the situation that should trigger it>.]";

function yamlSingleQuoted(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

/** `json.dumps(value)` — a TOML basic string, non-ASCII escaped. */
function tomlString(value: string): string {
  return pyJsonString(value, true);
}

function frontmatterBlock(content: string): { block: string | null; body: string } {
  const text = content.replace(/^\s+/, "");
  if (!text.startsWith("---")) return { block: null, body: content };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { block: null, body: content };
  const after = text.slice(end + 4);
  if (after && !after.startsWith("\n") && !after.startsWith("\r")) return { block: null, body: content };
  return { block: text.slice(3, end).replace(/^[\r\n]+|[\r\n]+$/g, ""), body: after };
}

function stripQuotes(value: string): string {
  if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === "'" || value[0] === '"')) {
    const inner = value.slice(1, -1);
    return value[0] === "'" ? inner.replace(/''/g, "'") : inner;
  }
  return value;
}

/** `parse_frontmatter`: `key: value` lines, indented continuations folded in. */
export function parseSkillFrontmatter(content: string): { meta: Record<string, string> | null; body: string } {
  const { block, body } = frontmatterBlock(content);
  if (block === null) return { meta: null, body };
  const result: Record<string, string> = {};
  let key: string | null = null;
  let value = "";
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0 && line[0] !== " " && line[0] !== "\t") {
      if (key !== null) result[key] = stripQuotes(value.trim());
      key = line.slice(0, colon).trim();
      value = line.slice(colon + 1);
    } else if (key !== null && !line.replace(/^\s+/, "").startsWith("#")) {
      value += "\n" + line;
    }
  }
  if (key !== null) result[key] = stripQuotes(value.trim());
  return { meta: result, body };
}

function skillMd(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${yamlSingleQuoted(description)}\n---\n\n# ${name}\n`;
}

function bmodToml(shape: string, name: string, bmod: string | null, source: string | null): string {
  const sourceValue = source
    ? tomlString(source)
    : tomlString("[TODO: update_source, e.g. github:org/repo/skills]");
  if (shape === "multi-skill-module") {
    const code = name.startsWith("bmod-") ? name.slice("bmod-".length) : name;
    return `[bmod]\ncode = ${tomlString(code)}\nversion = "0.1.0"\nupdate_source = ${sourceValue}\nskills = []\n`;
  }
  if (shape === "single-skill-module") {
    const code = name.startsWith("bmad-") ? name.slice("bmad-".length) : name;
    return (
      `[bmod]\ncode = ${tomlString(code)}\nversion = "0.1.0"\nupdate_source = ${sourceValue}\n\n` +
      "# The record is in this same file, so the skill table needs no bmod or source.\n[skill]\n"
    );
  }
  const lines = ["[skill]"];
  if (bmod) lines.push(`bmod = ${tomlString(bmod)}`);
  if (source) lines.push(`source = ${tomlString(source)}`);
  return lines.join("\n") + "\n";
}

interface Args {
  name: string | null;
  dest: string | null;
  shape: string | null;
  dirs: string;
  bmod: string | null;
  source: string | null;
  description: string | null;
}

async function create(fs: Fs, args: Args): Promise<PortResult> {
  const name = args.name!;
  if (!KEBAB_RE.test(name) || name.length > 64) {
    return {
      stdout: `${pyJson(
        {
          ok: false,
          error: `name ${pyRepr(name)} must be kebab-case (lowercase, digits, single hyphens), at most 64 characters`,
        },
        { ensureAscii: true },
      )}\n`,
      exitCode: 1,
    };
  }
  if (args.shape === "multi-skill-module" && !RECORD_NAME_RE.test(name)) {
    return { stdout: `${pyJson({ ok: false, error: "a multi-skill-module record is named bmod-<code>" }, { ensureAscii: true })}\n`, exitCode: 1 };
  }
  const dirs = args.dirs.split(",").map((entry) => entry.trim()).filter(Boolean);
  const unknown = dirs.filter((dir) => !KNOWN_DIRS.includes(dir));
  if (unknown.length) {
    return {
      stdout: `${pyJson(
        { ok: false, error: `unknown dirs ${unknown.join(", ")}; known: ${KNOWN_DIRS.join(", ")}` },
        { ensureAscii: true },
      )}\n`,
      exitCode: 1,
    };
  }
  const skillDir = `${args.dest}/${name}`;
  if (await fs.exists(skillDir)) {
    return { stdout: `${pyJson({ ok: false, error: `${skillDir} already exists` }, { ensureAscii: true })}\n`, exitCode: 1 };
  }

  let description = args.description ?? DESCRIPTION_PLACEHOLDER;
  if (args.shape === "multi-skill-module") description = RECORD_DESCRIPTION;

  const created: string[] = [];
  const emitted: [string, string][] = [["SKILL.md", skillMd(name, description)]];
  if (args.bmod || args.shape === "single-skill-module" || args.shape === "multi-skill-module") {
    emitted.push(["bmod.toml", bmodToml(args.shape!, name, args.bmod, args.source)]);
  }
  await fs.mkdir(skillDir);
  for (const [rel, text] of emitted) {
    await fs.writeText(`${skillDir}/${rel}`, text);
    created.push(rel);
  }
  for (const dir of dirs) {
    await fs.mkdir(`${skillDir}/${dir}`);
    created.push(dir + "/");
  }
  const result = { ok: true, skill: name, dir: skillDir, shape: args.shape, created };
  return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}\n`, exitCode: 0 };
}

function finding(path: string, line: number, rule: string, text: string, fix: string): Record<string, unknown> {
  return { path, line, rule, text: text.slice(0, 200), fix };
}

async function readBmod(
  fs: Fs,
  skillDir: string,
  findings: Record<string, unknown>[],
): Promise<{ data: Record<string, unknown> | null; status: string }> {
  const path = `${skillDir}/bmod.toml`;
  if (!(await isFile(fs, path))) return { data: null, status: "absent" };
  let data: Record<string, unknown>;
  try {
    data = parseToml(await fs.readText(path)) as Record<string, unknown>;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    findings.push(finding("bmod.toml", 1, "bmod-invalid", text, "fix the TOML"));
    return { data: null, status: "invalid" };
  }
  if (!("skill" in data) && !("bmod" in data)) {
    findings.push(finding("bmod.toml", 1, "bmod-tables", "neither [skill] nor [bmod]", "add a [skill] table"));
    return { data, status: "invalid" };
  }
  return { data, status: "ok" };
}

/** Every file under a folder, sorted the way `sorted(dir.rglob("*"))` sorts. */
export async function walkFiles(fs: Fs, root: string, skip: (rel: string[]) => boolean = () => false): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, rel: string[]): Promise<void> => {
    for (const name of await fs.list(dir)) {
      const path = `${dir}/${name}`;
      const parts = [...rel, name];
      if (skip(parts)) continue;
      if (await isDirectory(fs, path)) await walk(path, parts);
      else out.push(path);
    }
  };
  await walk(root, []);
  return out.sort(compareStrings);
}

async function check(fs: Fs, skillDir: string, anyName: boolean): Promise<Record<string, unknown>> {
  const findings: Record<string, unknown>[] = [];
  const bmod = await readBmod(fs, skillDir, findings);
  const isRecord = bmod.data !== null && "bmod" in bmod.data && !("skill" in bmod.data);

  const skillPath = `${skillDir}/SKILL.md`;
  if (!(await isFile(fs, skillPath))) {
    findings.push(finding("SKILL.md", 1, "skill-md-missing", "no SKILL.md", "create SKILL.md"));
  } else {
    const content = await fs.readText(skillPath);
    const { meta, body } = parseSkillFrontmatter(content);
    if (meta === null) {
      findings.push(finding("SKILL.md", 1, "frontmatter-missing", content.slice(0, 80), "open with --- name/description ---"));
    } else {
      const extra = Object.keys(meta).filter((key) => key !== "name" && key !== "description").sort(compareStrings);
      if (extra.length) {
        findings.push(finding("SKILL.md", 1, "frontmatter-keys", extra.join(", "), "keep only name and description"));
      }
      const name = meta.name ?? "";
      if (!name) {
        findings.push(finding("SKILL.md", 1, "name-missing", "", "add name: <folder name>"));
      } else {
        if (name !== skillDir.slice(skillDir.lastIndexOf("/") + 1)) {
          findings.push(
            finding("SKILL.md", 2, "name-folder-mismatch", name, `name must equal ${skillDir.slice(skillDir.lastIndexOf("/") + 1)}`),
          );
        }
        const regex = anyName ? KEBAB_RE : isRecord ? RECORD_NAME_RE : BMAD_NAME_RE;
        if (!regex.test(name)) {
          findings.push(finding("SKILL.md", 2, "name-format", name, `name must match ${regex.source}`));
        }
      }
      const desc = meta.description ?? "";
      if (!desc) {
        findings.push(finding("SKILL.md", 1, "description-missing", "", "add a description with a Use when clause"));
      } else {
        if (desc.length > 1024) {
          findings.push(finding("SKILL.md", 3, "description-length", `${desc.length} chars`, "cut to 1024 or fewer"));
        }
        if (isRecord) {
          if (desc !== RECORD_DESCRIPTION) {
            findings.push(
              finding("SKILL.md", 3, "description-trigger", desc, `a record's description is '${RECORD_DESCRIPTION}'`),
            );
          }
        } else if (!USE_WHEN_RE.test(desc)) {
          findings.push(finding("SKILL.md", 3, "description-trigger", desc, 'add a "Use when ..." clause'));
        }
      }
      if (!body.trim()) {
        findings.push(finding("SKILL.md", 1, "body-empty", "", "write the skill body after the frontmatter"));
      }
    }
  }

  for (const path of await walkFiles(fs, skillDir)) {
    const rel = path.slice(skillDir.length + 1);
    const parts = rel.split("/");
    const name = parts[parts.length - 1];
    const dot = name.lastIndexOf(".");
    const suffix = dot > 0 ? name.slice(dot) : "";
    if (!TEXT_SUFFIXES.includes(suffix) || parts.some((part) => part.startsWith("."))) continue;
    const lines = (await fs.readText(path)).split("\n");
    lines.forEach((line, index) => {
      if (TODO_RE.test(line)) {
        findings.push(finding(rel, index + 1, "todo-left", line.trim(), "fill in or remove the placeholder"));
      }
    });
  }

  return { ok: findings.length === 0, skill: skillDir.slice(skillDir.lastIndexOf("/") + 1), bmod: bmod.status, findings };
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function initSkill(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "init_skill";
  const args: Args = { name: null, dest: null, shape: null, dirs: "", bmod: null, source: null, description: null };
  let checkPath: string | null = null;
  let anyName = false;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    const take = (): string | undefined => value();
    if (flag === "--check") {
      const taken = take();
      if (taken === undefined) return usageError(script, "argument --check: expected one argument");
      checkPath = taken;
    } else if (flag === "--any-name" && inline === null) anyName = true;
    else if (flag === "--name") args.name = take() ?? null;
    else if (flag === "--dest") args.dest = take() ?? null;
    else if (flag === "--shape") {
      const taken = take();
      if (taken === undefined) return usageError(script, "argument --shape: expected one argument");
      if (!SHAPES.includes(taken)) return usageError(script, `argument --shape: invalid choice: '${taken}'`);
      args.shape = taken;
    } else if (flag === "--dirs") args.dirs = take() ?? "";
    else if (flag === "--bmod") args.bmod = take() ?? null;
    else if (flag === "--source") args.source = take() ?? null;
    else if (flag === "--description") args.description = take() ?? null;
    else if (flag === "--skill-root") {
      // Task 1's patch artifact; the Python never read its own location.
      if (take() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else return usageError(script, `unrecognized arguments: ${argv[i]}`);
  }

  if (checkPath !== null) {
    if (!(await isDirectory(fs, checkPath))) return usageError(script, `not a directory: ${checkPath}`);
    const result = await check(fs, checkPath, anyName);
    return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}\n`, exitCode: result.ok ? 0 : 1 };
  }

  if (!(args.name && args.dest && args.shape)) {
    return usageError(script, "--name, --dest and --shape are required to create a skill (or use --check)");
  }
  return create(fs, args);
}

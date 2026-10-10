import type { Fs } from "./fs";
import { compareStrings, isDirectory, pyJson } from "./knowledge";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-toolsmith/scripts/scan_paths.py` — lint a skill's
 * Markdown for path conventions: bare `scripts/` calls, `installed_path`
 * leftovers, machine-absolute paths, references into another skill, dead
 * backticked references, old module formats and hand-rolled Python calls. The
 * goldens in `__tests__/goldens/helpers/scanPaths-*.json` are the contract,
 * line numbers and finding order included.
 *
 * `--skill-root` is the Task 1 patch artifact, accepted and ignored (the
 * Python never read its own location).
 */

const SKIP_DIRS = [".git", "__pycache__", "node_modules", ".venv", "venv"];
const EXAMPLE_DIR = "assets";
const EXAMPLE_PREFIX = "sample-";

const BARE_SCRIPT_RE = /\buv\s+run\b[^`\n]*?\s(?:\.\/)?scripts\/\S+/g;
const INSTALLED_PATH_RE = /\{installed_path\}|\binstalled_path\s*[:=]/g;
const ABS_PATH_RE = /(?:\/Users\/|\/home\/|\b[A-Za-z]:[\\/]|(?<![\w.])~\/)\S*/g;
const OLD_FORMAT_RE = /\bmodule\.yaml\b|\bmodule-help\.csv\b/g;
const PYTHON_CALL_RE = /(?<![\w/.-])(?:python3?|pip3?)\s+(?:-m\s+\S+|\S+\.py\b|install\b)/g;
const BACKTICK_REF_RE = /`([^`\s]+\/[^`\s]+\.(?:md|yaml|yml|toml|json|csv|txt|xml|py|html))`/g;
const SKILL_DIR_RE = /(?:^|\/)(?:skills|\.claude\/skills|\.agents\/skills|_bmad)\/([a-z0-9][a-z0-9-]*)\//;
const RULES = ["bare-script-call", "installed-path", "absolute-path", "cross-skill-ref", "missing-file", "old-module-format", "python-call"];
const BMAD_RUNTIME_DIRS = ["scripts", "config", "custom", "memory", "render", "_config", "knowledge"];

function finding(path: string, line: number, rule: string, text: string, fix: string): Record<string, unknown> {
  return { path, line, rule, text: text.trim().slice(0, 200), fix };
}

/** `blank_fences`: fenced blocks blanked, their newlines kept. */
export function blankFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ""));
}

function lineOf(content: string, offset: number): number {
  let count = 0;
  for (let i = 0; i < offset; i++) if (content[i] === "\n") count += 1;
  return count + 1;
}

/** `iter_md_files`: every `.md` under the skill, hidden paths skipped, sorted. */
export async function iterMarkdown(fs: Fs, root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, parts: string[]): Promise<void> => {
    for (const name of await fs.list(dir)) {
      const path = `${dir}/${name}`;
      const next = [...parts, name];
      if (SKIP_DIRS.includes(name) || name.startsWith(".")) continue;
      if (await isDirectory(fs, path)) await walk(path, next);
      else if (name.endsWith(".md")) out.push(path);
    }
  };
  await walk(root, []);
  return out.sort(compareStrings);
}

function isExample(parts: string[]): boolean {
  const name = parts[parts.length - 1] ?? "";
  return parts.slice(0, -1).includes(EXAMPLE_DIR) || name.startsWith(EXAMPLE_PREFIX);
}

function scanRegexRules(content: string, rel: string): Record<string, unknown>[] {
  const findings: Record<string, unknown>[] = [];
  const rules: [RegExp, string, string][] = [
    [BARE_SCRIPT_RE, "bare-script-call", "write `uv run {skill-root}/scripts/<name>.py`"],
    [INSTALLED_PATH_RE, "installed-path", "remove installed_path; use a path relative to this file"],
    [ABS_PATH_RE, "absolute-path", "use {project-root}, {skill-root} or a config value"],
    [OLD_FORMAT_RE, "old-module-format", "describe the module in bmod.toml; see the migrate mode"],
    [PYTHON_CALL_RE, "python-call", "run it as `uv run <path>`; dependencies come from the script's PEP 723 header"],
  ];
  for (const [regex, rule, fix] of rules) {
    for (const match of content.matchAll(regex)) {
      findings.push(finding(rel, lineOf(content, match.index), rule, match[0], fix));
    }
  }
  return findings;
}

/** The reference-resolution rules: cross-skill references and dead backticked
 * paths, over the fenced blocks blanked out. */
async function scanReferences(
  fs: Fs,
  content: string,
  rel: string,
  skillRoot: string,
): Promise<Record<string, unknown>[]> {
  const findings: Record<string, unknown>[] = [];
  const stripped = blankFences(content);
  const skillName = skillRoot.slice(skillRoot.lastIndexOf("/") + 1);
  const relDir = rel.includes("/") ? `${skillRoot}/${rel.slice(0, rel.lastIndexOf("/"))}` : skillRoot;
  for (const match of stripped.matchAll(BACKTICK_REF_RE)) {
    const raw = match[1];
    const line = lineOf(stripped, match.index);
    const other = SKILL_DIR_RE.exec(raw);
    if (other && other[1] !== skillName && !BMAD_RUNTIME_DIRS.includes(other[1])) {
      findings.push(
        finding(
          rel,
          line,
          "cross-skill-ref",
          raw,
          `do not reach into \`${other[1]}\`; write "invoke the \`${other[1]}\` skill"`,
        ),
      );
      continue;
    }
    if ([...raw].some((ch) => "*<{".includes(ch))) continue;
    if (raw.startsWith("../")) {
      const target = normalize(`${relDir}/${raw}`);
      if (target !== skillRoot && !target.startsWith(`${skillRoot}/`)) {
        findings.push(finding(rel, line, "cross-skill-ref", raw, "a skill's files stay inside it"));
      }
      continue;
    }
    if (raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("_bmad/") || raw.startsWith("@")) continue;
    if (isExample(rel.split("/"))) continue;
    const resolves = async (path: string): Promise<boolean> => (await fs.exists(path)) && !(await isDirectory(fs, path));
    if ((await resolves(`${relDir}/${raw}`)) || (await resolves(`${skillRoot}/${raw}`))) continue;
    const firstDir = raw.split("/")[0];
    if ((await isDirectory(fs, `${relDir}/${firstDir}`)) || (await isDirectory(fs, `${skillRoot}/${firstDir}`))) {
      findings.push(finding(rel, line, "missing-file", raw, "fix the path or remove the dead reference"));
    }
  }
  return findings;
}

/** A lexical `Path.resolve()`: dot segments folded, no symlinks to follow. */
function normalize(path: string): string {
  const parts: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return "/" + parts.join("/");
}

export async function scanSkill(
  fs: Fs,
  skillRoot: string,
  allow: string[] = [],
): Promise<{ skill: string; files_scanned: number; findings: Record<string, unknown>[] }> {
  let findings: Record<string, unknown>[] = [];
  let count = 0;
  for (const path of await iterMarkdown(fs, skillRoot)) {
    count += 1;
    const rel = path.slice(skillRoot.length + 1);
    const content = await fs.readText(path);
    findings.push(...scanRegexRules(content, rel));
    findings.push(...(await scanReferences(fs, content, rel, skillRoot)));
  }
  findings = findings.filter((entry) => !allow.includes(entry.rule as string));
  findings.sort(
    (a, b) =>
      compareStrings(a.path as string, b.path as string) ||
      (a.line as number) - (b.line as number) ||
      compareStrings(a.rule as string, b.rule as string),
  );
  return { skill: skillRoot.slice(skillRoot.lastIndexOf("/") + 1), files_scanned: count, findings };
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function scanPaths(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "scan_paths";
  const positionals: string[] = [];
  const allow: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--allow") {
      const value = inline ?? argv[++i];
      if (value === undefined) return usageError(script, "argument --allow: expected one argument");
      allow.push(value);
    } else if (flag === "--skill-root") {
      const value = inline ?? argv[++i];
      if (value === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  const skill = positionals[0];
  if (skill === undefined) return usageError(script, "the following arguments are required: skill");
  if (!(await isDirectory(fs, skill))) return usageError(script, `not a directory: ${skill}`);
  const unknown = [...new Set(allow)].filter((rule) => !RULES.includes(rule)).sort(compareStrings);
  if (unknown.length) {
    return usageError(script, `unknown rule(s): ${unknown.join(", ")}; rules: ${[...RULES].sort(compareStrings).join(", ")}`);
  }
  const result = await scanSkill(fs, skill, allow);
  return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}\n`, exitCode: result.findings.length ? 1 : 0 };
}

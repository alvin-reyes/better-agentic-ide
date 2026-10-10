import { homedir } from "node:os";
import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";
import { compareStrings, errorText, isDirectory, isFile, pyJson, resolvePath } from "./knowledge";
import { absolutePath, splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-customize/scripts/list_customizable_skills.py` — the
 * customizable skills installed beside this one, grouped by surface, with the
 * override files already in `{project-root}/_bmad/custom/` looked up. The
 * goldens in `__tests__/goldens/helpers/listCustomizableSkills-*.json` are the
 * contract, `sort_keys=True` included.
 *
 * The pin derived the skills root from its own location
 * (`{skills_root}/<skill>/scripts/…`). A bundled runtime has no such folder, so
 * the root comes from `--skills-root` (the pin's own flag) or, for the patched
 * call sites, from `--skill-root`'s parent — the same root the pin would have
 * computed for a skill installed there. The output is sorted by key at every
 * level, so the objects below are built in sorted-key order.
 */

const SURFACE_KEYS = ["agent", "workflow"] as const;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/;

/** `read_frontmatter_description`: the `description:` value, quotes stripped. */
export function frontmatterDescription(text: string): string {
  const match = FRONTMATTER_RE.exec(text);
  if (!match) return "";
  for (const line of match[1].split("\n")) {
    const stripped = line.trim();
    if (!stripped.startsWith("description:")) continue;
    let value = stripped.slice("description:".length).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"')))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

/** `~` and the dot segments, the way `Path.expanduser().resolve()` did. */
export function expandUser(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolvePath(`${home}/${path.slice(2)}`);
  return resolvePath(path);
}

interface Entry {
  description: string;
  has_team_override: boolean;
  has_user_override: boolean;
  install_path: string;
  name: string;
  skills_root: string;
  surface: string;
  team_override_path: string;
  user_override_path: string;
}

export async function scanCustomizableSkills(
  fs: Fs,
  roots: string[],
  projectRoot: string,
): Promise<Record<string, unknown>> {
  const agents: Entry[] = [];
  const workflows: Entry[] = [];
  const errors: string[] = [];
  const scannedRoots: string[] = [];
  const seen = new Set<string>();
  const customDir = `${projectRoot}/_bmad/custom`;

  for (const root of roots) {
    if (!(await isDirectory(fs, root))) {
      errors.push(`skills root does not exist: ${root}`);
      continue;
    }
    scannedRoots.push(root);
    for (const name of (await fs.list(root)).sort(compareStrings)) {
      const skillDir = `${root}/${name}`;
      if (!(await isDirectory(fs, skillDir))) continue;
      const customizeToml = `${skillDir}/customize.toml`;
      if (!(await isFile(fs, customizeToml))) continue;

      let data: Record<string, unknown> | null;
      try {
        data = parseToml(await fs.readText(customizeToml)) as Record<string, unknown>;
      } catch {
        data = null;
      }
      if (data === null) {
        errors.push(`failed to parse ${customizeToml}`);
        continue;
      }
      if (seen.has(name)) continue;
      seen.add(name);

      const skillMd = `${skillDir}/SKILL.md`;
      const description = (await isFile(fs, skillMd)) ? frontmatterDescription(await fs.readText(skillMd)) : "";
      const teamOverride = `${customDir}/${name}.toml`;
      const userOverride = `${customDir}/${name}.user.toml`;

      const surfaces = SURFACE_KEYS.filter((key) => key in data);
      if (!surfaces.length) {
        errors.push(`no [agent] or [workflow] block in ${customizeToml}`);
        continue;
      }
      for (const surface of surfaces) {
        const entry: Entry = {
          description,
          has_team_override: await isFile(fs, teamOverride),
          has_user_override: await isFile(fs, userOverride),
          install_path: skillDir,
          name,
          skills_root: root,
          surface,
          team_override_path: teamOverride,
          user_override_path: userOverride,
        };
        if (surface === "agent") agents.push(entry);
        else workflows.push(entry);
      }
    }
  }

  // json.dumps(..., indent=2, sort_keys=True): every level in key order.
  return {
    agents,
    custom_dir: customDir,
    errors,
    project_root: projectRoot,
    scanned_roots: scannedRoots,
    workflows,
  };
}

/** The uniform port shape, with the Task 6 refusal convention for the one
 * invocation error the Python answered itself. */
export async function listCustomizableSkills(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "list_customizable_skills";
  let projectRoot: string | null = null;
  let skillsRoot: string | null = null;
  let skillRoot: string | null = null;
  const extraRoots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    const taken = () => value();
    if (flag === "--project-root") {
      projectRoot = taken() ?? null;
      if (projectRoot === null) return usageError(script, "argument --project-root: expected one argument");
    } else if (flag === "--skills-root") {
      skillsRoot = taken() ?? null;
      if (skillsRoot === null) return usageError(script, "argument --skills-root: expected one argument");
    } else if (flag === "--extra-root") {
      const extra = taken();
      if (extra === undefined) return usageError(script, "argument --extra-root: expected one argument");
      extraRoots.push(extra);
    } else if (flag === "--skill-root") {
      // Task 1's patch artifact: the call site named the skill's own folder,
      // whose parent is the skills root this scan is over.
      const taken2 = taken();
      if (taken2 === undefined) return usageError(script, "argument --skill-root: expected one argument");
      skillRoot = taken2;
    } else {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    }
  }
  if (projectRoot === null) return usageError(script, "the following arguments are required: --project-root");

  const home = homedir();
  const resolvedProject = absolutePath(expandUser(projectRoot, home));
  if (!(await isDirectory(fs, resolvedProject))) {
    return {
      stdout: `error: project-root does not exist or is not a directory: ${resolvedProject}\n`,
      exitCode: 2,
    };
  }

  if (skillsRoot === null && skillRoot === null) {
    // The pin fell back to its own location, three parents up from the script;
    // nothing in the argv names that folder in a bundled runtime.
    return usageError(script, "give --skills-root (or the patched --skill-root) to name the skills folder to scan");
  }
  const primary =
    skillsRoot !== null
      ? absolutePath(expandUser(skillsRoot, home))
      : resolvePath(`${absolutePath(expandUser(skillRoot!, home))}/..`);
  const roots: string[] = [];
  for (const root of [primary, ...extraRoots.map((extra) => absolutePath(expandUser(extra, home)))]) {
    if (!roots.includes(root)) roots.push(root);
  }

  try {
    const result = await scanCustomizableSkills(fs, roots, resolvedProject);
    return { stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}\n`, exitCode: 0 };
  } catch (error) {
    return { stdout: `${errorText(error)}\n`, exitCode: 1 };
  }
}

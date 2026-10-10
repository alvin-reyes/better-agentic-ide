import { homedir } from "node:os";
import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";
import { compareStrings, isDirectory, isFile, pyJson, resolvePath } from "./knowledge";
import { absolutePath, splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-toolsmith/scripts/registry.py` — what BMad knows about
 * in a project, so a new skill's registration can be guessed: the installed
 * module records with their members and prefix, the skills wired to BMad but
 * registered nowhere, and whether `_bmad/` and a skills repository are there.
 * The goldens in `__tests__/goldens/helpers/registry-*.json` are the contract.
 *
 * One substitution: without `--root` the Python scans `~/.agents/skills` and
 * `~/.claude/skills` too. A bundled runtime has no script location, but it
 * does run under Node, so the home directory comes from `node:os` — the same
 * answer the interpreter gave.
 */

interface RecordEntry {
  code: string;
  folder: string;
  path: string;
  scope: string;
  version: unknown;
  update_source: unknown;
  skills: string[];
  has_help: boolean;
  has_roster: boolean;
  single_skill: boolean;
  prefix?: string;
}

const RUNTIME_RE = /_bmad\/scripts\//;

/** The shared leading `word-` run of the member names, or "". */
export function commonPrefix(names: string[]): string {
  if (!names.length) return "";
  const parts = names.map((name) => name.split("-"));
  let shared: string[] = [];
  const width = Math.min(...parts.map((p) => p.length));
  for (let i = 0; i < width; i++) {
    if (new Set(parts.map((part) => part[i])).size !== 1) break;
    shared.push(parts[0][i]);
  }
  if (parts.length === 1) {
    // One member: its name minus the last word, or the whole name when it is
    // one word (`bmad-`).
    shared = parts[0].slice(0, -1);
    if (!shared.length) shared = parts[0];
  }
  return shared.length ? shared.join("-") + "-" : "";
}

function isRelativeTo(path: string, parent: string): boolean {
  return path === parent || path.startsWith(parent.endsWith("/") ? parent : `${parent}/`);
}

export async function scanRegistry(
  fs: Fs,
  projectRoot: string,
  roots: string[],
): Promise<Record<string, unknown>> {
  const seen = new Set<string>();
  const records = new Map<string, RecordEntry>();
  const members = new Map<string, string[]>();
  const unregistered: { skill: string; path: string }[] = [];
  const home = resolvePath(homedir());

  for (const root of roots) {
    if (!(await isDirectory(fs, root))) continue;
    const entries = (await fs.list(root)).sort(compareStrings);
    for (const name of entries) {
      const folder = `${root}/${name}`;
      if (!(await isDirectory(fs, folder))) continue;
      if (!(await isFile(fs, `${folder}/SKILL.md`))) continue;
      const real = resolvePath(folder);
      if (seen.has(real)) continue;
      seen.add(real);
      const scope = isRelativeTo(real, home) && !isRelativeTo(real, resolvePath(projectRoot)) ? "user" : "project";
      const manifest = `${folder}/bmod.toml`;
      if (!(await isFile(fs, manifest))) {
        const skillText = await fs.readText(`${folder}/SKILL.md`);
        if ((await isFile(fs, `${folder}/customize.toml`)) || RUNTIME_RE.test(skillText)) {
          unregistered.push({ skill: name, path: folder });
        }
        continue;
      }
      let data: Record<string, unknown> = {};
      try {
        data = parseToml(await fs.readText(manifest)) as Record<string, unknown>;
      } catch {
        data = {};
      }
      const bmod = data.bmod;
      if (bmod !== null && typeof bmod === "object" && !Array.isArray(bmod) && (bmod as Record<string, unknown>).code) {
        const table = bmod as Record<string, unknown>;
        const skills = Array.isArray(table.skills) ? (table.skills as unknown[]) : [];
        records.set(name, {
          code: String(table.code),
          folder: name,
          path: folder,
          scope,
          version: table.version ?? null,
          update_source: table.update_source ?? null,
          skills: skills.map(String),
          has_help: await isFile(fs, `${folder}/help/help.md`),
          has_roster: await isFile(fs, `${folder}/roster.toml`),
          single_skill: "skill" in data,
        });
      }
      const skill = data.skill;
      if (skill !== null && typeof skill === "object" && !Array.isArray(skill) && (skill as Record<string, unknown>).bmod) {
        const owner = String((skill as Record<string, unknown>).bmod);
        members.set(owner, [...(members.get(owner) ?? []), name]);
      }
    }
  }

  const out: RecordEntry[] = [];
  for (const folder of [...records.keys()].sort(compareStrings)) {
    const rec = records.get(folder)!;
    const names = [...new Set([...rec.skills, ...(members.get(folder) ?? [])])].sort(compareStrings);
    rec.skills = names;
    rec.prefix = names.length ? commonPrefix(names) : `${rec.code}-`;
    out.push(rec);
  }

  const bmadDir = `${projectRoot}/_bmad`;
  const core = out.find((rec) => rec.code === "core-tools") ?? null;
  const skillsDir = `${projectRoot}/skills`;
  let skillsRepo = false;
  if (await isDirectory(fs, skillsDir)) {
    for (const name of await fs.list(skillsDir)) {
      const folder = `${skillsDir}/${name}`;
      if (!(await isDirectory(fs, folder))) continue;
      if ((await isFile(fs, `${folder}/SKILL.md`)) && (await isFile(fs, `${folder}/bmod.toml`))) {
        skillsRepo = true;
        break;
      }
    }
  }
  return {
    project_root: projectRoot,
    bmad: { present: await isDirectory(fs, bmadDir), version: core === null ? null : core.version },
    skills_repo: skillsRepo,
    records: out,
    unregistered,
  };
}

/** The Python's own home-relative defaults, for a call site that passed no root. */
export function defaultRegistryRoots(projectRoot: string): string[] {
  const home = homedir();
  return [
    `${projectRoot}/.agents/skills`,
    `${projectRoot}/.claude/skills`,
    `${projectRoot}/skills`,
    `${home}/.agents/skills`,
    `${home}/.claude/skills`,
  ];
}

export async function registry(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "registry";
  let projectRoot: string | null = null;
  let skillRoot: string | null = null;
  const roots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project-root") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --project-root: expected one argument");
      projectRoot = taken;
    } else if (flag === "--root") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --root: expected one argument");
      roots.push(taken);
    } else if (flag === "--skill-root") {
      // The patched call sites carry it; the Python never read its own
      // location, but a skill sitting in a root names that root's folder.
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --skill-root: expected one argument");
      skillRoot = taken;
    } else {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    }
  }
  if (projectRoot === null) return usageError(script, "the following arguments are required: --project-root");
  const resolved = absolutePath(projectRoot);
  if (!(await isDirectory(fs, resolved))) return usageError(script, `not a directory: ${resolved}`);

  const fallback = skillRoot === null ? [] : [resolvePath(`${skillRoot}/..`)];
  const allRoots = roots.length
    ? roots.map((root) => absolutePath(root))
    : [...fallback, ...defaultRegistryRoots(resolved)];
  const report = await scanRegistry(fs, resolved, allRoots);
  return { stdout: `${pyJson(report, { indent: 2, ensureAscii: true })}\n`, exitCode: 0 };
}

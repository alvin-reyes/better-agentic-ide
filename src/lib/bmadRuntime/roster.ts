import { parse as parseToml } from "smol-toml";
import { hasOwn } from "./compat";
import { loadCentralConfig, resolveCustomization } from "./config";
import type { Fs } from "./fs";
import {
  ROSTER_NAME,
  compareStrings,
  dirname,
  errorText,
  folderName,
  installCommand,
  isDirectory,
  isTable,
  pyJson,
  pyRepr,
  readDocument,
  resolvePath,
  scan,
  type ModuleRecord,
  type Problem,
} from "./knowledge";

/**
 * Port of `skills/bmad/scripts/roster.py` — report the people and groups the
 * installed modules offer. `roster.py` imports `scan`, `read_document`,
 * `install_command` and `ROSTER_NAME` from `knowledge.py`, and so does this
 * file from `knowledge.ts`. Where a golden in `__tests__/goldens/misc/`
 * disagrees with this file, this file changes.
 *
 * One substitution: `agent_identity` catches the Python `ConfigError` a skill
 * with no `customize.toml` raises; Task 3's `resolveCustomization` throws its
 * own message for the same case, and both are discarded here, so the shapes
 * agree even though the text does not.
 */

const MEMBER_FIELDS = ["name", "icon", "title", "persona", "capabilities", "model"] as const;
const AGENT_FIELDS = ["name", "icon", "title"] as const;

interface RosterEntry {
  code: string;
  module?: string;
  source: string;
  name?: string;
  icon?: string;
  title?: string;
  persona?: string;
  capabilities?: unknown;
  model?: unknown;
  skill?: string;
  installed?: boolean;
  install?: string;
  [field: string]: unknown;
}

interface RosterReport {
  agents: Record<string, RosterEntry>;
  members: Record<string, RosterEntry>;
  groups: Record<string, unknown>[];
  rosters: { module: string; path: string; skills: string[] }[];
  problems: Problem[];
}

export async function collect(fs: Fs, roots: string[], projectRoot: string | null = null): Promise<RosterReport> {
  const found = await scan(fs, roots);
  const problems = found.problems;
  const skills = found.folders;
  const files = new Map<string, { module: ModuleRecord; path: string; data: Record<string, unknown> }>();

  for (const module of found.modules) {
    if (await fs.exists(`${module.folder}/${ROSTER_NAME}`)) {
      await recordFile(fs, files, problems, module);
    }
  }

  const members: Record<string, RosterEntry> = Object.create(null);
  const groups: Record<string, Record<string, unknown>> = Object.create(null);
  const ordered = [...files.values()].sort(
    (a, b) => compareStrings(a.module.code, b.module.code) || compareStrings(a.path, b.path),
  );
  for (const file of ordered) {
    const source = file.module.table.update_source;
    for (const member of listed(file.data, "members", problems, file.module.code, file.path)) {
      await addMember(fs, members, problems, member, file.module.code, file.path, source, skills, projectRoot);
    }
    for (const group of listed(file.data, "groups", problems, file.module.code, file.path)) {
      addGroup(groups, problems, group, file.module.code, file.path);
    }
  }

  const agents: Record<string, RosterEntry> = Object.create(null);
  for (const [code, member] of Object.entries(members)) if (member.installed) agents[code] = member;
  await applyCentralAgents(fs, agents, members, problems, projectRoot);

  return {
    agents,
    members,
    groups: [...Object.values(groups)],
    rosters: ordered.map((file) => ({
      module: file.module.code,
      path: file.path,
      skills: file.module.skills.filter((name) => skills.has(name)),
    })),
    problems,
  };
}

function listed(data: Record<string, unknown>, key: string, problems: Problem[], module: string, path: string): unknown[] {
  const found = data[key] ?? [];
  if (Array.isArray(found)) return found;
  problems.push({ kind: "roster", problem: `${module} ${path}: '${key}' is not a list` });
  return [];
}

async function recordFile(
  fs: Fs,
  files: Map<string, { module: ModuleRecord; path: string; data: Record<string, unknown> }>,
  problems: Problem[],
  module: ModuleRecord,
): Promise<void> {
  const folder = module.folder;
  const path = `${folder}/${ROSTER_NAME}`;
  let data: Record<string, unknown>;
  try {
    data = parseToml(await readDocument(fs, path, folder)) as Record<string, unknown>;
  } catch (error) {
    problems.push({
      kind: "roster",
      skill: folderName(folder),
      problem: `${path}: ${errorText(error)}`,
    });
    return;
  }
  const key = `${module.code}\u0000${ROSTER_NAME}`;
  if (!files.has(key)) files.set(key, { module, path: ROSTER_NAME, data });
}

async function addMember(
  fs: Fs,
  members: Record<string, RosterEntry>,
  problems: Problem[],
  member: unknown,
  module: string,
  path: string,
  source: unknown,
  skills: Map<string, string>,
  projectRoot: string | null,
): Promise<void> {
  const code = isTable(member) ? member.code : undefined;
  if (typeof code !== "string" || !code) {
    problems.push({ kind: "member", problem: `${module} ${path}: a member has no code` });
    return;
  }
  if (hasOwn(members, code)) {
    problems.push({
      kind: "member",
      problem: `${module} ${path}: member ${pyRepr(code)} is already defined by ${members[code].module}`,
    });
    return;
  }
  const table = member as Record<string, unknown>;
  const entry: RosterEntry = { code, module, source: "roster" };
  for (const field of MEMBER_FIELDS) {
    if (typeof table[field] === "string") entry[field] = table[field];
  }
  const skill = table.skill;
  if (typeof skill === "string" && skill) {
    entry.skill = skill;
    entry.installed = skills.has(skill);
    if (entry.installed) {
      Object.assign(entry, await agentIdentity(fs, skills.get(skill)!, projectRoot));
    } else {
      const command = installCommand(source, skill);
      if (command) entry.install = command;
    }
  }
  if (!hasOwn(entry, "name")) entry.name = code;
  members[code] = entry;
}

/** The name, title and icon the agent actually answers to, after any customization. */
async function agentIdentity(
  fs: Fs,
  skillDir: string,
  projectRoot: string | null,
): Promise<Record<string, string>> {
  let agent: unknown;
  try {
    const skill = folderName(skillDir);
    const customization = await resolveCustomization(projectRoot ?? "", skillDir, skill, fs);
    agent = customization.agent ?? {};
  } catch {
    return {};
  }
  if (!isTable(agent)) return {};
  const identity: Record<string, string> = {};
  for (const field of AGENT_FIELDS) {
    if (typeof agent[field] === "string" && agent[field]) identity[field] = agent[field] as string;
  }
  return identity;
}

function addGroup(
  groups: Record<string, Record<string, unknown>>,
  problems: Problem[],
  group: unknown,
  module: string,
  path: string,
): void {
  const id = isTable(group) ? group.id : undefined;
  if (typeof id !== "string" || !id) {
    problems.push({ kind: "group", problem: `${module} ${path}: a group has no id` });
    return;
  }
  if (hasOwn(groups, id)) {
    problems.push({
      kind: "group",
      problem: `${module} ${path}: group ${pyRepr(id)} is already defined by ${groups[id].module}`,
    });
    return;
  }
  groups[id] = { ...(group as Record<string, unknown>), module };
}

/**
 * Lay the central config's `[agents.<code>]` tables over the scan: how a user
 * adds an agent of their own, and how an install made before rosters existed
 * keeps the agents it recorded.
 */
async function applyCentralAgents(
  fs: Fs,
  agents: Record<string, RosterEntry>,
  members: Record<string, RosterEntry>,
  problems: Problem[],
  projectRoot: string | null,
): Promise<void> {
  if (projectRoot === null || !(await isDirectory(fs, `${projectRoot}/_bmad`))) return;
  let configured: unknown;
  try {
    configured = (await loadCentralConfig(projectRoot, fs)).agents ?? {};
  } catch (error) {
    problems.push({ kind: "config", problem: errorText(error) });
    return;
  }
  if (!isTable(configured)) return;
  for (const [code, info] of Object.entries(configured)) {
    if (!isTable(info) || members[code]?.installed === false) continue;
    if (!hasOwn(agents, code)) agents[code] = { code, source: "config" };
    const entry = agents[code];
    const settled = new Set<string>();
    if (entry.source === "roster") {
      settled.add("module");
      for (const field of AGENT_FIELDS) if (hasOwn(entry, field)) settled.add(field);
    }
    const hasPersona = hasOwn(info, "persona");
    for (const [field, value] of Object.entries(info)) {
      if (settled.has(field)) continue;
      // Older installs recorded the persona paragraph as `description`.
      const target = field === "description" && !hasPersona ? "persona" : field;
      entry[target] = value;
    }
    if (!hasOwn(entry, "name")) entry.name = code;
  }
}

// ---------------------------------------------------------------- the command

export async function roster(argv: string[], fs: Fs): Promise<{ stdout: string; exitCode: number }> {
  let skill: string | null = null;
  let projectRoot: string | null = null;
  const roots: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--skill") {
      const value = argv[++i];
      if (value === undefined) return usageError("argument --skill: expected one argument");
      skill = value;
    } else if (token.startsWith("--skill=")) {
      skill = token.slice("--skill=".length);
    } else if (token === "--root") {
      const value = argv[++i];
      if (value === undefined) return usageError("argument --root: expected one argument");
      roots.push(value);
    } else if (token.startsWith("--root=")) {
      roots.push(token.slice("--root=".length));
    } else if (token === "--project-root") {
      const value = argv[++i];
      if (value === undefined) return usageError("argument --project-root: expected one argument");
      projectRoot = value;
    } else if (token.startsWith("--project-root=")) {
      projectRoot = token.slice("--project-root=".length);
    } else {
      return usageError(`unrecognized arguments: ${token}`);
    }
  }
  const allRoots = (skill !== null ? [dirname(resolvePath(skill))] : []).concat(roots);
  if (!allRoots.length) return usageError("give --skill or --root");
  const report = await collect(fs, allRoots, projectRoot === null ? null : resolvePath(projectRoot));
  return { stdout: `${pyJson(report, { indent: 2 })}\n`, exitCode: 0 };
}

function usageError(message: string): { stdout: string; exitCode: number } {
  return { stdout: `roster: error: ${message}`, exitCode: 2 };
}

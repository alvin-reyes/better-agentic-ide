import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";
import { isFile, pyJson, pyRepr, resolvePath } from "./knowledge";
import { collect as collectRoster } from "./roster";
import { loadCentralConfig, resolveCustomization } from "./config";
import { absolutePath, splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-forge-idea/scripts/resolve_personas.py` — the personas
 * and parties the forge can bring into the room: the installed roster, the
 * extra members an installed module or the user's party customization adds,
 * and the named groups with their members resolved to brief cards. The goldens
 * in `__tests__/goldens/helpers/resolvePersonas-*.json` are the contract.
 *
 * The Python shelled out to `roster.py` and `resolve_customization.py`, and
 * read them "directly" as the fallbacks; all four paths are in-process here
 * (the Task 5b roster, the Task 3 resolver, the TOML parser the runtime
 * already carries).
 */

const PARTY_SKILL = "bmad-party-mode";

interface Entry extends Record<string, unknown> {
  code: string;
  source: string;
  name?: string;
}

function isTable(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function badMember(code: unknown, name: unknown): boolean {
  return !(typeof code === "string" && (name === undefined || name === null || typeof name === "string"));
}

/** `load_roster` through the roster port, with the config's `[agents]` as the
 * Python's fallback when the roster cannot be read. */
export async function loadRoster(
  fs: Fs,
  projectRoot: string,
  skillRoot: string,
): Promise<{ agents: Record<string, Entry>; guests: Record<string, Entry>; groups: unknown[]; resolved: boolean }> {
  try {
    const data = await collectRoster(fs, [resolvePath(`${skillRoot}/..`)], projectRoot);
    const agents = isTable(data.agents) ? (data.agents as Record<string, Entry>) : {};
    const members = isTable(data.members) ? (data.members as Record<string, Entry>) : {};
    const guests: Record<string, Entry> = {};
    for (const [code, member] of Object.entries(members)) {
      if (!(code in agents) && isTable(member)) guests[code] = member as Entry;
    }
    return { agents, guests, groups: Array.isArray(data.groups) ? data.groups : [], resolved: true };
  } catch {
    return { agents: await loadConfigAgents(fs, projectRoot), guests: {}, groups: [], resolved: true };
  }
}

/** `load_config_agents`: the central config's `[agents]`, dict or list. */
async function loadConfigAgents(fs: Fs, projectRoot: string): Promise<Record<string, Entry>> {
  try {
    const config = await loadCentralConfig(projectRoot, fs);
    const agents = config.agents;
    if (Array.isArray(agents)) {
      const out: Record<string, Entry> = {};
      for (const item of agents) if (isTable(item) && item.code) out[String(item.code)] = item as Entry;
      return out;
    }
    return isTable(agents) ? (agents as Record<string, Entry>) : {};
  } catch {
    return {};
  }
}

/** `merge_groups`: roster groups first, custom ones replacing by id. */
export function mergeGroups(rosterGroups: unknown[], customGroups: unknown): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const group of rosterGroups) if (isTable(group) && group.id) merged.set(String(group.id), group);
  if (Array.isArray(customGroups)) {
    for (const group of customGroups) if (isTable(group) && group.id) merged.set(String(group.id), group);
  }
  return [...merged.values()];
}

/** `find_party_skill`: the installed bmad-party-mode folder, or null. */
export async function findPartySkill(fs: Fs, projectRoot: string, skillRoot: string): Promise<string | null> {
  const parent = resolvePath(`${skillRoot}/..`);
  const candidates = [
    `${parent}/${PARTY_SKILL}`,
    `${projectRoot}/.claude/skills/${PARTY_SKILL}`,
    `${projectRoot}/_bmad/skills/${PARTY_SKILL}`,
  ];
  for (const candidate of candidates) {
    if (await isFile(fs, `${candidate}/customize.toml`)) return candidate;
  }
  return null;
}

/** `load_party_workflow`: party-mode's merged `[workflow]`. */
export async function loadPartyWorkflow(
  fs: Fs,
  projectRoot: string,
  partySkill: string,
): Promise<Record<string, unknown>> {
  try {
    const merged = await resolveCustomization(projectRoot, partySkill, PARTY_SKILL, fs);
    if (isTable(merged.workflow)) return merged.workflow;
  } catch {
    // fall through: the base customize.toml, no override merge
  }
  try {
    const base = parseToml(await fs.readText(`${partySkill}/customize.toml`)) as Record<string, unknown>;
    return isTable(base.workflow) ? base.workflow : {};
  } catch {
    return {};
  }
}

/** `load_party_overrides`: the user's override TOMLs alone, team then personal. */
export async function loadPartyOverrides(fs: Fs, projectRoot: string): Promise<Record<string, unknown>> {
  const custom = `${projectRoot}/_bmad/custom`;
  const read = async (path: string): Promise<Record<string, unknown>> => {
    if (!(await isFile(fs, path))) return {};
    try {
      const data = parseToml(await fs.readText(path)) as Record<string, unknown>;
      return isTable(data.workflow) ? data.workflow : {};
    } catch {
      return {};
    }
  };
  const team = await read(`${custom}/${PARTY_SKILL}.toml`);
  const user = await read(`${custom}/${PARTY_SKILL}.user.toml`);
  const merged: Record<string, unknown> = { ...team };
  for (const [key, value] of Object.entries(user)) {
    const current = merged[key];
    if (Array.isArray(value) && Array.isArray(current)) merged[key] = [...current, ...value];
    else merged[key] = value;
  }
  return merged;
}

/** `build_pool`: one pool keyed by code, custom members overriding slots. */
export function buildPool(
  agents: Record<string, Entry>,
  partyMembers: unknown,
  guests: Record<string, Entry> | null = null,
): { pool: Record<string, Entry>; index: Map<string, string>; installedCodes: string[]; customCodes: string[] } {
  const pool: Record<string, Entry> = {};
  const index = new Map<string, string>();
  const installedCodes: string[] = [];
  const customCodes: string[] = [];

  const register = (code: string, entry: Entry): void => {
    pool[code] = entry;
    index.set(code, code);
    index.set(code.toLowerCase(), code);
    index.set(shortAlias(code).toLowerCase(), code);
    const name = entry.name;
    if (name) {
      const key = name.toLowerCase();
      // A custom rename must not hijack another agent's name lookup.
      if ((index.get(key) ?? code) === code) index.set(key, code);
    }
  };

  for (const [code, info] of Object.entries(agents ?? {})) {
    if (badMember(code, info.name)) continue;
    register(code, {
      code,
      name: info.name ?? code,
      icon: info.icon ?? "",
      title: info.title ?? "",
      description: info.description ?? "",
      persona: info.persona ?? "",
      source: "installed",
    });
    installedCodes.push(code);
  }

  for (const [code, info] of Object.entries(guests ?? {})) {
    if (badMember(code, info.name)) continue;
    const entry: Entry = { code, source: "roster" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model"]) {
      if (info[field]) entry[field] = info[field];
    }
    if (entry.name === undefined) entry.name = code;
    register(code, entry);
    customCodes.push(code);
  }

  for (const member of Array.isArray(partyMembers) ? partyMembers : []) {
    if (!isTable(member)) continue;
    const code = member.code;
    if (code === null || code === undefined || code === "" || badMember(code, member.name)) continue;
    const text = String(code);
    const canonical = index.get(text) ?? index.get(text.toLowerCase()) ?? text;
    const wasInstalled = canonical in pool;
    const entry: Entry = { ...(pool[canonical] ?? ({} as Entry)), code: canonical, source: "custom" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model"]) {
      if (member[field] !== null && member[field] !== undefined) entry[field] = member[field];
    }
    if (entry.name === undefined) entry.name = canonical;
    register(canonical, entry);
    if (!wasInstalled) customCodes.push(canonical);
  }

  return { pool, index, installedCodes, customCodes };
}

/** `_alias`: the short alias an installed agent code answers to. */
export function shortAlias(code: string): string {
  for (const prefix of ["bmad-agent-", "bmad-"]) if (code.startsWith(prefix)) return code.slice(prefix.length);
  return code;
}

/** `_brief`: the slim card the orchestrator casts a persona from. */
export function brief(entry: Entry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["code", "name", "icon", "title", "source"]) {
    const value = entry[key];
    if (value) out[key] = value;
  }
  for (const key of ["description", "persona", "capabilities", "model"]) {
    const value = entry[key];
    if (value) out[key] = value;
  }
  return out;
}

/** `resolve_parties`: the named groups with their members briefed. */
export function resolveParties(
  groups: unknown[],
  pool: Record<string, Entry>,
  index: Map<string, string>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const group of groups) {
    if (!isTable(group) || !group.id) continue;
    const raw = Array.isArray(group.members) ? group.members : [];
    const members: Record<string, unknown>[] = [];
    for (const token of raw) {
      // `str(t)`: a malformed entry is a token that resolves to nothing.
      const key = typeof token === "string" ? token : pyRepr(token);
      const code = index.get(key) ?? index.get(key.toLowerCase());
      if (code !== undefined && code in pool) members.push(brief(pool[code]));
    }
    const party: Record<string, unknown> = { id: group.id, name: group.name ?? group.id, members };
    if (group.scene) party.scene = group.scene;
    if (!raw.length) party.open_cast = true;
    out.push(party);
  }
  return out;
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function resolvePersonas(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "resolve_personas";
  let projectRoot: string | null = null;
  let skill: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--project-root") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --project-root: expected one argument");
      projectRoot = taken;
    } else if (flag === "--skill") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --skill: expected one argument");
      skill = taken;
    } else if (flag === "--skill-root") {
      // Task 1's patch artifact; the Python never read its own location.
      if (value() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else return usageError(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (projectRoot === null) return usageError(script, "the following arguments are required: --project-root");
  if (skill === null) return usageError(script, "the following arguments are required: --skill");

  const root = absolutePath(projectRoot);
  const skillRoot = absolutePath(skill);
  const roster = await loadRoster(fs, root, skillRoot);
  const partySkill = await findPartySkill(fs, root, skillRoot);
  const workflow = partySkill !== null ? await loadPartyWorkflow(fs, root, partySkill) : await loadPartyOverrides(fs, root);

  const { pool, index, installedCodes, customCodes } = buildPool(roster.agents, workflow.party_members ?? [], roster.guests);
  const parties = resolveParties(mergeGroups(roster.groups, workflow.party_groups ?? []), pool, index);

  const payload = {
    agents: installedCodes.map((code) => brief(pool[code])),
    members: customCodes.map((code) => brief(pool[code])),
    parties,
    default_party: typeof workflow.default_party === "string" && workflow.default_party ? workflow.default_party : "",
    party_mode_found: partySkill !== null,
    agents_resolved: roster.resolved,
  };
  return { stdout: `${pyJson(payload, { indent: 2 })}\n`, exitCode: 0 };
}

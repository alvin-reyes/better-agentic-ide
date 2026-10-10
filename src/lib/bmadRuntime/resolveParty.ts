import type { Fs } from "./fs";
import { pyJson, resolvePath } from "./knowledge";
import { parse as parseToml } from "smol-toml";
import { collect as collectRoster } from "./roster";
import { loadCentralConfig, resolveCustomization } from "./config";
import { absolutePath, splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-party-mode/scripts/resolve_party.py` — merge the
 * installed roster with the user's `party_members` and `party_groups` into one
 * collective, then project only what the moment needs: the default room, the
 * group menu, or one group's detail. The goldens in
 * `__tests__/goldens/helpers/resolveParty-*.json` are the contract.
 *
 * The Python shelled out to `_bmad/scripts/roster.py` and
 * `resolve_customization.py`; the port answers both in-process through the
 * Task 5b roster and the Task 3 customization resolver — the same modules,
 * with no interpreter in the middle. The roster's own "the script is missing"
 * fallback (`resolve_config.py`'s `[agents]`) stays reachable when the roster
 * cannot be read at all.
 */

interface Entry extends Record<string, unknown> {
  code: string;
  source: string;
  name?: string;
}

function isTable(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `load_roster` through the roster port: (agents, guests, groups, resolved, problems). */
export async function loadRoster(
  fs: Fs,
  projectRoot: string,
  skillRoot: string,
): Promise<{ agents: Record<string, Entry>; guests: Record<string, Entry>; groups: unknown[]; resolved: boolean; problems: string[] }> {
  const root = resolvePath(`${skillRoot}/..`);
  try {
    const data = await collectRoster(fs, [root], projectRoot);
    const agents = (data.agents ?? {}) as Record<string, Entry>;
    const members = (data.members ?? {}) as Record<string, Entry>;
    const guests: Record<string, Entry> = {};
    for (const [code, member] of Object.entries(members)) if (!(code in agents)) guests[code] = member;
    const problems = (data.problems ?? [])
      .filter((problem) => isTable(problem) && typeof problem.problem === "string")
      .map((problem) => problem.problem as string)
      .filter(Boolean);
    return { agents, guests, groups: data.groups ?? [], resolved: true, problems };
  } catch {
    // The Python's fallback: the `[agents]` table the central config holds.
    try {
      const config = await loadCentralConfig(projectRoot, fs);
      const agents = isTable(config.agents) ? (config.agents as Record<string, Entry>) : {};
      return { agents, guests: {}, groups: [], resolved: true, problems: [] };
    } catch {
      return { agents: {}, guests: {}, groups: [], resolved: false, problems: [] };
    }
  }
}

/** `load_workflow`: the merged `[workflow]` table, the base customize.toml as
 * the fallback when no override layer resolves. */
export async function loadWorkflow(fs: Fs, projectRoot: string, skillRoot: string): Promise<Record<string, unknown>> {
  const skill = skillRoot.replace(/\/+$/, "").split("/").pop() ?? skillRoot;
  try {
    const merged = await resolveCustomization(projectRoot, skillRoot, skill, fs);
    if (isTable(merged.workflow)) return merged.workflow;
  } catch {
    // fall through to the skill's own table
  }
  try {
    const base = parseToml(await fs.readText(`${skillRoot}/customize.toml`)) as Record<string, unknown>;
    return isTable(base.workflow) ? base.workflow : {};
  } catch {
    return {};
  }
}

/** `merge_groups`: roster groups first, then the user's, keyed by id. */
export function mergeGroups(rosterGroups: unknown[], customGroups: unknown): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const group of rosterGroups) {
    if (isTable(group) && group.id) merged.set(String(group.id), group);
  }
  if (Array.isArray(customGroups)) {
    for (const group of customGroups) if (isTable(group) && group.id) merged.set(String(group.id), group);
  }
  return [...merged.values()];
}

/** `_alias`: the short alias an installed agent code answers to. */
export function alias(code: string): string {
  if (code.includes("-agent-")) return code.split("-agent-", 2)[1];
  for (const prefix of ["bmad-agent-", "bmad-"]) if (code.startsWith(prefix)) return code.slice(prefix.length);
  return code;
}

function badMember(code: unknown, name: unknown): boolean {
  return !(typeof code === "string" && (name === undefined || name === null || typeof name === "string"));
}

export function buildCollective(
  agents: Record<string, Entry>,
  partyMembers: unknown,
  guests: Record<string, Entry> | null = null,
): { collective: Record<string, Entry>; index: Map<string, string>; installedCodes: string[] } {
  const collective: Record<string, Entry> = {};
  const index = new Map<string, string>();
  const installedCodes: string[] = [];
  const aliasOwner = new Map<string, string | null>();

  const register = (code: string, entry: Entry): void => {
    collective[code] = entry;
    index.set(code, code);
    index.set(code.toLowerCase(), code);
    const short = alias(code).toLowerCase();
    const owner = aliasOwner.has(short) ? aliasOwner.get(short)! : code;
    if (!aliasOwner.has(short)) aliasOwner.set(short, code);
    if (owner === code) {
      if (!index.has(short)) index.set(short, code);
    } else if (owner !== null) {
      aliasOwner.set(short, null);
      if (index.get(short) === owner && short !== owner.toLowerCase()) index.delete(short);
    }
    const name = entry.name;
    if (name) index.set(name.toLowerCase(), code);
  };

  for (const [code, info] of Object.entries(agents)) {
    if (badMember(code, info.name)) continue;
    const entry: Entry = {
      code,
      name: info.name ?? code,
      icon: info.icon ?? "",
      title: info.title ?? "",
      module: info.module ?? "",
      source: "installed",
    };
    // Installs from before rosters recorded the persona as `description`.
    const persona = info.persona ?? info.description;
    if (persona) entry.persona = persona;
    for (const field of ["capabilities", "model"]) if (info[field]) entry[field] = info[field];
    register(code, entry);
    installedCodes.push(code);
  }

  for (const [code, info] of Object.entries(guests ?? {})) {
    if (badMember(code, info.name)) continue;
    const entry: Entry = { code, source: "roster" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model", "module", "skill", "install"]) {
      if (info[field]) entry[field] = info[field];
    }
    if (entry.name === undefined) entry.name = code;
    if (info.installed === false) entry.installed = false;
    register(code, entry);
  }

  for (const member of Array.isArray(partyMembers) ? partyMembers : []) {
    if (!isTable(member)) continue;
    const code = member.code;
    if (code === null || code === undefined || code === "" || badMember(code, member.name)) continue;
    const text = String(code);
    // A custom member overrides an installed agent it matches by code/alias/name.
    const canonical = index.get(text) ?? index.get(text.toLowerCase()) ?? text;
    const entry: Entry = { ...(collective[canonical] ?? ({} as Entry)), code: canonical, source: "custom" };
    for (const field of ["name", "icon", "title", "persona", "capabilities", "model"]) {
      if (member[field] !== null && member[field] !== undefined) entry[field] = member[field];
    }
    if (entry.name === undefined) entry.name = canonical;
    register(canonical, entry);
    // An override keeps the installed slot; a brand-new custom does not join it.
  }

  return { collective, index, installedCodes };
}

/** `resolve_members`: the entries in the listed order, and the tokens that did
 * not resolve. */
export function resolveMembers(
  tokens: unknown,
  collective: Record<string, Entry>,
  index: Map<string, string>,
): { resolved: Entry[]; unresolved: unknown[] } {
  const resolved: Entry[] = [];
  const unresolved: unknown[] = [];
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (typeof token !== "string") {
      unresolved.push(token); // malformed config value — never a key lookup
      continue;
    }
    const code = index.get(token) ?? index.get(token.toLowerCase());
    if (code && code in collective) resolved.push(collective[code]);
    else unresolved.push(token);
  }
  return { resolved, unresolved };
}

/** `group_menu`: names only, open-cast groups flagged. */
export function groupMenu(groups: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const group of groups) {
    if (!isTable(group) || !group.id) continue;
    const members = Array.isArray(group.members) ? group.members : [];
    const entry: Record<string, unknown> = {
      id: group.id,
      name: group.name ?? group.id,
      member_count: members.length,
    };
    if (!members.length) entry.open_cast = true;
    out.push(entry);
  }
  return out;
}

export function findGroup(groups: unknown[], groupId: string): Record<string, unknown> | null {
  for (const group of groups) if (isTable(group) && group.id === groupId) return group;
  return null;
}

/** `group_detail`: one group's resolved members and its optional scene. */
export function groupDetail(
  group: Record<string, unknown>,
  collective: Record<string, Entry>,
  index: Map<string, string>,
): Record<string, unknown> {
  const rawMembers = Array.isArray(group.members) ? group.members : [];
  const { resolved, unresolved } = resolveMembers(rawMembers, collective, index);
  const detail: Record<string, unknown> = {
    active: group.id,
    name: group.name ?? group.id,
    members: resolved,
    unresolved,
    memory_enabled: Boolean(group.memory ?? false),
  };
  if (group.scene) detail.scene = group.scene;
  if (!rawMembers.length) detail.open_cast = true;
  return detail;
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function resolveParty(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "resolve_party";
  let projectRoot: string | null = null;
  let skill: string | null = null;
  let party: string | null = null;
  let listGroups = false;
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
    } else if (flag === "--party" || flag === "--group") {
      const taken = value();
      if (taken === undefined) return usageError(script, `argument ${flag}: expected one argument`);
      party = taken;
    } else if (flag === "--list-groups" && inline === null) listGroups = true;
    else if (flag === "--skill-root") {
      // Task 1's patch artifact; the Python never read its own location.
      if (value() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else return usageError(script, `unrecognized arguments: ${argv[i]}`);
  }
  if (projectRoot === null) return usageError(script, "the following arguments are required: --project-root");
  if (skill === null) return usageError(script, "the following arguments are required: --skill");

  const root = absolutePath(projectRoot);
  const skillRoot = absolutePath(skill);
  const workflow = await loadWorkflow(fs, root, skillRoot);
  const roster = await loadRoster(fs, root, skillRoot);
  const groups = mergeGroups(roster.groups, workflow.party_groups ?? []);
  const defaultParty = typeof workflow.default_party === "string" ? workflow.default_party : "";
  const partyMode = (typeof workflow.party_mode === "string" && workflow.party_mode) || "session";
  const partyMemory = Boolean(workflow.party_memory ?? true);

  const emit = (payload: unknown): PortResult => ({ stdout: `${pyJson(payload, { indent: 2 })}\n`, exitCode: 0 });

  if (listGroups) {
    return emit({ party_mode: partyMode, default_party: defaultParty, groups: groupMenu(groups) });
  }

  const { collective, index, installedCodes } = buildCollective(
    roster.agents,
    workflow.party_members ?? [],
    roster.guests,
  );

  if (party !== null) {
    const group = findGroup(groups, party);
    if (group === null) {
      return emit({ error: "unknown_group", requested: party, available: groupMenu(groups) });
    }
    const detail: Record<string, unknown> = { ...groupDetail(group, collective, index), party_mode: partyMode };
    if (roster.problems.length) detail.roster_problems = roster.problems;
    return emit(detail);
  }

  const result: Record<string, unknown> = {
    party_mode: partyMode,
    groups: groupMenu(groups),
    installed_agents_resolved: roster.resolved,
  };
  if (roster.problems.length) result.roster_problems = roster.problems;
  const group = defaultParty ? findGroup(groups, defaultParty) : null;
  if (group !== null) Object.assign(result, groupDetail(group, collective, index));
  else {
    Object.assign(result, {
      active: "installed",
      members: installedCodes.map((code) => collective[code]),
      memory_enabled: partyMemory,
    });
  }
  return emit(result);
}

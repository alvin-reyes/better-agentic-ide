import { create } from "zustand";
import { ROLES, ROLE_ORDER } from "../data/roles";
import { AGENT_CATALOG } from "../data/curatedAgents";
import type { AgentSession } from "./agentTrackerStore";
import { promptTokens, sessionCost, type SessionUsage } from "../lib/tokenUsage";

export type SubagentEvent =
  | { kind: "Spawn"; id: string; agent_type: string; description: string;
      model: string | null; started_at: string | null }
  | { kind: "Complete"; id: string; finished_at: string | null };

export interface SubagentRecord {
  id: string;
  agentType: string;
  description: string;
  model: string | null;
  startTime: number;
  endTime: number | null;
  cwd: string;
}

export interface PaneMeta {
  tabId: string;
  tabName: string;
  cwd: string | null;
}

/** A pane flattened out of the tab tree, before its cwd has been resolved. */
export interface PaneInfo {
  paneId: string;
  tabId: string;
  tabName: string;
  ptyId: number | null;
  /** savedCwd ?? initialCwd — only ever set for restored or explicitly-opened panes. */
  fallbackCwd: string | null;
}

/**
 * Resolve each pane's cwd for lane construction.
 *
 * `liveCwds` holds cwds read from the running PTY (`get_pty_cwd`) — the *same*
 * source the sub-agent watcher's cwd comes from, so an agent lane and the
 * sub-agents spawned inside it compare equal in `buildLanes`. The stored
 * `fallbackCwd` is only a stand-in for panes with no live PTY yet; panes created
 * in this run carry no stored cwd at all.
 */
export function buildPaneMeta(
  panes: PaneInfo[],
  liveCwds: Record<string, string>,
): Record<string, PaneMeta> {
  const map: Record<string, PaneMeta> = {};
  for (const p of panes) {
    map[p.paneId] = {
      tabId: p.tabId,
      tabName: p.tabName,
      cwd: liveCwds[p.paneId] ?? p.fallbackCwd,
    };
  }
  return map;
}

export interface FleetLane {
  id: string;
  kind: "agent" | "subagent";
  parentId: string | null;
  tabId: string | null;
  tabName: string | null;
  paneId: string | null;
  cwd: string | null;
  label: string;
  detail: string;
  provider: string | null;
  model: string | null;
  /**
   * Which of the nineteen roles this lane is, when it can be known.
   *
   * Null rather than guessed: sessions recorded before roles existed have no
   * roleId, and Claude Code allows sub-agent names that are not roles at all.
   * Attributing those to a role would put cost against work that never ran.
   */
  roleId: string | null;
  startTime: number;
  endTime: number | null;
  status: "running" | "completed" | "cancelled";
  costCents: number | null;
  tokens: { input: number; output: number } | null;
}

function agentLaneId(s: AgentSession): string {
  return `agent:${s.paneId}:${s.startTime}`;
}

const ROLE_IDS = new Set(ROLES.map((r) => r.id));
const CURATED_ROLE_BY_ID = new Map(AGENT_CATALOG.map((a) => [a.id, a.roleId]));

/**
 * The role behind a sub-agent's type, or null.
 *
 * ADE writes sub-agents two ways: the core roles by role id (`qa`), and the
 * curated profiles by profile id (`backend-api`). Only one of the 47 profiles
 * shares an id with a role, so matching role ids alone left the other 46
 * unattributed even though each declares the role it is.
 *
 * Anything else - Claude Code's own `general-purpose`, `Explore` - stays null.
 * Guessing would put cost against work that never ran.
 */
function roleIdOf(agentType: string): string | null {
  if (ROLE_IDS.has(agentType)) return agentType;
  return CURATED_ROLE_BY_ID.get(agentType) ?? null;
}

/**
 * Merge agent sessions and sub-agent records into a flat, time-sorted lane list.
 *
 * A sub-agent attaches to an agent lane only when exactly one agent is running
 * in the same cwd. The transcript records no pane, so with two panes sharing a
 * directory the parent is genuinely unknown — we leave it unattached rather
 * than guess.
 */
export function buildLanes(
  sessions: AgentSession[],
  subagents: SubagentRecord[],
  paneMeta: Record<string, PaneMeta>,
): FleetLane[] {
  const agentLanes: FleetLane[] = sessions.map((s) => {
    const meta = paneMeta[s.paneId];
    return {
      id: agentLaneId(s),
      kind: "agent",
      parentId: null,
      tabId: meta?.tabId ?? null,
      tabName: meta?.tabName ?? null,
      paneId: s.paneId,
      // The live pane cwd is authoritative — an agent can cd mid-run — but it
      // disappears with the pane, so the session's own folder is the fallback.
      cwd: meta?.cwd ?? s.cwd ?? null,
      label: s.agentName,
      detail: "",
      provider: s.provider,
      model: null,
      roleId: s.roleId ?? null,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      costCents: null,
      tokens: null,
    };
  });

  const runningByCwd = new Map<string, FleetLane[]>();
  for (const lane of agentLanes) {
    if (lane.status !== "running" || !lane.cwd) continue;
    const list = runningByCwd.get(lane.cwd) ?? [];
    list.push(lane);
    runningByCwd.set(lane.cwd, list);
  }

  const subLanes: FleetLane[] = subagents.map((s) => {
    const candidates = runningByCwd.get(s.cwd) ?? [];
    const parent = candidates.length === 1 ? candidates[0] : null;
    return {
      id: `sub:${s.id}`,
      kind: "subagent",
      parentId: parent ? parent.id : null,
      tabId: parent?.tabId ?? null,
      tabName: parent?.tabName ?? null,
      paneId: parent?.paneId ?? null,
      cwd: s.cwd,
      label: s.agentType || "agent",
      detail: s.description,
      provider: null,
      model: s.model,
      roleId: roleIdOf(s.agentType),
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.endTime === null ? "running" : "completed",
      costCents: null,
      tokens: null,
    };
  });

  return [...agentLanes, ...subLanes].sort((a, b) => a.startTime - b.startTime);
}

// A few seconds of slack: the agent's first response lands after launch.
const USAGE_SLACK_MS = 5_000;

/**
 * Put real cost and tokens on Claude agent lanes, from the Claude Code
 * sessions (`token_usage`) run in each lane's folder.
 *
 * A session belongs to the lane whose run it started in. When two runs in
 * the same folder overlap, the transcript can't say which terminal it came
 * from, so the session is left out rather than counted twice.
 */
export function withUsage(lanes: FleetLane[], sessionsByCwd: Record<string, SessionUsage[]>): FleetLane[] {
  const totals = new Map<string, { cost: number; input: number; output: number }>();
  const claude = lanes.filter((l) => l.kind === "agent" && l.provider === "claude" && l.cwd);
  for (const [cwd, sessions] of Object.entries(sessionsByCwd)) {
    for (const s of sessions) {
      const t = s.firstAt ? Date.parse(s.firstAt) : NaN;
      if (Number.isNaN(t)) continue;
      const owners = claude.filter((l) => l.cwd === cwd && l.startTime - USAGE_SLACK_MS <= t && (l.endTime === null || t <= l.endTime));
      if (owners.length !== 1) continue;
      const acc = totals.get(owners[0].id) ?? { cost: 0, input: 0, output: 0 };
      acc.cost += sessionCost(s) * 100;
      for (const m of s.models) {
        acc.input += promptTokens(m);
        acc.output += m.output;
      }
      totals.set(owners[0].id, acc);
    }
  }
  return lanes.map((l) => {
    const u = totals.get(l.id);
    return u ? { ...l, costCents: u.cost, tokens: { input: u.input, output: u.output } } : l;
  });
}

/** Which terminals a fleet view covers. */
export type FleetScope = "active" | "all";

/**
 * How lanes are bucketed in the all-terminals view.
 *
 * Project is the default: a folder outlives the window the work ran in, which a
 * terminal tab does not. Terminal remains available because it is occasionally
 * what you want after splitting panes — it is simply no longer the default.
 */
export type FleetGrouping = "project" | "role" | "terminal";

/**
 * Whether a group's key can be opened as a terminal tab.
 *
 * Only a terminal group's key is a tab id. Under project or role grouping it is
 * a folder or a role id, and handing one to setActiveTab would select nothing.
 * Exported so the decision has a test rather than living inline in a component.
 */
export function groupKeyIsTabId(grouping: FleetGrouping): boolean {
  return grouping === "terminal";
}

/** A terminal tab with the fleet lanes that belong to it. */
export interface FleetGroup {
  /** null for the catch-all group of lanes whose terminal is gone. */
  tabId: string | null;
  tabName: string;
  cwds: string[];
  lanes: FleetLane[];
  runningCount: number;
  costCents: number;
}

export interface TerminalTabInfo {
  id: string;
  name: string;
  paneIds: string[];
}

/**
 * Split lanes into one group per terminal tab, in tab order.
 *
 * Agent lanes (and sub-agents already attached to a parent) carry their tabId.
 * An unattached sub-agent goes to the first terminal tab working in its cwd —
 * the transcript records no pane, so when two tabs share a folder the first
 * one is as good a guess as any. Lanes whose terminal has closed land in a
 * trailing "Closed terminals" group so their cost isn't silently dropped.
 * Every terminal tab gets a group, even with no lanes, so idle terminals show.
 */
export function groupLanesByTerminal(
  lanes: FleetLane[],
  terminalTabs: TerminalTabInfo[],
  paneMeta: Record<string, PaneMeta>,
): FleetGroup[] {
  const groups: FleetGroup[] = terminalTabs.map((t) => {
    const cwds: string[] = [];
    for (const id of t.paneIds) {
      const cwd = paneMeta[id]?.cwd;
      if (cwd && !cwds.includes(cwd)) cwds.push(cwd);
    }
    return { tabId: t.id, tabName: t.name, cwds, lanes: [], runningCount: 0, costCents: 0 };
  });
  const byTab = new Map(groups.map((g) => [g.tabId, g]));
  const orphans: FleetGroup = {
    tabId: null, tabName: "Closed terminals", cwds: [], lanes: [], runningCount: 0, costCents: 0,
  };

  for (const lane of lanes) {
    let group = lane.tabId ? byTab.get(lane.tabId) : undefined;
    if (!group && lane.kind === "subagent" && lane.cwd) {
      group = groups.find((g) => g.cwds.includes(lane.cwd!));
    }
    const target = group ?? orphans;
    target.lanes.push(lane);
    if (lane.status === "running") target.runningCount += 1;
    target.costCents += lane.costCents ?? 0;
  }

  return orphans.lanes.length > 0 ? [...groups, orphans] : groups;
}

interface FleetStore {
  subagents: SubagentRecord[];
  scope: FleetScope;
  setScope: (scope: FleetScope) => void;
  grouping: FleetGrouping;
  setGrouping: (grouping: FleetGrouping) => void;
  applyEvent: (ev: SubagentEvent, cwd: string) => void;
  /** Drop the records of one watched folder once nothing watches it. */
  removeCwd: (cwd: string) => void;
  reset: () => void;
}

/** A transcript timestamp in ms; now when it's missing or unreadable. */
function parseTime(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Date.now() : t;
}

export const useFleetStore = create<FleetStore>((set) => ({
  subagents: [],
  scope: "active",
  setScope: (scope) => set({ scope }),
  grouping: "project",
  setGrouping: (grouping) => set({ grouping }),
  applyEvent: (ev, cwd) =>
    set((state) => {
      if (ev.kind === "Spawn") {
        if (state.subagents.some((s) => s.id === ev.id)) return state;
        const startTime = parseTime(ev.started_at);
        return {
          subagents: [
            ...state.subagents,
            {
              id: ev.id,
              agentType: ev.agent_type,
              description: ev.description,
              model: ev.model ?? null,
              startTime,
              endTime: null,
              cwd,
            },
          ],
        };
      }
      if (!state.subagents.some((s) => s.id === ev.id)) return state;
      const endTime = parseTime(ev.finished_at);
      return {
        subagents: state.subagents.map((s) =>
          s.id === ev.id ? { ...s, endTime } : s,
        ),
      };
    }),
  removeCwd: (cwd) =>
    set((state) => ({ subagents: state.subagents.filter((s) => s.cwd !== cwd) })),
  reset: () => set({ subagents: [] }),
}));


/**
 * Lanes bucketed by something that outlives a window.
 *
 * One shape for every grouping, so the view renders them identically and a new
 * way to bucket lanes needs no component change.
 */
export interface LaneGroup {
  /** The folder or role id; null for lanes that could not be attributed. */
  key: string | null;
  name: string;
  lanes: FleetLane[];
  runningCount: number;
  costCents: number;
  /**
   * Whether any lane in this group carries a cost at all.
   *
   * withUsage only ever attributes cost to top-level agent lanes: a sub-agent's
   * spend is inside its parent's Claude Code session and cannot be separated
   * out. A role that only ever runs as a sub-agent therefore sums to zero, and
   * rendering that as "$0.00" states something false about money. False when
   * there is nothing to report, so the view can say so instead.
   */
  costKnown: boolean;
  /** The folders behind this group, unjoined so each can be shortened. */
  paths: string[];
}

function bucket(
  lanes: FleetLane[],
  keyOf: (l: FleetLane) => string | null,
  nameOf: (key: string) => string,
  /** The folder behind the key, when there is one; "" otherwise. */
  pathOf: (key: string) => string,
  unattributedName: string,
): LaneGroup[] {
  const byKey = new Map<string, LaneGroup>();
  const unattributed: LaneGroup = {
    key: null, name: unattributedName, lanes: [],
    runningCount: 0, costCents: 0, costKnown: false, paths: [],
  };

  for (const lane of lanes) {
    const key = keyOf(lane);
    let group: LaneGroup;
    if (key) {
      group = byKey.get(key) ?? {
        key, name: nameOf(key), lanes: [],
        runningCount: 0, costCents: 0, costKnown: false,
        paths: pathOf(key) ? [pathOf(key)] : [],
      };
      byKey.set(key, group);
    } else {
      group = unattributed;
    }
    group.lanes.push(lane);
    if (lane.status === "running") group.runningCount += 1;
    if (lane.costCents !== null) {
      group.costCents += lane.costCents;
      group.costKnown = true;
    }
  }

  const groups = [...byKey.values()];
  // The unattributed bucket trails the real ones: it is a remainder, not a peer.
  return unattributed.lanes.length > 0 ? [...groups, unattributed] : groups;
}

/**
 * Split lanes by the folder they ran in.
 *
 * A terminal tab is a window-management artifact: it changes when panes are
 * rearranged and vanishes when the tab closes, which is why grouping by it
 * needed a "Closed terminals" bucket to avoid dropping cost. A folder outlives
 * both, and sub-agents already carried one.
 *
 * An agent lane takes its folder from pane metadata, which can be absent. Those
 * lanes go to a single trailing group rather than being dropped: showing cost
 * that cannot be attributed is better than losing it.
 */
export function groupLanesByProject(lanes: FleetLane[]): LaneGroup[] {
  return bucket(
    lanes,
    // A trailing slash would split one project in two, with separate totals:
    // paneMeta mixes the live PTY cwd and a persisted one, which can disagree.
    (l) => (l.cwd ? l.cwd.replace(/\/+$/, "") : null),
    (cwd) => cwd.slice(cwd.lastIndexOf("/") + 1) || cwd,
    (cwd) => cwd,
    "Unknown project",
  );
}

/**
 * Split lanes by which role ran them.
 *
 * Answers "what is QA costing me", which no grouping by window can. A lane with
 * no role — a pre-roles session, or a sub-agent whose type is not one of the
 * nineteen — is gathered rather than guessed at.
 */
export function groupLanesByRole(lanes: FleetLane[]): LaneGroup[] {
  const groups = bucket(
    lanes,
    (l) => l.roleId,
    (id) => ROLES.find((r) => r.id === id)?.title ?? id,
    () => "",
    "No role recorded",
  );
  // ROLE_ORDER is the catalog's deliberate order — delivery flow, then the
  // company roles, then the advisory ones. Insertion order would instead be
  // "whichever ran first", which reshuffles as lanes come and go.
  const rank = (g: LaneGroup) => {
    if (g.key === null) return Number.MAX_SAFE_INTEGER;
    const i = ROLE_ORDER.indexOf(g.key);
    return i < 0 ? ROLE_ORDER.length : i;
  };
  return [...groups].sort((a, b) => rank(a) - rank(b));
}


/**
 * Put the terminal grouping into the shared shape.
 *
 * groupLanesByTerminal keeps its own shape and its own tests, including the
 * empty groups it emits so idle tabs still show. Folders stay unjoined so the
 * view can shorten each one: joining first meant only the first was abbreviated.
 */
export function terminalGroupsToLaneGroups(groups: FleetGroup[]): LaneGroup[] {
  return groups.map((g) => ({
    key: g.tabId,
    name: g.tabName,
    paths: g.cwds,
    lanes: g.lanes,
    runningCount: g.runningCount,
    costCents: g.costCents,
    costKnown: g.lanes.some((l) => l.costCents !== null),
  }));
}

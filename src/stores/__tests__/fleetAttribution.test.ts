import { describe, it, expect } from "vitest";
import {
  buildLanes,
  groupLanesByProject,
  groupLanesByRole,
  terminalGroupsToLaneGroups,
  useFleetStore,
  type FleetLane,
  type PaneMeta,
  type SubagentRecord,
} from "../fleetStore";
import type { AgentSession } from "../agentTrackerStore";

/**
 * Lanes were grouped by terminal tab, which is a window-management artifact:
 * it changes when panes are rearranged, and it disappears when a tab closes —
 * hence the "Closed terminals" bucket the old grouping needed. A lane's project
 * and role are what the work actually is, and both outlive the window.
 */
function lane(over: Partial<FleetLane>): FleetLane {
  return {
    id: "x", kind: "agent", parentId: null, tabId: null, tabName: null, paneId: null,
    cwd: null, label: "l", detail: "", provider: null, model: null, roleId: null,
    startTime: 0, endTime: null, status: "running", costCents: null, tokens: null,
    ...over,
  };
}

const session = (over: Partial<AgentSession>): AgentSession => ({
  paneId: "p1", agentName: "API Builder", agentIcon: "{}", provider: "claude",
  startTime: 0, endTime: null, status: "running", ...over,
});

const sub = (over: Partial<SubagentRecord>): SubagentRecord => ({
  id: "s1", agentType: "developer", description: "build it", model: "sonnet",
  startTime: 1, endTime: null, cwd: "/repo/api", ...over,
});

const meta: Record<string, PaneMeta> = {
  p1: { tabId: "t1", tabName: "api", cwd: "/repo/api" },
};

describe("a lane knows which role it is", () => {
  it("takes the role from the session that launched it", () => {
    const [l] = buildLanes([session({ roleId: "developer" })], [], meta);
    expect(l.roleId).toBe("developer");
  });

  it("leaves the role null for a session recorded before roles existed", () => {
    // roleId is optional on AgentSession precisely because older localStorage
    // entries lack it. Guessing one would attribute cost to the wrong role.
    const [l] = buildLanes([session({})], [], meta);
    expect(l.roleId).toBeNull();
  });

  it("takes a sub-agent's role from its agent type", () => {
    const lanes = buildLanes([], [sub({ agentType: "qa" })], {});
    expect(lanes[0].roleId).toBe("qa");
  });

  it("leaves an unrecognised sub-agent type unattributed", () => {
    // Claude Code allows arbitrary sub-agent names; only the nineteen roles map.
    const lanes = buildLanes([], [sub({ agentType: "general-purpose" })], {});
    expect(lanes[0].roleId).toBeNull();
    expect(lanes[0].label).toBe("general-purpose");
  });
});

describe("groupLanesByProject", () => {
  it("groups by folder and labels with its basename", () => {
    const groups = groupLanesByProject([
      lane({ id: "a", cwd: "/repo/api", costCents: 120 }),
      lane({ id: "b", cwd: "/repo/web", costCents: 30 }),
      lane({ id: "c", cwd: "/repo/api", costCents: 50, status: "completed" }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["api", "web"]);
    expect(groups[0].lanes.map((l) => l.id)).toEqual(["a", "c"]);
  });

  it("totals cost and running count per project", () => {
    const groups = groupLanesByProject([
      lane({ id: "a", cwd: "/repo/api", costCents: 120 }),
      lane({ id: "c", cwd: "/repo/api", costCents: 50, status: "completed" }),
    ]);
    expect(groups[0].costCents).toBe(170);
    expect(groups[0].runningCount).toBe(1);
  });

  it("keeps a lane with no folder rather than dropping its cost", () => {
    // An agent lane takes cwd from paneMeta, which can be missing. Showing cost
    // we cannot attribute beats losing it silently.
    const groups = groupLanesByProject([lane({ id: "a", cwd: null, costCents: 99 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBeNull();
    expect(groups[0].costCents).toBe(99);
  });

  it("puts the unattributed group last, after the real projects", () => {
    const groups = groupLanesByProject([
      lane({ id: "a", cwd: null }),
      lane({ id: "b", cwd: "/repo/web" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["/repo/web", null]);
  });

  it("has no bucket for closed terminals, because a folder does not close", () => {
    const groups = groupLanesByProject([lane({ id: "a", cwd: "/repo/api", tabId: null })]);
    expect(groups.map((g) => g.name)).toEqual(["api"]);
  });
});


describe("groupLanesByRole", () => {
  it("groups by role, using the role's title as the name", () => {
    const groups = groupLanesByRole([
      lane({ id: "a", roleId: "developer", costCents: 100 }),
      lane({ id: "b", roleId: "qa", costCents: 20 }),
      lane({ id: "c", roleId: "developer", costCents: 5, status: "completed" }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(["Developer", "QA"]);
    expect(groups[0].costCents).toBe(105);
    expect(groups[0].runningCount).toBe(1);
  });

  it("gathers lanes with no role into one trailing group", () => {
    const groups = groupLanesByRole([
      lane({ id: "a", roleId: null, costCents: 7 }),
      lane({ id: "b", roleId: "qa" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["qa", null]);
    expect(groups[1].costCents).toBe(7);
  });

  it("falls back to the id when a role is not in the catalog", () => {
    // A vendored role could be removed while sessions referencing it remain.
    const groups = groupLanesByRole([lane({ id: "a", roleId: "retired-role" })]);
    expect(groups[0].name).toBe("retired-role");
  });
});

describe("every grouping returns the same shape", () => {
  const SHAPE = ["costCents", "costKnown", "key", "lanes", "name", "paths", "runningCount"];

  it("so one component can render all of them", () => {
    const ls = [lane({ id: "a", cwd: "/repo/api", roleId: "qa", costCents: 10 })];
    // The mapped terminal grouping is included: it is the one conversion done
    // by hand, so it is the one that can silently drift from the others.
    const terminal = terminalGroupsToLaneGroups([
      { tabId: "t1", tabName: "api", cwds: ["/repo/api"], lanes: ls, runningCount: 0, costCents: 10 },
    ]);
    for (const g of [...groupLanesByProject(ls), ...groupLanesByRole(ls), ...terminal]) {
      expect(Object.keys(g).sort()).toEqual(SHAPE);
    }
  });
});

describe("a lane keeps its folder when the pane is gone", () => {
  it("falls back to the folder the session recorded", () => {
    // paneMeta is rebuilt from the live tab tree, so a closed pane nulls tabId
    // AND cwd together. Without the session's own cwd, "group by project" is
    // just "group by terminal" with a different name for the orphan bucket -
    // and cost lives only on agent lanes, so all of it pools there.
    const [l] = buildLanes([session({ cwd: "/repo/api" })], [], {});
    expect(l.tabId).toBeNull();
    expect(l.cwd).toBe("/repo/api");
  });

  it("prefers the live pane cwd while the pane still exists", () => {
    // The live PTY cwd is authoritative: an agent can cd during its run.
    const [l] = buildLanes([session({ cwd: "/stale" })], [], meta);
    expect(l.cwd).toBe("/repo/api");
  });
});

describe("curated sub-agents are attributed to their role", () => {
  it("maps a curated profile id to the role it declares", () => {
    // ADE writes curated sub-agents as `name: <profile id>`, e.g. backend-api.
    // Only one of the 47 shares an id with a role, so matching role ids alone
    // left 46 of them unattributed despite each declaring a roleId.
    const lanes = buildLanes([], [sub({ agentType: "backend-api" })], {});
    expect(lanes[0].roleId).toBe("developer");
  });

  it("still maps a core role written by name", () => {
    expect(buildLanes([], [sub({ agentType: "qa" })], {})[0].roleId).toBe("qa");
  });

  it("leaves a built-in sub-agent type unattributed", () => {
    expect(buildLanes([], [sub({ agentType: "general-purpose" })], {})[0].roleId).toBeNull();
  });
});

describe("a group says when its cost is not knowable", () => {
  it("reports cost unknown when no lane carries one", () => {
    // withUsage only ever assigns cost to agent lanes, so a role that runs only
    // as a sub-agent would otherwise render a confident $0.00.
    const groups = groupLanesByRole([
      lane({ id: "a", kind: "subagent", roleId: "qa", costCents: null }),
    ]);
    expect(groups[0].costCents).toBe(0);
    expect(groups[0].costKnown).toBe(false);
  });

  it("reports cost known when at least one lane carries one", () => {
    const groups = groupLanesByRole([
      lane({ id: "a", roleId: "developer", costCents: 120 }),
      lane({ id: "b", kind: "subagent", roleId: "developer", costCents: null }),
    ]);
    expect(groups[0].costKnown).toBe(true);
    expect(groups[0].costCents).toBe(120);
  });
});

describe("the fleet store's defaults", () => {
  it("groups by project, not by terminal", () => {
    // The headline behaviour of this change; nothing else asserts it.
    expect(useFleetStore.getState().grouping).toBe("project");
  });
});

describe("terminalGroupsToLaneGroups", () => {
  it("keeps idle tabs, which the terminal grouping emits deliberately", () => {
    const mapped = terminalGroupsToLaneGroups([
      { tabId: "t1", tabName: "api", cwds: ["/repo/api"], lanes: [], runningCount: 0, costCents: 0 },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0].key).toBe("t1");
    expect(mapped[0].name).toBe("api");
  });

  it("carries each folder separately so each can be shortened", () => {
    // Joining first meant only the first path got abbreviated by shortPath.
    const mapped = terminalGroupsToLaneGroups([
      { tabId: "t1", tabName: "api", cwds: ["/Users/a/repo/api", "/Users/a/repo/web"],
        lanes: [], runningCount: 0, costCents: 0 },
    ]);
    expect(mapped[0].paths).toEqual(["/Users/a/repo/api", "/Users/a/repo/web"]);
  });
});

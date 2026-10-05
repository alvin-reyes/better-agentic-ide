import { describe, it, expect } from "vitest";
import {
  buildLanes,
  groupLanesByProject,
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

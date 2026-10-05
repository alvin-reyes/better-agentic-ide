import { describe, it, expect } from "vitest";
import { groupLanesByTerminal, type FleetLane, type PaneMeta } from "../fleetStore";

function lane(over: Partial<FleetLane>): FleetLane {
  return {
    id: "x", kind: "agent", parentId: null, tabId: null, tabName: null, paneId: null,
    cwd: null, label: "l", detail: "", provider: null, model: null, roleId: null,
    startTime: 0, endTime: null, status: "running", costCents: null, tokens: null,
    ...over,
  };
}

const tabs = [
  { id: "t1", name: "api", paneIds: ["p1"] },
  { id: "t2", name: "web", paneIds: ["p2", "p3"] },
];
const meta: Record<string, PaneMeta> = {
  p1: { tabId: "t1", tabName: "api", cwd: "/repo/api" },
  p2: { tabId: "t2", tabName: "web", cwd: "/repo/web" },
  p3: { tabId: "t2", tabName: "web", cwd: "/repo/web" },
};

describe("groupLanesByTerminal", () => {
  it("returns a group per terminal tab in tab order, including idle ones", () => {
    const groups = groupLanesByTerminal([], tabs, meta);
    expect(groups.map((g) => g.tabName)).toEqual(["api", "web"]);
    expect(groups[1].cwds).toEqual(["/repo/web"]);
    expect(groups.every((g) => g.lanes.length === 0)).toBe(true);
  });

  it("puts agent lanes under their tab and totals running and cost", () => {
    const groups = groupLanesByTerminal(
      [
        lane({ id: "a", tabId: "t2", costCents: 120 }),
        lane({ id: "b", tabId: "t2", status: "completed", costCents: 30 }),
        lane({ id: "c", tabId: "t1", costCents: 5 }),
      ],
      tabs,
      meta,
    );
    expect(groups[0].lanes.map((l) => l.id)).toEqual(["c"]);
    expect(groups[1].lanes.map((l) => l.id)).toEqual(["a", "b"]);
    expect(groups[1].runningCount).toBe(1);
    expect(groups[1].costCents).toBe(150);
  });

  it("assigns an unattached sub-agent to the terminal working in its folder", () => {
    const groups = groupLanesByTerminal(
      [lane({ id: "s", kind: "subagent", cwd: "/repo/web" })],
      tabs,
      meta,
    );
    expect(groups[1].lanes.map((l) => l.id)).toEqual(["s"]);
  });

  it("collects lanes from closed terminals in a trailing group", () => {
    const groups = groupLanesByTerminal(
      [
        lane({ id: "gone", tabId: "t9", costCents: 40 }),
        lane({ id: "sub", kind: "subagent", cwd: "/elsewhere" }),
      ],
      tabs,
      meta,
    );
    expect(groups).toHaveLength(3);
    expect(groups[2].tabId).toBeNull();
    expect(groups[2].tabName).toBe("Closed terminals");
    expect(groups[2].lanes.map((l) => l.id)).toEqual(["gone", "sub"]);
    expect(groups[2].costCents).toBe(40);
  });
});

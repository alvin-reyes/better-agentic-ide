import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FleetGroups from "../FleetGroups";
import type { LaneGroup, FleetLane } from "../../../stores/fleetStore";

function lane(over: Partial<FleetLane> = {}): FleetLane {
  return {
    id: "a", kind: "agent", parentId: null, tabId: "t1", tabName: "ide",
    paneId: "p1", cwd: "/repo/api", label: "claude", detail: "", provider: "claude",
    model: null, roleId: "developer", startTime: 1000, endTime: 2000,
    status: "completed", costCents: 120, tokens: null, ...over,
  };
}

const group = (over: Partial<LaneGroup> = {}): LaneGroup => ({
  key: "/repo/api", name: "api",
  paths: ["/repo/api"], lanes: [lane()], runningCount: 0, costCents: 120,
  costKnown: true, ...over,
});

describe("FleetGroups renders any grouping", () => {
  it("shows the group name, its detail and its cost", () => {
    render(<FleetGroups groups={[group()]} from={0} to={3000} />);
    expect(screen.getByText("api")).toBeTruthy();
    expect(screen.getByText("$1.20")).toBeTruthy();
  });

  it("labels a role group by role, with no path detail", () => {
    render(<FleetGroups groups={[group({ key: "qa", name: "QA", paths: [] })]} from={0} to={3000} />);
    expect(screen.getByLabelText("Fleet for QA")).toBeTruthy();
  });

  it("names the unattributed group without a key", () => {
    render(<FleetGroups groups={[group({ key: null, name: "Unknown project", paths: [] })]} from={0} to={3000} />);
    expect(screen.getByLabelText("Fleet for Unknown project")).toBeTruthy();
  });
});

import { describe, it, expect, vi } from "vitest";
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
  key: "/repo/api", name: "api", detail: "/repo/api",
  lanes: [lane()], runningCount: 0, costCents: 120, ...over,
});

describe("FleetGroups renders any grouping", () => {
  it("shows the group name, its detail and its cost", () => {
    render(<FleetGroups groups={[group()]} from={0} to={3000} />);
    expect(screen.getByText("api")).toBeTruthy();
    expect(screen.getByText("$1.20")).toBeTruthy();
  });

  it("labels a role group by role, with no path detail", () => {
    render(<FleetGroups groups={[group({ key: "qa", name: "QA", detail: "" })]} from={0} to={3000} />);
    expect(screen.getByLabelText("Fleet for QA")).toBeTruthy();
  });

  it("names the unattributed group without a key", () => {
    render(<FleetGroups groups={[group({ key: null, name: "Unknown project", detail: "" })]} from={0} to={3000} />);
    expect(screen.getByLabelText("Fleet for Unknown project")).toBeTruthy();
  });
});

describe("the open-tab control", () => {
  it("is offered when the caller supplies a handler", () => {
    const onOpenTab = vi.fn();
    render(<FleetGroups groups={[group({ key: "t1", name: "ide" })]} from={0} to={3000} onOpenTab={onOpenTab} />);
    expect(screen.queryByRole("button", { name: /go to tab/i })).toBeTruthy();
  });

  it("is absent when no handler is given, so a folder key is never opened as a tab", () => {
    // Only a terminal group's key is a tab id. Under project or role grouping the
    // key is a folder or a role, and the caller withholds the handler; offering
    // the control anyway would call setActiveTab with a path.
    render(<FleetGroups groups={[group()]} from={0} to={3000} />);
    expect(screen.queryByRole("button", { name: /go to tab/i })).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import FleetGroups from "../FleetGroups";
import { groupKeyIsTabId, useFleetStore, type LaneGroup, type FleetLane } from "../../../stores/fleetStore";

/**
 * The guard that decides whether "Go to tab" is offered lives in FleetTab, not
 * in FleetGroups: the component only renders what it is handed. A test that
 * withholds the handler itself and then asserts the handler is absent proves
 * nothing about the guard — it tests its own fixture.
 *
 * These exercise the decision the way FleetTab makes it: from the store's
 * grouping. Only a terminal group's key is a tab id; under project or role
 * grouping it is a folder or a role, and opening a tab with it would do nothing.
 */
const onOpenTab = (grouping: Parameters<typeof groupKeyIsTabId>[0], open: (id: string) => void) =>
  groupKeyIsTabId(grouping) ? open : undefined;

function lane(over: Partial<FleetLane> = {}): FleetLane {
  return {
    id: "a", kind: "agent", parentId: null, tabId: "t1", tabName: "ide",
    paneId: "p1", cwd: "/repo/api", label: "claude", detail: "", provider: "claude",
    model: null, roleId: "developer", startTime: 1000, endTime: 2000,
    status: "completed", costCents: 120, tokens: null, ...over,
  };
}

const group = (over: Partial<LaneGroup> = {}): LaneGroup => ({
  key: "/repo/api", name: "api", paths: ["/repo/api"],
  lanes: [lane()], runningCount: 0, costCents: 120, costKnown: true, ...over,
});

describe("the open-tab control follows the grouping", () => {
  beforeEach(() => useFleetStore.setState({ grouping: "project" }));

  it("is offered when grouping by terminal, where the key is a tab id", () => {
    const open = vi.fn();
    render(
      <FleetGroups
        groups={[group({ key: "t1", name: "ide" })]}
        from={0} to={3000}
        onOpenTab={onOpenTab("terminal", open)}
      />,
    );
    expect(screen.queryByRole("button", { name: /go to tab/i })).toBeTruthy();
  });

  it.each(["project", "role"] as const)("is withheld when grouping by %s", (grouping) => {
    const open = vi.fn();
    render(
      <FleetGroups groups={[group()]} from={0} to={3000} onOpenTab={onOpenTab(grouping, open)} />,
    );
    expect(screen.queryByRole("button", { name: /go to tab/i })).toBeNull();
  });
});

describe("cost is only claimed when it is known", () => {
  it("shows a dash for a group whose lanes carry no cost", () => {
    // A role that only ever runs as a sub-agent: its spend is inside the
    // parent's session, so "$0.00" would be a false statement about money.
    render(
      <FleetGroups
        groups={[group({ key: "qa", name: "QA", paths: [], costCents: 0, costKnown: false })]}
        from={0} to={3000}
      />,
    );
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("shows the figure when at least one lane carries a cost", () => {
    render(<FleetGroups groups={[group()]} from={0} to={3000} />);
    expect(screen.getByText("$1.20")).toBeTruthy();
  });
});

describe("paths are shortened individually", () => {
  it("abbreviates every folder, not only the first", () => {
    render(
      <FleetGroups
        groups={[group({
          key: "t1", name: "ide",
          paths: ["/Users/alvin/repo/api", "/Users/alvin/repo/web"],
        })]}
        from={0} to={3000}
      />,
    );
    expect(screen.getByText("~/repo/api, ~/repo/web")).toBeTruthy();
  });
});

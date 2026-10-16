import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FleetGroups from "../FleetGroups";
import type { LaneGroup, FleetLane } from "../../../stores/fleetStore";
import { AGENT_COLOR_HEX } from "../../../data/agentColors";

// jsdom reports a hex set in a style as rgb(...).
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const FORBIDDEN = [
  "rgb(34, 197, 94)", // the old #22c55e
  ...Object.values(AGENT_COLOR_HEX).map((h) => rgb(h.dark)),
];

/** Every inline color on the "N running" element and inside it. */
function runningColors(el: HTMLElement): string[] {
  return [el, ...el.querySelectorAll<HTMLElement>("*")].flatMap((e) => [e.style.color, e.style.backgroundColor]).filter(Boolean);
}

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

  it("running is not green", () => {
    const { unmount } = render(<FleetGroups groups={[group({ runningCount: 2 })]} from={0} to={3000} />);
    const running = screen.getByText(/2 running/).closest("[data-testid='fleet-running']") as HTMLElement;
    expect(running).not.toBeNull();
    expect(running.style.color).toBe("var(--text-secondary)");
    for (const c of runningColors(running)) expect(FORBIDDEN).not.toContain(c);
    expect(running.querySelector(".fleet-live-edge")).not.toBeNull();
    unmount();

    render(<FleetGroups groups={[group({ runningCount: 0 })]} from={0} to={3000} />);
    const idle = screen.getByText(/0 running/).closest("[data-testid='fleet-running']") as HTMLElement;
    expect(idle.querySelector(".fleet-live-edge")).toBeNull();
  });
});

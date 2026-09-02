import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FleetTimeline from "../FleetTimeline";
import type { FleetLane } from "../../../stores/fleetStore";

function lane(over: Partial<FleetLane> = {}): FleetLane {
  return {
    id: "agent:p1:1000", kind: "agent", parentId: null, tabId: "t1", tabName: "ide",
    paneId: "p1", cwd: "/proj", label: "claude", detail: "", provider: "claude",
    model: null, startTime: 1000, endTime: 2000, status: "completed",
    costCents: 10, tokens: { input: 1, output: 1 }, ...over,
  };
}

describe("FleetTimeline", () => {
  it("renders a completed lane spanning half the range at 50% width", () => {
    render(<FleetTimeline lanes={[lane({ startTime: 0, endTime: 500 })]} from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("0%");
    expect(bar.style.width).toBe("50%");
  });

  it("offsets a lane that starts midway", () => {
    render(<FleetTimeline lanes={[lane({ startTime: 500, endTime: 1000 })]} from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("50%");
    expect(bar.style.width).toBe("50%");
  });

  it("extends a running lane to the end of the range", () => {
    render(<FleetTimeline lanes={[lane({ startTime: 500, endTime: null, status: "running" })]}
                          from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("50%");
    expect(bar.style.width).toBe("50%");
  });

  it("clamps a lane starting before the range", () => {
    render(<FleetTimeline lanes={[lane({ startTime: -1000, endTime: 500 })]} from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("0%");
    expect(bar.style.width).toBe("50%");
  });

  it("shows an empty state when there are no lanes", () => {
    render(<FleetTimeline lanes={[]} from={0} to={1000} />);
    expect(screen.getByText(/No agent activity/i)).toBeTruthy();
  });

  it("calls onSelect with the lane when a bar is clicked", () => {
    const onSelect = vi.fn();
    const l = lane();
    render(<FleetTimeline lanes={[l]} from={0} to={2000} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("lane-bar"));
    expect(onSelect).toHaveBeenCalledWith(l);
  });

  it("indents sub-agent lanes under their parent", () => {
    const parent = lane();
    const child = lane({ id: "sub:s1", kind: "subagent", parentId: parent.id, label: "Explore" });
    render(<FleetTimeline lanes={[parent, child]} from={0} to={2000} />);
    const rows = screen.getAllByTestId("lane-row");
    expect(rows).toHaveLength(2);
    expect(rows[1].getAttribute("data-kind")).toBe("subagent");
  });

  it("shows no project header when every lane shares one cwd", () => {
    render(<FleetTimeline lanes={[lane(), lane({ id: "a2", paneId: "p2" })]} from={0} to={2000} />);
    expect(screen.queryAllByTestId("project-header")).toHaveLength(0);
  });

  it("groups lanes under a project header when cwds differ", () => {
    const a = lane({ id: "a1", cwd: "/proj-a" });
    const b = lane({ id: "a2", cwd: "/proj-b", paneId: "p2" });
    render(<FleetTimeline lanes={[a, b]} from={0} to={2000} />);
    const headers = screen.getAllByTestId("project-header");
    expect(headers.map((h) => h.textContent)).toEqual(["proj-a", "proj-b"]);
  });

  it("puts unattached sub-agents under their own cwd group", () => {
    const a = lane({ id: "a1", cwd: "/proj-a" });
    const orphan = lane({ id: "sub:s9", kind: "subagent", parentId: null, cwd: "/proj-b", label: "Explore" });
    render(<FleetTimeline lanes={[a, orphan]} from={0} to={2000} />);
    expect(screen.getAllByTestId("project-header").map((h) => h.textContent))
      .toEqual(["proj-a", "proj-b"]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), Channel: class { onmessage: unknown = null; } }));

import AgentDot from "../AgentDot";
import FleetGroups from "../fleet/FleetGroups";
import { useAgentStatusStore } from "../../stores/agentStatusStore";
import { useTabStore, type Tab } from "../../stores/tabStore";
import type { LaneGroup } from "../../stores/fleetStore";

const tab = (id: string, ...ptys: number[]): Tab => ({
  id, name: id, activePaneId: `${id}-0`,
  root: { type: "split", direction: "horizontal", children: ptys.map((p, i) => ({ type: "pane", pane: { id: `${id}-${i}`, ptyId: p } })) },
});

const dot = () => document.querySelector(".agent-dot");

beforeEach(() => {
  useTabStore.setState({ tabs: [tab("t1", 1, 2), tab("t2", 3)], activeTabId: "t1" });
  useAgentStatusStore.setState({ byPty: {} });
});
afterEach(cleanup);

describe("AgentDot", () => {
  it("shows needs you when any pane of the tab needs you", () => {
    useAgentStatusStore.setState({ byPty: { 1: "working", 2: "needsYou" } });
    render(<AgentDot tabId="t1" />);
    expect(dot()?.getAttribute("data-state")).toBe("needsYou");
    expect(dot()?.getAttribute("title")).toBe("An agent here needs you");
  });

  it("shows waiting for you", () => {
    useAgentStatusStore.setState({ byPty: { 3: "waiting" } });
    render(<AgentDot tabId="t2" />);
    expect(dot()?.getAttribute("data-state")).toBe("waiting");
  });

  it("shows nothing for working, ready, finished or no agent", () => {
    for (const state of ["working", "ready", "finished"] as const) {
      useAgentStatusStore.setState({ byPty: { 3: state } });
      render(<AgentDot tabId="t2" />);
      expect(dot(), state).toBeNull();
      cleanup();
    }
    render(<AgentDot tabId="nope" />);
    expect(dot()).toBeNull();
  });

  it("shows on the Fleet card of the tab", () => {
    useAgentStatusStore.setState({ byPty: { 3: "needsYou" } });
    const group: LaneGroup = { key: "t2", name: "t2", paths: [], lanes: [], runningCount: 0, costCents: 0, costKnown: true };
    render(<FleetGroups groups={[group]} from={0} to={1} onOpenTab={() => {}} />);
    expect(dot()?.getAttribute("data-state")).toBe("needsYou");
  });
});

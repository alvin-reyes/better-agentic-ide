import { describe, it, expect, beforeEach } from "vitest";
import { buildLanes, useFleetStore, type SubagentRecord, type PaneMeta } from "../fleetStore";
import type { AgentSession } from "../agentTrackerStore";

function session(over: Partial<AgentSession> = {}): AgentSession {
  return {
    paneId: "p1", agentName: "claude", agentIcon: "🤖", provider: "claude",
    startTime: 1000, endTime: null, status: "running",
    estimatedInputTokens: 0, estimatedOutputTokens: 0, ...over,
  };
}
function sub(over: Partial<SubagentRecord> = {}): SubagentRecord {
  return { id: "s1", agentType: "Explore", description: "find x", model: null,
           startTime: 1500, endTime: null, cwd: "/proj", ...over };
}
const meta: Record<string, PaneMeta> = { p1: { tabId: "t1", tabName: "ide", cwd: "/proj" } };

describe("buildLanes", () => {
  it("maps an agent session to an agent lane", () => {
    const lanes = buildLanes([session()], [], meta);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({
      kind: "agent", paneId: "p1", tabId: "t1", label: "claude",
      provider: "claude", startTime: 1000, endTime: null, status: "running",
    });
  });

  it("nests a sub-agent under the sole running agent in the same cwd", () => {
    const lanes = buildLanes([session()], [sub()], meta);
    const agent = lanes.find((l) => l.kind === "agent")!;
    const child = lanes.find((l) => l.kind === "subagent")!;
    expect(child.parentId).toBe(agent.id);
    expect(child.label).toBe("Explore");
    expect(child.detail).toBe("find x");
  });

  it("leaves a sub-agent unattached when two agents share a cwd", () => {
    const sessions = [session({ paneId: "p1" }), session({ paneId: "p2" })];
    const twoPanes: Record<string, PaneMeta> = {
      p1: { tabId: "t1", tabName: "ide", cwd: "/proj" },
      p2: { tabId: "t1", tabName: "ide", cwd: "/proj" },
    };
    const lanes = buildLanes(sessions, [sub()], twoPanes);
    expect(lanes.find((l) => l.kind === "subagent")!.parentId).toBeNull();
  });

  it("does not attach a sub-agent to an agent in a different cwd", () => {
    const lanes = buildLanes([session()], [sub({ cwd: "/other" })], meta);
    expect(lanes.find((l) => l.kind === "subagent")!.parentId).toBeNull();
  });

  it("carries cost and tokens on agent lanes only", () => {
    const s = session({ status: "completed", endTime: 5000,
                        estimatedInputTokens: 1_000_000, estimatedOutputTokens: 1_000_000 });
    const lanes = buildLanes([s], [sub()], meta);
    const agent = lanes.find((l) => l.kind === "agent")!;
    const child = lanes.find((l) => l.kind === "subagent")!;
    expect(agent.tokens).toEqual({ input: 1_000_000, output: 1_000_000 });
    expect(agent.costCents).toBeCloseTo(1800, 0); // 300 in + 1500 out per 1M
    expect(child.costCents).toBeNull();
    expect(child.tokens).toBeNull();
  });

  it("sorts lanes by start time", () => {
    const lanes = buildLanes(
      [session({ paneId: "p1", startTime: 3000 })],
      [sub({ startTime: 1000 })],
      meta,
    );
    expect(lanes.map((l) => l.startTime)).toEqual([1000, 3000]);
  });
});

describe("useFleetStore", () => {
  beforeEach(() => useFleetStore.getState().reset());

  it("records a spawn then completes it", () => {
    useFleetStore.getState().applyEvent(
      { kind: "Spawn", id: "s1", agent_type: "Explore", description: "d",
        model: "sonnet", started_at: "2026-08-07T05:29:32.936Z" }, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(1);
    expect(useFleetStore.getState().subagents[0].startTime)
      .toBe(Date.parse("2026-08-07T05:29:32.936Z"));

    useFleetStore.getState().applyEvent(
      { kind: "Complete", id: "s1", finished_at: "2026-08-07T05:31:00.000Z" }, "/proj");
    expect(useFleetStore.getState().subagents[0].endTime)
      .toBe(Date.parse("2026-08-07T05:31:00.000Z"));
  });

  it("ignores a duplicate spawn for the same id", () => {
    const ev = { kind: "Spawn" as const, id: "s1", agent_type: "E", description: "d",
                 model: null, started_at: "2026-08-07T05:29:32.936Z" };
    useFleetStore.getState().applyEvent(ev, "/proj");
    useFleetStore.getState().applyEvent(ev, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(1);
  });

  it("ignores a complete for an unknown id", () => {
    useFleetStore.getState().applyEvent(
      { kind: "Complete", id: "nope", finished_at: "2026-08-07T05:31:00.000Z" }, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(0);
  });
});

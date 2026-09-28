import { describe, it, expect, beforeEach } from "vitest";
import { buildLanes, buildPaneMeta, useFleetStore, withUsage,
         type SubagentRecord, type PaneMeta, type PaneInfo } from "../fleetStore";
import type { AgentSession } from "../agentTrackerStore";
import type { SessionUsage } from "../../lib/tokenUsage";

function session(over: Partial<AgentSession> = {}): AgentSession {
  return {
    paneId: "p1", agentName: "claude", agentIcon: "🤖", provider: "claude",
    startTime: 1000, endTime: null, status: "running", ...over,
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

  it("leaves cost empty until real usage is attached", () => {
    const lanes = buildLanes([session()], [sub()], meta);
    expect(lanes.every((l) => l.costCents === null && l.tokens === null)).toBe(true);
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

describe("buildPaneMeta", () => {
  function pane(over: Partial<PaneInfo> = {}): PaneInfo {
    return { paneId: "p1", tabId: "t1", tabName: "ide", ptyId: 7, fallbackCwd: null, ...over };
  }

  it("prefers the live PTY cwd over the stored one", () => {
    const m = buildPaneMeta([pane({ fallbackCwd: "/stale" })], { p1: "/proj" });
    expect(m.p1.cwd).toBe("/proj");
  });

  it("falls back to the stored cwd when no live cwd is known", () => {
    const m = buildPaneMeta([pane({ ptyId: null, fallbackCwd: "/restored" })], {});
    expect(m.p1.cwd).toBe("/restored");
  });

  it("yields null for a pane with neither a live nor a stored cwd", () => {
    expect(buildPaneMeta([pane({ ptyId: null })], {}).p1.cwd).toBeNull();
  });

  it("carries tab identity through", () => {
    const m = buildPaneMeta([pane({ tabId: "t9", tabName: "work" })], { p1: "/proj" });
    expect(m.p1).toEqual({ tabId: "t9", tabName: "work", cwd: "/proj" });
  });

  // The regression this fixes: a pane created in the current run has no stored
  // cwd at all, so its lane used to carry cwd: null while the sub-agent carried
  // the live cwd — the two could never agree and nothing ever nested.
  it("nests a sub-agent under a pane that only has a live cwd", () => {
    const meta = buildPaneMeta([pane({ paneId: "p1", fallbackCwd: null })], { p1: "/proj" });
    const lanes = buildLanes([session()], [sub({ cwd: "/proj" })], meta);
    const agent = lanes.find((l) => l.kind === "agent")!;
    expect(lanes.find((l) => l.kind === "subagent")!.parentId).toBe(agent.id);
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

describe("withUsage", () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const usage = (id: string, firstAt: number, output = 1_000_000): SessionUsage => ({
    id, cwd: "/proj", title: null, firstAt: iso(firstAt), lastAt: iso(firstAt), subagentRequests: 0,
    contextTokens: 0, peakContextTokens: 0, model: "claude-sonnet-5", compactions: 0,
    models: [{ model: "claude-sonnet-5", requests: 1, input: 1000, output, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 9000 }],
  });

  it("puts a session's real cost on the lane it started in", () => {
    const lanes = buildLanes([session({ startTime: 10_000, endTime: 50_000, status: "completed" })], [], meta);
    const [lane] = withUsage(lanes, { "/proj": [usage("a", 12_000), usage("later", 90_000)] });
    // Sonnet 5: $10 per 1M output, $2 per 1M input, cache reads at 0.1x.
    expect(lane.costCents).toBeCloseTo((10 + 1000 * 2e-6 + 9000 * 0.2e-6) * 100, 3);
    expect(lane.tokens).toEqual({ input: 10_000, output: 1_000_000 });
  });

  it("skips sessions it can't pin to one lane, and other providers", () => {
    const twoPanes: Record<string, PaneMeta> = {
      p1: { tabId: "t1", tabName: "ide", cwd: "/proj" },
      p2: { tabId: "t1", tabName: "ide", cwd: "/proj" },
    };
    const overlapping = buildLanes([session({ paneId: "p1" }), session({ paneId: "p2" })], [], twoPanes);
    expect(withUsage(overlapping, { "/proj": [usage("a", 2000)] }).every((l) => l.costCents === null)).toBe(true);
    const codex = buildLanes([session({ provider: "codex" })], [], meta);
    expect(withUsage(codex, { "/proj": [usage("a", 2000)] })[0].costCents).toBeNull();
  });
});

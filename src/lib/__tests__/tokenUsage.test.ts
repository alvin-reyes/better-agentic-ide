import { describe, it, expect } from "vitest";
import {
  costOf, uncachedCostOf, totals, contextWindow, tipsFor, modelLabel, fmtTokens, fmtUsd, fmtInt, sumModels,
  type ModelUsage, type SessionUsage,
} from "../tokenUsage";

const usage = (model: string, o: Partial<ModelUsage> = {}): ModelUsage => ({
  model, requests: 1, input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, ...o,
});

const session = (o: Partial<SessionUsage> = {}): SessionUsage => ({
  id: "s", cwd: "/p", title: null, firstAt: null, lastAt: null, models: [], subagentRequests: 0,
  contextTokens: 0, peakContextTokens: 0, model: "claude-opus-5-5", compactions: 0, ...o,
});

describe("pricing", () => {
  it("prices every token kind at its own rate", () => {
    // Opus 5.5: $4 in, $20 out, reads 0.05x, writes 1.25x (5m) / 2x (1h).
    const u = usage("claude-opus-5-5", { input: 1e6, output: 1e6, cacheWrite5m: 1e6, cacheWrite1h: 1e6, cacheRead: 1e6 });
    expect(costOf(u)).toBeCloseTo(4 + 20 + 5 + 8 + 0.2);
    expect(uncachedCostOf(u)).toBeCloseTo(4 * 4 + 20);
    expect(costOf(usage("claude-sonnet-5", { cacheRead: 1e6 }))).toBeCloseTo(0.2);
    expect(costOf(usage("claude-fable-5-1", { cacheRead: 1e6 }))).toBeCloseTo(0.25);
    expect(costOf(usage("claude-opus-4-1-20250805", { output: 1e6 }))).toBeCloseTo(75);
    expect(costOf(usage("gpt-5"))).toBeNull();
  });

  it("totals report the cache hit rate and what caching saved", () => {
    const t = totals([usage("claude-sonnet-5", { input: 100, cacheRead: 900_000, cacheWrite5m: 99_900, output: 1000, requests: 10 }), usage("mystery")]);
    expect(t.cacheHitRate).toBeCloseTo(0.9);
    expect(t.cacheSavings).toBeGreaterThan(1.5);
    expect(t.unpriced).toEqual(["mystery"]);
    expect(t.requests).toBe(11);
  });

  it("merges per-model usage across sessions", () => {
    const s = sumModels([usage("a", { output: 1 }), usage("b"), usage("a", { output: 2 })]);
    expect(s.find((u) => u.model === "a")).toMatchObject({ requests: 2, output: 3 });
  });

  it("knows context windows", () => {
    expect(contextWindow("claude-opus-5-5")).toBe(1_000_000);
    expect(contextWindow("claude-haiku-4-5-20251001")).toBe(200_000);
    expect(contextWindow("claude-sonnet-4-5[1m]")).toBe(1_000_000);
    expect(contextWindow(null)).toBe(200_000);
  });
});

describe("tips", () => {
  it("suggests /compact when the context is large", () => {
    const tips = tipsFor([session({ contextTokens: 800_000 })], null);
    expect(tips[0]).toMatchObject({ id: "compact", level: "high", command: "/compact" });
    expect(tipsFor([session({ contextTokens: 20_000 })], null)).toEqual([]);
    // Haiku's 200k window fills sooner.
    expect(tipsFor([session({ model: "claude-haiku-4-5", contextTokens: 120_000 })], null)[0].id).toBe("compact");
  });

  it("flags a poor cache hit rate and top-tier sub-agents", () => {
    const s = session({ subagentRequests: 30, models: [usage("claude-opus-5-5", { requests: 50, input: 800_000, cacheRead: 200_000 })] });
    const ids = tipsFor([s], null).map((t) => t.id);
    expect(ids).toContain("cache");
    expect(ids).toContain("subagent-model");
  });

  it("uses the project audit", () => {
    const tips = tipsFor([], {
      memoryFiles: [{ path: "/p/CLAUDE.md", bytes: 40_000 }],
      heavy: [{ path: "node_modules", denied: false }, { path: "dist", denied: true }],
      mcpServers: ["a", "b", "c", "d"],
    });
    expect(tips.map((t) => t.id)).toEqual(["memory", "deny", "mcp"]);
    expect(tips[1].detail).toMatch(/^node_modules\./);
  });
});

describe("formatting", () => {
  it("formats models, tokens and dollars", () => {
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(modelLabel("claude-sonnet-4-20250514")).toBe("Sonnet 4");
    expect(modelLabel("claude-fable-5-1")).toBe("Fable 5.1");
    expect(fmtTokens(1_234_567)).toBe("1.2M");
    expect(fmtTokens(45_300)).toBe("45k");
    expect(fmtUsd(0.0421)).toBe("$0.042");
    expect(fmtUsd(12.5)).toBe("$12.50");
    expect(fmtUsd(1256.4)).toBe("$1,256");
    expect(fmtInt(6517)).toBe("6,517");
    expect(fmtInt(1234567)).toBe("1,234,567");
  });
});

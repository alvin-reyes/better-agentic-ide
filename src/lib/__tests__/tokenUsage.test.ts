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

/**
 * DeepSeek runs through the Anthropic-compatible endpoint, so its usage lands
 * in the same Claude Code transcripts and would otherwise be counted but never
 * costed. Its prices are published, so there is nothing to guess.
 *
 * The figures are DeepSeek's standard (peak) rate. Off-peak is half, and the
 * window is 01:00-04:00 and 06:00-10:00 UTC on weekdays, but ModelUsage is
 * aggregated per model with no timestamp, so there is nothing here to decide
 * peak from. Pricing at the standard rate makes the figure an upper bound,
 * which overstates an off-peak run rather than understating a peak one.
 */
describe("deepseek pricing", () => {
  const usage = (model: string, over: Partial<ModelUsage> = {}): ModelUsage => ({
    model, requests: 1, input: 0, output: 0,
    cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, ...over,
  });

  it("prices deepseek-v4-pro input at the standard rate", () => {
    // 1M input tokens at $1.32/M
    expect(costOf(usage("deepseek-v4-pro", { input: 1_000_000 }))).toBeCloseTo(1.32, 6);
  });

  it("prices deepseek-v4-pro output at the standard rate", () => {
    expect(costOf(usage("deepseek-v4-pro", { output: 1_000_000 }))).toBeCloseTo(3.96, 6);
  });

  it("prices deepseek-flash lower than v4-pro", () => {
    const pro = costOf(usage("deepseek-v4-pro", { input: 1_000_000 }))!;
    const flash = costOf(usage("deepseek-flash", { input: 1_000_000 }))!;
    expect(flash).toBeCloseTo(0.3, 6);
    expect(flash).toBeLessThan(pro);
  });

  it("charges a cache read far less than a fresh input token", () => {
    const fresh = costOf(usage("deepseek-v4-pro", { input: 1_000_000 }))!;
    const cached = costOf(usage("deepseek-v4-pro", { cacheRead: 1_000_000 }))!;
    expect(cached).toBeCloseTo(0.044, 6);
    expect(cached).toBeLessThan(fresh / 10);
  });

  it("no longer reports deepseek as an unpriced model", () => {
    expect(costOf(usage("deepseek-v4-pro", { input: 10 }))).not.toBeNull();
    expect(costOf(usage("deepseek-flash", { input: 10 }))).not.toBeNull();
  });

  it("gives deepseek the 1M context window it publishes", () => {
    expect(contextWindow("deepseek-v4-pro")).toBe(1_000_000);
    expect(contextWindow("deepseek-flash")).toBe(1_000_000);
  });

  it("does not let a deepseek name collide with an anthropic price", () => {
    const ds = costOf(usage("deepseek-v4-pro", { input: 1_000_000 }))!;
    const opus = costOf(usage("claude-opus-4", { input: 1_000_000 }))!;
    expect(ds).not.toBeCloseTo(opus, 6);
  });
});

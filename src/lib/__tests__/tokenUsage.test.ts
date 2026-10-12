import { describe, it, expect } from "vitest";
import {
  costOf, uncachedCostOf, totals, contextWindow, tipsFor, modelLabel, fmtTokens, fmtUsd, fmtInt, sumModels,
  type AuditLike, type ModelUsage, type SessionUsage, type Tip,
} from "../tokenUsage";

const usage = (model: string, o: Partial<ModelUsage> = {}): ModelUsage => ({
  model, requests: 1, input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, ...o,
});

const session = (o: Partial<SessionUsage> = {}): SessionUsage => ({
  id: "s", cwd: "/p", title: null, firstAt: null, lastAt: null, models: [], subagentRequests: 0,
  contextTokens: 0, peakContextTokens: 0, model: "claude-opus-5-5", compactions: 0,
  commandRuns: 0, commandOutputChars: 0, largestCommandOutput: 0, ...o,
});

const audit = (presets: Record<string, string> = {}): AuditLike => ({ memoryFiles: [], heavy: [], mcpServers: [], presets });
const tip = (tips: Tip[], id: string) => tips.find((t) => t.id === id);

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

  it("counts the sessions that filled the context window", () => {
    // Opus 5.5 has a 1M window, Haiku 200k: 80% of each.
    const full = [session({ peakContextTokens: 800_000 }), session({ model: "claude-haiku-4-5", peakContextTokens: 160_000 }), session({ peakContextTokens: 799_999 })];
    const t = tip(tipsFor(full, audit()), "ran-full")!;
    expect(t).toMatchObject({ level: "medium", title: "2 sessions filled 80% or more of the context window" });
    expect(t.detail).toContain("Auto-compact at");
    // The setting is named only when the audit shows it unset.
    expect(tip(tipsFor(full, audit({ "env.CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE": "70" })), "ran-full")!.detail).not.toContain("Auto-compact at");
    expect(tip(tipsFor(full, null), "ran-full")!.detail).not.toContain("Auto-compact at");
    expect(tip(tipsFor(full.slice(1), null), "ran-full")).toBeUndefined();
  });

  it("names the session that was compacted most", () => {
    const long = "Rework the whole billing pipeline end to end, then the invoices";
    const tips = tipsFor([session({ title: "Fix a typo", compactions: 3 }), session({ title: long, compactions: 5 })], null);
    const t = tip(tips, "recompacted")!;
    expect(t).toMatchObject({ level: "medium", title: `${long.slice(0, 40)} was compacted 5 times` });
    expect(t.detail).toContain("/clear");
    // No title: the start of the id, as the sessions table shows it.
    expect(tip(tipsFor([session({ id: "0123456789abcdef", compactions: 3 })], null), "recompacted")!.title).toBe("01234567 was compacted 3 times");
    expect(tip(tipsFor([session({ compactions: 2 })], null), "recompacted")).toBeUndefined();
  });

  it("says when the top-tier model took nearly all the spend", () => {
    // Opus 5.5 output is $20 per million, Sonnet 5 $10: $9.50 of $10.
    const spent = [session({ models: [usage("claude-opus-5-5", { output: 475_000 }), usage("claude-sonnet-5", { output: 50_000 })] })];
    const t = tip(tipsFor(spent, audit()), "top-tier")!;
    expect(t).toMatchObject({ level: "info", title: "Opus 5.5 took 95% of the $10.00 spent", command: "/model" });
    expect(t.detail).toContain("Default model");
    expect(t.detail).toContain("opusplan");
    // No audit: the tip, without the sentence about the setting.
    const bare = tip(tipsFor(spent, null), "top-tier")!;
    expect(bare.title).toBe(t.title);
    expect(bare.detail).not.toContain("Default model");
    expect(tip(tipsFor(spent, audit({ model: "opusplan" })), "top-tier")).toBeUndefined();
    // Two ids of one model are named once.
    const twice = [session({ models: [usage("claude-opus-5-5", { output: 200_000 }), usage("claude-opus-5-5[1m]", { output: 200_000 })] })];
    expect(tip(tipsFor(twice, null), "top-tier")!.title).toBe("Opus 5.5 took 100% of the $8.00 spent");
    // Under $5, and under 90%.
    expect(tip(tipsFor([session({ models: [usage("claude-opus-5-5", { output: 200_000 })] })], null), "top-tier")).toBeUndefined();
    expect(tip(tipsFor([session({ models: [usage("claude-opus-5-5", { output: 400_000 }), usage("claude-sonnet-5", { output: 200_000 })] })], null), "top-tier")).toBeUndefined();
  });

  it("names a session that is most of the spend", () => {
    const cost = (dollars: number) => [usage("claude-sonnet-5", { output: dollars * 100_000 })];
    const three = [session({ models: cost(0.5) }), session({ title: "Migrate the database", models: cost(3) }), session({ models: cost(0.5) })];
    expect(tip(tipsFor(three, null), "one-session")).toMatchObject({ level: "info", title: "Migrate the database is 75% of this period's spend ($3.00)" });
    expect(tip(tipsFor(three.slice(0, 2), null), "one-session")).toBeUndefined();
    // 3 of 6 is under 60%; 0.75 of 0.95 is over it, but under $1 in all.
    expect(tip(tipsFor([...three, session({ models: cost(2) })], null), "one-session")).toBeUndefined();
    expect(tip(tipsFor([session({ models: cost(0.1) }), session({ models: cost(0.75) }), session({ models: cost(0.1) })], null), "one-session")).toBeUndefined();
  });

  it("flags short sessions that wrote more to cache than they read", () => {
    const short = (o: Partial<ModelUsage>) => session({ models: [usage("claude-sonnet-5", { requests: 3, ...o })] });
    const five = Array.from({ length: 5 }, () => short({ cacheWrite5m: 10_000, cacheWrite1h: 20_000, cacheRead: 5_000 }));
    const title = "5 sessions made 3 requests or fewer and wrote 150k tokens to cache";
    const t = tip(tipsFor(five, null), "short-sessions")!;
    expect(t).toMatchObject({ level: "info", title });
    expect(t.detail).toContain("still open");
    expect(tip(tipsFor(five.slice(1), null), "short-sessions")).toBeUndefined();
    // A longer session is not one of them, whatever it wrote.
    expect(tip(tipsFor([...five.slice(1), short({ requests: 4, cacheWrite5m: 900_000 })], null), "short-sessions")).toBeUndefined();
    // Nor is one that read as much as it wrote: a long session with a few
    // requests inside the period. It adds nothing to the count or the figure.
    const resumed = short({ cacheWrite5m: 40_000, cacheRead: 900_000 });
    expect(tip(tipsFor([...five.slice(1), resumed], null), "short-sessions")).toBeUndefined();
    expect(tip(tipsFor([...five, resumed, short({ cacheWrite5m: 10_000, cacheRead: 10_000 })], null), "short-sessions")!.title).toBe(title);
    // 50k tokens written between them, or nothing is said.
    const small = (written: number) => Array.from({ length: 5 }, () => short({ cacheWrite5m: written }));
    expect(tip(tipsFor(small(9_999), null), "short-sessions")).toBeUndefined();
    expect(tip(tipsFor(small(10_000), null), "short-sessions")!.title).toBe("5 sessions made 3 requests or fewer and wrote 50k tokens to cache");
  });

  it("adds up command output across sessions", () => {
    // Four characters to a token: 120k and 80k characters are 50k tokens.
    const runs = [session({ commandRuns: 30, commandOutputChars: 120_000 }), session({ commandRuns: 12, commandOutputChars: 80_000 })];
    const t = tip(tipsFor(runs, null), "script-output")!;
    expect(t).toMatchObject({ level: "info", title: "Command output added about 50k tokens over 42 runs" });
    expect(t.detail).toContain("split terminal");
    expect(tip(tipsFor([session({ commandRuns: 1200, commandOutputChars: 800_000 })], null), "script-output")).toMatchObject({
      level: "medium", title: "Command output added about 200k tokens over 1,200 runs",
    });
    // The thresholds are in characters: 199,998 rounds to 50k tokens and is still under.
    expect(tip(tipsFor([session({ commandRuns: 30, commandOutputChars: 199_998 })], null), "script-output")).toBeUndefined();
    expect(tip(tipsFor([session({ commandRuns: 30, commandOutputChars: 799_998 })], null), "script-output")).toMatchObject({
      level: "info", title: "Command output added about 200k tokens over 30 runs",
    });
  });

  it("points at the Bash output limit when one command printed a lot", () => {
    const big = [session({ largestCommandOutput: 9_000 }), session({ largestCommandOutput: 15_000 })];
    const t = tip(tipsFor(big, audit()), "bash-limit")!;
    expect(t).toMatchObject({ level: "info", title: "The largest command output was 15,000 characters" });
    expect(t.detail).toContain("Bash output sent to the model");
    expect(tip(tipsFor(big, audit({ "env.BASH_MAX_OUTPUT_LENGTH": "8000" })), "bash-limit")).toBeUndefined();
    expect(tip(tipsFor(big, null), "bash-limit")).toBeUndefined();
    expect(tip(tipsFor([session({ largestCommandOutput: 14_999 })], audit()), "bash-limit")).toBeUndefined();
  });

  it("leaves a model with no price out of every dollar figure and share", () => {
    const mystery = usage("gpt-5", { output: 50_000_000 });
    // $9.50 of $10 on Opus, beside a far larger block of usage with no price.
    const mixed = [session({ models: [usage("claude-opus-5-5", { output: 475_000 }), usage("claude-sonnet-5", { output: 50_000 }), mystery] })];
    expect(tip(tipsFor(mixed, null), "top-tier")!.title).toBe("Opus 5.5 took 95% of the $10.00 spent");
    const cost = (dollars: number) => [usage("claude-sonnet-5", { output: dollars * 100_000 })];
    const three = [session({ models: [mystery] }), session({ title: "Migrate", models: cost(3) }), session({ models: cost(1) })];
    expect(tip(tipsFor(three, null), "one-session")!.title).toBe("Migrate is 75% of this period's spend ($3.00)");
    // Nothing priced at all: the tips that fire quote no dollar figure and no share of spend.
    const none = tipsFor(Array.from({ length: 5 }, () => session({
      commandRuns: 5, commandOutputChars: 100_000,
      models: [usage("opus-like-router", { output: 50_000_000, cacheWrite5m: 20_000 })],
    })), audit());
    const ids = none.map((t) => t.id);
    expect(ids).toContain("short-sessions");
    expect(ids).toContain("script-output");
    expect(ids).not.toContain("top-tier");
    expect(ids).not.toContain("one-session");
    expect(none.map((t) => t.title + t.detail).join(" ")).not.toMatch(/\$|spend/);
  });

  it("names no setting when the audit carries no presets", () => {
    // All projects: the settings belong to one folder, the usage to many.
    const bare: AuditLike = { memoryFiles: [], heavy: [], mcpServers: [] };
    const sessions = [
      session({ peakContextTokens: 900_000, largestCommandOutput: 20_000, models: [usage("claude-opus-5-5", { output: 500_000 })] }),
      session({ peakContextTokens: 900_000 }),
    ];
    const tips = tipsFor(sessions, bare);
    expect(tip(tips, "ran-full")!.detail).not.toContain("Auto-compact at");
    expect(tip(tips, "top-tier")!.detail).not.toContain("Default model");
    expect(tip(tips, "bash-limit")).toBeUndefined();
    expect(tipsFor(sessions, audit()).map((t) => t.id)).toEqual(["ran-full", "top-tier", "bash-limit"]);
  });

  it("keeps new tips after the existing ones of their level, in a fixed order", () => {
    const heavy = (o: Partial<SessionUsage>) => session({
      peakContextTokens: 900_000, compactions: 3, commandRuns: 10, commandOutputChars: 50_000, largestCommandOutput: 20_000,
      models: [usage("claude-opus-5-5", { requests: 3, output: 100_000, cacheWrite5m: 20_000 })], ...o,
    });
    const sessions = [heavy({ title: "Big", models: [usage("claude-opus-5-5", { requests: 3, output: 1_000_000, cacheWrite5m: 20_000 })] }), ...Array.from({ length: 4 }, () => heavy({}))];
    const tips = tipsFor(sessions, { ...audit(), memoryFiles: [{ path: "/p/CLAUDE.md", bytes: 40_000 }], mcpServers: ["a", "b", "c", "d"] });
    expect(tips.map((t) => t.id)).toEqual(["memory", "ran-full", "recompacted", "mcp", "top-tier", "one-session", "short-sessions", "script-output", "bash-limit"]);
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

import { describe, it, expect } from "vitest";
import { totals, type ModelUsage } from "../tokenUsage";

/**
 * Not every model in a transcript has a price here: ADE can run Claude Code
 * against routers and local models, and PRICES only covers Anthropic's. Those
 * requests are excluded from the cost total — which is correct, since inventing
 * a price would be worse — but the total then understates real spend with no
 * indication, and it is shown as a confident dollar figure.
 *
 * On a real machine this hid 19,182 sub-agent turns on an unpriced model: the
 * largest single block of usage, absent from the headline.
 *
 * totals() already reports which models it could not price. The contract here
 * is that it does so accurately, so the UI can say the figure is partial.
 */
const u = (model: string, over: Partial<ModelUsage> = {}): ModelUsage => ({
  model, requests: 1, input: 1000, output: 500,
  cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, ...over,
});

describe("totals() reports models it cannot price", () => {
  it("names an unpriced model", () => {
    const t = totals([u("deepseek-v4-pro")]);
    expect(t.unpriced).toContain("deepseek-v4-pro");
  });

  it("leaves unpriced usage out of the cost rather than guessing", () => {
    const priced = totals([u("claude-sonnet-5")]);
    const mixed = totals([u("claude-sonnet-5"), u("deepseek-v4-pro")]);
    expect(mixed.cost).toBeCloseTo(priced.cost, 10);
  });

  it("still counts unpriced tokens and requests, so volume is not lost too", () => {
    const t = totals([u("deepseek-v4-pro", { requests: 7 })]);
    expect(t.requests).toBe(7);
    expect(t.inputTokens).toBe(1000);
    expect(t.outputTokens).toBe(500);
  });

  it("reports nothing unpriced when every model is known", () => {
    expect(totals([u("claude-opus-5"), u("claude-haiku-4-5-20251001")]).unpriced).toEqual([]);
  });

  it("does not repeat a model name", () => {
    const t = totals([u("deepseek-v4-pro"), u("deepseek-v4-pro")]);
    expect(t.unpriced.filter((m) => m === "deepseek-v4-pro").length).toBeLessThanOrEqual(1);
  });
});

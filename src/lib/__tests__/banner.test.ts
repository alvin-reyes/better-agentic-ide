import { describe, it, expect } from "vitest";
import { bannerLines, bannerWidth, shouldShowBanner, stripSgr, visibleWidth } from "../banner";

// Glyphs known to take one terminal cell. visibleWidth counts code points, so
// a wide glyph (an emoji, a CJK character) would pass the 80-column test while
// drawing wider: the art must stay within this set.
const SINGLE_CELL = new Set([..."\u2584\u2580\u2588\u25cf\u2554\u2557\u255a\u255d\u2550\u2551"]);
const isSingleCell = (ch: string) => (ch >= " " && ch <= "~") || SINGLE_CELL.has(ch);

describe("bannerLines", () => {
  it("fits in 80 columns", () => {
    for (const line of bannerLines("12.345.6789")) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
    expect(bannerWidth()).toBeLessThanOrEqual(80);
  });

  it("draws only single-cell glyphs", () => {
    for (const line of bannerLines("12.345.6789")) {
      for (const ch of stripSgr(line)) expect(isSingleCell(ch), `glyph ${JSON.stringify(ch)}`).toBe(true);
    }
  });

  it("starts with the art and ends with one blank line before the prompt", () => {
    const lines = bannerLines("1.0.0").map(stripSgr);
    expect(lines[0].trim()).not.toBe("");
    expect(lines[lines.length - 1]).toBe("");
    expect(lines[lines.length - 2].trim()).not.toBe("");
  });

  it("is compact: the mark and lettering take at most 8 rows", () => {
    const drawn = bannerLines("1.0.0").filter((l) => stripSgr(l).trim() !== "");
    expect(drawn.length).toBeLessThanOrEqual(8);
  });

  it("shows the version it is given", () => {
    const text = bannerLines("0.19.0").map(stripSgr).join("\n");
    expect(text).toContain("v0.19.0");
    expect(bannerLines("v0.19.0").map(stripSgr).join("\n")).not.toContain("vv");
  });

  it("shows no version when none is known", () => {
    for (const v of [undefined, null, ""]) {
      const text = bannerLines(v).map(stripSgr).join("\n");
      expect(text).not.toMatch(/v\d/);
    }
  });

  it("resets colour at the end of every line", () => {
    for (const line of bannerLines("0.19.0")) {
      if (!line.includes("\x1b[")) continue;
      expect(line.endsWith("\x1b[0m")).toBe(true);
    }
  });

  it("draws the logo: the ADE lettering and the orange accents", () => {
    const lines = bannerLines("0.19.0");
    expect(lines.map(stripSgr).join("\n")).toContain("█████╗ ██████╗ ███████╗");
    expect(lines.join("")).toContain("\x1b[38;2;255;90;31m");
  });
});

describe("shouldShowBanner", () => {
  const wide = bannerWidth() + 20;

  it("shows in a new tab's first pane wide enough to draw it", () => {
    expect(shouldShowBanner({ isNewTab: true, cols: wide, enabled: true })).toBe(true);
    expect(shouldShowBanner({ isNewTab: true, cols: bannerWidth(), enabled: true })).toBe(true);
  });

  it("is skipped when the setting is off", () => {
    expect(shouldShowBanner({ isNewTab: true, cols: wide, enabled: false })).toBe(false);
  });

  it("is skipped in a pane that is not a new tab's first (a split, a restored pane)", () => {
    expect(shouldShowBanner({ isNewTab: false, cols: wide, enabled: true })).toBe(false);
  });

  it("is skipped when the pane is narrower than the banner, or its width is unknown", () => {
    expect(shouldShowBanner({ isNewTab: true, cols: bannerWidth() - 1, enabled: true })).toBe(false);
    expect(shouldShowBanner({ isNewTab: true, cols: 0, enabled: true })).toBe(false);
  });
});

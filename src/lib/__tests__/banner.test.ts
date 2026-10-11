import { describe, it, expect } from "vitest";
import { bannerLines, bannerWidth, stripSgr, visibleWidth } from "../banner";

describe("bannerLines", () => {
  it("fits in 80 columns", () => {
    for (const line of bannerLines("12.345.6789")) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
    expect(bannerWidth()).toBeLessThanOrEqual(80);
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

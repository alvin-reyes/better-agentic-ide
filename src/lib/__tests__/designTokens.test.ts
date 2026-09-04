import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

const REQUIRED_TOKENS = [
  "--text-2xs", "--text-xs", "--text-sm", "--text-base",
  "--text-md", "--text-lg", "--text-xl",
  "--space-0-5", "--space-1", "--space-1-5", "--space-2", "--space-3",
  "--space-4", "--space-5", "--space-6", "--space-8", "--space-10",
  "--radius-sm", "--radius-lg", "--radius-xl",
  "--elev-1", "--elev-2", "--elev-3",
  "--hairline-top", "--scrim",
  "--ease-out", "--dur-fast", "--dur-base",
];

describe("design tokens", () => {
  it("defines every required token in index.css", () => {
    for (const token of REQUIRED_TOKENS) {
      expect(
        css.includes(`${token}:`),
        `index.css is missing the token "${token}"`
      ).toBe(true);
    }
  });

  it("does not use a blanket transition-all rule", () => {
    expect(css.includes("transition: all")).toBe(false);
  });

  it("handles prefers-reduced-motion", () => {
    expect(css.includes("prefers-reduced-motion")).toBe(true);
  });

  it("no longer hardcodes 8px or 9px font sizes", () => {
    expect(/font-size:\s*[89]px/.test(css)).toBe(false);
  });
});

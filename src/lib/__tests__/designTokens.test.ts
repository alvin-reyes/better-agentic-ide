import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { themePresets } from "../../stores/settingsStore";

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
  "--font-ui", "--font-mono",
  "--control-h", "--control-h-sm",
  // Runtime-set colour tokens that must also have a static fallback.
  "--accent-solid", "--red", "--red-subtle", "--yellow", "--yellow-subtle",
];

/** Reads a `--token: value;` declaration out of index.css. */
function tokenValue(name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : "";
}

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

  it("transitions filter, so brightness-based hovers ease rather than snap", () => {
    const rule = /button, a, input, textarea, select \{([^}]+)\}/.exec(css);
    expect(rule !== null).toBe(true);
    expect(rule![1].includes("filter var(--dur-fast)")).toBe(true);
  });

  it("statically falls back to the default preset's colours", () => {
    const precision = themePresets.find((p) => p.id === "precision-dark")!;
    const c = precision.colors;
    const pairs: Array<[string, string]> = [
      ["--bg-primary", c.bgPrimary],
      ["--bg-secondary", c.bgSecondary],
      ["--bg-tertiary", c.bgTertiary],
      ["--bg-elevated", c.bgElevated],
      ["--bg-surface", c.bgSurface],
      ["--text-primary", c.textPrimary],
      ["--text-secondary", c.textSecondary],
      ["--text-muted", c.textMuted],
      ["--accent", c.accent],
      ["--accent-solid", c.accentSolid],
      ["--green", c.green],
      ["--red", c.red],
      ["--yellow", c.yellow],
      ["--border", c.border],
      ["--border-strong", c.borderStrong],
    ];
    for (const [token, expected] of pairs) {
      expect(
        tokenValue(token).toLowerCase(),
        `index.css ${token} should fall back to precision-dark's value`
      ).toBe(expected.toLowerCase());
    }
  });
});

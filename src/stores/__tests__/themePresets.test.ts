import { describe, it, expect } from "vitest";
import { themePresets, type ThemeColors } from "../settingsStore";

const THEME_COLOR_KEYS: (keyof ThemeColors)[] = [
  "bgPrimary", "bgSecondary", "bgTertiary", "bgElevated", "bgSurface",
  "textPrimary", "textSecondary", "textMuted",
  "accent", "green",
  "accentSolid", "red", "yellow",
  "border", "borderStrong",
  "termBg", "termFg", "termCursor",
  "termBlack", "termRed", "termGreen", "termYellow",
  "termBlue", "termMagenta", "termCyan", "termWhite",
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const RGBA = /^rgba?\(/;

describe("themePresets", () => {
  it("every preset defines every ThemeColors key", () => {
    for (const preset of themePresets) {
      for (const key of THEME_COLOR_KEYS) {
        expect(
          preset.colors[key],
          `preset "${preset.id}" is missing "${key}"`
        ).toBeTruthy();
      }
    }
  });

  it("every colour value is a 6-digit hex or an rgb/rgba string", () => {
    for (const preset of themePresets) {
      for (const key of THEME_COLOR_KEYS) {
        const value = preset.colors[key];
        expect(
          HEX.test(value) || RGBA.test(value),
          `preset "${preset.id}" key "${key}" has invalid value "${value}"`
        ).toBe(true);
      }
    }
  });

  it("preset ids are unique", () => {
    const ids = themePresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the precision-dark signature preset", () => {
    expect(themePresets.some((p) => p.id === "precision-dark")).toBe(true);
  });

  it("every accentSolid clears WCAG AA against the white button label", () => {
    // .ui-btn--primary paints white text on --accent-solid, and .ui-btn--sm
    // renders at 11px — normal text, so the threshold is 4.5:1.
    for (const preset of themePresets) {
      const ratio = contrastWithWhite(preset.colors.accentSolid);
      expect(
        ratio >= 4.5,
        `preset "${preset.id}" accentSolid ${preset.colors.accentSolid} ` +
          `contrasts ${ratio.toFixed(2)}:1 with white; AA needs 4.5:1`
      ).toBe(true);
    }
  });
});

/** WCAG 2.x relative luminance of an #rrggbb colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG contrast ratio of `hex` against pure white. */
function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

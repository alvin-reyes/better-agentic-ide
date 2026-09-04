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
});

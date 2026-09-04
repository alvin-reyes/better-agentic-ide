import { describe, it, expect, beforeEach } from "vitest";
import { applyThemeToDOM, themePresets } from "../settingsStore";

const precision = themePresets.find((p) => p.id === "precision-dark")!;

describe("applyThemeToDOM", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("sets the chrome custom properties from the preset", () => {
    applyThemeToDOM(precision.colors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--bg-primary")).toBe("#0A0B0D");
    expect(style.getPropertyValue("--text-primary")).toBe("#E8EAED");
    expect(style.getPropertyValue("--accent")).toBe("#7C8FFF");
  });

  it("emits the new accent-solid, red and yellow properties", () => {
    applyThemeToDOM(precision.colors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--accent-solid")).toBe("#4A5FE0");
    expect(style.getPropertyValue("--red")).toBe("#F4756B");
    expect(style.getPropertyValue("--yellow")).toBe("#D9A441");
  });

  it("derives subtle variants with the existing hex-suffix convention", () => {
    applyThemeToDOM(precision.colors);
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--red-subtle")).toBe("#F4756B26");
    expect(style.getPropertyValue("--yellow-subtle")).toBe("#D9A44126");
    expect(style.getPropertyValue("--accent-subtle")).toBe("#7C8FFF26");
  });

  it("emits a property for every preset without producing empty values", () => {
    for (const preset of themePresets) {
      document.documentElement.removeAttribute("style");
      applyThemeToDOM(preset.colors);
      const style = document.documentElement.style;
      for (const prop of ["--accent-solid", "--red", "--yellow"]) {
        expect(
          style.getPropertyValue(prop),
          `preset "${preset.id}" produced an empty "${prop}"`
        ).toBeTruthy();
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ui from "../index";

const css = readFileSync(resolve(__dirname, "../ui.css"), "utf8");

/** Body of the first rule whose selector list contains `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`(?:^|[,\\n])\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, "m").exec(css);
  return m ? m[1] : "";
}

describe("ui barrel", () => {
  it("re-exports all six primitives as named exports", () => {
    for (const name of ["Badge", "Button", "Field", "Overlay", "Panel", "Row"]) {
      expect(typeof (ui as Record<string, unknown>)[name]).toBe("function");
    }
  });
});

describe("ui.css", () => {
  it("namespaces every class under ui-", () => {
    const classes = css.match(/\.[a-zA-Z][\w-]*/g) ?? [];
    const stray = classes.filter((c) => !c.startsWith(".ui-"));
    expect(stray.length, `unprefixed classes: ${stray.join(", ")}`).toBe(0);
  });

  it("drives control heights from tokens rather than magic numbers", () => {
    expect(rule(".ui-btn--md").includes("var(--control-h)")).toBe(true);
    expect(rule(".ui-btn--sm").includes("var(--control-h-sm)")).toBe(true);
    expect(rule(".ui-input").includes("var(--control-h)")).toBe(true);
    expect(rule(".ui-row").includes("var(--control-h)")).toBe(true);
  });

  it("floors icon-only buttons at the 24x24 WCAG 2.5.8 target", () => {
    const icon = rule(".ui-btn--icon");
    expect(icon.includes("min-width: 24px")).toBe(true);
    expect(icon.includes("min-height: 24px")).toBe(true);
  });

  it("gives every button variant an :active state", () => {
    for (const variant of ["primary", "secondary", "ghost", "danger"]) {
      expect(
        css.includes(`.ui-btn--${variant}:active`),
        `.ui-btn--${variant} has no :active rule`
      ).toBe(true);
    }
  });

  it("puts --hairline-top on the panel, not the occluded overlay content", () => {
    expect(rule(".ui-panel").includes("var(--hairline-top)")).toBe(true);
    expect(rule(".ui-overlay__content").includes("var(--hairline-top)")).toBe(false);
    expect(rule(".ui-overlay__content").includes("var(--elev-3)")).toBe(true);
  });

  it("bounds the overlay content width so call sites need not", () => {
    const content = rule(".ui-overlay__content");
    expect(/max-width:\s*\d/.test(content)).toBe(true);
    expect(content.includes("width: 100%")).toBe(true);
  });

  it("gives hover, cursor and selection three distinct row grounds", () => {
    const hover = rule(".ui-row:hover:not(.ui-row--disabled)");
    const selected = rule(".ui-row--selected");
    expect(hover.length > 0).toBe(true);
    expect(selected.length > 0).toBe(true);
    expect(hover === selected).toBe(false);
  });

  it("scopes the Field control selectors away from non-text inputs", () => {
    expect(css.includes('.ui-field > input:not([type="checkbox"])')).toBe(true);
    expect(css.includes('[type="color"]')).toBe(true);
  });
});

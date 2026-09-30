import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Renaming a tab is bound to ⌘R — "reload" in every browser and most apps, so
 * it gets pressed by accident. The rename field used to be transparent and
 * borderless, indistinguishable from the tab label it replaced. Nothing on
 * screen said the app was now capturing keystrokes, so typing went into the
 * tab's name while the terminal looked dead.
 *
 * The field must therefore be visibly a field whenever it is on screen.
 */
const TABBAR = readFileSync(resolve(__dirname, "../TabBar.tsx"), "utf8");

/** The rename <input> element's source, from `ref={inputRef}` to its close. */
function renameInput(): string {
  const start = TABBAR.indexOf("ref={inputRef}");
  expect(start, "rename input not found — did the ref change?").toBeGreaterThan(-1);
  const end = TABBAR.indexOf("/>", start);
  return TABBAR.slice(start, end);
}

describe("the tab rename field is visible while it has focus", () => {
  it("is not styled invisible", () => {
    const input = renameInput();
    for (const invisible of ["bg-transparent", "border-none"]) {
      expect(
        input.includes(invisible),
        `rename input uses "${invisible}", which makes it indistinguishable from a tab label`
      ).toBe(false);
    }
  });

  it("paints its own background and border", () => {
    const input = renameInput();
    expect(input).toMatch(/backgroundColor:/);
    expect(input).toMatch(/border:\s*"1px solid/);
  });

  it("is labelled, so it is announced as an editable field", () => {
    expect(renameInput()).toMatch(/aria-label=/);
  });

  it("still leaves Escape as the way out", () => {
    expect(TABBAR).toMatch(/e\.key === "Escape"[\s\S]{0,40}setEditingId\(null\)/);
  });
});

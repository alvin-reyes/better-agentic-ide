import { describe, it, expect } from "vitest";
import { matches, tabNumber, pageTab, isAppShortcut, shortcutLabel, SHORTCUTS, keyName } from "../shortcuts";

const ev = (code: string, mods: Partial<Record<"meta" | "ctrl" | "shift" | "alt", boolean>> = {}, key = "") => ({
  code, key, metaKey: !!mods.meta, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt,
});

describe("macOS", () => {
  it("uses ⌘ and ⌘⇧", () => {
    expect(matches(ev("KeyT", { meta: true }), SHORTCUTS.newTab, true)).toBe(true);
    expect(matches(ev("KeyD", { meta: true, shift: true }), SHORTCUTS.splitVertical, true)).toBe(true);
    expect(matches(ev("KeyD", { meta: true, shift: true }), SHORTCUTS.splitHorizontal, true)).toBe(false);
  });
  it("leaves Ctrl combos to the terminal", () => {
    expect(isAppShortcut(ev("KeyR", { ctrl: true }), true)).toBe(false);
    expect(isAppShortcut(ev("KeyD", { ctrl: true }), true)).toBe(false);
  });
  it("matches ⌘⇧[ even though the key reports {", () => {
    expect(matches(ev("BracketLeft", { meta: true, shift: true }, "{"), SHORTCUTS.prevTab, true)).toBe(true);
  });
});

describe("Linux / Windows", () => {
  it("maps ⌘ to Ctrl+Shift and ⌘⇧ to Ctrl+Alt+Shift", () => {
    expect(matches(ev("KeyT", { ctrl: true, shift: true }, "T"), SHORTCUTS.newTab, false)).toBe(true);
    expect(matches(ev("KeyD", { ctrl: true, shift: true, alt: true }), SHORTCUTS.splitVertical, false)).toBe(true);
    expect(matches(ev("KeyD", { ctrl: true, shift: true }), SHORTCUTS.splitVertical, false)).toBe(false);
    expect(tabNumber(ev("Digit3", { ctrl: true, shift: true }, "#"), false)).toBe(3);
    expect(pageTab(ev("PageDown", { ctrl: true }), false)).toBe(1);
  });
  it("leaves every plain Ctrl key to the shell", () => {
    for (const code of ["KeyD", "KeyR", "KeyW", "KeyE", "KeyP", "KeyB", "KeyF", "KeyT", "KeyJ", "KeyS", "ArrowLeft", "Enter", "Digit1"]) {
      expect(isAppShortcut(ev(code, { ctrl: true }), false), code).toBe(false);
    }
  });
  it("labels spell out the keys", () => {
    expect(shortcutLabel("splitVertical", false)).toBe("Ctrl+Alt+Shift+D");
    expect(shortcutLabel("send", false)).toBe("Ctrl+Shift+Enter");
    expect(shortcutLabel("send", true)).toBe("⌘↵");
  });
});

describe("keyName", () => {
  it("names keys by position", () => {
    expect(keyName({ code: "Comma", key: "<" })).toBe(",");
    expect(keyName({ code: "Digit1", key: "!" })).toBe("1");
    expect(keyName({ code: "", key: "Escape" })).toBe("Escape");
  });
});

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

describe("Linux", () => {
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

describe("keyboard shortcuts list", () => {
  it("opens with ⌘/ and Ctrl+Shift+/ (which the key reports as ?)", () => {
    expect(matches(ev("Slash", { meta: true }, "/"), SHORTCUTS.shortcuts, true)).toBe(true);
    expect(matches(ev("Slash", { ctrl: true, shift: true }, "?"), SHORTCUTS.shortcuts, false)).toBe(true);
    expect(shortcutLabel("shortcuts", false)).toBe("Ctrl+Shift+/");
  });

  it("lists every shortcut, with no combo used twice", async () => {
    const { ALL_SHORTCUTS } = await import("../shortcutList");
    const listed = new Set(ALL_SHORTCUTS.map((s) => s.keys));
    for (const id of Object.keys(SHORTCUTS) as (keyof typeof SHORTCUTS)[]) {
      if (["paneLeft", "paneRight", "prevTab", "nextTab"].includes(id)) continue; // shown as combined rows
      expect(listed.has(shortcutLabel(id)), id).toBe(true);
    }
    // ⌘⇧↵ copies in the scratchpad and zooms the pane elsewhere, on purpose.
    const combos = Object.entries(SHORTCUTS)
      .filter(([id]) => id !== "copy")
      .map(([, c]) => `${c.key}:${"shift" in c ? c.shift : false}`);
    expect(new Set(combos).size).toBe(combos.length);
  });
});

describe("sub-terminal shortcuts", () => {
  it("prevSubTerminal and nextSubTerminal are ⌘[ and ⌘] and map to Ctrl+Shift+[ and ] on Linux", () => {
    expect(matches(ev("BracketLeft", { meta: true }, "["), SHORTCUTS.prevSubTerminal, true)).toBe(true);
    expect(matches(ev("BracketRight", { meta: true }, "]"), SHORTCUTS.nextSubTerminal, true)).toBe(true);
    // ⌘⇧[ and ⌘⇧] stay the tab keys.
    expect(matches(ev("BracketLeft", { meta: true, shift: true }, "{"), SHORTCUTS.prevSubTerminal, true)).toBe(false);
    // Linux: Ctrl+Shift+[ reports "{" and Ctrl+Shift+] reports "}".
    expect(matches(ev("BracketLeft", { ctrl: true, shift: true }, "{"), SHORTCUTS.prevSubTerminal, false)).toBe(true);
    expect(matches(ev("BracketRight", { ctrl: true, shift: true }, "}"), SHORTCUTS.nextSubTerminal, false)).toBe(true);
    expect(shortcutLabel("prevSubTerminal", true)).toBe("⌘[");
    expect(shortcutLabel("nextSubTerminal", true)).toBe("⌘]");
    expect(shortcutLabel("prevSubTerminal", false)).toBe("Ctrl+Shift+[");
    expect(shortcutLabel("nextSubTerminal", false)).toBe("Ctrl+Shift+]");
  });

  it("isAppShortcut keeps Ctrl+Shift+[ and ] from the shell", () => {
    expect(isAppShortcut(ev("BracketLeft", { ctrl: true, shift: true }, "{"), false)).toBe(true);
    expect(isAppShortcut(ev("BracketRight", { ctrl: true, shift: true }, "}"), false)).toBe(true);
    // Plain Ctrl+[ is Esc and stays the shell's.
    expect(isAppShortcut(ev("BracketLeft", { ctrl: true }, "["), false)).toBe(false);
    expect(isAppShortcut(ev("BracketLeft", { meta: true }, "["), true)).toBe(true);
  });

  it("the overlay carries the Linux note", async () => {
    const { shortcutNotes, ALL_SHORTCUTS } = await import("../shortcutList");
    const NOTE = "On Linux, Ctrl+Shift+[ and Ctrl+Shift+] switch sub-terminals in every tab, so the shell does not receive them.";
    expect(shortcutNotes(false)).toContain(NOTE);
    expect(shortcutNotes(true)).not.toContain(NOTE);
    // Both keys are listed rows.
    expect(ALL_SHORTCUTS.some((s) => s.keys === shortcutLabel("prevSubTerminal") && /sub-terminal/i.test(s.action))).toBe(true);
    expect(ALL_SHORTCUTS.some((s) => s.keys === shortcutLabel("nextSubTerminal") && /sub-terminal/i.test(s.action))).toBe(true);

    // The overlay shows this platform's notes (jsdom is not a Mac, so the Linux one).
    const { createElement } = await import("react");
    const { render, screen, cleanup } = await import("@testing-library/react");
    const { default: ShortcutsOverlay } = await import("../../components/ShortcutsOverlay");
    const { IS_MAC } = await import("../shortcuts");
    expect(IS_MAC).toBe(false);
    render(createElement(ShortcutsOverlay, { onClose: () => {} }));
    expect(screen.getByText(NOTE)).toBeTruthy();
    cleanup();
  });
});

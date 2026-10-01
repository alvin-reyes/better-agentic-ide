import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { claimKeyboard, keyboardClaimed, __resetKeyboardOwners } from "../keyboardOwner";

beforeEach(() => __resetKeyboardOwners());

describe("keyboardOwner", () => {
  it("is unclaimed when nothing is open", () => {
    expect(keyboardClaimed()).toBe(false);
  });

  it("is claimed while a panel is open", () => {
    claimKeyboard("scratchpad");
    expect(keyboardClaimed()).toBe(true);
  });

  it("releases when the panel closes", () => {
    const release = claimKeyboard("settings");
    release();
    expect(keyboardClaimed()).toBe(false);
  });

  it("stays claimed while any one of several is still open", () => {
    const releaseA = claimKeyboard("palette");
    claimKeyboard("picker");
    releaseA();
    expect(keyboardClaimed()).toBe(true);
  });

  it("is idempotent, so a remount cannot leave a stale claim", () => {
    claimKeyboard("scratchpad");
    const release = claimKeyboard("scratchpad");
    release();
    expect(keyboardClaimed()).toBe(false);
  });
});

/**
 * A claim is only useful if it is made by the component that is actually on
 * screen, for exactly as long as it is on screen. Both ways of getting that
 * wrong were shipped and caught in review: the Settings claim was written into
 * OllamaDownloadPrompt, a child rendered only for the Ollama provider, so the
 * panel itself never claimed; and the Scratchpad claimed unconditionally even
 * though it returns null when collapsed while staying mounted, which would have
 * held the keyboard for the life of the app and never handed the terminal back.
 */
describe("panels claim the keyboard where it counts", () => {
  const read = (f: string) => readFileSync(resolve(__dirname, "../../components", f), "utf8");

  it.each([
    ["SettingsPanel.tsx", "export default function SettingsPanel() {"],
    ["CommandPalette.tsx", "export default function CommandPalette("],
    ["AgentPicker.tsx", "export default function AgentPicker("],
  ])("%s claims inside the component it renders", (file, signature) => {
    const src = read(file);
    const start = src.indexOf(signature);
    expect(start, `${signature} not found — did the component get renamed?`).toBeGreaterThan(-1);
    const claim = src.indexOf("claimKeyboard(", start);
    expect(claim, "no claim after the component's own signature").toBeGreaterThan(-1);
  });

  it("Scratchpad releases its claim when collapsed", () => {
    const src = read("Scratchpad.tsx");
    // It renders nothing when closed but stays mounted, so the claim must be
    // keyed on isOpen rather than on mounting.
    expect(src).toContain("if (!isOpen) return null;");
    const claim = src.match(/useEffect\(\(\) => \(isOpen \? claimKeyboard\("scratchpad"\) : undefined\), \[isOpen\]\)/);
    expect(claim, "Scratchpad must claim only while open").not.toBeNull();
  });
});

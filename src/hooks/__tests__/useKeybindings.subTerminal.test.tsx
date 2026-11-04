import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

const term = vi.hoisted(() => ({ focusActiveTerminal: vi.fn(() => true) }));
vi.mock("../useTerminal", () => ({
  refreshAllTerminals: vi.fn(),
  getPtyCwd: vi.fn(async () => null),
  focusActiveTerminal: term.focusActiveTerminal,
}));

import { useKeybindings } from "../useKeybindings";
import { useTabStore, ownViewOnly, type Tab, type PaneNode } from "../../stores/tabStore";
import { IS_MAC } from "../../lib/shortcuts";

const leaf = (id: string): PaneNode => ({ type: "pane", pane: { id, ptyId: 1 } });
const terminalTab = (id: string, paneId: string): Tab => ({ id, name: id, ...ownViewOnly(leaf(paneId), paneId) });
const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;

const noop = () => {};
const actions = {
  toggleScratchpad: noop, closeScratchpad: noop, sendScratchpad: noop, copyScratchpad: noop,
  saveNoteScratchpad: noop, sendEnterToTerminal: noop, toggleCommandPalette: noop, toggleAgentPicker: noop,
  togglePreview: noop, toggleBoard: noop, toggleFleet: noop, toggleFileBrowser: noop, openOrchestrator: noop,
  toggleContracts: noop, toggleTokens: noop, toggleIntegrations: noop, toggleShortcuts: noop, toggleTabSwitcher: noop,
  requestCloseTab: vi.fn(), requestClosePane: vi.fn(), isScratchpadOpen: false,
};
function Host() {
  useKeybindings(actions);
  return null;
}

/** ⌘] / ⌘[ on macOS, Ctrl+Shift+] / [ elsewhere; true when the default was not prevented. */
const press = (dir: "next" | "prev") => {
  const code = dir === "next" ? "BracketRight" : "BracketLeft";
  return IS_MAC
    ? fireEvent.keyDown(window, { code, key: dir === "next" ? "]" : "[", metaKey: true })
    : fireEvent.keyDown(window, { code, key: dir === "next" ? "}" : "{", ctrlKey: true, shiftKey: true });
};

beforeEach(() => {
  cleanup();
  term.focusActiveTerminal.mockClear();
  useTabStore.setState({ tabs: [terminalTab("a", "a1"), terminalTab("b", "b1")], activeTabId: "a", closedTabs: [] });
});

describe("⌘[ and ⌘] switch sub-terminals", () => {
  it("⌘] and ⌘[ step through the views and stop at the ends", () => {
    const { addView } = useTabStore.getState();
    const v1 = addView("a", { name: "one", cwd: null })!;
    const v2 = addView("a", { name: "two", cwd: null })!;
    render(<Host />);

    expect(press("next")).toBe(false);
    expect(tab("a").shownView).toBe(v1);
    expect(term.focusActiveTerminal).toHaveBeenCalledTimes(1);
    press("next");
    expect(tab("a").shownView).toBe(v2);
    // The end: no wrap back to own.
    expect(press("next")).toBe(false);
    expect(tab("a").shownView).toBe(v2);

    press("prev");
    expect(tab("a").shownView).toBe(v1);
    press("prev");
    expect(tab("a").shownView).toBe("own");
    press("prev");
    expect(tab("a").shownView).toBe("own");
    // The other tab and the active tab are untouched.
    expect(useTabStore.getState().activeTabId).toBe("a");
    expect(tab("b").shownView).toBe("own");
  });

  it("without sub-terminals the two keys neither prevent default nor change the view", () => {
    render(<Host />);
    const before = useTabStore.getState();

    expect(press("next")).toBe(true);
    expect(press("prev")).toBe(true);

    const after = useTabStore.getState();
    expect(after.tabs).toBe(before.tabs);
    expect(after.activeTabId).toBe("a");
    expect(term.focusActiveTerminal).not.toHaveBeenCalled();
  });
});

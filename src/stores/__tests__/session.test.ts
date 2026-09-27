import { describe, it, expect, beforeEach, vi } from "vitest";

// Only panes that have been shown have a live terminal; the rest have none.
const live = new Map<string, { buffer: string; cwd: string }>();
vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: (id: string) => live.get(id)?.buffer ?? null,
  getPtyCwd: async (id: string) => live.get(id)?.cwd ?? null,
}));

import { useTabStore, saveSession, loadSession, findAllPanes } from "../tabStore";

const KEY = "ade-session";
const pane = (id: string, extra: Record<string, unknown> = {}) => ({ type: "pane", pane: { id, ...extra } });

beforeEach(() => {
  localStorage.clear();
  live.clear();
});

describe("saveSession", () => {
  it("keeps the restored folder and scrollback of tabs that were never opened", async () => {
    localStorage.setItem(KEY, JSON.stringify({
      tabs: [
        { id: "t1", name: "one", root: pane("a", { savedCwd: "/one", serializedBuffer: "hist-1" }), activePaneId: "a" },
        { id: "t2", name: "two", root: pane("b", { savedCwd: "/two", serializedBuffer: "hist-2" }), activePaneId: "b" },
      ],
      activeTabId: "t1",
    }));
    expect(loadSession()).toBe(true);
    const [first] = useTabStore.getState().tabs;
    // Only the first tab has been shown: it has a live terminal now.
    live.set(findAllPanes(first.root)[0].id, { buffer: "hist-1 more", cwd: "/one/sub" });

    await saveSession();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.tabs[0].root.pane).toMatchObject({ savedCwd: "/one/sub", serializedBuffer: "hist-1 more" });
    expect(saved.tabs[1].root.pane).toMatchObject({ savedCwd: "/two", serializedBuffer: "hist-2" });
  });

  it("clears the saved session when every tab is closed", async () => {
    localStorage.setItem(KEY, JSON.stringify({ tabs: [{ id: "t", name: "x", root: pane("a"), activePaneId: "a" }] }));
    useTabStore.setState({ tabs: [] });
    await saveSession();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe("loadSession", () => {
  it("restores the active tab when an earlier editor tab was dropped", () => {
    localStorage.setItem(KEY, JSON.stringify({
      tabs: [
        { id: "e", name: "lost editor", type: "editor", root: pane("x"), activePaneId: "x" },
        { id: "t1", name: "one", root: pane("a"), activePaneId: "a" },
        { id: "t2", name: "two", root: pane("b"), activePaneId: "b" },
      ],
      activeTabId: "t1",
    }));
    expect(loadSession()).toBe(true);
    const { tabs, activeTabId } = useTabStore.getState();
    expect(tabs.map((t) => t.name)).toEqual(["one", "two"]);
    expect(tabs.find((t) => t.id === activeTabId)?.name).toBe("one");
  });
});

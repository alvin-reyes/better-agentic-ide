import { describe, it, expect, beforeEach, vi } from "vitest";

// Only panes that have been shown have a live terminal; the rest have none.
const live = new Map<string, { buffer: string; cwd: string }>();
vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: (id: string) => live.get(id)?.buffer ?? null,
  getPtyCwd: async (id: string) => live.get(id)?.cwd ?? null,
}));

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useTabStore, saveSession, loadSession, findAllPanes, ownView, ownViewOnly, type Tab, type PaneNode } from "../tabStore";

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
    live.set(findAllPanes(ownView(first).root)[0].id, { buffer: "hist-1 more", cwd: "/one/sub" });

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

// Captured from saveSession before views replaced Tab.root (story 2a).
const GOLDEN = readFileSync(resolve(__dirname, "fixtures/session-golden.json"), "utf8").trim();

/** The state the golden file was captured from, in the views shape. */
function goldenState() {
  const tab = (fields: Omit<Tab, "views" | "viewOrder" | "shownView">, root: PaneNode, active: string): Tab =>
    ({ ...fields, ...ownViewOnly(root, active) });
  return {
    tabs: [
      tab({ id: "t1", name: "one", color: "#f00" }, {
        type: "split", direction: "horizontal", children: [
          { type: "pane", pane: { id: "a", ptyId: 1 } },
          { type: "split", direction: "vertical", children: [
            { type: "pane", pane: { id: "b", ptyId: null, savedCwd: "/proj/one/b", serializedBuffer: "old-b" } },
            { type: "pane", pane: { id: "c", ptyId: 3, initialCwd: "/proj/c" } },
          ] },
        ],
      }, "b"),
      tab({ id: "t2", name: "x.md", type: "editor", editorFilePath: "/proj/x.md" }, { type: "pane", pane: { id: "e1", ptyId: null } }, "e1"),
      tab({ id: "t3", name: "Browser", type: "browser", browserUrl: "http://localhost:5173", color: "#0f0" }, { type: "pane", pane: { id: "w1", ptyId: null } }, "w1"),
      tab({ id: "t4", name: "two" }, { type: "pane", pane: { id: "d", ptyId: 4 } }, "d"),
    ],
    activeTabId: "t4",
  };
}

describe("the session across the views refactor", () => {
  it("a single-view tab saves the same JSON as before the refactor", async () => {
    live.set("a", { buffer: "buf-a", cwd: "/proj/one" });
    live.set("d", { buffer: "buf-d", cwd: "/proj/two" });
    useTabStore.setState(goldenState());
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
    await saveSession();
    vi.restoreAllMocks();
    expect(localStorage.getItem(KEY)).toBe(GOLDEN);
  });

  it("an old session loads as one own view", () => {
    localStorage.setItem(KEY, GOLDEN);
    expect(loadSession()).toBe(true);
    const { tabs, activeTabId } = useTabStore.getState();
    expect(tabs.map((t) => t.name)).toEqual(["one", "x.md", "Browser", "two"]);
    expect(tabs.find((t) => t.id === activeTabId)?.name).toBe("two");
    for (const t of tabs) {
      expect(t.viewOrder).toEqual(["own"]);
      expect(t.shownView).toBe("own");
      expect(Object.keys(t.views)).toEqual(["own"]);
    }
    // The same tree: shape, folders and scrollback.
    const shape = (n: PaneNode): unknown => n.type === "pane"
      ? [n.pane.savedCwd, n.pane.serializedBuffer]
      : { [n.direction]: n.children.map(shape) };
    expect(shape(ownView(tabs[0]).root)).toEqual({ horizontal: [
      ["/proj/one", "buf-a"],
      { vertical: [["/proj/one/b", "old-b"], ["/proj/c", undefined]] },
    ] });
    // Pane ids are new on load; the active pane is the first, as before.
    expect(ownView(tabs[0]).activePaneId).toBe(findAllPanes(ownView(tabs[0]).root)[0].id);
    expect(ownView(tabs[3]).activePaneId).toBe(findAllPanes(ownView(tabs[3]).root)[0].id);
    expect(tabs[1].editorFilePath).toBe("/proj/x.md");
    expect(tabs[2].browserUrl).toBe("http://localhost:5173");
  });
});

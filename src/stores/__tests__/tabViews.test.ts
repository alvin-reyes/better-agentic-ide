import { describe, it, expect, beforeEach, vi } from "vitest";

// Panes with a live terminal; the rest have none (never shown).
const live = new Map<string, { buffer: string; cwd: string }>();
const destroyInstance = vi.fn();
const detachInstance = vi.fn();
vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: (id: string) => live.get(id)?.buffer ?? null,
  getPtyCwd: async (id: string) => live.get(id)?.cwd ?? null,
  destroyInstance: (...a: unknown[]) => destroyInstance(...a),
  detachInstance: (...a: unknown[]) => detachInstance(...a),
}));

import {
  useTabStore, saveSession, loadSession, findAllPanes,
  shownView, ownView, allTabPanes, viewOfPane, OWN_VIEW,
  type Tab, type PaneNode,
} from "../tabStore";
import { tabAgentState } from "../agentStatusStore";

const KEY = "ade-session";
const leaf = (id: string, ptyId: number | null = null, extra: Record<string, unknown> = {}): PaneNode =>
  ({ type: "pane", pane: { id, ptyId, ...extra } });
const split = (...children: PaneNode[]): PaneNode => ({ type: "split", direction: "horizontal", children });

/**
 * A tab with its own view (o1, o2) in sight and a hidden view "v1" (h1, h2)
 * in another folder. Production code makes no second view yet (story 2b):
 * the test builds it.
 */
function twoViewTab(id = "t"): Tab {
  return {
    id,
    name: "Terminal",
    views: {
      own: { id: "own", name: null, spawnedBy: null, root: split(leaf("o1", 1, { savedCwd: "/proj/own" }), leaf("o2", 2)), activePaneId: "o1" },
      v1: { id: "v1", name: "vim", spawnedBy: "own", root: split(leaf("h1", 11, { savedCwd: "/other/hidden" }), leaf("h2", null)), activePaneId: "h1" },
    },
    viewOrder: ["own", "v1"],
    shownView: "own",
  };
}
const oneViewTab = (id: string, paneId: string): Tab => ({
  id, name: id,
  views: { own: { id: "own", name: null, spawnedBy: null, root: leaf(paneId, 50), activePaneId: paneId } },
  viewOrder: ["own"], shownView: "own",
});

const tab = (id = "t") => useTabStore.getState().tabs.find((t) => t.id === id)!;
const ids = (node: PaneNode) => findAllPanes(node).map((p) => p.id);

beforeEach(() => {
  localStorage.clear();
  live.clear();
  destroyInstance.mockClear();
  detachInstance.mockClear();
  useTabStore.setState({ tabs: [oneViewTab("other", "x1"), twoViewTab()], activeTabId: "t", closedTabs: [] });
});

describe("the view shape", () => {
  it("a new tab has one own view, first in order and shown", () => {
    const id = useTabStore.getState().addTab("x", "/tmp");
    const t = tab(id);
    expect(Object.keys(t.views)).toEqual([OWN_VIEW]);
    expect(t.views.own.id).toBe("own");
    expect(t.viewOrder).toEqual(["own"]);
    expect(t.shownView).toBe("own");
    expect("root" in t).toBe(false);
    expect("activePaneId" in t).toBe(false);
  });

  it("the accessors read the shown, own and hidden views", () => {
    const t = twoViewTab();
    expect(shownView(t).id).toBe("own");
    expect(shownView({ ...t, shownView: "v1" }).id).toBe("v1");
    expect(ownView(t)).toBe(t.views.own);
    expect(allTabPanes(t).map((p) => p.id)).toEqual(["o1", "o2", "h1", "h2"]);
    expect(allTabPanes({ ...t, viewOrder: ["own", "v1"].reverse() }).map((p) => p.id)).toEqual(["h1", "h2", "o1", "o2"]);
    expect(viewOfPane(t, "h2")?.id).toBe("v1");
    expect(viewOfPane(t, "o2")?.id).toBe("own");
    expect(viewOfPane(t, "nope")).toBeUndefined();
  });
});

describe("tabStore readers with a hidden view", () => {
  it("getActivePane with a pane in a hidden view", () => {
    expect(useTabStore.getState().getActivePane()?.id).toBe("o1");
  });

  it("getActivePtyId with a pane in a hidden view", () => {
    expect(useTabStore.getState().getActivePtyId()).toBe(1);
  });

  it("getTabActivePane with a pane in a hidden view", () => {
    useTabStore.setState({ activeTabId: "other" });
    expect(useTabStore.getState().getTabActivePane("t")?.id).toBe("o1");
  });

  it("focusNextPane with a pane in a hidden view", () => {
    useTabStore.getState().focusNextPane("t");
    expect(tab().views.own.activePaneId).toBe("o2");
    expect(tab().views.v1.activePaneId).toBe("h1");
    useTabStore.getState().focusNextPane("t");
    expect(tab().views.own.activePaneId).toBe("o1");
  });

  it("focusPrevPane with a pane in a hidden view", () => {
    useTabStore.getState().focusPrevPane("t");
    expect(tab().views.own.activePaneId).toBe("o2");
    expect(tab().views.v1.activePaneId).toBe("h1");
  });

  it("splitPane with a pane in a hidden view", () => {
    useTabStore.getState().splitPane("t", "h2", "horizontal", "/other");
    const hidden = tab().views.v1;
    const panes = findAllPanes(hidden.root);
    expect(panes.map((p) => p.id).slice(0, 2)).toEqual(["h1", "h2"]);
    expect(panes).toHaveLength(3);
    expect(hidden.activePaneId).toBe(panes[2].id);
    expect(panes[2].initialCwd).toBe("/other");
    expect(ids(tab().views.own.root)).toEqual(["o1", "o2"]);
    expect(tab().views.own.activePaneId).toBe("o1");
    expect(tab().shownView).toBe("own");
  });

  it("closePane with a pane in a hidden view", async () => {
    useTabStore.getState().closePane("t", "h1");
    expect(ids(tab().views.v1.root)).toEqual(["h2"]);
    expect(tab().views.v1.activePaneId).toBe("h2");
    expect(ids(tab().views.own.root)).toEqual(["o1", "o2"]);
    expect(tab().views.own.activePaneId).toBe("o1");
    await vi.waitFor(() => expect(destroyInstance).toHaveBeenCalledWith("h1", 11));
    // The last pane of a view stays, as the last pane of a tab did.
    useTabStore.getState().closePane("t", "h2");
    expect(ids(tab().views.v1.root)).toEqual(["h2"]);
  });

  it("setPtyId with a pane in a hidden view", async () => {
    useTabStore.getState().setPtyId("h2", 99);
    const stored = findAllPanes(tab().views.v1.root).find((p) => p.id === "h2");
    expect(stored?.ptyId).toBe(99);
    expect(findAllPanes(tab().views.own.root).every((p) => p.ptyId !== 99)).toBe(true);
    // The agent dot sees it.
    expect(tabAgentState(tab(), { 99: "needsYou" })).toBe("needsYou");
    // The kill path sees it.
    useTabStore.getState().closeTab("t");
    await vi.waitFor(() => expect(destroyInstance).toHaveBeenCalledWith("h2", 99));
  });

  it("setActivePaneInTab with a pane in a hidden view", () => {
    useTabStore.getState().setActivePaneInTab("t", "h2");
    expect(tab().views.v1.activePaneId).toBe("h2");
    expect(tab().views.own.activePaneId).toBe("o1");
    useTabStore.getState().setActivePaneInTab("t", "o2");
    expect(tab().views.own.activePaneId).toBe("o2");
    expect(tab().views.v1.activePaneId).toBe("h2");
  });

  it("closeTab with a pane in a hidden view", async () => {
    useTabStore.getState().closeTab("t");
    await vi.waitFor(() => expect(destroyInstance).toHaveBeenCalledTimes(4));
    // Every pane of every view, each with the store's pty id, so a pane with
    // no instance (h1 never shown, h2 with no shell) is still killed.
    expect(destroyInstance.mock.calls).toEqual([["o1", 1], ["o2", 2], ["h1", 11], ["h2", null]]);
    // The closed-tab record is the own view's.
    expect(useTabStore.getState().closedTabs.slice(-1)[0]).toEqual({ name: "Terminal", cwd: "/proj/own", color: undefined });
  });

  it("detachTab with a pane in a hidden view", async () => {
    const detached = useTabStore.getState().detachTab("t");
    expect(detached?.viewOrder).toEqual(["own", "v1"]);
    await vi.waitFor(() => expect(detachInstance).toHaveBeenCalledTimes(4));
    expect(detachInstance.mock.calls.map((c) => c[0])).toEqual(["o1", "o2", "h1", "h2"]);
  });

  it("saveSession and loadSession with a pane in a hidden view", async () => {
    live.set("h1", { buffer: "hidden-buf", cwd: "/other/hidden" });
    live.set("o1", { buffer: "own-buf", cwd: "/proj/own" });
    useTabStore.setState({ tabs: [twoViewTab()], activeTabId: "t" });
    await saveSession();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    // The saved format is unchanged until story 2b: root is the own view's tree.
    expect(saved.tabs[0].activePaneId).toBe("o1");
    expect(saved.tabs[0].root.children.map((c: { pane: { id: string } }) => c.pane.id)).toEqual(["o1", "o2"]);
    expect(saved.tabs[0].root.children[0].pane).toMatchObject({ serializedBuffer: "own-buf", savedCwd: "/proj/own" });
    expect(localStorage.getItem(KEY)).not.toContain("hidden-buf");

    expect(loadSession()).toBe(true);
    const [restored] = useTabStore.getState().tabs;
    expect(restored.viewOrder).toEqual(["own"]);
    expect(restored.shownView).toBe("own");
    expect(findAllPanes(restored.views.own.root).map((p) => p.savedCwd)).toEqual(["/proj/own", undefined]);
  });

  it("tabAgentState with a pane in a hidden view", () => {
    expect(tabAgentState(tab(), { 11: "waiting" })).toBe("waiting");
    expect(tabAgentState(tab(), { 1: "ready", 11: "needsYou" })).toBe("needsYou");
  });

  it("reopenClosedTab with a pane in a hidden view", () => {
    useTabStore.getState().closeTab("t");
    useTabStore.getState().reopenClosedTab();
    const reopened = useTabStore.getState().tabs.slice(-1)[0];
    expect(reopened.viewOrder).toEqual(["own"]);
    const panes = findAllPanes(reopened.views.own.root);
    expect(panes).toHaveLength(1);
    expect(panes[0].initialCwd).toBe("/proj/own");
  });
});

/** The same readers with the hidden view v1 in sight. */
describe("tabStore readers with a hidden view in sight", () => {
  const showHidden = () => useTabStore.setState((s) => ({ tabs: s.tabs.map((t) => (t.id === "t" ? { ...t, shownView: "v1" } : t)) }));
  beforeEach(showHidden);

  it("getActivePane with a pane in a hidden view, shown", () => {
    expect(useTabStore.getState().getActivePane()?.id).toBe("h1");
  });

  it("getActivePtyId with a pane in a hidden view, shown", () => {
    expect(useTabStore.getState().getActivePtyId()).toBe(11);
  });

  it("getTabActivePane with a pane in a hidden view, shown", () => {
    useTabStore.setState({ activeTabId: "other" });
    expect(useTabStore.getState().getTabActivePane("t")?.id).toBe("h1");
  });

  it("focusNextPane with a pane in a hidden view, shown", () => {
    useTabStore.getState().focusNextPane("t");
    expect(tab().views.v1.activePaneId).toBe("h2");
    expect(tab().views.own.activePaneId).toBe("o1");
  });

  it("focusPrevPane with a pane in a hidden view, shown", () => {
    useTabStore.getState().focusPrevPane("t");
    expect(tab().views.v1.activePaneId).toBe("h2");
    expect(tab().views.own.activePaneId).toBe("o1");
  });

  it("closeTab and reopenClosedTab with a pane in a hidden view, shown", () => {
    useTabStore.getState().closeTab("t");
    expect(useTabStore.getState().closedTabs.slice(-1)[0]).toEqual({ name: "Terminal", cwd: "/proj/own", color: undefined });
    useTabStore.getState().reopenClosedTab();
    const reopened = useTabStore.getState().tabs.slice(-1)[0];
    expect(findAllPanes(reopened.views.own.root).map((p) => p.initialCwd)).toEqual(["/proj/own"]);
  });

  it("saveSession with a pane in a hidden view, shown", async () => {
    await saveSession();
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    const t = saved.tabs.find((x: { id: string }) => x.id === "t");
    expect(t.activePaneId).toBe("o1");
    expect(t.root.children.map((c: { pane: { id: string; savedCwd?: string } }) => [c.pane.id, c.pane.savedCwd])).toEqual([["o1", "/proj/own"], ["o2", undefined]]);
  });
});

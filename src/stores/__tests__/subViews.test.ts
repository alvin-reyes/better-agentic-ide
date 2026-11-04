import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: () => null,
  getPtyCwd: async () => null,
  destroyInstance: vi.fn(),
  detachInstance: vi.fn(),
}));

import { useTabStore, findAllPanes, shownView, ownViewOnly, type Tab, type PaneNode } from "../tabStore";

const leaf = (id: string, ptyId: number | null = null): PaneNode => ({ type: "pane", pane: { id, ptyId } });
const terminalTab = (id: string, paneId: string): Tab => ({ id, name: id, ...ownViewOnly(leaf(paneId, 1), paneId) });
const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;

beforeEach(() => {
  useTabStore.setState({ tabs: [terminalTab("a", "a1"), terminalTab("b", "b1")], activeTabId: "a", closedTabs: [] });
});

describe("addView", () => {
  it("addView in the background keeps the selection", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const id = useTabStore.getState().addView("a", { name: "tests", cwd: "/work/tests" });

    const t = tab("a");
    expect(t.viewOrder).toEqual(["own", id]);
    expect(t.views[id!].name).toBe("tests");
    expect(t.shownView).toBe("own");
    expect(useTabStore.getState().activeTabId).toBe("a");
    expect(document.activeElement).toBe(input);
    // Its one pane starts in the folder given, with no PTY yet.
    const panes = findAllPanes(t.views[id!].root);
    expect(panes).toHaveLength(1);
    expect(panes[0]).toMatchObject({ ptyId: null, initialCwd: "/work/tests" });
    expect(t.views[id!].activePaneId).toBe(panes[0].id);
    input.remove();
  });

  it("addView with focus shows the sub-terminal and activates its tab", () => {
    const id = useTabStore.getState().addView("b", { name: "dev server", cwd: "/work/api", focus: true });

    expect(tab("b").shownView).toBe(id);
    expect(useTabStore.getState().activeTabId).toBe("b");
    expect(shownView(tab("b")).name).toBe("dev server");
    // The other tab is untouched.
    expect(tab("a").viewOrder).toEqual(["own"]);
  });

  it("addView stores spawnedBy and defaults it to null", () => {
    const first = useTabStore.getState().addView("a", { name: "x", cwd: null });
    const second = useTabStore.getState().addView("a", { name: "y", cwd: null, spawnedBy: "own" });

    expect(tab("a").views[first!].spawnedBy).toBeNull();
    expect(tab("a").views[second!].spawnedBy).toBe("own");
    expect(tab("a").viewOrder).toEqual(["own", first, second]);
  });
});

describe("switching views", () => {
  it("a tab remembers the view it last showed", () => {
    const { addView, showView, setActiveTab } = useTabStore.getState();
    const id = addView("a", { name: "tests", cwd: null })!;
    showView("a", id);
    expect(tab("a").shownView).toBe(id);

    setActiveTab("b");
    setActiveTab("a");

    expect(tab("a").shownView).toBe(id);
    expect(useTabStore.getState().getActivePane()?.id).toBe(tab("a").views[id].activePaneId);
  });

  it("each view keeps its own active pane", () => {
    const { addView, showView, splitPane, setActivePaneInTab } = useTabStore.getState();
    const id = addView("a", { name: "tests", cwd: null })!;
    const subPane = tab("a").views[id].activePaneId;
    splitPane("a", subPane, "horizontal");
    const [, second] = findAllPanes(tab("a").views[id].root);
    expect(tab("a").views[id].activePaneId).toBe(second.id);
    splitPane("a", "a1", "vertical");
    setActivePaneInTab("a", "a1");

    showView("a", id);
    expect(useTabStore.getState().getActivePane()?.id).toBe(second.id);
    showView("a", "own");
    expect(useTabStore.getState().getActivePane()?.id).toBe("a1");
    showView("a", id);
    expect(useTabStore.getState().getActivePane()?.id).toBe(second.id);
  });
});

describe("closeView", () => {
  it("closing the last sub-terminal returns the view to own", () => {
    const { addView, closeView } = useTabStore.getState();
    const id = addView("a", { name: "tests", cwd: null, focus: true })!;
    expect(tab("a").shownView).toBe(id);

    closeView("a", id);

    const t = tab("a");
    expect(t.viewOrder).toEqual(["own"]);
    expect(Object.keys(t.views)).toEqual(["own"]);
    expect(t.shownView).toBe("own");
    expect(useTabStore.getState().getActivePane()?.id).toBe("a1");
    // The own view never closes this way.
    closeView("a", "own");
    expect(tab("a").viewOrder).toEqual(["own"]);
  });

  it("closeView kills a pane with no instance through its ptyId", async () => {
    const { destroyInstance } = await import("../../hooks/useTerminal");
    const destroy = vi.mocked(destroyInstance);
    destroy.mockClear();
    const { addView, splitPane, setPtyId, closeView } = useTabStore.getState();
    const id = addView("a", { name: "dev", cwd: null })!;
    const first = tab("a").views[id].activePaneId;
    splitPane("a", first, "vertical");
    const [p1, p2] = findAllPanes(tab("a").views[id].root);
    // A shell started for one pane while the view was hidden: no instance, only the store's id.
    setPtyId(p1.id, 41);

    closeView("a", id);

    await vi.waitFor(() => expect(destroy).toHaveBeenCalledTimes(2));
    expect(destroy).toHaveBeenCalledWith(p1.id, 41);
    expect(destroy).toHaveBeenCalledWith(p2.id, null);
    // Nothing of the own view is killed.
    expect(destroy).not.toHaveBeenCalledWith("a1", expect.anything());
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: () => null,
  getPtyCwd: async () => null,
  destroyInstance: () => {},
}));

import { useTabStore, saveSession, loadSession, findAllPanes } from "../tabStore";

const KEY = "ade-session";
const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;

beforeEach(() => localStorage.clear());

// Only the first pane of a newly opened tab shows the launch banner.
describe("Pane.isNewTab", () => {
  it("marks the first pane of a tab opened with addTab", () => {
    const id = useTabStore.getState().addTab("x", "/tmp");
    expect(findAllPanes(tab(id).root)[0].isNewTab).toBe(true);
  });

  it("never marks a pane made by a split", () => {
    const id = useTabStore.getState().addTab();
    const first = findAllPanes(tab(id).root)[0];
    useTabStore.getState().splitPane(id, first.id, "horizontal");
    const panes = findAllPanes(tab(id).root);
    expect(panes).toHaveLength(2);
    expect(panes.filter((p) => p.id !== first.id).every((p) => !p.isNewTab)).toBe(true);
  });

  it("never marks a restored pane, even one saved without scrollback", () => {
    localStorage.setItem(KEY, JSON.stringify({
      tabs: [{ id: "t1", name: "one", root: { type: "pane", pane: { id: "a", isNewTab: true } }, activePaneId: "a" }],
      activeTabId: "t1",
    }));
    expect(loadSession()).toBe(true);
    const panes = useTabStore.getState().tabs.flatMap((t) => findAllPanes(t.root));
    expect(panes.length).toBeGreaterThan(0);
    expect(panes.every((p) => !p.isNewTab)).toBe(true);
  });

  it("is not saved with the session", async () => {
    useTabStore.getState().addTab();
    await saveSession();
    expect(localStorage.getItem(KEY)).not.toContain("isNewTab");
  });
});

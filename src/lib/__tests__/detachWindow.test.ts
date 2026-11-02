import { describe, it, expect, vi, beforeEach } from "vitest";

const windows: { label: string; opts: { url: string } }[] = [];
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class {
    constructor(label: string, opts: { url: string }) {
      windows.push({ label, opts });
    }
    once() {}
  },
}));
vi.mock("../../hooks/useTerminal", () => ({ detachInstance: vi.fn(), destroyInstance: vi.fn() }));

import { detachTabToWindow, tabFromDetached } from "../detachWindow";
import { useTabStore, ownViewOnly } from "../../stores/tabStore";

const tree = {
  type: "split" as const,
  direction: "vertical" as const,
  children: [
    { type: "pane" as const, pane: { id: "a", ptyId: 7 } },
    { type: "pane" as const, pane: { id: "b", ptyId: 8 } },
  ],
};

beforeEach(() => {
  windows.length = 0;
});

describe("detachTabToWindow", () => {
  it("sends the root and active pane of a one-view tab, as before", async () => {
    useTabStore.setState({
      tabs: [
        { id: "keep", name: "keep", ...ownViewOnly({ type: "pane", pane: { id: "k", ptyId: 1 } }, "k") },
        { id: "go", name: "go", ...ownViewOnly(tree, "b") },
      ],
      activeTabId: "go",
    });
    await detachTabToWindow("go");
    expect(windows).toHaveLength(1);
    const payload = decodeURIComponent(windows[0].opts.url.replace("index.html?detached=", ""));
    expect(payload).toBe(JSON.stringify({ id: "go", name: "go", root: tree, activePaneId: "b" }));
  });

  it("the detached window holds the payload as a tab with one own view", () => {
    const t = tabFromDetached({ id: "go", name: "go", root: tree, activePaneId: "b" });
    expect(t.viewOrder).toEqual(["own"]);
    expect(t.shownView).toBe("own");
    expect(t.views.own).toEqual({ id: "own", name: null, spawnedBy: null, root: tree, activePaneId: "b" });
  });
});

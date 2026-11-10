import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
  Channel: class { onmessage: unknown = null; },
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn(async () => {}), listen: vi.fn(async () => () => {}) }));

// The terminal hook loads xterm, which probes a canvas jsdom does not have.
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null) }));

// jsdom's navigator is not a Mac: the modifier here is ⌘, as on macOS.
vi.mock("../../lib/shortcuts", async (original) => ({ ...(await original<typeof import("../../lib/shortcuts")>()), IS_MAC: true }));

import FileBrowser from "../FileBrowser";
import { useFileBrowserStore, type TreeNode } from "../../stores/fileBrowserStore";
import { useTabStore } from "../../stores/tabStore";
import { handlePreviewOpen } from "../../lib/openFile";

const node = (name: string, isDir: boolean): TreeNode => ({
  entry: { name, path: `/r/${name}`, isDir, size: 0, extension: isDir ? null : name.split(".").pop() ?? null, isHidden: false },
  children: null,
  isExpanded: false,
  isLoading: false,
});

describe("opening files from the file browser", () => {
  let previews: unknown[];
  let panelOpened: number;
  // What App does with "open-preview": the file goes on the active tab.
  const onPreview = (e: Event) => {
    previews.push((e as CustomEvent).detail);
    const { activeTabId, setPreviewPath } = useTabStore.getState();
    handlePreviewOpen((e as CustomEvent).detail, { activeTabId, setPreviewPath, openPanel: () => { panelOpened++; } });
  };
  const editorPaths = () => useTabStore.getState().tabs.filter((t) => t.type === "editor").map((t) => t.editorFilePath);
  const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id);

  beforeEach(() => {
    previews = [];
    panelOpened = 0;
    useTabStore.setState({ tabs: [], activeTabId: "" });
    useTabStore.getState().addTab();
    useFileBrowserStore.setState({ rootPath: "/r", tree: [node("src", true), node("a.ts", false), node("b.ts", false)] });
    window.addEventListener("open-preview", onPreview);
  });
  afterEach(() => {
    window.removeEventListener("open-preview", onPreview);
    cleanup();
  });

  it("a file opens in the panel, modifier-click in a tab", () => {
    const expandNode = vi.fn(async () => {});
    useFileBrowserStore.setState({ expandNode });
    render(<FileBrowser />);
    const terminalTab = useTabStore.getState().activeTabId;
    const tabsBefore = useTabStore.getState().tabs.length;

    // A plain click: the panel, no tab.
    fireEvent.click(screen.getByText("a.ts"));
    expect(previews).toEqual([{ path: "/r/a.ts" }]);
    expect(panelOpened).toBe(1);
    expect(useTabStore.getState().tabs.length).toBe(tabsBefore);
    expect(useTabStore.getState().activeTabId).toBe(terminalTab);
    expect(tab(terminalTab)?.previewPath).toBe("/r/a.ts");

    // Ctrl is not the modifier on macOS: still the panel.
    fireEvent.click(screen.getByText("a.ts"), { ctrlKey: true });
    expect(previews).toHaveLength(2);
    expect(editorPaths()).toEqual([]);

    // A folder still expands, and opens nothing, with or without the modifier.
    fireEvent.click(screen.getByText("src"));
    expect(expandNode.mock.calls).toEqual([["/r/src"]]);
    fireEvent.click(screen.getByText("src"), { metaKey: true });
    expect(expandNode).toHaveBeenCalledTimes(2);
    expect(previews).toHaveLength(2);
    expect(editorPaths()).toEqual([]);

    // ⌘-click: the tab, and nothing for the panel.
    fireEvent.click(screen.getByText("a.ts"), { metaKey: true });
    expect(editorPaths()).toEqual(["/r/a.ts"]);
    expect(previews).toHaveLength(2);
    const editorTab = useTabStore.getState().activeTabId;
    expect(tab(editorTab)?.editorFilePath).toBe("/r/a.ts");

    // With that editor tab active, a plain click lands in its panel.
    fireEvent.click(screen.getByText("b.ts"));
    expect(previews[2]).toEqual({ path: "/r/b.ts" });
    expect(tab(editorTab)?.previewPath).toBe("/r/b.ts");
    expect(tab(terminalTab)?.previewPath).toBe("/r/a.ts");
    expect(editorPaths()).toEqual(["/r/a.ts"]);
  });
});

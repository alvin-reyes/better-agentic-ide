import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * With a sub-terminal in another folder in sight, the tab's project actions
 * and the file browser still follow the tab's own terminal. Each test asserts
 * the folder that is passed or shown.
 */
const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  applies: [] as Record<string, unknown>[],
  listed: [] as string[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class { onmessage: unknown = null; },
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return String(args.path).replace(/\/src$/, "");
      case "bmad_switch_pending":
        return [];
      case "project_setup_status":
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      case "list_directory":
        tauri.listed.push(String(args.path));
        return [];
      case "watch_directory":
        return 1;
      case "unwatch_directory":
        return null;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// The own view's pane is in /code/shop/src; the sub-terminal in sight is in /elsewhere/src.
const folders = vi.hoisted(() => ({ byPane: {} as Record<string, string> }));
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async (paneId: string) => folders.byPane[paneId] ?? null) }));

Element.prototype.scrollIntoView = vi.fn();

import CommandPalette from "../CommandPalette";
import FileBrowser from "../FileBrowser";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests } from "../../lib/methodologyPrompt";
import { useSettingsStore } from "../../stores/settingsStore";
import { useFileBrowserStore } from "../../stores/fileBrowserStore";
import { useTabStore, type Tab, type PaneNode } from "../../stores/tabStore";

const leaf = (id: string, ptyId: number): PaneNode => ({ type: "pane", pane: { id, ptyId } });
const tabWithSubInSight: Tab = {
  id: "t",
  name: "Terminal",
  views: {
    own: { id: "own", name: null, spawnedBy: null, root: leaf("own-pane", 1), activePaneId: "own-pane", restored: false },
    "view-1": { id: "view-1", name: "dev server", spawnedBy: null, root: leaf("sub-pane", 2), activePaneId: "sub-pane", restored: false },
  },
  viewOrder: ["own", "view-1"],
  shownView: "view-1",
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  tauri.byDir = {};
  tauri.applies.length = 0;
  tauri.listed.length = 0;
  folders.byPane = { "own-pane": "/code/shop/src", "sub-pane": "/elsewhere/src" };
  __resetPromptForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
  useTabStore.setState({ tabs: [tabWithSubInSight], activeTabId: "t", closedTabs: [] });
});

const renderPalette = () =>
  render(
    <>
      <CommandPalette onClose={vi.fn()} onToggleScratchpad={vi.fn()} onOpenAgentPicker={vi.fn()} />
      <MethodologyPromptHost />
    </>,
  );

describe("call sites follow the own view", () => {
  it("Set up project and the BMAD switch use the own folder", async () => {
    // The two folders are on different versions, so either reading shows.
    tauri.byDir = { "/code/shop": "v4", "/elsewhere": "v6" };
    renderPalette();

    // The switch offered is the own project's: v4 → v6.
    expect(await screen.findByText("BMAD: Switch to v6…")).toBeTruthy();
    expect(screen.queryByText("BMAD: Switch to v4…")).toBeNull();

    fireEvent.click(screen.getByText("Project: Set up BMAD, methodology and agents"));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4" });
  });

  it("FileBrowser shows the own folder", async () => {
    useFileBrowserStore.setState({ rootPath: null, tree: [] });
    render(<FileBrowser />);

    await waitFor(() => expect(useFileBrowserStore.getState().rootPath).toBe("/code/shop/src"));
    expect(screen.getByTitle("/code/shop/src")).toBeTruthy();
    expect(screen.queryByTitle("/elsewhere/src")).toBeNull();
    expect(tauri.listed).toContain("/code/shop/src");
    expect(tauri.listed).not.toContain("/elsewhere/src");
  });
});

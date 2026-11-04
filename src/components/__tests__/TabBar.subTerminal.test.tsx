import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), Channel: class { onmessage: unknown = null; } }));
vi.mock("../../hooks/useTerminal", () => ({ isPaneActive: () => false, focusActiveTerminal: vi.fn(() => false) }));

Element.prototype.scrollIntoView = vi.fn();

import TabBar from "../TabBar";
import SubTerminalStrip from "../SubTerminalStrip";
import { useTabStore, ownViewOnly, findAllPanes, shownView, type Tab, type PaneNode } from "../../stores/tabStore";
import { usePaneCwd } from "../../stores/paneMetaStore";

const leaf = (id: string): PaneNode => ({ type: "pane", pane: { id, ptyId: 1 } });
const makeTab = (id: string, paneId: string, extra: Partial<Tab> = {}): Tab => ({ id, name: id, ...ownViewOnly(leaf(paneId), paneId), ...extra });
const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;
const openMenu = (tabId: string) => fireEvent.contextMenu(document.querySelector(`[data-tab-id="${tabId}"]`)!);
const menuItem = (label: string) => screen.queryByRole("button", { name: label });

beforeEach(() => {
  usePaneCwd.setState({ cwds: { a1: "/code/api", b1: "/code/web" }, projects: {}, attention: {} });
  useTabStore.setState({ tabs: [makeTab("a", "a1"), makeTab("b", "b1")], activeTabId: "a", closedTabs: [] });
});
afterEach(cleanup);

describe("New Sub-terminal", () => {
  it("New Sub-terminal adds a Terminal in the own folder and shows it", () => {
    // A sub-terminal in another folder is in sight: the new one still opens in the tab's own folder.
    const other = useTabStore.getState().addView("a", { name: "dev server", cwd: "/elsewhere", focus: true })!;
    expect(tab("a").shownView).toBe(other);
    render(<TabBar />);

    openMenu("a");
    fireEvent.click(menuItem("New Sub-terminal")!);

    const t = tab("a");
    expect(t.viewOrder).toHaveLength(3);
    const id = t.viewOrder[2];
    expect(t.shownView).toBe(id);
    expect(shownView(t).name).toBe("Terminal");
    expect(shownView(t).spawnedBy).toBeNull();
    expect(findAllPanes(shownView(t).root).map((p) => p.initialCwd)).toEqual(["/code/api"]);
    expect(useTabStore.getState().activeTabId).toBe("a");
  });

  it("New Sub-terminal activates its tab", () => {
    render(<TabBar />);
    openMenu("b"); // not the active tab

    fireEvent.click(menuItem("New Sub-terminal")!);

    expect(useTabStore.getState().activeTabId).toBe("b");
    const t = tab("b");
    expect(t.shownView).toBe(t.viewOrder[1]);
    expect(findAllPanes(shownView(t).root)[0].initialCwd).toBe("/code/web");
    expect(tab("a").viewOrder).toEqual(["own"]);
  });

  it("New Sub-terminal is only in terminal tabs' menus", () => {
    const others: Tab[] = [
      makeTab("editor", "e1", { type: "editor", editorFilePath: "/x.ts" }),
      makeTab("browser", "w1", { type: "browser", browserUrl: "http://localhost" }),
      makeTab("fleet", "f1", { type: "fleet" }),
      makeTab("orch", "o1", { type: "orchestrator", orchestratorSessionId: "s" }),
      makeTab("contracts", "c1", { type: "contracts", contractsRoot: "/c" }),
      makeTab("typed", "t1", { type: "terminal" }),
    ];
    useTabStore.setState({ tabs: [makeTab("a", "a1"), ...others] });
    render(<TabBar />);

    for (const id of ["editor", "browser", "fleet", "orch", "contracts"]) {
      openMenu(id);
      expect(menuItem("New Sub-terminal"), id).toBeNull();
      expect(menuItem("Rename"), id).not.toBeNull(); // the menu is open
      fireEvent.click(menuItem("Rename")!); // closes it
    }
    for (const id of ["a", "typed"]) {
      openMenu(id);
      expect(menuItem("New Sub-terminal"), id).not.toBeNull();
      fireEvent.click(menuItem("Rename")!);
    }
  });

  it("the strip has no add control", () => {
    useTabStore.getState().addView("a", { name: "tests", cwd: null });
    render(<SubTerminalStrip tabId="a" />);

    const strip = screen.getByRole("tablist");
    expect(strip.querySelectorAll("button")).toHaveLength(0);
    expect(strip.textContent).not.toMatch(/\+/);
    expect(screen.queryByRole("button", { name: /new|add/i })).toBeNull();
  });
});

describe("Move to New Window", () => {
  it("Move to New Window is hidden for a tab with sub-terminals", () => {
    useTabStore.getState().addView("a", { name: "tests", cwd: null });
    render(<TabBar />);
    openMenu("a");
    expect(menuItem("Move to New Window")).toBeNull();
    expect(menuItem("New Sub-terminal")).not.toBeNull();
  });

  it("Move to New Window is present for a tab without", () => {
    useTabStore.getState().addView("a", { name: "tests", cwd: null });
    render(<TabBar />);
    openMenu("b");
    expect(menuItem("Move to New Window")).not.toBeNull();
  });
});

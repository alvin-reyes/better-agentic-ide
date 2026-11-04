import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), Channel: class { onmessage: unknown = null; } }));
// What each pane runs (paneBusy's label), for the badge's running count.
const running = vi.hoisted(() => new Map<string, string>());
vi.mock("../../hooks/useTerminal", () => ({
  isPaneActive: () => false,
  focusActiveTerminal: vi.fn(() => false),
  paneBusy: vi.fn(async (paneId: string) => running.get(paneId) ?? null),
  getTerminalDimensions: () => ({ cols: 80, rows: 24 }),
  destroyInstance: vi.fn(),
}));

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
  running.clear();
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

describe("the count badge", () => {
  const badge = (tabId: string) => document.querySelector<HTMLElement>(`[data-tab-id="${tabId}"] [data-subterm-badge]`);
  /** Let the badge's async recount land. */
  const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  const addSub = (tabId: string, name: string) => {
    let id = "";
    act(() => { id = useTabStore.getState().addView(tabId, { name, cwd: null })!; });
    return id;
  };

  it("the badge shows the count after the label and is hidden at zero", async () => {
    render(<TabBar />);
    expect(badge("a")).toBeNull();

    const one = addSub("a", "tests");
    const two = addSub("a", "dev server");
    await settle();
    expect(badge("a")!.textContent).toBe("▤2");
    expect(badge("b")).toBeNull();
    // Right after the tab's label.
    const label = document.querySelector('[data-tab-id="a"] .truncate')!;
    expect(label.textContent).toBe("a");
    expect(label.nextElementSibling).toBe(badge("a"));

    act(() => useTabStore.getState().closeView("a", one));
    await settle();
    expect(badge("a")!.textContent).toBe("▤1");
    act(() => useTabStore.getState().closeView("a", two));
    await settle();
    expect(badge("a")).toBeNull();
  });

  it("the badge title and aria-label carry the running count", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      render(<TabBar />);
      const dev = addSub("a", "dev server");
      const devPane = tab("a").views[dev].activePaneId;
      act(() => useTabStore.getState().setPtyId(devPane, 7));
      running.set(devPane, "node");
      addSub("a", "tests"); // the add recounts: dev server is running
      await settle();
      expect(badge("a")!.getAttribute("title")).toBe("2 sub-terminals: 1 running");
      expect(badge("a")!.getAttribute("aria-label")).toBe("2 sub-terminals: 1 running");

      // Not polled: a change alone, however long, does not show.
      running.delete(devPane);
      act(() => { vi.advanceTimersByTime(10_000); });
      await settle();
      expect(badge("a")!.getAttribute("title")).toBe("2 sub-terminals: 1 running");

      // Opening the tab's menu recounts.
      openMenu("a");
      await settle();
      expect(badge("a")!.getAttribute("title")).toBe("2 sub-terminals: 0 running");
      fireEvent.click(menuItem("Rename")!);

      // One sub-terminal: the singular.
      const tests = tab("a").viewOrder[2];
      act(() => useTabStore.getState().closeView("a", tests));
      await settle();
      expect(badge("a")!.getAttribute("aria-label")).toBe("1 sub-terminal: 0 running");
      // The badge is neutral: it has no colour of its own for running.
      running.set(devPane, "node");
      openMenu("a");
      await settle();
      expect(badge("a")!.getAttribute("title")).toBe("1 sub-terminal: 1 running");
      expect(badge("a")!.style.color).toBe("var(--text-secondary)");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the badge is absent on non-terminal tabs", async () => {
    // An editor tab can't get a sub-terminal; one built with a second view by hand still shows no badge.
    const editor = makeTab("editor", "e1", { type: "editor", editorFilePath: "/x.ts" });
    const forced: Tab = {
      ...editor,
      views: { ...editor.views, v: { id: "v", name: "x", spawnedBy: null, root: leaf("e2"), activePaneId: "e2", restored: false } },
      viewOrder: ["own", "v"],
    };
    useTabStore.setState({
      tabs: [makeTab("a", "a1"), forced, makeTab("browser", "w1", { type: "browser", browserUrl: "http://localhost" })],
    });
    expect(useTabStore.getState().addView("browser", { name: "x", cwd: null })).toBeNull();
    render(<TabBar />);
    addSub("a", "tests");
    await settle();

    expect(badge("a")).not.toBeNull();
    expect(badge("editor")).toBeNull();
    expect(badge("browser")).toBeNull();
  });
});

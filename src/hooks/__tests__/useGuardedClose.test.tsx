import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * What runs in each pane (paneBusy's label, by pane id), and which panes have
 * a terminal instance. paneBusy itself is pinned by the busy-check tests; here
 * it only says what each pane runs.
 */
const t = vi.hoisted(() => ({
  running: new Map<string, string>(),
  instances: new Set<string>(),
}));
vi.mock("../useTerminal", () => ({
  paneBusy: vi.fn(async (paneId: string) => t.running.get(paneId) ?? null),
  getTerminalDimensions: (paneId: string) => (t.instances.has(paneId) ? { cols: 80, rows: 24 } : null),
  destroyInstance: vi.fn(),
  detachInstance: vi.fn(),
  serializeTerminalBuffer: () => null,
  getPtyCwd: vi.fn(async () => null),
  focusActiveTerminal: vi.fn(() => false),
}));

import ConfirmDialog from "../../components/ConfirmDialog";
import { useGuardedClose } from "../useGuardedClose";
import { paneBusy, destroyInstance } from "../useTerminal";
import { useTabStore, ownViewOnly, findAllPanes, loadSession, type Tab, type PaneNode } from "../../stores/tabStore";
import { usePaneCwd } from "../../stores/paneMetaStore";

const leaf = (id: string, ptyId: number | null = 1): PaneNode => ({ type: "pane", pane: { id, ptyId } });
const terminalTab = (id: string, name: string, paneId: string): Tab => ({ id, name, ...ownViewOnly(leaf(paneId), paneId) });
const tab = (id: string) => useTabStore.getState().tabs.find((x) => x.id === id);
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

let api: ReturnType<typeof useGuardedClose>;
/** App's part in closing: the guarded close and its dialog, confirm label included. */
function Host() {
  api = useGuardedClose();
  const { confirmDialog, setConfirmDialog } = api;
  return confirmDialog ? (
    <ConfirmDialog
      title={confirmDialog.title}
      message={confirmDialog.message}
      confirmLabel={confirmDialog.confirmLabel}
      onConfirm={confirmDialog.onConfirm}
      onCancel={() => setConfirmDialog(null)}
    />
  ) : null;
}

/** A sub-terminal with one pane that has a shell (ptyId) and an instance. */
function addSub(tabId: string, name: string, opts: { focus?: boolean } = {}): { viewId: string; paneId: string } {
  let viewId = "";
  act(() => { viewId = useTabStore.getState().addView(tabId, { name, cwd: null, focus: opts.focus })!; });
  const paneId = tab(tabId)!.views[viewId].activePaneId;
  act(() => useTabStore.getState().setPtyId(paneId, 50));
  t.instances.add(paneId);
  return { viewId, paneId };
}

/** Whether the confirm dialog is up (it always has a Cancel button). */
const dialogOpen = () => screen.queryByRole("button", { name: "Cancel" }) !== null;

beforeEach(() => {
  t.running.clear();
  t.instances = new Set(["a1", "b1", "c1"]);
  vi.mocked(paneBusy).mockClear();
  vi.mocked(destroyInstance).mockClear();
  usePaneCwd.setState({ cwds: { a1: "/code/api" } });
  useTabStore.setState({
    tabs: [terminalTab("a", "api", "a1"), terminalTab("b", "web", "b1"), terminalTab("c", "docs", "c1")],
    activeTabId: "a",
    closedTabs: [],
  });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("closing a sub-terminal", () => {
  it("requestCloseView asks when a pane of the view is running", async () => {
    const { viewId, paneId } = addSub("a", "dev server");
    // A split: the second pane runs node, the first is at its prompt.
    act(() => useTabStore.getState().splitPane("a", paneId, "vertical"));
    const second = findAllPanes(tab("a")!.views[viewId].root)[1];
    act(() => useTabStore.getState().setPtyId(second.id, 51));
    t.instances.add(second.id);
    t.running.set(second.id, "node");
    render(<Host />);

    await act(async () => { await api.requestCloseView("a", viewId); });

    expect(screen.getByText("Close “dev server”?")).toBeTruthy();
    expect(screen.getByText("It is running a program (node). Closing ends it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close Anyway" })).toBeNull();
    expect(tab("a")!.views[viewId]).toBeDefined();

    // Cancel keeps it; Close ends it.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(tab("a")!.views[viewId]).toBeDefined();
    await act(async () => { await api.requestCloseView("a", viewId); });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(tab("a")!.views[viewId]).toBeUndefined();
    expect(screen.queryByText("Close “dev server”?")).toBeNull();
  });

  it("requestCloseView names the first busy pane's program", async () => {
    const { viewId, paneId } = addSub("a", "tests");
    act(() => useTabStore.getState().splitPane("a", paneId, "vertical"));
    const second = findAllPanes(tab("a")!.views[viewId].root)[1];
    act(() => useTabStore.getState().setPtyId(second.id, 51));
    t.instances.add(second.id);
    t.running.set(paneId, "vitest");
    t.running.set(second.id, "node");
    render(<Host />);

    await act(async () => { await api.requestCloseView("a", viewId); });

    expect(screen.getByText("It is running a program (vitest). Closing ends it.")).toBeTruthy();
  });

  it("requestCloseView closes an idle view at once", async () => {
    const { viewId, paneId } = addSub("a", "tests");
    render(<Host />);

    await act(async () => { await api.requestCloseView("a", viewId); });

    expect(dialogOpen()).toBe(false);
    expect(tab("a")!.viewOrder).toEqual(["own"]);
    await vi.waitFor(() => expect(destroyInstance).toHaveBeenCalledWith(paneId, 50));

    // The strip's × and Delete reach it by the request-close-view event.
    const other = addSub("a", "dev");
    act(() => { window.dispatchEvent(new CustomEvent("request-close-view", { detail: { tabId: "a", viewId: other.viewId } })); });
    await flush();
    expect(tab("a")!.viewOrder).toEqual(["own"]);
  });

  it("closing the shown sub-terminal shows the entry on its left", async () => {
    const one = addSub("a", "one");
    const two = addSub("a", "two");
    const three = addSub("a", "three");
    render(<Host />);

    act(() => useTabStore.getState().showView("a", two.viewId));
    await act(async () => { await api.requestCloseView("a", two.viewId); });
    expect(tab("a")!.shownView).toBe(one.viewId);

    // Closing one not in sight leaves the selection alone.
    await act(async () => { await api.requestCloseView("a", three.viewId); });
    expect(tab("a")!.shownView).toBe(one.viewId);

    // The first sub-terminal's left is the tab's own view.
    await act(async () => { await api.requestCloseView("a", one.viewId); });
    expect(tab("a")!.shownView).toBe("own");
    expect(tab("a")!.viewOrder).toEqual(["own"]);
  });
});

describe("⌘⇧W on a last pane", () => {
  it("requestClosePane on a sub-terminal's last pane closes the view", async () => {
    const { viewId, paneId } = addSub("a", "dev server", { focus: true });
    t.running.set(paneId, "node");
    render(<Host />);

    await act(async () => { await api.requestClosePane("a", paneId); });

    // The sub-terminal's confirm, not the pane's.
    expect(screen.getByText("Close “dev server”?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(tab("a")!.views[viewId]).toBeUndefined();
    expect(tab("a")!.shownView).toBe("own");
    await vi.waitFor(() => expect(destroyInstance).toHaveBeenCalledWith(paneId, 50));

    // Idle: at once.
    const idle = addSub("a", "tests");
    await act(async () => { await api.requestClosePane("a", idle.paneId); });
    expect(tab("a")!.viewOrder).toEqual(["own"]);
  });

  it("requestClosePane on the own view's last pane does nothing", async () => {
    addSub("a", "dev server");
    t.running.set("a1", "node");
    render(<Host />);
    const before = useTabStore.getState().tabs;

    await act(async () => { await api.requestClosePane("a", "a1"); });
    if (dialogOpen()) fireEvent.click(screen.getByRole("button", { name: /Close/ }));

    expect(tab("a")!.viewOrder).toHaveLength(2);
    expect(findAllPanes(tab("a")!.views.own.root).map((p) => p.id)).toEqual(["a1"]);
    expect(useTabStore.getState().tabs).toBe(before);
    expect(destroyInstance).not.toHaveBeenCalled();
  });
});

describe("closing a tab", () => {
  it("a tab without sub-terminals keeps today's dialog", async () => {
    t.running.set("a1", "claude");
    render(<Host />);

    await act(async () => { await api.requestCloseTab("a"); });

    expect(screen.getByText("Active process running")).toBeTruthy();
    expect(screen.getByText("This tab has a live claude session. Closing it will terminate the process. Are you sure?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close Anyway" }));
    expect(tab("a")).toBeUndefined();
  });

  it("closing a tab asks when any of its sub-terminals is running, with the UX copy", async () => {
    const dev = addSub("a", "dev server");
    addSub("a", "idle one");
    const agent = addSub("a", "claude: auth");
    t.running.set(dev.paneId, "node");
    t.running.set(agent.paneId, "claude");
    render(<Host />);

    await act(async () => { await api.requestCloseTab("a"); });

    expect(screen.getByText("Close “api” and its 3 sub-terminals?")).toBeTruthy();
    expect(screen.getByText("2 are running a program (node, claude). Closing ends them.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close Anyway" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close all" }));
    expect(tab("a")).toBeUndefined();

    // One sub-terminal, one running view (here the tab's own): the singular forms.
    cleanup();
    addSub("b", "tests");
    t.running.set("b1", "vim");
    render(<Host />);
    await act(async () => { await api.requestCloseTab("b"); });
    expect(screen.getByText("Close “web” and its sub-terminal?")).toBeTruthy();
    expect(screen.getByText("1 is running a program (vim). Closing ends it.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close all" })).toBeTruthy();
  });

  it("closing a tab whose sub-terminals are idle asks nothing", async () => {
    const one = addSub("a", "one");
    const two = addSub("a", "two");
    render(<Host />);

    await act(async () => { await api.requestCloseTab("a"); });

    expect(dialogOpen()).toBe(false);
    expect(tab("a")).toBeUndefined();
    // Every pane of every view is killed.
    await vi.waitFor(() => expect(destroyInstance).toHaveBeenCalledTimes(3));
    expect(destroyInstance).toHaveBeenCalledWith(one.paneId, 50);
    expect(destroyInstance).toHaveBeenCalledWith(two.paneId, 50);
  });

  it("Close Others counts a running sub-terminal in one confirmation", async () => {
    const dev = addSub("b", "dev server");
    t.running.set(dev.paneId, "node");
    render(<Host />);

    act(() => { window.dispatchEvent(new CustomEvent("request-close-tabs", { detail: { tabIds: ["b", "c"] } })); });
    await flush();

    expect(screen.getAllByText("Active process running")).toHaveLength(1);
    expect(screen.getByText("Of these 2 tabs, 1 has a live session that will be terminated. Close 2 tabs?")).toBeTruthy();
    expect(tab("b")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Close Anyway" }));
    expect(tab("b")).toBeUndefined();
    expect(tab("c")).toBeUndefined();
  });
});

describe("restored sub-terminals not yet shown", () => {
  it("a session restored with a sub-terminal that is never shown, then the tab closed, asks nothing", async () => {
    localStorage.setItem("ade-session", JSON.stringify({
      tabs: [
        { id: "t1", name: "api", activePaneId: "p1",
          root: { type: "pane", pane: { id: "p1", savedCwd: "/code/api" } },
          subViews: [{ id: "view-9", name: "dev server", activePaneId: "p2",
            root: { type: "pane", pane: { id: "p2", savedCwd: "/code/api/web", serializedBuffer: "$ npm run dev" } } }],
          shownView: "own" },
        { id: "t2", name: "web", activePaneId: "p3", root: { type: "pane", pane: { id: "p3" } } },
      ],
      activeTabId: "t1",
    }));
    expect(loadSession()).toBe(true);
    const [restored] = useTabStore.getState().tabs;
    const [ownPane] = findAllPanes(restored.views.own.root);
    const [subPane] = findAllPanes(restored.views[restored.viewOrder[1]].root);
    // The own view was shown (it has a terminal, idle); the sub-terminal never was.
    t.instances.add(ownPane.id);
    // paneBusy would name a program for the restored pane, if it were asked.
    t.running.set(subPane.id, "node");
    render(<Host />);

    await act(async () => { await api.requestCloseTab(restored.id); });

    expect(dialogOpen()).toBe(false);
    expect(tab(restored.id)).toBeUndefined();
    expect(paneBusy).not.toHaveBeenCalledWith(subPane.id);
  });

  it("a pane with neither instance nor ptyId is not sampled", async () => {
    let viewId = "";
    act(() => { viewId = useTabStore.getState().addView("a", { name: "never shown", cwd: null })!; });
    const paneId = tab("a")!.views[viewId].activePaneId;
    t.running.set(paneId, "node");
    // A pane with a shell but no instance yet is sampled; so is one with an instance and no shell.
    const withPty = addSub("a", "hidden shell");
    t.instances.delete(withPty.paneId);
    let mountedId = "";
    act(() => { mountedId = useTabStore.getState().addView("a", { name: "mounting", cwd: null })!; });
    const mountedPane = tab("a")!.views[mountedId].activePaneId;
    t.instances.add(mountedPane);
    render(<Host />);

    await act(async () => { await api.requestCloseView("a", viewId); });
    expect(paneBusy).not.toHaveBeenCalledWith(paneId);
    expect(dialogOpen()).toBe(false);
    expect(tab("a")!.views[viewId]).toBeUndefined();

    await act(async () => { await api.requestCloseTab("a"); });
    expect(paneBusy).toHaveBeenCalledWith(withPty.paneId);
    expect(paneBusy).toHaveBeenCalledWith(mountedPane);
  });
});

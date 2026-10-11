import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

const disk = vi.hoisted(() => ({
  /** Folders that say what they are on, as project_setup_status reports. */
  bmad: {} as Record<string, "v4" | "v6">,
  /** project_root by path; default "/p". */
  roots: {} as Record<string, string>,
  /** Folders that exist. */
  exists: new Set<string>(),
  /** When set, project_root waits for it: the root is still resolving. */
  rootGate: null as Promise<void> | null,
  /** What bmad_switch_pending answers; `pendingFails` makes it reject. */
  pending: [] as unknown[],
  pendingFails: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "project_root" && disk.rootGate) await disk.rootGate;
    if (cmd === "project_root") return args.path === "/home/u" ? "/home/u" : disk.roots[args.path as string] ?? "/p";
    if (cmd === "project_setup_status") {
      return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: disk.bmad[args.root as string] ?? null };
    }
    if (cmd === "bmad_switch_pending") {
      if (disk.pendingFails) throw new Error("no journal access");
      return disk.pending;
    }
    if (cmd === "path_exists") return disk.exists.has(args.path as string);
    if (cmd === "watch_directory") return 1;
    if (cmd === "project_setup_apply") return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
    if (cmd === "bmad_switch_plan") {
      return { from: "v4", to: args.to, archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [], leftInPlace: [], dirty: null, archiveIgnored: null, blocked: null };
    }
    return null;
  }),
  Channel: class { onmessage: unknown = null; },
}));

const store = vi.hoisted(() => ({ methodology: null as "v4" | "v6" | null }));
vi.mock("../../stores/boardPanelStore", async () => {
  const { create } = await import("zustand");
  const useBoardPanel = create(() => ({
    root: "/p", methodology: store.methodology, board: null, map: null, stageFile: null, error: null, loading: false,
    show: vi.fn(), refresh: vi.fn(async () => {}), scheduleRefresh: vi.fn(),
  }));
  return { useBoardPanel };
});

// The confirm step asks which terminals are open in the project; there are none.
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null), destroyInstance: vi.fn(), detachInstance: vi.fn() }));

const launch = vi.hoisted(() => ({ dispatchAgent: vi.fn(async (_a: unknown): Promise<string | null> => null) }));
vi.mock("../../lib/agentLaunch", () => launch);

const opened = vi.hoisted(() => ({ file: vi.fn() }));
vi.mock("../../lib/openFile", async (original) => ({
  ...(await original<typeof import("../../lib/openFile")>()),
  openFileFromTerminal: opened.file,
}));

import BoardPanel from "../board/BoardPanel";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests, useMethodologyPrompt } from "../../lib/methodologyPrompt";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { beginSwitch } from "../../lib/projectSetup";
import { SWITCH_DONE_EVENT } from "../../lib/bmadSwitch";
import { buildBoard } from "../../stores/stageBoardStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { taskUnsupportedReason } from "../../lib/agentCommand";
import type { V6Map } from "../../lib/v6Map";

beforeEach(() => {
  __resetPromptForTests();
  localStorage.clear();
  disk.bmad = {};
  disk.roots = {};
  disk.exists = new Set();
  disk.rootGate = null;
  disk.pending = [];
  disk.pendingFails = false;
  vi.mocked(invoke).mockClear();
});

const watched = () =>
  vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "watch_directory").map(([, args]) => (args as { dir: string }).dir);
const existsChecks = () => vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "path_exists").length;
const v4Board = () => buildBoard({ config: null, artifactExists: () => false, stories: [], gates: [] });

describe("BoardPanel watching", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("watches only folders that exist, and picks up one created before the next rebuild", async () => {
    disk.exists = new Set(["/p/.bmad-core"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toContain("/p/.bmad-core"));
    expect(watched()).not.toContain("/p/.ade");

    // An agent creates .ade/; the next rebuild produces a new board.
    disk.exists.add("/p/.ade");
    act(() => { useBoardPanel.setState({ board: v4Board() }); });
    await waitFor(() => expect(watched()).toContain("/p/.ade"));
  });

  it("asks the watcher for change notices only, not file contents", async () => {
    disk.exists = new Set(["/p/.ade"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toContain("/p/.ade"));
    const call = vi.mocked(invoke).mock.calls.find(([cmd]) => cmd === "watch_directory")!;
    expect(call[1]).toMatchObject({ dir: "/p/.ade", withContent: false });
  });

  it("does not re-register when a rebuild leaves the existing folders unchanged", async () => {
    disk.exists = new Set(["/p/.bmad-core", "/p/.ade", "/p/docs"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toHaveLength(3));
    act(() => { useBoardPanel.setState({ board: v4Board() }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(watched()).toHaveLength(3);
  });

  it("re-checks a missing folder every 5 s, watches it once it appears and schedules a refresh", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const scheduleRefresh = vi.fn();
    disk.exists = new Set(["/p/.bmad-core", "/p/.ade"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false, scheduleRefresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toContain("/p/.ade"));
    expect(watched()).not.toContain("/p/docs");

    disk.exists.add("/p/docs");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await waitFor(() => expect(watched()).toContain("/p/docs"));
    expect(scheduleRefresh).toHaveBeenCalled();
  });

  it("stops re-checking once the panel closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    disk.exists = new Set(["/p/.bmad-core"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    const { unmount } = render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toContain("/p/.bmad-core"));
    unmount();
    const before = existsChecks();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(existsChecks()).toBe(before);
  });
});

const v6Map = (): V6Map => ({
  outputFolder: "docs/bmad", initiative: { title: "Shop relaunch", folder: "initiative-shop" }, initiativeState: "active",
  docs: { analysis: [], planning: [], implementation: [], validation: [] },
  loose: [], epics: [], tickets: [], backlog: [], unmatchedGates: [], supersededGates: [], problems: [],
});

describe("BoardPanel v6", () => {
  it("shows a v6 project's map, with no stage controls, and watches its output folder", async () => {
    disk.exists = new Set(["/p/docs/bmad"]);
    useBoardPanel.setState({ root: "/p", methodology: "v6", board: null, map: v6Map(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={() => {}} />);
    expect(await screen.findByText("Shop relaunch")).toBeTruthy();
    expect(screen.queryByText(/Track stage|Next →/)).toBeNull();
    await waitFor(() => expect(watched()).toContain("/p/docs/bmad"));
  });
});

describe("BoardPanel", () => {
  it("says so when the pane has no project", () => {
    render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    expect(screen.getByText("No project in this pane")).toBeTruthy();
  });

  it("offers setup for a project with no BMAD, naming the folder it would set up", async () => {
    store.methodology = null;
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false });
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("This project isn't set up for BMAD")).toBeTruthy());
    expect(screen.getByText("/p")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up now" })).toBeTruthy();
  });

  const applies = () =>
    vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "project_setup_apply").map(([, args]) => args as Record<string, unknown>);
  const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
  const renderWithPrompt = () =>
    render(
      <>
        <BoardPanel cwd="/p/src" onClose={vi.fn()} />
        <MethodologyPromptHost />
      </>,
    );

  it("asks which BMAD version before Set up now sets the project up", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    renderWithPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).toBe("Set up p with BMAD v6 (default) or BMAD v4?"));
    expect(applies()).toHaveLength(0);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Set up project" }), { key: "Enter" });
    await waitFor(() => expect(applies()).toHaveLength(1));
    expect(applies()[0]).toMatchObject({ root: "/p", methodology: "v6", full: true });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("cannot be skipped: Escape leaves the question open and sets nothing up", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    renderWithPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 20));
    expect(question()).not.toBeNull();
    expect(applies()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the BMAD project nested below the repository root, as agent launches resolve it", async () => {
    disk.roots = { "/mono/app/src": "/mono", "/mono/app": "/mono" };
    disk.bmad = { "/mono/app": "v4" };
    const show = vi.fn();
    useBoardPanel.setState({ root: null, methodology: null, board: null, error: null, loading: false, show });
    render(<BoardPanel cwd="/mono/app/src" onClose={vi.fn()} />);
    await waitFor(() => expect(show).toHaveBeenCalledWith("/mono/app"));
    expect(show).not.toHaveBeenCalledWith("/mono");
  });

  it("lets go of the project when it closes, cancelling a pending refresh, and shows it again on reopening", async () => {
    const show = vi.fn();
    useBoardPanel.setState({ root: null, methodology: null, board: null, error: null, loading: false, show });
    const first = render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(show).toHaveBeenLastCalledWith("/p"));
    first.unmount();
    expect(show).toHaveBeenLastCalledWith(null);

    show.mockClear();
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(show).toHaveBeenLastCalledWith("/p"));
  });

  it("says Loading, not No project, while the pane's project is still resolving", async () => {
    let release!: () => void;
    disk.rootGate = new Promise<void>((r) => { release = r; });
    useBoardPanel.setState({ root: null, methodology: null, board: null, error: null, loading: false });
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("No project in this pane")).toBeNull();
    await act(async () => { release(); });
  });

  it("says No project once the pane's folder resolves to a home directory", async () => {
    useBoardPanel.setState({ root: null, methodology: null, board: null, error: null, loading: false });
    render(<BoardPanel cwd="/home/u" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("No project in this pane")).toBeTruthy());
    // So there is nothing to click that could set a home folder up.
    expect(screen.queryByRole("button", { name: "Set up now" })).toBeNull();
  });

  it("falls back to the repository root when nothing is set up", async () => {
    disk.roots = { "/mono/app/src": "/mono" };
    const show = vi.fn();
    useBoardPanel.setState({ root: null, methodology: null, board: null, error: null, loading: false, show });
    render(<BoardPanel cwd="/mono/app/src" onClose={vi.fn()} />);
    await waitFor(() => expect(show).toHaveBeenCalledWith("/mono"));
  });

  it("shows a failed methodology check instead of the setup card", async () => {
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, error: "boom", loading: false });
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("boom"));
    expect(screen.queryByRole("button", { name: "Set up now" })).toBeNull();
  });

  it("does not render another project's board while the store catches up", async () => {
    const board = buildBoard({ config: null, artifactExists: () => false, stories: [], gates: [] });
    useBoardPanel.setState({ root: "/other", methodology: "v4", board, error: null, loading: false });
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Loading…")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /approve|dispatch/i })).toBeNull();
  });
});

describe("BoardPanel width", () => {
  const panel = () => screen.getByRole("complementary", { name: "Stage board" });
  const handle = () => screen.getByRole("separator", { name: "Resize stage board" });

  it("opens at 380 px and resizes by dragging its left edge, clamped to 280–720", () => {
    render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    expect(panel().style.width).toBe("380px");

    fireEvent.mouseDown(handle(), { clientX: 1000 });
    fireEvent.mouseMove(document, { clientX: 900 }); // dragged left: wider
    expect(panel().style.width).toBe("480px");
    fireEvent.mouseMove(document, { clientX: 0 });
    expect(panel().style.width).toBe("720px");
    fireEvent.mouseMove(document, { clientX: 2000 });
    expect(panel().style.width).toBe("280px");
    fireEvent.mouseUp(document);

    fireEvent.mouseMove(document, { clientX: 900 }); // released: no effect
    expect(panel().style.width).toBe("280px");
  });

  it("drags from the width on screen when flex has squeezed the panel", () => {
    render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    panel().getBoundingClientRect = () => ({ width: 300 }) as DOMRect; // stored 380, shown 300
    fireEvent.mouseDown(handle(), { clientX: 1000 });
    fireEvent.mouseMove(document, { clientX: 990 });
    expect(panel().style.width).toBe("310px");
    fireEvent.mouseUp(document);
  });

  it("keeps the terminal area from being crushed by the side panels", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    const m = /<div className="overflow-hidden" style=\{\{ minWidth: (\d+), flex: 1 \}\}>/.exec(app);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(320);
  });
});

describe("BoardPanel dispatch", () => {
  const approved = (status: string) =>
    buildBoard({
      config: null,
      artifactExists: () => false,
      stories: [{ file: "docs/stories/1.2.x.md", markdown: `# Story 1.2: T\n\n## Status\n\n${status}\n` }],
      gates: [],
    });
  const rowEl = () => document.querySelector('[data-row="1.2"]') as HTMLElement;

  it("shows a row as Dispatched once its dispatch succeeds, until its state changes", async () => {
    launch.dispatchAgent.mockClear();
    disk.roots = { "/dp": "/dp" };
    useBoardPanel.setState({ root: "/dp", methodology: "v4", board: approved("Approved"), error: null, loading: false });
    render(<BoardPanel cwd="/dp" onClose={vi.fn()} />);
    await waitFor(() => expect(rowEl().querySelector("button[data-action=dispatch]")).not.toBeNull());
    fireEvent.click(rowEl().querySelector("button[data-action=dispatch]")!);
    await waitFor(() => expect(rowEl().querySelector("button[data-action=dispatched]")).not.toBeNull());
    expect((rowEl().querySelector("button[data-action=dispatched]") as HTMLButtonElement).disabled).toBe(true);
    expect(rowEl().querySelector("button[data-action=dispatch]")).toBeNull();
    expect(launch.dispatchAgent).toHaveBeenCalledTimes(1);

    // The agent moves the story on: Dispatch comes back for the new state.
    act(() => { useBoardPanel.setState({ board: approved("InProgress") }); });
    await waitFor(() => expect(rowEl().querySelector("button[data-action=dispatch]")).not.toBeNull());
  });

  it.each(["ollama", "codex"] as const)("disables Dispatch when the default provider is %s", async (provider) => {
    useSettingsStore.setState({ defaultProvider: provider });
    try {
      disk.roots = { "/dr": "/dr" };
      useBoardPanel.setState({ root: "/dr", methodology: "v4", board: approved("Approved"), error: null, loading: false });
      render(<BoardPanel cwd="/dr" onClose={vi.fn()} />);
      await waitFor(() => expect(rowEl().querySelector("button[data-action=dispatch]")).not.toBeNull());
      const btn = rowEl().querySelector("button[data-action=dispatch]") as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.title).toBe(taskUnsupportedReason(provider));
    } finally {
      useSettingsStore.setState({ defaultProvider: "claude" });
    }
  });

  it("does not mark a row whose dispatch failed", async () => {
    launch.dispatchAgent.mockImplementationOnce(async () => "The new terminal did not start.");
    disk.roots = { "/dq": "/dq" };
    useBoardPanel.setState({ root: "/dq", methodology: "v4", board: approved("Approved"), error: null, loading: false });
    render(<BoardPanel cwd="/dq" onClose={vi.fn()} />);
    await waitFor(() => expect(rowEl().querySelector("button[data-action=dispatch]")).not.toBeNull());
    fireEvent.click(rowEl().querySelector("button[data-action=dispatch]")!);
    await waitFor(() => expect(rowEl().textContent).toContain("The new terminal did not start."));
    expect(rowEl().querySelector("button[data-action=dispatched]")).toBeNull();
  });
});

describe("BoardPanel and a BMAD switch", () => {
  const unwatched = () => vi.mocked(invoke).mock.calls.filter(([cmd]) => cmd === "unwatch_directory").length;
  const pendingEntry = (status: string) => ({ archive: ".ade/archive/bmad-v4-2026-10-11", status, phase: "moving", from: "v4", to: "v6", date: "2026-10-11" });

  beforeEach(() => {
    opened.file.mockClear();
    useBoardPanel.setState({ refresh: vi.fn(async () => {}), scheduleRefresh: vi.fn() });
  });

  it("passes the archive exclusion for its .ade watch, and none for the others", async () => {
    disk.exists = new Set(["/p/.ade", "/p/docs"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toEqual(expect.arrayContaining(["/p/.ade", "/p/docs"])));
    const args = (dir: string) => vi.mocked(invoke).mock.calls.find(([cmd, a]) => cmd === "watch_directory" && (a as { dir: string }).dir === dir)![1];
    expect(args("/p/.ade")).toMatchObject({ exclude: ["/p/.ade/archive"] });
    expect(args("/p/docs")).toMatchObject({ exclude: [] });
  });

  it("shows Switching… instead of Set up now while its project is being switched, then refreshes once", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Set up now" });

    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    expect(screen.getByText("Switching…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up now" })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    act(() => end());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(screen.queryByText("Switching…")).toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows only Switching… in place of a board that had an error", async () => {
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: null, error: "boom", loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    expect(await screen.findByText("boom")).toBeTruthy();
    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    expect(screen.getByText("Switching…")).toBeTruthy();
    expect(screen.queryByText("boom")).toBeNull();
    expect(screen.queryAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Close board"]);
    act(() => end());
  });

  it("stops watching and ignores a focus refresh while the switch runs, then watches again", async () => {
    const scheduleRefresh = vi.fn();
    disk.exists = new Set(["/p/.ade"]);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false, scheduleRefresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(watched()).toEqual(["/p/.ade"]));

    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    await waitFor(() => expect(unwatched()).toBe(1));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(scheduleRefresh).not.toHaveBeenCalled();

    act(() => end());
    await waitFor(() => expect(watched()).toEqual(["/p/.ade", "/p/.ade"]));
    act(() => { window.dispatchEvent(new Event("focus")); });
    expect(scheduleRefresh).toHaveBeenCalledOnce();
  });

  it("is not disturbed by another project's switch", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false, refresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Set up now" });
    let end!: () => void;
    act(() => { end = beginSwitch("/elsewhere"); });
    expect(screen.queryByText("Switching…")).toBeNull();
    act(() => end());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when a switch finishes that no board-side registration covered, and not for another project's", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false, refresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByText("No stories yet.");
    act(() => { window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/elsewhere" } })); });
    expect(refresh).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/p" } })); });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh on the done event while its own switch is still registered (the end refreshes once)", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false, refresh });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByText("No stories yet.");
    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    act(() => { window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/p" } })); });
    act(() => end());
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("removes its done-event listener on unmount", async () => {
    const refresh = vi.fn(async () => {});
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false, refresh });
    const { unmount } = render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByText("No stories yet.");
    unmount();
    window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/p" } }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("warns about a switch that didn't finish, and links to its ARCHIVE.md", async () => {
    disk.pending = [pendingEntry("incomplete")];
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    const warning = await screen.findByRole("alert");
    expect(warning.textContent).toContain("A BMAD switch didn't finish here");
    fireEvent.click(screen.getByRole("button", { name: "ARCHIVE.md" }));
    expect(opened.file).toHaveBeenCalledWith("/p/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
  });

  it("says why Set up now is refused while a switch is unfinished, in the panel and in a toast that links to the journal", async () => {
    disk.pending = [pendingEntry("incomplete")];
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent).detail).toEqual({
      why: "A BMAD switch in p didn't finish. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
      archiveFile: "/p/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md",
    });
    expect(screen.getAllByRole("alert").map((el) => el.textContent)).toContain(
      "A BMAD switch in p didn't finish. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
    );
    window.removeEventListener("project-setup-failed", failed);
  });

  it("raises no toast for a refusal that has no journal behind it", async () => {
    disk.bmad = {};
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to BMAD v6…" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This project has no BMAD to switch from.");
    expect(failed).not.toHaveBeenCalled();
    window.removeEventListener("project-setup-failed", failed);
  });

  it("warns for an in-progress journal too, and says an unreadable one couldn't be read", async () => {
    disk.pending = [pendingEntry("in-progress")];
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    const first = render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("didn't finish");
    first.unmount();

    disk.pending = [pendingEntry("unknown")];
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    const warning = await screen.findByRole("alert");
    expect(warning.textContent).toContain("couldn't be read");
    expect(warning.textContent).not.toContain("didn't finish");
    expect(screen.getByRole("button", { name: "ARCHIVE.md" })).toBeTruthy();
  });

  it("says the check failed when it can't tell, rather than showing nothing", async () => {
    disk.pendingFails = true;
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't check for an unfinished BMAD switch.");
  });

  it("hides the warning while a switch runs for the project (its journal is in progress then)", async () => {
    disk.pending = [pendingEntry("in-progress")];
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("alert");
    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    expect(screen.queryByRole("alert")).toBeNull();
    disk.pending = [];
    act(() => end());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows no warning when nothing is pending", async () => {
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await waitFor(() => expect(vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "bmad_switch_pending")).toBe(true));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("links to the switch to the other version at the bottom, and opens the confirm step", async () => {
    disk.bmad = { "/p": "v4" };
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<><BoardPanel cwd="/p" onClose={vi.fn()} /><MethodologyPromptHost /></>);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to BMAD v6…" }));
    await waitFor(() =>
      expect(useMethodologyPrompt.getState().request).toEqual({ root: "/p", mode: "confirm", from: "v4", to: "v6", back: false }),
    );
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("links to v4 from a v6 project", async () => {
    useBoardPanel.setState({ root: "/p", methodology: "v6", board: null, map: v6Map(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Switch to BMAD v4…" })).toBeTruthy();
  });

  it("has no switch link for a project with no BMAD, or while a switch runs", async () => {
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, map: null, error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Set up now" });
    expect(screen.queryByRole("button", { name: /Switch to BMAD/ })).toBeNull();

    act(() => { useBoardPanel.setState({ methodology: "v4", board: v4Board() }); });
    await screen.findByRole("button", { name: "Switch to BMAD v6…" });
    let end!: () => void;
    act(() => { end = beginSwitch("/p"); });
    expect(screen.queryByRole("button", { name: /Switch to BMAD/ })).toBeNull();
    act(() => end());
  });

  it("has no switch link while a switch is unresolved, or when that couldn't be checked", async () => {
    disk.pending = [pendingEntry("in-progress")];
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    const first = render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /Switch to BMAD/ })).toBeNull();
    first.unmount();

    disk.pending = [];
    disk.pendingFails = true;
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: /Switch to BMAD/ })).toBeNull();
  });

  it("drops one project's refusal when the board moves to another project", async () => {
    disk.bmad = {};
    disk.roots = { "/q": "/q" };
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    const view = render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to BMAD v6…" }));
    await screen.findByRole("alert");

    useBoardPanel.setState({ root: "/q", methodology: "v4", board: v4Board(), error: null, loading: false });
    view.rerender(<BoardPanel cwd="/q" onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Switch to BMAD v6…" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says why when the switch can't be offered after all", async () => {
    // The board still shows v4, but the marker is gone from disk.
    disk.bmad = {};
    useBoardPanel.setState({ root: "/p", methodology: "v4", board: v4Board(), error: null, loading: false });
    render(<BoardPanel cwd="/p" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Switch to BMAD v6…" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This project has no BMAD to switch from.");
  });
});

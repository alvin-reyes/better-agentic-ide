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
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "project_root") return args.path === "/home/u" ? "/home/u" : disk.roots[args.path as string] ?? "/p";
    if (cmd === "project_setup_status") {
      return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: disk.bmad[args.root as string] ?? null };
    }
    if (cmd === "path_exists") return disk.exists.has(args.path as string);
    if (cmd === "watch_directory") return 1;
    return null;
  }),
  Channel: class { onmessage: unknown = null; },
}));

const store = vi.hoisted(() => ({ methodology: null as "v4" | "v6" | null }));
vi.mock("../../stores/boardPanelStore", async () => {
  const { create } = await import("zustand");
  const useBoardPanel = create(() => ({
    root: "/p", methodology: store.methodology, board: null, stageFile: null, error: null, loading: false,
    show: vi.fn(), refresh: vi.fn(async () => {}), scheduleRefresh: vi.fn(),
  }));
  return { useBoardPanel };
});

const launch = vi.hoisted(() => ({ dispatchAgent: vi.fn(async (_a: unknown): Promise<string | null> => null) }));
vi.mock("../../lib/agentLaunch", () => launch);

import BoardPanel from "../board/BoardPanel";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { buildBoard } from "../../stores/stageBoardStore";

beforeEach(() => {
  disk.bmad = {};
  disk.roots = {};
  disk.exists = new Set();
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

describe("BoardPanel", () => {
  it("says so when the pane has no project", () => {
    render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    expect(screen.getByText("No project in this pane")).toBeTruthy();
  });

  it("offers setup for a project with no BMAD, naming the folder it would set up", async () => {
    store.methodology = null;
    useBoardPanel.setState({ root: "/p", methodology: null, board: null, error: null, loading: false });
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("This project isn't set up for BMAD")).toBeTruthy());
    expect(screen.getByText("/p")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up now" })).toBeTruthy();
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

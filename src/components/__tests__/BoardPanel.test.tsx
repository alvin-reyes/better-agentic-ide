import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const disk = vi.hoisted(() => ({
  /** Folders that say what they are on, as project_setup_status reports. */
  bmad: {} as Record<string, "v4" | "v6">,
  /** project_root by path; default "/p". */
  roots: {} as Record<string, string>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "project_root") return args.path === "/home/u" ? "/home/u" : disk.roots[args.path as string] ?? "/p";
    if (cmd === "project_setup_status") {
      return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: disk.bmad[args.root as string] ?? null };
    }
    if (cmd === "path_exists") return false;
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

import BoardPanel from "../board/BoardPanel";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { buildBoard } from "../../stores/stageBoardStore";

beforeEach(() => {
  disk.bmad = {};
  disk.roots = {};
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

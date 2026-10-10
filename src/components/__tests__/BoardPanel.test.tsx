import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "project_root") return args.path === "/home/u" ? "/home/u" : "/p";
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

describe("BoardPanel", () => {
  it("says so when the pane has no project", () => {
    render(<BoardPanel cwd={null} onClose={vi.fn()} />);
    expect(screen.getByText("No project in this pane")).toBeTruthy();
  });

  it("offers setup for a project with no BMAD", async () => {
    store.methodology = null;
    render(<BoardPanel cwd="/p/src" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("This project isn't set up for BMAD")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Set up now" })).toBeTruthy();
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

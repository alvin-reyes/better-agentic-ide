import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import BoardView from "../board/BoardView";
import { buildBoard } from "../../stores/stageBoardStore";
import { stageView } from "../../lib/confirmedStage";

const story = (id: string, status: string) => ({ file: `docs/stories/${id}.x.md`, markdown: `# Story ${id}: T${id}\n\n## Status\n\n${status}\n` });
const board = buildBoard({
  config: null,
  artifactExists: (p) => ["docs/brief.md", "docs/prd", "docs/architecture"].includes(p),
  stories: [story("1.1", "Draft"), story("1.2", "Approved"), story("1.3", "InProgress")],
  gates: [],
});

function renderWith(file: string | null, actions: Record<string, unknown> = {}) {
  const all = { onOpen: vi.fn(), onApprove: vi.fn(async () => {}), onDispatch: vi.fn(async () => {}), onStage: vi.fn(async () => {}), ...actions };
  render(<BoardView methodology="v4" board={board} stage={stageView(board, file)} error={null} actions={all} />);
  return all;
}
const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement;

// An action's busy state clears after its promise settles; wait for it so no update lands outside act().
const settled = (name: string | RegExp) => waitFor(() => expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(false));

describe("BoardView actions", () => {
  it("offers Approve only on draft rows", () => {
    renderWith(null);
    expect(row("1.1").querySelector("button[data-action=approve]")).not.toBeNull();
    expect(row("1.2").querySelector("button[data-action=approve]")).toBeNull();
  });

  it("never offers Dispatch below approved", () => {
    renderWith(null);
    expect(row("1.1").querySelector("button[data-action=dispatch]")).toBeNull();
    expect(row("1.2").querySelector("button[data-action=dispatch]")).not.toBeNull();
    expect(row("1.3").querySelector("button[data-action=dispatch]")).not.toBeNull();
  });

  it("calls the action with the row and shows a failure on that row", async () => {
    const a = renderWith(null, { onApprove: vi.fn(async () => { throw new Error("Story is not a draft"); }) });
    fireEvent.click(row("1.1").querySelector("button[data-action=approve]")!);
    await waitFor(() => expect(row("1.1").textContent).toContain("Story is not a draft"));
    expect((a.onApprove as ReturnType<typeof vi.fn>).mock.calls[0][0].story.id).toBe("1.1");
  });

  it("offers Track stage, not Next, when the stage is not tracked", async () => {
    const a = renderWith(null);
    expect(screen.queryByRole("button", { name: /Next/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Track stage" }));
    expect(a.onStage).toHaveBeenCalledWith(stageView(board, null).shown);
    await settled("Track stage");
  });

  it("offers Next once the tracked stage's evidence is on disk, and Back", async () => {
    const a = renderWith("design\n");
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(a.onStage).toHaveBeenCalledWith("audit");
    await settled(/Next/);
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(a.onStage).toHaveBeenCalledWith("brainstorming");
    await settled(/Back/);
  });

  it("marks a tracked stage ahead of the evidence as claimed, and warns on an invalid file", () => {
    renderWith("review\n");
    expect(screen.getByText(/claimed/i)).toBeTruthy();
  });

  it("warns when .ade/stage is not a stage", () => {
    renderWith("shipping\n");
    expect(screen.getByText(/\.ade\/stage is not a stage/)).toBeTruthy();
  });
});

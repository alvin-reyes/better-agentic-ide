import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BoardView, { rowLabel } from "../board/BoardView";
import { buildBoard, type BoardState } from "../../stores/stageBoardStore";
import { stageView } from "../../lib/confirmedStage";
import type { StoryView } from "../../lib/storyState";

const story = (id: string, status: string) => ({
  file: `docs/stories/${id}.x.md`,
  markdown: `# Story ${id}: Title ${id}\n\n## Status\n\n${status}\n`,
});
const gate = (id: string, verdict: string, reason = "r") => ({
  file: `docs/qa/gates/${id}-x.yml`,
  yaml: `story: "${id}"\ngate: "${verdict}"\nstatus_reason: "${reason}"\nupdated: "2026-10-10"\n`,
});

function v4Board(): BoardState {
  return buildBoard({
    config: null,
    artifactExists: (p) => p === "docs/prd.md",
    stories: [story("1.1", "Draft"), story("1.2", "Done"), story("1.3", "Done"), story("1.4", "Done"), story("1.5", "Blocked")],
    gates: [gate("1.2", "PASS"), gate("1.3", "WAIVED", "legacy path"), gate("9.9", "PASS"), { file: "docs/qa/gates/bad.yml", yaml: "nope: 1\n" }],
  });
}

const renderBoard = (board = v4Board(), extra: Partial<Parameters<typeof BoardView>[0]> = {}) =>
  render(<BoardView methodology="v4" board={board} stage={stageView(board, null)} error={null} actions={{ onOpen: vi.fn() }} {...extra} />);

describe("rowLabel", () => {
  it("names every state the board can show", () => {
    const rows = v4Board().stories;
    const by = (id: string) => rowLabel(rows.find((r) => r.story.id === id) as StoryView);
    expect(by("1.1")).toBe("draft");
    expect(by("1.2")).toBe("done ✓");
    expect(by("1.3")).toBe("waived");
    expect(by("1.4")).toBe("claimed");
    expect(by("1.5")).toBe("Blocked");
  });
});

describe("BoardView", () => {
  it("renders the five stages with the current one marked", () => {
    renderBoard(); // no brief and no architecture: the first stage is current
    for (const label of ["Brainstorming", "Design", "Audit", "Execution", "Review"]) expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText("Brainstorming").closest("[data-stage]")?.getAttribute("data-current")).toBe("true");
  });

  it("shows a skipped optional stage as skipped", () => {
    const board = buildBoard({ config: null, artifactExists: (p) => ["docs/prd", "docs/architecture", "docs/reviews"].includes(p), stories: [], gates: [] });
    renderBoard(board);
    expect(screen.getByText("Brainstorming").closest("[data-stage]")?.getAttribute("data-skipped")).toBe("true");
  });

  it("lists artifacts as present or missing, and opens a present file", () => {
    const onOpen = vi.fn();
    renderBoard(v4Board(), { actions: { onOpen } });
    fireEvent.click(screen.getByRole("button", { name: /PRD/ }));
    expect(onOpen).toHaveBeenCalledWith("docs/prd.md");
    expect(screen.getByText("Architecture").closest("[data-artifact]")?.getAttribute("data-present")).toBe("false");
  });

  it("always shows a waiver's reason, and a claimed row's", () => {
    renderBoard();
    expect(screen.getByText(/legacy path/)).toBeTruthy();
    expect(screen.getByText(/no gate file/)).toBeTruthy();
  });

  it("expands a row to its gate", () => {
    renderBoard();
    const title = screen.getByText("Title 1.2");
    expect(title.tagName).toBe("BUTTON");
    expect(title.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(title);
    expect(title.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("docs/qa/gates/1.2-x.yml")).toBeTruthy();
  });

  it("lists unmatched and unreadable gates last", () => {
    renderBoard();
    expect(screen.getByText(/docs\/qa\/gates\/9\.9-x\.yml/)).toBeTruthy();
    expect(screen.getByText(/no gate: key/)).toBeTruthy();
  });

  it("groups v6 rows under their epics, with problems and a no-initiative note", () => {
    const base = buildBoard({ config: null, artifactExists: () => false, stories: [story("1.1", "Draft"), story("2.1", "Draft")], gates: [] });
    const board: BoardState = { ...base, epics: [{ slug: "epic-cart", title: "Cart", refs: ["1.1"] }], problems: ["plan names no ticket"] };
    render(<BoardView methodology="v6" board={board} stage={stageView(board, null)} error={null} actions={{ onOpen: vi.fn() }} />);
    expect(screen.getByText("Cart")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
    expect(screen.getByText("plan names no ticket")).toBeTruthy();

    const none: BoardState = { ...base, stories: [], epics: [], noInitiative: true };
    render(<BoardView methodology="v6" board={none} stage={stageView(none, null)} error={null} actions={{ onOpen: vi.fn() }} />);
    expect(screen.getByText(/No active initiative/)).toBeTruthy();
  });

  it("shows a rebuild error above the last good board", () => {
    renderBoard(v4Board(), { error: "tickets.toml: bad" });
    expect(screen.getByRole("alert").textContent).toContain("tickets.toml: bad");
    expect(screen.getByText("Title 1.1")).toBeTruthy();
  });

  it("shows an unreadable gate's error without expanding, on a story that is not Done", () => {
    const board = buildBoard({
      config: null,
      artifactExists: () => false,
      stories: [story("1.1", "Draft")],
      gates: [{ file: "docs/qa/gates/1.1-x.yml", yaml: 'story: "1.1"\nnope: 1\n' }],
    });
    renderBoard(board);
    expect(screen.getByText(/gate unreadable: no gate: key/)).toBeTruthy();
  });

  it("shows an unreadable superseded gate's error", () => {
    const board = buildBoard({
      config: null,
      artifactExists: () => false,
      stories: [story("1.2", "Done")],
      gates: [
        gate("1.2", "PASS"),
        { file: "docs/qa/gates/1.2-old.yml", yaml: 'story: "1.2"\nupdated: "2026-01-01"\n' },
      ],
    });
    expect(board.supersededGates.map((g) => g.file)).toEqual(["docs/qa/gates/1.2-old.yml"]);
    renderBoard(board);
    expect(screen.getByText(/Superseded: docs\/qa\/gates\/1\.2-old\.yml: no gate: key/)).toBeTruthy();
  });
});

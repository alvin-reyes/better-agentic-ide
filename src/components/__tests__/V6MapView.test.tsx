import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import V6MapView from "../board/V6MapView";
import type { BoardActions } from "../board/BoardView";
import type { V6Map } from "../../lib/v6Map";
import type { V6Doc } from "../../lib/v6Kinds";
import { ticketView } from "../../lib/ticketView";
import type { Ticket } from "../../lib/bmadTicketTree";

const ticket = (id: string, status: string): Ticket => ({
  file: `_bmad-output/initiative-shop/epic-cart/story-${id}.md`, id, localId: id.split(".")[1], type: "story",
  title: `Ticket ${id}`, parent: "epic-cart", status, state: "", acceptanceCriteria: [], epic: "epic-cart",
});
const doc = (kind: string, label: string, name: string, status: string, path: string | null = `_bmad-output/x/${kind}-${name}.md`): V6Doc => ({ kind, label, name, path, status });

function map(over: Partial<V6Map> = {}): V6Map {
  return {
    outputFolder: "_bmad-output",
    initiative: { title: "Shop relaunch", folder: "initiative-shop" },
    initiativeState: "active",
    docs: {
      analysis: [doc("brainstorm", "Brainstorm", "pricing", "in progress")],
      planning: [doc("prd", "PRD", "shop", "draft")],
      implementation: [doc("plan", "Quick plan", "fix-typo", "built")],
      validation: [],
    },
    loose: [],
    epics: [{ slug: "epic-cart", title: "Cart", refs: ["1.1", "1.2"] }],
    tickets: [ticketView(ticket("1.1", "done"), []), ticketView(ticket("1.2", "draft"), [])],
    backlog: [],
    unmatchedGates: [],
    supersededGates: [],
    problems: [],
    ...over,
  };
}
const renderMap = (m = map(), actions: BoardActions = { onOpen: vi.fn(), onApprove: vi.fn(), onDispatch: vi.fn() }) =>
  render(<V6MapView map={m} error={null} actions={actions} />);

describe("V6MapView", () => {
  it("shows the four phases in v6's order, and no stage controls", () => {
    renderMap();
    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Analysis", "Planning", "Implementation", "Validation"]);
    expect(screen.queryByRole("button", { name: /Next|Back|Track stage/ })).toBeNull();
  });

  it("names the initiative", () => {
    renderMap();
    expect(screen.getByText("Shop relaunch")).toBeTruthy();
  });

  it("lists each doc with its status, and opens its main file", () => {
    const actions = { onOpen: vi.fn() };
    renderMap(map(), actions);
    expect(document.querySelector('[data-doc="prd"] [data-status]')?.textContent).toBe("draft");
    fireEvent.click(screen.getByRole("button", { name: "PRD" }));
    expect(actions.onOpen).toHaveBeenCalledWith("_bmad-output/x/prd-shop.md");
  });

  it("shows a muted line for a kind with no doc", () => {
    renderMap();
    expect(screen.getByText("Architecture · none yet")).toBeTruthy();
  });

  it("a doc with no main file is not clickable", () => {
    renderMap(map({ docs: { analysis: [], planning: [doc("prd", "PRD", "empty", "present", null)], implementation: [], validation: [] } }));
    expect(screen.queryByRole("button", { name: "PRD" })).toBeNull();
    expect(screen.getByText("PRD")).toBeTruthy();
  });

  it("groups tickets under their epics with the existing row actions; plans have no buttons", () => {
    renderMap();
    expect(screen.getByText("Cart")).toBeTruthy();
    expect(document.querySelector('[data-row="1.2"] [data-action="approve"]')).not.toBeNull();
    expect(document.querySelector('[data-doc="plan"] button:not([data-open])')).toBeNull();
  });

  it("summarises the QA gates under Validation", () => {
    renderMap();
    expect(screen.getByText("QA gates: 0 passed, 0 waived, 1 claimed")).toBeTruthy();
  });

  it("with no active initiative, says how to set one and shows only loose work", () => {
    renderMap(map({ initiative: null, initiativeState: "none", loose: [doc("prd", "PRD", "loose", "draft")] }));
    expect(screen.getByText("No active initiative. Set one with the bmad skill.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Analysis" })).toBeNull();
    expect(screen.getByText("Not in an initiative")).toBeTruthy();
  });

  it("backlog rows are read-only and open their leaf", () => {
    const actions = { onOpen: vi.fn(), onApprove: vi.fn(), onDispatch: vi.fn() };
    const bug: Ticket = { ...ticket("x", "draft"), id: "bug-login-crash.md", title: "Login crash", file: "_bmad-output/backlog/bug-login-crash.md", type: "bug" };
    renderMap(map({ backlog: [ticketView(bug, [])] }), actions);
    const row = document.querySelector('[data-backlog="bug-login-crash.md"]')!;
    expect(row.querySelector('[data-action]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Login crash" }));
    expect(actions.onOpen).toHaveBeenCalledWith("_bmad-output/backlog/bug-login-crash.md");
  });

  it("lists problems under Needs attention", () => {
    renderMap(map({ problems: ["Initiative initiative-gone not found: _bmad-output/initiative-gone"] }));
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/initiative-gone not found/)).toBeTruthy();
  });
});

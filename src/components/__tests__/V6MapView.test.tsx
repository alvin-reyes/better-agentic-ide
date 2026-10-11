import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import V6MapView from "../board/V6MapView";
import type { BoardActions } from "../board/BoardView";
import type { V6Map } from "../../lib/v6Map";
import type { V6Doc } from "../../lib/v6Kinds";
import { ticketView } from "../../lib/ticketView";
import { parseGate } from "../../lib/bmadGates";
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

  it("names the initiative it could not find", () => {
    renderMap(map({ initiative: { title: "initiative-gone", folder: "initiative-gone" }, initiativeState: "missing" }));
    expect(screen.getByText("Initiative initiative-gone not found")).toBeTruthy();
  });

  it("shows same-named specs from different places as separate rows, with no duplicate-key warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    renderMap(map({ docs: { analysis: [], implementation: [], validation: [], planning: [
      doc("spec", "Spec", "api", "present", "_bmad-output/initiative-shop/spec-api/spec-api.md"),
      doc("spec", "Spec", "cart/api", "present", "_bmad-output/initiative-shop/epic-cart/spec-api/spec-api.md"),
    ] } }));
    expect(document.querySelectorAll('[data-doc="spec"]').length).toBe(2);
    expect(screen.getByText("cart/api")).toBeTruthy();
    expect(error.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    error.mockRestore();
  });

  it("lists problems under Needs attention", () => {
    renderMap(map({ problems: ["Initiative initiative-gone not found: _bmad-output/initiative-gone"] }));
    expect(screen.getByText("Needs attention")).toBeTruthy();
    expect(screen.getByText(/initiative-gone not found/)).toBeTruthy();
  });

  describe("a ticket's own status word", () => {
    const row = (id: string) => document.querySelector(`[data-row="${id}"]`) as HTMLElement;
    const gates = [
      parseGate(".ade/gates/1.1.yml", 'story: "1.1"\ngate: "PASS"\nstatus_reason: "ok"\nupdated: "2026-10-10"\n'),
      parseGate(".ade/gates/1.2.yml", 'story: "1.2"\ngate: "WAIVED"\nstatus_reason: "legacy"\nupdated: "2026-10-10"\n'),
    ];
    const withTickets = (...t: [string, string][]) =>
      renderMap(map({ epics: [{ slug: "epic-cart", title: "Cart", refs: t.map(([id]) => id) }], tickets: t.map(([id, st]) => ticketView(ticket(id, st), gates)) }));

    it("shows beside the state when it differs", () => {
      withTickets(["1.3", "ready-for-dev"]);
      expect(row("1.3").querySelector("[data-state]")!.textContent).toBe("draft");
      expect(row("1.3").querySelector("[data-raw-status]")!.textContent).toBe("ready-for-dev");
    });

    it("is not repeated when it equals the state", () => {
      withTickets(["1.3", "draft"]);
      expect(row("1.3").querySelector("[data-raw-status]")).toBeNull();
    });

    it("is dropped on a passed or waived ticket", () => {
      withTickets(["1.1", "done"], ["1.2", "built"]);
      expect(row("1.1").querySelector("[data-state]")!.textContent).toBe("done ✓");
      expect(row("1.1").querySelector("[data-raw-status]")).toBeNull();
      expect(row("1.2").querySelector("[data-state]")!.textContent).toBe("waived");
      expect(row("1.2").querySelector("[data-raw-status]")).toBeNull();
    });

    it("is kept on a claimed ticket", () => {
      withTickets(["1.3", "done"]);
      expect(row("1.3").querySelector("[data-state]")!.textContent).toBe("claimed");
      expect(row("1.3").querySelector("[data-raw-status]")!.textContent).toBe("done");
    });
  });
});

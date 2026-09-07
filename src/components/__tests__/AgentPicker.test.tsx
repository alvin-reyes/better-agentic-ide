import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AgentPicker from "../AgentPicker";

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
// AgentPicker calls it (via a ref effect) to keep the selected row visible.
Element.prototype.scrollIntoView = vi.fn();

describe("AgentPicker", () => {
  it("lists curated agents by their familiar names", () => {
    render(<AgentPicker onClose={() => {}} />);
    expect(screen.getByText("Auth Architect")).toBeTruthy();
    expect(screen.getByText("Code Reviewer")).toBeTruthy();
  });

  it("shows the role behind a curated agent", () => {
    render(<AgentPicker onClose={() => {}} />);
    expect(screen.getAllByText(/Architect/).length).toBeGreaterThan(0);
    // "Architect" alone is ambiguous here — three agent names (Auth Architect,
    // Style Architect, System Architect) already contain that word. Assert a
    // role title with no name overlap so this actually proves the role is
    // rendered, not just coincidental agent naming: "Code Reviewer" is backed
    // by the "adversarial-reviewer" role, titled "Adversarial Reviewer".
    expect(screen.getByText("Adversarial Reviewer")).toBeTruthy();
  });

  it("shows what the selected agent's role owns", () => {
    render(<AgentPicker onClose={() => {}} />);
    // Ownership is shown for the currently selected row only. "Auth Architect"
    // (role: architect, owns docs/architecture.md) is the third row in the
    // unfiltered list — arrow down from the default selection to reach it.
    const input = screen.getByPlaceholderText("Search agents or describe a task...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByText(/docs\/architecture\.md/).length).toBeGreaterThan(0);
  });
});

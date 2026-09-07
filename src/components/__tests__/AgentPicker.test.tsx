import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AgentPicker from "../AgentPicker";

// AgentPicker's mount effect calls invoke("check_command_exists", ...) for
// each provider to detect installed CLIs. Outside a real Tauri runtime there
// is no IPC bridge, so the unmocked call rejects — but only after the test
// body's synchronous assertions have already run, which trips React's
// "not wrapped in act(...)" warning. Mock invoke so the rejection (and the
// resulting setInstalledProviders update) happens predictably, and flush it
// below before asserting.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.reject(new Error("not installed"))),
}));

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
// AgentPicker calls it (via a ref effect) to keep the selected row visible.
Element.prototype.scrollIntoView = vi.fn();

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Render AgentPicker and let its provider-detection effect settle inside act(). */
async function renderPicker() {
  const utils = render(<AgentPicker onClose={() => {}} />);
  await act(async () => {
    await flush();
  });
  return utils;
}

describe("AgentPicker", () => {
  it("lists curated agents by their familiar names", async () => {
    await renderPicker();
    expect(screen.getByText("Auth Architect")).toBeTruthy();
    expect(screen.getByText("Code Reviewer")).toBeTruthy();
  });

  it("shows the role behind a curated agent", async () => {
    await renderPicker();
    expect(screen.getAllByText(/Architect/).length).toBeGreaterThan(0);
    // "Architect" alone is ambiguous here — three agent names (Auth Architect,
    // Style Architect, System Architect) already contain that word. Assert a
    // role title with no name overlap so this actually proves the role is
    // rendered, not just coincidental agent naming: "Code Reviewer" is backed
    // by the "adversarial-reviewer" role, titled "Adversarial Reviewer".
    expect(screen.getByText("Adversarial Reviewer")).toBeTruthy();
  });

  it("shows what the selected agent's role owns", async () => {
    await renderPicker();
    // Ownership is shown for the currently selected row only. "Auth Architect"
    // (role: architect, owns docs/architecture.md) is the third row in the
    // unfiltered list — arrow down from the default selection to reach it.
    const input = screen.getByPlaceholderText("Search agents or describe a task...");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getAllByText(/docs\/architecture\.md/).length).toBeGreaterThan(0);
  });
});

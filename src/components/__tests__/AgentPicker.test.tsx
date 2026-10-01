import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import AgentPicker from "../AgentPicker";
import { useTabStore } from "../../stores/tabStore";
import { useSettingsStore } from "../../stores/settingsStore";

// AgentPicker's mount effect calls invoke("check_command_exists", ...) for
// each provider to detect installed CLIs. Outside a real Tauri runtime there
// is no IPC bridge, so the unmocked call rejects — but only after the test
// body's synchronous assertions have already run, which trips React's
// "not wrapped in act(...)" warning. Mock invoke so every command resolves
// predictably, and flush it below before asserting.
//
// The mock is also what makes the launch assertions possible: it records the
// bytes handed to write_pty, which is the exact string the shell would run.
const tauri = vi.hoisted(() => ({
  ptyWrites: [] as { id: number; text: string }[],
  fileWrites: [] as { path: string; content: string }[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "check_command_exists":
        throw new Error("not installed");
      case "create_directory":
        // Mirrors the Rust command, which expands ~ and returns the real path.
        return String(args.path).replace("~", "/Users/testuser");
      case "write_text_file":
        tauri.fileWrites.push({ path: String(args.path), content: String(args.content) });
        return null;
      case "write_pty":
        tauri.ptyWrites.push({
          id: Number(args.id),
          text: new TextDecoder().decode(new Uint8Array(args.data as number[])),
        });
        return null;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
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

/** Give the focused pane a PTY, so launchSpec has somewhere to write. */
function attachPty(ptyId: number) {
  const pane = useTabStore.getState().getActivePane();
  if (!pane) throw new Error("no active pane");
  useTabStore.getState().setPtyId(pane.id, ptyId);
}

/** The filter pill with this exact label — "General" also appears as a row badge. */
function pill(label: string): HTMLElement {
  const button = screen.getAllByRole("button").find((b) => b.textContent === label);
  if (!button) throw new Error(`no pill labelled "${label}"`);
  return button;
}

/** Click a row by its visible name and let the async launch settle. */
/**
 * Pick an agent and run it in the current terminal.
 *
 * Picking a row no longer launches on its own: it asks where to run, and the
 * launch happens on that answer. These tests assert on what reaches the PTY,
 * so they take the "This terminal" branch — the equivalent of the old
 * single-click behaviour.
 */
async function clickRow(name: string) {
  // A failed launch leaves the prompt open so the attempt can be retried with
  // a different provider — and its "Run <name> in" line repeats the name, so
  // the row is only clicked when the prompt is not already up.
  if (screen.queryByText(/This terminal/) === null) {
    await act(async () => {
      fireEvent.click(screen.getAllByText(name)[0]);
      await flush();
    });
  }
  await act(async () => {
    fireEvent.click(screen.getByText(/This terminal/));
    await flush();
  });
}

beforeEach(() => {
  tauri.ptyWrites.length = 0;
  tauri.fileWrites.length = 0;
  useSettingsStore.getState().setDefaultProvider("claude");
});

describe("AgentPicker", () => {
  it("lists curated agents by their familiar names", async () => {
    await renderPicker();
    expect(screen.getByText("Auth Architect")).toBeTruthy();
    expect(screen.getByText("Code Reviewer")).toBeTruthy();
  });

  it("shows the role behind a curated agent", async () => {
    await renderPicker();
    // "Architect" alone is ambiguous here — three agent names (Auth Architect,
    // Style Architect, System Architect) already contain that word. Assert a
    // role title with no name overlap so this actually proves the role is
    // rendered, not just coincidental agent naming: "Code Reviewer" is backed
    // by the "adversarial-reviewer" role, titled "Adversarial Reviewer".
    // Filter to General first, so the bare "Adversarial Reviewer" role row
    // (added by the Roles group) isn't a second match for the same text.
    fireEvent.click(pill("General"));
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

  it("writes an absolute, launchable command into the PTY", async () => {
    await renderPicker();
    attachPty(11);
    await clickRow("Auth Architect");

    // The whole point of the regression: the path is absolute, so `claude`
    // can actually open it. A '~' inside single quotes is not expanded by any
    // POSIX shell, and the agent would launch with no role definition at all.
    expect(tauri.ptyWrites.length).toBe(1);
    expect(tauri.ptyWrites[0].text).toBe(
      "claude --append-system-prompt-file '/Users/testuser/.ade/roles/architect-security.md'\r"
    );
    expect(tauri.ptyWrites[0].id).toBe(11);
  });

  it("writes the role file to the same absolute path the command reads", async () => {
    await renderPicker();
    attachPty(12);
    await clickRow("Auth Architect");

    expect(tauri.fileWrites.length).toBe(1);
    expect(tauri.fileWrites[0].path).toBe("/Users/testuser/.ade/roles/architect-security.md");
    expect(tauri.fileWrites[0].content.startsWith("# Architect — Security")).toBe(true);
    expect(tauri.ptyWrites[0].text.includes(tauri.fileWrites[0].path)).toBe(true);
  });

  it("offers every role as a bare launch, including the three no curated pair covers", async () => {
    await renderPicker();
    fireEvent.click(pill("Roles"));

    // These three are attached to no curated pair. Before the Roles group they
    // could not be launched by any means once BmadPanel's buttons were removed.
    expect(screen.getByText("Product Manager")).toBeTruthy();
    expect(screen.getByText("Product Owner")).toBeTruthy();
    expect(screen.getByText("Scrum Master")).toBeTruthy();
    // 13 roles, one row each.
    expect(screen.getByText(/^13 agents/)).toBeTruthy();
  });

  it("launches a bare role with no domain", async () => {
    await renderPicker();
    attachPty(13);
    fireEvent.click(pill("Roles"));
    await clickRow("Product Manager");

    expect(tauri.fileWrites[0].path).toBe("/Users/testuser/.ade/roles/product-manager.md");
    expect(tauri.ptyWrites[0].text).toBe(
      "claude --append-system-prompt-file '/Users/testuser/.ade/roles/product-manager.md'\r"
    );
  });

  it("refuses a codex launch without leaving a role file behind", async () => {
    await renderPicker();
    attachPty(14);
    await act(async () => {
      fireEvent.click(screen.getByText("Codex"));
      await flush();
    });
    await clickRow("Auth Architect");

    expect(screen.getByRole("alert").textContent?.includes("Codex")).toBe(true);
    expect(tauri.fileWrites.length).toBe(0);
    expect(tauri.ptyWrites.length).toBe(0);
  });

  it("clears a stale launch error when the next attempt starts", async () => {
    await renderPicker();
    attachPty(15);
    await act(async () => {
      fireEvent.click(screen.getByText("Codex"));
      await flush();
    });
    await clickRow("Auth Architect");
    expect(screen.queryByRole("alert")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Claude"));
      await flush();
    });
    await clickRow("Auth Architect");
    expect(screen.queryByRole("alert")).toBe(null);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import AgentPicker from "../AgentPicker";
import { useTabStore } from "../../stores/tabStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { AGENT_CATEGORIES } from "../../data/curatedAgents";
import { ROLES_FILTER } from "../../data/pickerItems";
import { AGENT_COLOR_HEX } from "../../data/agentColors";

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
      case "orgo_launch_rules":
        return { ask: ["mcp__*orgo*__*create*"] };
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

/** Orgo's ask rules, which every Claude Code launch carries (see orgoRules.ts). */
const SETTINGS = `--settings '{"permissions":{"ask":["mcp__*orgo*__*create*"]}}'`;

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
      `claude ${SETTINGS} --append-system-prompt-file '/Users/testuser/.ade/roles/architect-security.v6.md'\r`
    );
    expect(tauri.ptyWrites[0].id).toBe(11);
  });

  it("writes the role file to the same absolute path the command reads", async () => {
    await renderPicker();
    attachPty(12);
    await clickRow("Auth Architect");

    expect(tauri.fileWrites.length).toBe(1);
    expect(tauri.fileWrites[0].path).toBe("/Users/testuser/.ade/roles/architect-security.v6.md");
    expect(tauri.fileWrites[0].content.startsWith("# Architect — Security")).toBe(true);
    expect(tauri.ptyWrites[0].text.includes(tauri.fileWrites[0].path)).toBe(true);
  });

  it("offers every role as a bare launch, including those no curated pair covers", async () => {
    await renderPicker();
    fireEvent.click(pill("Roles"));

    // These are attached to no curated pair. Before the Roles group they
    // could not be launched by any means once BmadPanel's buttons were removed.
    expect(screen.getByText("Product Manager")).toBeTruthy();
    expect(screen.getByText("Product Owner")).toBeTruthy();
    expect(screen.getByText("Scrum Master")).toBeTruthy();
    // The company roles added for end-to-end coverage are bare too.
    expect(screen.getByText("Release Manager")).toBeTruthy();
    expect(screen.getByText("Engineering Manager")).toBeTruthy();
    expect(screen.getByText("Support Engineer")).toBeTruthy();
    expect(screen.getByText("Solutions Engineer")).toBeTruthy();
    // 19 roles, one row each.
    expect(screen.getByText(/^19 agents/)).toBeTruthy();
  });

  it("launches a bare role with no domain", async () => {
    await renderPicker();
    attachPty(13);
    fireEvent.click(pill("Roles"));
    await clickRow("Product Manager");

    expect(tauri.fileWrites[0].path).toBe("/Users/testuser/.ade/roles/product-manager.v6.md");
    expect(tauri.ptyWrites[0].text).toBe(
      `claude ${SETTINGS} --append-system-prompt-file '/Users/testuser/.ade/roles/product-manager.v6.md'\r`
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
    // waitFor, not a bare assertion: the launch awaits ensureRoleDir() and then
    // write_text_file, and the helper's flush() drains a single macrotask tick.
    // That is enough when the machine is idle and not when the suite runs in
    // parallel, which made this the one test that reddened CI at random.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByText("Claude"));
      await flush();
    });
    await clickRow("Auth Architect");
    await waitFor(() => expect(screen.queryByRole("alert")).toBe(null));
  });

  it("categories are neutral and role color is never text", async () => {
    // jsdom reports a hex set in a style as rgb(...), so any literal color
    // shows up as one or the other; the neutral styles use only var(...).
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    const rgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
    const green = rgb(AGENT_COLOR_HEX.green.dark);

    await renderPicker();
    for (const cat of [...AGENT_CATEGORIES, ROLES_FILTER]) {
      const inactive = pill(cat);
      expect(inactive.getAttribute("style") ?? "", `${cat} inactive`).not.toMatch(literal);
      fireEvent.click(inactive);
      const active = pill(cat);
      expect(active.getAttribute("style") ?? "", `${cat} active`).not.toMatch(literal);
      expect(active.style.color, `${cat} active text`).toBe("var(--text-primary)");
      fireEvent.click(active);
    }

    // Row badges: the category label on each curated row and "Role" on the bare roles.
    const badges = screen.getAllByText((_, el) =>
      el?.tagName === "SPAN" && [...AGENT_CATEGORIES, "Role"].includes(el.textContent ?? "") && !el.closest("button"),
    );
    expect(badges.length).toBeGreaterThan(0);
    for (const b of badges) expect(b.getAttribute("style") ?? "", b.textContent ?? "").not.toMatch(literal);

    // The icon tile: bordered and tinted in the role's color, glyph in the theme's text color.
    const row = screen.getByText("API Builder").closest("[data-testid='agent-row']") as HTMLElement;
    const tile = row.querySelector("[data-testid='agent-tile']") as HTMLElement;
    expect(tile.style.border).toBe(`1px solid ${green}`);
    expect(tile.style.color).toBe("var(--text-primary)");
    // API Builder is the first row, selected on open: its left border is the role color.
    expect(row.style.borderLeft).toBe(`2px solid ${green}`);

    // "Run X in": the name in the theme's text color, the role color only as a dot.
    await act(async () => {
      fireEvent.click(screen.getByText("API Builder"));
      await flush();
    });
    const where = screen.getByRole("group", { name: "Where to run API Builder" });
    const name = where.querySelector(".agent-where__title b") as HTMLElement;
    expect(name.textContent).toBe("API Builder");
    expect(name.style.color).toBe("var(--text-primary)");
    const dot = where.querySelector("[data-testid='agent-where-dot']") as HTMLElement;
    expect(dot.style.backgroundColor).toBe(green);
    expect(dot.style.width).toBe("8px");

    // The suggested-agent bar appears only for a task description; its badge is neutral too.
    fireEvent.change(screen.getByPlaceholderText("Search agents or describe a task..."), {
      target: { value: "set up docker containers for deploy" },
    });
    const suggested = screen.getByText(/Suggested:/).parentElement as HTMLElement;
    const spans = [...suggested.querySelectorAll<HTMLElement>("span")];
    expect(spans.some((sp) => AGENT_CATEGORIES.includes(sp.textContent as never)), "a category badge is shown").toBe(true);
    for (const sp of spans) expect(sp.getAttribute("style") ?? "", sp.textContent ?? "").not.toMatch(literal);
  });
});

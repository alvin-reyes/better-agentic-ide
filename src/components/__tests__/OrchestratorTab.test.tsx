import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import OrchestratorTab from "../OrchestratorTab";
import { useOrchestratorStore } from "../../stores/orchestratorStore";
import { useTabStore } from "../../stores/tabStore";
import { destroyInstance } from "../../hooks/useTerminal";

// OrchestratorTab imports @tauri-apps/api/core at module scope, and dispatch
// drives it for real. Mock it the same way AgentPicker.test.tsx does, and
// record the write_pty bytes — the exact string the shell would receive.
const tauri = vi.hoisted(() => ({
  ptyWrites: [] as { id: number; text: string }[],
  fileWrites: [] as { path: string; content: string }[],
  failFileWrite: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "create_directory":
        // Mirrors the Rust command, which expands ~ and returns the real path.
        return String(args.path).replace("~", "/Users/testuser");
      case "write_text_file":
        if (tauri.failFileWrite) throw new Error("disk full");
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

// closeTab lazily imports useTerminal to destroy each pane's terminal, and
// that module pulls in xterm's webgl and serialize addons, which touch canvas
// APIs jsdom does not implement. Mock it so aborting a dispatch is quiet, and
// so the panes it destroys can be asserted on.
vi.mock("../../hooks/useTerminal", () => ({
  destroyInstance: vi.fn(),
}));

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
// OrchestratorTab calls it on mount to keep the chat scrolled to the bottom.
Element.prototype.scrollIntoView = vi.fn();

const flush = () => new Promise((r) => setTimeout(r, 0));
/** dispatchTask polls for its tab's PTY every 500ms; one tick is enough. */
const tick = () => new Promise((r) => setTimeout(r, 700));

interface SeedTask {
  title: string;
  description: string;
  agentProfileId: string;
}

function seedSession(name: string, tasks: SeedTask[]): string {
  const sessionId = useOrchestratorStore.getState().createSession(name);
  useOrchestratorStore.getState().setTasks(
    sessionId,
    tasks.map((t, i) => ({ ...t, priority: i + 1, dependencies: [] })),
  );
  return sessionId;
}

/**
 * The tab dispatch created for a task, found by the name it gives it. Tabs from
 * earlier tests are never closed, so take the most recent match.
 */
function agentTab(title: string) {
  const matches = useTabStore.getState().tabs.filter((t) => t.name === `Agent: ${title}`);
  return matches[matches.length - 1];
}

/**
 * Give a tab's pane a PTY, the way TerminalPane does once its process starts.
 * Wrapped in act() because OrchestratorTab subscribes to the tab store.
 */
async function attachPty(tabId: string, ptyId: number) {
  const pane = useTabStore.getState().getTabActivePane(tabId);
  if (!pane) throw new Error(`tab ${tabId} has no pane`);
  await act(async () => {
    useTabStore.getState().setPtyId(pane.id, ptyId);
  });
}

/** The user clicks away to a tab of their own while dispatch is still waiting. */
async function userOpensOwnTab(ptyId: number): Promise<string> {
  let tabId = "";
  await act(async () => {
    tabId = useTabStore.getState().addTab("User work");
  });
  await attachPty(tabId, ptyId);
  return tabId;
}

beforeEach(() => {
  tauri.ptyWrites.length = 0;
  tauri.fileWrites.length = 0;
  tauri.failFileWrite = false;
});

describe("OrchestratorTab dispatch error", () => {
  it("survives a remount, because it lives in the store rather than component state", async () => {
    // This is the exact failure the store migration fixes: dispatchTask calls
    // addTab() before it can know whether dispatch will fail, and App.tsx's
    // tab-switch ternary unmounts OrchestratorTab as soon as the new tab
    // becomes active. Any error set in *component* state after that point
    // would be set on a detached fiber and never reach the screen. Setting
    // it directly through the store and rendering a fresh instance — as if
    // this were the remount after addTab() — proves the value survives that,
    // without needing to drive dispatchTask's async PTY flow at all.
    const sessionId = useOrchestratorStore.getState().createSession("Test session");
    useOrchestratorStore.getState().setDispatchError(sessionId, "Could not write the role file for \"Fix the bug\": disk full");

    await act(async () => {
      render(<OrchestratorTab sessionId={sessionId} />);
      await flush();
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe('Could not write the role file for "Fix the bug": disk full');
  });

  it("clears when a fresh dispatch actually runs, not merely when the setter is called", async () => {
    const sessionId = seedSession("Stale error session", [
      { title: "Stale auth", description: "Wire up OAuth", agentProfileId: "backend-auth" },
    ]);
    useOrchestratorStore.getState().setDispatchError(sessionId, "some earlier failure");

    await act(async () => {
      render(<OrchestratorTab sessionId={sessionId} />);
      await flush();
    });
    expect(screen.getByRole("alert").textContent).toBe("some earlier failure");

    // Drive the real dispatch path — this is what has to clear the banner.
    await act(async () => {
      fireEvent.click(screen.getByText("Dispatch All"));
      await flush();
    });
    await attachPty(agentTab("Stale auth").id, 31);
    await act(async () => {
      await tick();
    });

    expect(screen.queryByRole("alert")).toBe(null);
  });

  it("keeps an earlier task's failure on screen after a later task succeeds", async () => {
    // dispatchTask used to clear the banner at its own start, so in a
    // Dispatch All run task 2 wiped task 1's failure half a second after it
    // appeared — leaving task 1 "pending" with no sign it had ever run.
    const sessionId = seedSession("Two task session", [
      { title: "Broken task", description: "no such agent", agentProfileId: "does-not-exist" },
      { title: "Good task", description: "Wire up OAuth", agentProfileId: "backend-auth" },
    ]);

    await act(async () => {
      render(<OrchestratorTab sessionId={sessionId} />);
      await flush();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Dispatch All"));
      await flush();
    });
    await attachPty(agentTab("Good task").id, 32);
    await act(async () => {
      await tick();
    });

    expect(screen.getByRole("alert").textContent?.includes("Broken task")).toBe(true);
    expect(tauri.ptyWrites.length).toBe(1);
  });
});

describe("OrchestratorTab dispatch command", () => {
  it("writes an absolute, launchable command into the dispatched tab's PTY", async () => {
    const sessionId = seedSession("Command session", [
      { title: "Add auth", description: "Wire up OAuth", agentProfileId: "backend-auth" },
    ]);
    useOrchestratorStore.getState().setProjectDir(sessionId, "/Users/testuser/.ade/orchestrator/proj");

    await act(async () => {
      render(<OrchestratorTab sessionId={sessionId} />);
      await flush();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Dispatch All"));
      await flush();
    });
    await attachPty(agentTab("Add auth").id, 33);
    await act(async () => {
      await tick();
    });

    // Absolute role path, because single quotes stop a shell expanding "~" —
    // the flag would point at nothing and the agent would run with no role.
    // And no leading space before "Read SPEC.md".
    expect(tauri.ptyWrites.length).toBe(1);
    expect(tauri.ptyWrites[0].text).toBe(
      "claude --append-system-prompt-file '/Users/testuser/.ade/roles/architect-security.md' " +
        "-p 'Read SPEC.md for the full project specification and context. Your task: Wire up OAuth'\r"
    );
    expect(tauri.fileWrites[0].path).toBe("/Users/testuser/.ade/roles/architect-security.md");
  });

  it("dispatches into the tab it created, not whichever tab the user focused", async () => {
    const sessionId = seedSession("Tab switch session", [
      { title: "Switch auth", description: "Wire up OAuth", agentProfileId: "backend-auth" },
    ]);

    await act(async () => {
      render(<OrchestratorTab sessionId={sessionId} />);
      await flush();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Dispatch All"));
      await flush();
    });

    const agentTabId = agentTab("Switch auth").id;
    await attachPty(agentTabId, 34);
    // The user clicks away while the PTY wait is still in flight. Their tab
    // is now the active one, and it has a live process of its own.
    const userTabId = await userOpensOwnTab(99);

    await act(async () => {
      await tick();
    });

    expect(tauri.ptyWrites.length).toBe(1);
    expect(tauri.ptyWrites[0].id).toBe(34);
    const task = useOrchestratorStore.getState().sessions.find((s) => s.id === sessionId)!.tasks[0];
    expect(task.tabId).toBe(agentTabId);
    expect(useTabStore.getState().tabs.some((t) => t.id === userTabId)).toBe(true);
  });

  it("closes the tab it created — not the user's — when dispatch fails", async () => {
    const sessionId = seedSession("Abort session", [
      { title: "Abort auth", description: "Wire up OAuth", agentProfileId: "backend-auth" },
    ]);
    // Give the session a project dir so dispatchAll skips creating one; the
    // failure under test is the role-file write, not the folder setup.
    useOrchestratorStore.getState().setProjectDir(sessionId, "/Users/testuser/.ade/orchestrator/proj");
    tauri.failFileWrite = true;

    await act(async () => {
      render(<OrchestratorTab sessionId={sessionId} />);
      await flush();
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Dispatch All"));
      await flush();
    });

    const agentTabId = agentTab("Abort auth").id;
    const agentPaneId = useTabStore.getState().getTabActivePane(agentTabId)!.id;
    await attachPty(agentTabId, 35);
    const userTabId = await userOpensOwnTab(98);
    const userPaneId = useTabStore.getState().getTabActivePane(userTabId)!.id;

    await act(async () => {
      await tick();
    });

    expect(useTabStore.getState().tabs.some((t) => t.id === agentTabId)).toBe(false);
    expect(useTabStore.getState().tabs.some((t) => t.id === userTabId)).toBe(true);
    expect(screen.getByRole("alert").textContent?.includes("disk full")).toBe(true);

    // And the destroyed PTY is the dead agent one, never the user's live pane.
    const destroyed = vi.mocked(destroyInstance).mock.calls.map((c) => c[0]);
    expect(destroyed.includes(agentPaneId)).toBe(true);
    expect(destroyed.includes(userPaneId)).toBe(false);
  });
});

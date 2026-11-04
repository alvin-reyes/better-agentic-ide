import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BusyInputs, Fg, PaneSession } from "../lib/paneBusy";

/**
 * The pane each scenario stands for. paneBusy runs the real decision
 * (decideBusy) over what that kind of pane reports: a Hermes agent still
 * tracked as running, an Ollama agent waiting at its prompt after its session
 * went idle, or a shell at its prompt.
 */
const scene = vi.hoisted(() => ({ kind: "idle" as "hermes" | "ollama" | "idle" }));

function inputsFor(paneId: string): BusyInputs {
  const ollama: Fg = { kind: "busy", label: "ollama", names: ["ollama", "ollama"] };
  const sessions: PaneSession[] =
    scene.kind === "hermes" ? [{ paneId, provider: "hermes", agentName: "Hermes Architect", status: "running" }]
    : scene.kind === "ollama" ? [{ paneId, provider: "ollama", agentName: "Ollama Developer", status: "completed" }]
    : [];
  return {
    sessions,
    sample: async () => (scene.kind === "ollama" ? ollama : { kind: "shell" }),
    wait: async () => {},
    // The text heuristic would see nothing here: the foreground decides.
    fallback: () => null,
  };
}

vi.mock("../hooks/useTerminal", () => ({
  paneBusy: vi.fn(async (paneId: string) => {
    const { decideBusy } = await import("../lib/paneBusy");
    return decideBusy(inputsFor(paneId));
  }),
  destroyInstance: vi.fn(),
  getPtyCwd: vi.fn(async () => null),
  // Each pane stands for one on screen, with a terminal: the close guard samples it.
  getTerminalDimensions: () => ({ cols: 80, rows: 24 }),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    throw new Error(`unexpected command: ${command}`);
  }),
}));

// jsdom has no layout engine; the palette scrolls its selected row into view.
Element.prototype.scrollIntoView = vi.fn();

import ConfirmDialog from "../components/ConfirmDialog";
import CommandPalette from "../components/CommandPalette";
import { useGuardedClose } from "../hooks/useGuardedClose";
import { allTabPanes, shownView, useTabStore } from "../stores/tabStore";

/** App's part in closing: the guarded close and its dialog. */
function Host() {
  const { confirmDialog, setConfirmDialog, requestClosePane } = useGuardedClose();
  const closeActivePane = () => {
    const { tabs, activeTabId } = useTabStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId)!;
    requestClosePane(tab.id, shownView(tab).activePaneId);
  };
  return (
    <>
      <button onClick={closeActivePane}>close pane shortcut</button>
      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </>
  );
}

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const tabExists = (id: string) => useTabStore.getState().tabs.some((t) => t.id === id);
const paneExists = (tabId: string, paneId: string) => {
  const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
  return !!tab && allTabPanes(tab).some((p) => p.id === paneId);
};

/** A new tab with two panes; the second is active. Returns the tab and its active pane. */
function splitTab(name: string) {
  const tabId = useTabStore.getState().addTab(name);
  const first = shownView(useTabStore.getState().tabs.find((t) => t.id === tabId)!).activePaneId;
  useTabStore.getState().splitPane(tabId, first, "horizontal");
  const paneId = shownView(useTabStore.getState().tabs.find((t) => t.id === tabId)!).activePaneId;
  return { tabId, paneId };
}

const palette = () =>
  render(<CommandPalette onClose={vi.fn()} onToggleScratchpad={vi.fn()} onOpenAgentPicker={vi.fn()} />);

interface ClosePath {
  name: string;
  /** Set up the target, trigger the close, and return whether it is gone. */
  start: () => () => boolean;
}

const PATHS: ClosePath[] = [
  {
    name: "closing a tab",
    start: () => {
      const tabId = useTabStore.getState().addTab("tab");
      window.dispatchEvent(new CustomEvent("request-close-tab", { detail: { tabId } }));
      return () => !tabExists(tabId);
    },
  },
  {
    name: "closing a pane",
    start: () => {
      const { tabId, paneId } = splitTab("pane");
      fireEvent.click(screen.getByText("close pane shortcut"));
      return () => !paneExists(tabId, paneId);
    },
  },
  {
    name: "Close others",
    start: () => {
      const a = useTabStore.getState().addTab("a");
      const b = useTabStore.getState().addTab("b");
      window.dispatchEvent(new CustomEvent("request-close-tabs", { detail: { tabIds: [a, b] } }));
      return () => !tabExists(a) && !tabExists(b);
    },
  },
  {
    name: "the command palette's Close Tab",
    start: () => {
      const tabId = useTabStore.getState().addTab("palette tab");
      palette();
      fireEvent.click(screen.getByText("Close Tab"));
      return () => !tabExists(tabId);
    },
  },
  {
    name: "the command palette's Close Pane",
    start: () => {
      const { tabId, paneId } = splitTab("palette pane");
      palette();
      fireEvent.click(screen.getByText("Close Pane"));
      return () => !paneExists(tabId, paneId);
    },
  },
];

afterEach(() => {
  cleanup();
  scene.kind = "idle";
});

describe("closing", () => {
  describe("every close path asks first when a pane runs any agent", () => {
    for (const kind of ["hermes", "ollama"] as const) {
      for (const path of PATHS) {
        it(`${path.name}, over a ${kind} pane`, async () => {
          scene.kind = kind;
          render(<Host />);
          const closed = path.start();
          await flush();

          expect(screen.getByText("Active process running")).toBeTruthy();
          expect(closed()).toBe(false);
          if (path.name !== "Close others") {
            const agent = kind === "hermes" ? "Hermes Architect" : "Ollama Developer";
            expect(screen.getByText(new RegExp(`has a live ${agent} session`))).toBeTruthy();
          }

          fireEvent.click(screen.getByText("Close Anyway"));
          await flush();
          expect(closed()).toBe(true);
          expect(screen.queryByText("Active process running")).toBeNull();
        });
      }
    }

    for (const path of PATHS) {
      it(`${path.name}, over an idle pane, closes without asking`, async () => {
        render(<Host />);
        const closed = path.start();
        await flush();
        expect(screen.queryByText("Active process running")).toBeNull();
        expect(closed()).toBe(true);
      });
    }

    it("Cancel keeps a busy tab open", async () => {
      scene.kind = "ollama";
      render(<Host />);
      const closed = PATHS[0].start();
      await flush();
      fireEvent.click(screen.getByText("Cancel"));
      await flush();
      expect(closed()).toBe(false);
    });
  });
});

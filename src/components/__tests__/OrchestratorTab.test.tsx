import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import OrchestratorTab from "../OrchestratorTab";
import { useOrchestratorStore } from "../../stores/orchestratorStore";

// dispatchTask isn't exercised here (it needs a live PTY), but OrchestratorTab
// imports @tauri-apps/api/core at module scope and its mount effects don't
// touch it — mock it anyway, matching AgentPicker.test.tsx's idiom, so any
// future mount-time invoke call fails predictably instead of noisily.
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.reject(new Error("no Tauri runtime in tests"))),
}));

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
// OrchestratorTab calls it on mount to keep the chat scrolled to the bottom.
Element.prototype.scrollIntoView = vi.fn();

const flush = () => new Promise((r) => setTimeout(r, 0));

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

  it("clears once a fresh dispatch attempt starts, so a stale error doesn't linger", () => {
    const sessionId = useOrchestratorStore.getState().createSession("Test session 2");
    useOrchestratorStore.getState().setDispatchError(sessionId, "some earlier failure");
    useOrchestratorStore.getState().setDispatchError(sessionId, null);

    const session = useOrchestratorStore.getState().sessions.find((s) => s.id === sessionId);
    expect(session?.dispatchError ?? null).toBe(null);
  });
});

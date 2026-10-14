import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => null), Channel: class { onmessage: unknown = null; } }));

import { useAgentStatusToasts } from "../useAgentStatusToasts";
import { useAgentStatusStore } from "../../stores/agentStatusStore";
import { useTabStore, type Tab } from "../../stores/tabStore";
import type { GuardToast } from "../useContextGuard";

const tab = (id: string, ptyId: number): Tab => ({
  id, name: `tab ${id}`, activePaneId: `${id}-0`, root: { type: "pane", pane: { id: `${id}-0`, ptyId } },
});

let focused = true;

beforeEach(() => {
  focused = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  useTabStore.setState({ tabs: [tab("a", 1), tab("b", 2)], activeTabId: "a" });
  useAgentStatusStore.setState({ byPty: {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const needs = (byPty: Record<number, "needsYou" | "working">) => act(() => useAgentStatusStore.setState({ byPty }));

describe("needs-you toasts", () => {
  it("toasts once for a pane in a tab not in view, and the toast opens it", () => {
    const shown: GuardToast[] = [];
    renderHook(() => useAgentStatusToasts((t) => shown.push(t)));
    needs({ 2: "needsYou" });
    needs({ 2: "needsYou", 1: "working" });
    expect(shown).toHaveLength(1);
    expect(shown[0].body).toContain("tab b");
    const open = shown[0].action ?? shown[0].actions?.[0];
    act(() => open!.run!());
    expect(useTabStore.getState().activeTabId).toBe("b");
    // It leaves needs you, then needs you again: a new toast.
    needs({ 2: "working" });
    act(() => useTabStore.setState({ activeTabId: "a" }));
    needs({ 2: "needsYou" });
    expect(shown).toHaveLength(2);
  });

  it("doesn't toast a pane in the active tab of a focused window", () => {
    const shown: GuardToast[] = [];
    renderHook(() => useAgentStatusToasts((t) => shown.push(t)));
    needs({ 1: "needsYou" });
    expect(shown).toHaveLength(0);
  });

  it("toasts the active tab's pane when the window isn't focused", () => {
    focused = false;
    const shown: GuardToast[] = [];
    renderHook(() => useAgentStatusToasts((t) => shown.push(t)));
    needs({ 1: "needsYou" });
    expect(shown).toHaveLength(1);
  });

  it("doesn't toast a pane this window doesn't hold", () => {
    const shown: GuardToast[] = [];
    renderHook(() => useAgentStatusToasts((t) => shown.push(t)));
    needs({ 9: "needsYou" });
    expect(shown).toHaveLength(0);
  });
});

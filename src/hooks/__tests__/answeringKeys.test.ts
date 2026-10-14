import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ invoke: vi.fn(async (_cmd: string, _args?: unknown) => null as unknown) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: backend.invoke, Channel: class { onmessage: unknown = null; } }));

import { wireInput } from "../useTerminal";
import { useAgentStatusStore } from "../../stores/agentStatusStore";
import { writePty } from "../../lib/terminalCommands";

/** A terminal that records the handlers wireInput installs. */
function fakeTerminal(ptyId: number) {
  const handlers: { key?: (e: KeyboardEvent) => boolean; data?: (d: string) => void } = {};
  const term = {
    attachCustomKeyEventHandler: (fn: (e: KeyboardEvent) => boolean) => { handlers.key = fn; },
    onData: (fn: (d: string) => void) => { handlers.data = fn; },
    onResize: () => {},
  };
  wireInput({ term, ptyId } as unknown as Parameters<typeof wireInput>[0]);
  return handlers;
}

const keydown = (key: string) =>
  ({ type: "keydown", key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false }) as KeyboardEvent;

const keyReports = () => backend.invoke.mock.calls.filter(([cmd]) => cmd === "agent_status_key");

beforeEach(() => {
  backend.invoke.mockClear();
  useAgentStatusStore.setState({ byPty: { 7: "needsYou" } });
});

describe("answering keys in a terminal", () => {
  it("reports a real key press, and still lets it through to the shell", () => {
    const h = fakeTerminal(7);
    expect(h.key!(keydown("Enter"))).toBe(true);
    expect(keyReports()).toEqual([["agent_status_key", { ptyId: 7 }]]);
    h.key!({ ...keydown("Enter"), type: "keyup" } as KeyboardEvent);
    h.key!(keydown("a"));
    expect(keyReports()).toHaveLength(1);
  });

  it("ignores bytes xterm generates itself and text ADE writes", async () => {
    const h = fakeTerminal(7);
    // A focus report, a mouse report and a device reply come through onData.
    for (const bytes of ["\x1b[I", "\x1b[O", "\x1b[<0;10;5M", "\x1b[?1;2c", "y\r"]) h.data!(bytes);
    // The scratchpad's send writes to the PTY directly.
    await writePty(7, "1\r");
    expect(keyReports()).toEqual([]);
  });

  it("reports nothing for a pane that doesn't need you", () => {
    useAgentStatusStore.setState({ byPty: { 7: "working" } });
    fakeTerminal(7).key!(keydown("Escape"));
    expect(keyReports()).toEqual([]);
  });
});

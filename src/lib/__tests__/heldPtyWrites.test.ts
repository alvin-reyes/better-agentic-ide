import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hotfix 0.23.2, review finding B1: while an `ade open` sub-terminal's
 * command isn't typed yet, nothing the window writes may reach its PTY ahead
 * of ADE's line, not just the keys wireInput sees. App-level writes (the
 * scratchpad's send, Enter, a toast's or panel's command) all go through
 * `writePty`, so the hold is applied there: a write to a held PTY is
 * refused, writes nothing, says so in a toast, and rejects so the caller
 * keeps what it was sending. ADE's own line is typed by Rust, never here.
 */

const io = vi.hoisted(() => ({ writes: [] as { id: number; text: string }[] }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "write_pty") {
      io.writes.push({ id: Number(args.id), text: new TextDecoder().decode(new Uint8Array(args.data as number[])) });
      return null;
    }
    throw new Error(`unexpected ${cmd}`);
  }),
}));
vi.mock("../../hooks/useTerminal", () => ({ destroyInstance: vi.fn(), paneBusy: async () => null }));

import { PTY_STARTING_MESSAGE, PtyStartingError, holdPtyInput, ptyInputHeld, sendToActiveTerminal, writePty, writePtyInput } from "../terminalCommands";
import { useTabStore, ownViewOnly, type Tab } from "../../stores/tabStore";

let toasts: { title: string; body: string }[] = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);

beforeEach(() => {
  io.writes.length = 0;
  toasts = [];
  window.addEventListener("agent-notification", onToast);
  const a: Tab = { id: "a", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "a1", ptyId: 41 } }, "a1") };
  useTabStore.setState({ tabs: [a], activeTabId: "a", closedTabs: [] });
});

afterEach(() => window.removeEventListener("agent-notification", onToast));

describe("a write to a PTY whose command is not yet typed", () => {
  it("writePty refuses it: nothing written, a toast, and a rejection", async () => {
    let held = true;
    holdPtyInput(41, () => held);
    await expect(writePty(41, "hello\r")).rejects.toBeInstanceOf(PtyStartingError);
    expect(io.writes).toEqual([]);
    expect(toasts).toEqual([{ title: "Not sent", body: PTY_STARTING_MESSAGE }]);
    held = false;
    await writePty(41, "hello\r");
    expect(io.writes).toEqual([{ id: 41, text: "hello\r" }]);
  });

  it("sendToActiveTerminal writes nothing and answers false, then goes through once released", async () => {
    let held = true;
    holdPtyInput(41, () => held);
    expect(await sendToActiveTerminal("forge init my-contracts", true)).toBe(false);
    expect(io.writes).toEqual([]);
    expect(toasts.map((t) => t.body)).toEqual([PTY_STARTING_MESSAGE]);
    held = false;
    expect(await sendToActiveTerminal("forge init my-contracts", true)).toBe(true);
    expect(io.writes).toEqual([{ id: 41, text: "forge init my-contracts\r" }]);
  });

  it("other PTYs are not held", async () => {
    holdPtyInput(41, () => true);
    await writePty(7, "ls\r");
    expect(io.writes).toEqual([{ id: 7, text: "ls\r" }]);
    expect(ptyInputHeld(7)).toBe(false);
  });

  it("a released hold is forgotten, so it can't come back", () => {
    let held = true;
    holdPtyInput(42, () => held);
    expect(ptyInputHeld(42)).toBe(true);
    held = false;
    expect(ptyInputHeld(42)).toBe(false);
    held = true;
    expect(ptyInputHeld(42)).toBe(false);
  });

  it("writePtyInput (the terminal's own keys, filtered by wireInput) is not refused", async () => {
    holdPtyInput(41, () => true);
    await writePtyInput(41, "\x1b[?1;2c");
    expect(io.writes).toEqual([{ id: 41, text: "\x1b[?1;2c" }]);
    expect(toasts).toEqual([]);
  });
});

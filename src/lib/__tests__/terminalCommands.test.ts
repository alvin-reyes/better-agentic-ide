import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A launch line is typed only once the shell's line editor is up: until then
 * the terminal is in canonical mode, where the kernel cuts a long line (1024
 * bytes on macOS) and the cut line still runs. `pty_line_editor_ready` says
 * when, and these pin how its answers are used.
 */
const io = vi.hoisted(() => ({
  /** What pty_line_editor_ready answers next; `fallback` once empty. */
  answers: [] as (boolean | null | "reject")[],
  fallback: false as boolean | null,
  /** Every ready answer and every write, in the order they happened, with the fake clock. */
  events: [] as { what: string; at: number }[],
  writes: [] as { id: number; text: string }[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "pty_line_editor_ready") {
      const answer = io.answers.length ? io.answers.shift()! : io.fallback;
      io.events.push({ what: `ready:${answer}`, at: Date.now() });
      if (answer === "reject") throw new Error("ipc down");
      return answer;
    }
    if (cmd === "write_pty") {
      io.events.push({ what: "write", at: Date.now() });
      io.writes.push({ id: Number(args.id), text: new TextDecoder().decode(new Uint8Array(args.data as number[])) });
      return null;
    }
    throw new Error(`unexpected ${cmd}`);
  }),
}));

// closeTab lazily imports useTerminal, which pulls in xterm's canvas addons.
vi.mock("../../hooks/useTerminal", () => ({ destroyInstance: vi.fn() }));

import { runInNewTabPane, typeWhenReady } from "../terminalCommands";
import { useTabStore } from "../../stores/tabStore";

/** Start `runInNewTabPane` and give its new tab's pane PTY `ptyId`, as TerminalPane does once the shell starts. */
function launch(name: string, command: string, ptyId: number) {
  const result = runInNewTabPane(name, "/p", command);
  const tab = useTabStore.getState().tabs.find((t) => t.name === name)!;
  useTabStore.getState().setPtyId(tab.activePaneId, ptyId);
  return { result, tab };
}

beforeEach(() => {
  vi.useFakeTimers();
  io.answers = [];
  io.fallback = false;
  io.events.length = 0;
  io.writes.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("typing a launch line", () => {
  it("a launch line waits for two ready answers in a row", async () => {
    io.answers = [false, true, false, true, true];
    const command = "claude " + "x".repeat(3000);
    const { result, tab } = launch("Two in a row", command, 5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(tab.activePaneId);
    // One write, only after the fifth answer: one true is not enough, and a false resets the count.
    expect(io.events.map((e) => e.what)).toEqual(["ready:false", "ready:true", "ready:false", "ready:true", "ready:true", "write"]);
    // The whole line, whatever its length.
    expect(io.writes).toEqual([{ id: 5, text: command + "\r" }]);
  });

  it("types at once when readiness can't be known", async () => {
    for (const answer of [null, "reject"] as const) {
      io.events.length = 0;
      io.writes.length = 0;
      io.answers = [answer];
      const { result, tab } = launch(`Unknown ${answer}`, "claude go", 6);
      await vi.advanceTimersByTimeAsync(300);
      expect(await result, String(answer)).toBe(tab.activePaneId);
      expect(io.events.map((e) => e.what), String(answer)).toEqual([`ready:${answer}`, "write"]);
      expect(io.writes, String(answer)).toEqual([{ id: 6, text: "claude go\r" }]);
    }
  });

  it("types anyway after 10 s", async () => {
    io.fallback = false;
    const { result, tab } = launch("Never ready", "claude go", 7);
    // The PTY is found on the first 250 ms poll; the wait starts then.
    await vi.advanceTimersByTimeAsync(250);
    const started = Date.now();
    await vi.advanceTimersByTimeAsync(9_900);
    expect(io.writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(await result).toBe(tab.activePaneId);
    expect(io.writes).toEqual([{ id: 7, text: "claude go\r" }]);
    const writeAt = io.events.find((e) => e.what === "write")!.at;
    expect(writeAt - started).toBeGreaterThanOrEqual(10_000);
    expect(writeAt - started).toBeLessThan(10_100);
    // Exactly once, however long it runs on.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(io.writes).toHaveLength(1);
  });

  it("a tab closed while waiting gets nothing", async () => {
    io.fallback = false;
    useTabStore.getState().addTab("Keep one open");
    const { result, tab } = launch("Closed while waiting", "claude go", 8);
    await vi.advanceTimersByTimeAsync(1000);
    expect(io.events.some((e) => e.what === "ready:false")).toBe(true);
    useTabStore.getState().closeTab(tab.id);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(await result).toBeNull();
    expect(io.writes).toEqual([]);

    // typeWhenReady itself says it typed nothing.
    io.answers = [true, true];
    const typed = typeWhenReady(9, "claude go", () => false);
    await vi.advanceTimersByTimeAsync(500);
    expect(await typed).toBe(false);
    expect(io.writes).toEqual([]);
    // And true when it typed.
    io.answers = [true, true];
    const ok = typeWhenReady(9, "claude go", () => true);
    await vi.advanceTimersByTimeAsync(500);
    expect(await ok).toBe(true);
    expect(io.writes).toEqual([{ id: 9, text: "claude go\r" }]);
  });
});

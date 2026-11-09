import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hotfix 0.23.2: `ade open --focus -- bash -l <launcher>` gave the new
 * sub-terminal the keyboard while its shell started. Keys typed for another
 * pane reached the new PTY before ADE typed the line, so zsh ran
 * "ut abash -l ...". While the sub-terminal's open status is "starting", the
 * user's input to it is dropped; xterm's own replies (device attributes,
 * cursor reports) still reach the shell, which may be waiting for them. The
 * real createInstance and wireInput run here, with xterm and the backend
 * faked; Rust's typing is the `typed` message.
 */

const h = vi.hoisted(() => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const starts: Array<(id: number) => void> = [];
  const invoke = vi.fn((cmd: string, args?: Record<string, unknown>) => {
    calls.push([cmd, args]);
    if (cmd === "create_pty") return new Promise<number>((resolve) => starts.push(resolve));
    return Promise.resolve(null as unknown);
  });

  /** Every terminal made, with the handlers wireInput installs. */
  const terms: FakeTerminal[] = [];
  class FakeTerminal {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    element: HTMLElement | undefined = undefined;
    buffer = { active: { length: 0, getLine: () => undefined } };
    data: ((d: string) => void) | null = null;
    key: ((e: KeyboardEvent) => boolean) | null = null;
    constructor(options: Record<string, unknown>) {
      this.options = { scrollSensitivity: 1, ...options };
      terms.push(this);
    }
    open(parent: HTMLElement) {
      this.element = document.createElement("div");
      parent.appendChild(this.element);
    }
    resize(cols: number, rows: number) {
      this.cols = cols;
      this.rows = rows;
    }
    loadAddon(addon: { activate: (t: FakeTerminal) => void }) { addon.activate(this); }
    write() {}
    writeln() {}
    focus() {}
    refresh() {}
    dispose() {}
    onData(fn: (d: string) => void) { this.data = fn; return { dispose() {} }; }
    onResize() { return { dispose() {} }; }
    attachCustomKeyEventHandler(fn: (e: KeyboardEvent) => boolean) { this.key = fn; }
  }

  class Addon {
    term: FakeTerminal | null = null;
    activate(term: FakeTerminal) { this.term = term; }
    dispose() {}
    onContextLoss() { return { dispose() {} }; }
    proposeDimensions() { return { cols: 80, rows: 24 }; }
    fit() {}
  }

  return { calls, starts, invoke, terms, FakeTerminal, Addon };
});

vi.mock("@xterm/xterm", () => ({ Terminal: h.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: h.Addon }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: h.Addon }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: h.Addon }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: h.Addon }));
vi.mock("@xterm/addon-image", () => ({ ImageAddon: h.Addon }));
vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: h.Addon }));
vi.mock("../../lib/terminalFileLinks", () => ({ registerFileLinks: () => {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: class { onmessage: unknown = null; } }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: async () => {} }));

import { destroyInstance, stopIdlePolling, wireInput } from "../useTerminal";
import { PTY_STARTING_MESSAGE, sendToActiveTerminal } from "../../lib/terminalCommands";
import { isAppShortcut } from "../../lib/shortcuts";
import { handleOpenMessage, useOpenStatus } from "../../lib/terminalOpen";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore, ownViewOnly, findAllPanes, type Tab } from "../../stores/tabStore";

const keydown = (key: string, mods: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => {
  const e = { type: "keydown", key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, defaultPrevented: false, ...mods } as unknown as KeyboardEvent & { defaultPrevented: boolean };
  (e as { preventDefault: () => void }).preventDefault = () => { (e as { defaultPrevented: boolean }).defaultPrevented = true; };
  return e;
};

/** The text each write_pty carried, in order. */
const written = () =>
  h.calls.filter(([c]) => c === "write_pty").map(([, a]) => new TextDecoder().decode(new Uint8Array(a!.data as number[])));

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  useSettingsStore.setState({ gpuRendering: false, showBanner: false });
  const a: Tab = { id: "a", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "a1", ptyId: 5 } }, "a1") };
  useTabStore.setState({ tabs: [a], activeTabId: "a", closedTabs: [] });
  useOpenStatus.setState({ byView: {} });
});

afterEach(async () => {
  for (const start of h.starts.splice(0)) start(999);
  await flush();
  for (const t of useTabStore.getState().tabs) for (const p of t.viewOrder.flatMap((v) => findAllPanes(t.views[v].root))) destroyInstance(p.id);
  h.calls.length = 0;
  h.terms.length = 0;
  stopIdlePolling();
});

/** `ade open --focus -- bash -l /tmp/launcher` from tab a's own terminal, its PTY started as 41. */
async function openStarting(requestId: number) {
  const handled = handleOpenMessage({
    request: { requestId, expiresAt: Date.now() + 5_000, callerPtyId: 5, cwd: "/work", command: ["bash", "-l", "/tmp/launcher"], split: null, name: null, focus: true },
  });
  const term = h.terms[h.terms.length - 1];
  h.starts[h.starts.length - 1](41);
  await handled;
  await flush();
  return term;
}

describe("a sub-terminal whose command is not yet typed", () => {
  it("drops the user's keys and text, so nothing reaches the PTY before the typed line", async () => {
    const term = await openStarting(1);
    expect(h.calls.some(([c]) => c === "terminal_open_done")).toBe(true);
    // Keys: xterm is told not to handle them (no bytes for letters, arrows, Esc).
    expect(term.key!(keydown("u"))).toBe(false);
    expect(term.key!(keydown("ArrowUp"))).toBe(false);
    // Text that reaches onData anyway (a paste, an IME commit) is dropped too.
    term.data!("ut");
    term.data!(" a");
    term.data!("\r");
    expect(written()).toEqual([]);
  });

  it("still passes xterm's own replies to the shell, and nothing else that starts with ESC", async () => {
    const term = await openStarting(2);
    // A device-attributes reply, a cursor position report and a focus
    // report: a starting shell (fish 4, some prompts) waits for these.
    term.data!("\x1b[?1;2c");
    term.data!("\x1b[3;1R");
    term.data!("\x1b[I");
    // A bracketed paste starts with ESC too, but it is the user's text.
    term.data!("\x1b[200~ut a\x1b[201~");
    expect(written()).toEqual(["\x1b[?1;2c", "\x1b[3;1R", "\x1b[I"]);
  });

  it("drops a bracketed paste (review finding M1)", async () => {
    const term = await openStarting(5);
    term.data!("\x1b[200~rm -rf build\r\x1b[201~");
    expect(written()).toEqual([]);
  });

  it("stops the browser's default for the keys it drops, so Tab doesn't move focus (m2)", async () => {
    const term = await openStarting(6);
    const tab = keydown("Tab");
    expect(term.key!(tab)).toBe(false);
    expect(tab.defaultPrevented).toBe(true);
    const letter = keydown("u");
    term.key!(letter);
    expect(letter.defaultPrevented).toBe(true);
  });

  it("leaves app shortcuts to the window (no preventDefault)", async () => {
    const term = await openStarting(7);
    // Whatever the platform: the first of these the app claims (a new tab).
    const claimed = [keydown("t", { metaKey: true }), keydown("T", { ctrlKey: true, shiftKey: true }), keydown("t", { ctrlKey: true, shiftKey: true })].find((e) => isAppShortcut(e))!;
    expect(claimed).toBeDefined();
    expect(term.key!(claimed)).toBe(false);
    expect(claimed.defaultPrevented).toBe(false);
  });

  it("refuses app-level writes too: sendToActiveTerminal writes nothing, then goes through once typed (B1)", async () => {
    const toasts: string[] = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent).detail.body);
    window.addEventListener("agent-notification", onToast);
    try {
      await openStarting(8);
      // --focus from the tab in sight: the new sub-terminal is the active PTY.
      expect(useTabStore.getState().getActivePtyId()).toBe(41);
      expect(await sendToActiveTerminal("ls", true)).toBe(false);
      expect(written()).toEqual([]);
      expect(toasts).toEqual([PTY_STARTING_MESSAGE]);
      await handleOpenMessage({ typed: 8, ok: true, why: null });
      expect(await sendToActiveTerminal("ls", true)).toBe(true);
      expect(written()).toEqual(["ls\r"]);
    } finally {
      window.removeEventListener("agent-notification", onToast);
    }
  });

  it("takes input again once the command is typed", async () => {
    const term = await openStarting(3);
    term.data!("ut");
    await handleOpenMessage({ typed: 3, ok: true, why: null });
    expect(term.key!(keydown("l"))).toBe(true);
    term.data!("ls\r");
    expect(written()).toEqual(["ls\r"]);
  });

  it("takes input again when the command wasn't typed (exit 5)", async () => {
    const term = await openStarting(4);
    term.data!("ut");
    await handleOpenMessage({ typed: 4, ok: false, why: "the shell's line editor didn't start" });
    expect(term.key!(keydown("l"))).toBe(true);
    term.data!("ls\r");
    expect(written()).toEqual(["ls\r"]);
  });
});

describe("wireInput without a hold", () => {
  it("sends every key and all text, as before", () => {
    const term = new h.FakeTerminal({});
    wireInput({ term, ptyId: 7 } as unknown as Parameters<typeof wireInput>[0]);
    expect(term.key!(keydown("a"))).toBe(true);
    term.data!("ut a");
    expect(written()).toEqual(["ut a"]);
  });
});

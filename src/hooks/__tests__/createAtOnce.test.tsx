import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";

/**
 * `ade open`'s new pane: the window creates its terminal at once, headless,
 * through the real createInstance (xterm and the backend faked). A mount that
 * happens while create_pty is still pending must find that instance (one
 * create_pty per pane), and a mount that fits it to another size gets the PTY
 * resized once create_pty returns.
 */

const h = vi.hoisted(() => {
  /** Every invoke, in order. create_pty waits until the test starts it. */
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const starts: Array<(id: number) => void> = [];
  const invoke = vi.fn((cmd: string, args?: Record<string, unknown>) => {
    calls.push([cmd, args]);
    if (cmd === "create_pty") return new Promise<number>((resolve) => starts.push(resolve));
    return Promise.resolve(null as unknown);
  });

  class FakeTerminal {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    element: HTMLElement | undefined = undefined;
    buffer = { active: { length: 0, getLine: () => undefined } };
    constructor(options: Record<string, unknown>) {
      this.options = { scrollSensitivity: 1, ...options };
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
    onData() { return { dispose() {} }; }
    onResize() { return { dispose() {} }; }
    attachCustomKeyEventHandler() {}
  }

  class Addon {
    term: FakeTerminal | null = null;
    activate(term: FakeTerminal) { this.term = term; }
    dispose() {}
    onContextLoss() { return { dispose() {} }; }
  }

  /** A mounted pane fits its terminal to 120x40. */
  class FakeFitAddon extends Addon {
    proposeDimensions() { return { cols: 120, rows: 40 }; }
    fit() {
      this.term!.cols = 120;
      this.term!.rows = 40;
    }
  }

  return { calls, starts, invoke, FakeTerminal, Addon, FakeFitAddon };
});

vi.mock("@xterm/xterm", () => ({ Terminal: h.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: h.FakeFitAddon }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: h.Addon }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: h.Addon }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: h.Addon }));
vi.mock("@xterm/addon-image", () => ({ ImageAddon: h.Addon }));
vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: h.Addon }));
vi.mock("../../lib/terminalFileLinks", () => ({ registerFileLinks: () => {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: class { onmessage: unknown = null; } }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: async () => {} }));

import { useTerminal, destroyInstance, stopIdlePolling, createSubTerminalInstance } from "../useTerminal";
import { handleOpenMessage } from "../../lib/terminalOpen";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore, ownViewOnly, findAllPanes, type Tab } from "../../stores/tabStore";

function Pane({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useTerminal(id, ref);
  return <div ref={ref} />;
}

let frames: FrameRequestCallback[] = [];

/** Let pending attaches run: microtasks, then queued frames, repeatedly. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { for (const cb of frames.splice(0)) cb(0); });
  }
}

const sizes: Record<string, PropertyDescriptor | undefined> = {};

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  for (const key of ["offsetWidth", "offsetHeight"]) {
    sizes[key] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key);
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => 600 });
  }
});

afterAll(() => {
  vi.unstubAllGlobals();
  for (const [key, desc] of Object.entries(sizes)) if (desc) Object.defineProperty(HTMLElement.prototype, key, desc);
  stopIdlePolling();
});

beforeEach(() => {
  useSettingsStore.setState({ gpuRendering: false, showBanner: false });
  // The caller is tab a's own terminal, PTY 5, with no instance in this window.
  const a: Tab = { id: "a", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "a1", ptyId: 5 } }, "a1") };
  const b: Tab = { id: "b", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "b1", ptyId: 6 } }, "b1") };
  useTabStore.setState({ tabs: [a, b], activeTabId: "b", closedTabs: [] });
});

afterEach(async () => {
  cleanup();
  for (const start of h.starts.splice(0)) start(999);
  await settle();
  for (const t of useTabStore.getState().tabs) for (const p of t.viewOrder.flatMap((v) => findAllPanes(t.views[v].root))) destroyInstance(p.id);
  h.calls.length = 0;
  frames = [];
});

const open = (requestId: number, focus: boolean) =>
  handleOpenMessage({
    request: { requestId, expiresAt: Date.now() + 5_000, callerPtyId: 5, cwd: "/work/api", command: null, split: null, name: null, focus },
  });

const newPane = () => {
  const a = useTabStore.getState().tabs.find((t) => t.id === "a")!;
  return a.views[a.viewOrder[1]].activePaneId;
};
const callsOf = (cmd: string) => h.calls.filter(([c]) => c === cmd).map(([, args]) => args);

describe("one PTY per add", () => {
  it("a focused add makes exactly one create_pty", async () => {
    // --focus is honoured from the tab in sight.
    useTabStore.setState({ activeTabId: "a" });
    const handled = open(1, true);
    // --focus: the new view is in sight, so it mounts while create_pty awaits.
    render(<Pane id={newPane()} />);
    await settle();
    expect(callsOf("create_pty")).toHaveLength(1);
    h.starts[0](12);
    await act(async () => { await handled; });
    await settle();
    expect(callsOf("create_pty")).toHaveLength(1);
    expect(callsOf("terminal_open_done")).toEqual([{ requestId: 1, error: null, ptyId: 12, line: null, focused: true }]);
  });

  it("a background add shown at once makes exactly one create_pty", async () => {
    const handled = open(2, false);
    const paneId = newPane();
    act(() => {
      const a = useTabStore.getState().tabs.find((t) => t.id === "a")!;
      useTabStore.getState().setActiveTab("a");
      useTabStore.getState().showView("a", a.viewOrder[1]);
    });
    render(<Pane id={paneId} />);
    await settle();
    h.starts[0](13);
    await act(async () => { await handled; });
    await settle();
    expect(callsOf("create_pty")).toHaveLength(1);
    expect(callsOf("create_pty")[0]).toMatchObject({ requestId: 2, cwd: "/work/api" });
  });
});

describe("the size", () => {
  it("a focused mount at another size gets one resize_pty after create_pty", async () => {
    useTabStore.setState({ activeTabId: "a" });
    const handled = open(3, true);
    // Made at the caller's size: 24x80, as the caller has no instance here.
    expect(callsOf("create_pty")[0]).toMatchObject({ rows: 24, cols: 80, requestId: 3 });
    render(<Pane id={newPane()} />);
    await settle();
    expect(callsOf("resize_pty")).toEqual([]);
    h.starts[0](14);
    await act(async () => { await handled; });
    await settle();
    expect(callsOf("resize_pty")).toEqual([{ id: 14, rows: 40, cols: 120 }]);
    const order = h.calls.map(([c]) => c);
    expect(order.indexOf("resize_pty")).toBeGreaterThan(order.indexOf("create_pty"));
  });

  it("is made at the caller's size when the caller has a terminal here", async () => {
    // The caller's terminal is 132x43, not xterm's 80x24 or a mount's 120x40.
    const caller = createSubTerminalInstance("a1", () => {}, { cwd: null, size: { cols: 132, rows: 43 }, requestId: 0 });
    h.starts[0](5);
    await act(async () => { await caller; });
    h.calls.length = 0;
    const handled = open(5, false);
    expect(callsOf("create_pty")).toHaveLength(1);
    expect(callsOf("create_pty")[0]).toMatchObject({ rows: 43, cols: 132, requestId: 5 });
    h.starts[1](16);
    await act(async () => { await handled; });
    expect(callsOf("resize_pty")).toEqual([]);
  });

  it("a terminal still at its creation size is not resized", async () => {
    const handled = open(4, false);
    h.starts[0](15);
    await act(async () => { await handled; });
    expect(callsOf("resize_pty")).toEqual([]);
  });
});

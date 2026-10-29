import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";

/**
 * The real useTerminal hook, rendered in jsdom with xterm, its addons and the
 * Tauri backend mocked: where WebGL slots are taken as panes mount, switch
 * tabs, zoom and close.
 */

interface Activatable { activate: (t: FakeTerminalShape) => void }
interface FakeTerminalShape { element: HTMLElement | undefined; cols: number; rows: number }

const h = vi.hoisted(() => {
  /** What happened, in order: "webgl" loads, "fit:<webgl loaded?>", "create_pty". */
  const events: string[] = [];
  const ptys: Array<{ rows: unknown; cols: unknown }> = [];
  let nextPty = 1;
  const invoke = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "create_pty") {
      events.push("create_pty");
      ptys.push({ rows: args?.rows, cols: args?.cols });
      return nextPty++;
    }
    return null as unknown;
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
    loadAddon(addon: Activatable) { addon.activate(this); }
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
  }

  class FakeWebglAddon extends Addon {
    static all: FakeWebglAddon[] = [];
    disposed = false;
    connectedAtLoad: boolean | null = null;
    constructor() {
      super();
      FakeWebglAddon.all.push(this);
    }
    onContextLoss() { return { dispose() {} }; }
    activate(term: FakeTerminal) {
      super.activate(term);
      this.connectedAtLoad = !!term.element?.isConnected;
      events.push("webgl");
    }
    dispose() { this.disposed = true; }
  }

  const webglLoaded = (term: FakeTerminal) => FakeWebglAddon.all.some((a) => a.term === term && !a.disposed);

  class FakeFitAddon extends Addon {
    proposeDimensions() { return { cols: 120, rows: 40 }; }
    fit() {
      const term = this.term!;
      events.push(`fit:${webglLoaded(term)}`);
      term.cols = 120;
      term.rows = 40;
    }
  }

  return { events, ptys, invoke, FakeTerminal, Addon, FakeWebglAddon, FakeFitAddon };
});

vi.mock("@xterm/xterm", () => ({ Terminal: h.FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: h.FakeFitAddon }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: h.FakeWebglAddon }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: h.Addon }));
vi.mock("@xterm/addon-search", () => ({ SearchAddon: h.Addon }));
vi.mock("@xterm/addon-image", () => ({ ImageAddon: h.Addon }));
vi.mock("@xterm/addon-serialize", () => ({ SerializeAddon: h.Addon }));
vi.mock("../../lib/terminalFileLinks", () => ({ registerFileLinks: () => {} }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: class { onmessage: unknown = null; } }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.0.0" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: async () => {} }));

import { useTerminal, getSearchAddon, destroyInstance, stopIdlePolling, __resetGpuForTests } from "../useTerminal";
import { useSettingsStore } from "../../stores/settingsStore";

const { FakeWebglAddon, events, ptys } = h;
type FakeTerminal = InstanceType<typeof h.FakeTerminal>;

function Pane({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useTerminal(id, ref);
  return <div ref={ref} data-pane={id} />;
}

/** A useTerminal whose container never mounts. */
function NoContainer({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useTerminal(id, ref);
  return null;
}

/**
 * The active tab's panes, or only the zoomed one, the way App.tsx and
 * PaneContainer render them. Every pane of a tab switch or a zoom change
 * mounts in ONE React commit from one render: never mount them one per act
 * or per commit, or the switch no longer looks like the app's and the
 * eviction cascade it guards against (all panes' effects run before any of
 * them is seated) goes unseen.
 */
function Screen({ panes, zoomed }: { panes: string[]; zoomed?: string }) {
  return zoomed ? <Pane key={zoomed} id={zoomed} /> : <div>{panes.map((id) => <Pane key={id} id={id} />)}</div>;
}

let frames: FrameRequestCallback[] = [];
const runFrames = () => { for (const cb of frames.splice(0)) cb(0); };
const used = new Set<string>();

/** Let every pending attach finish: microtasks, then queued frames, repeatedly. */
async function settle() {
  for (let i = 0; i < 12; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    await act(async () => { runFrames(); });
  }
}

/** Microtasks only: the frames queued meanwhile stay queued. */
async function microtasks() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function show(r: ReturnType<typeof render> | null, panes: string[], zoomed?: string) {
  panes.forEach((id) => used.add(id));
  if (r) {
    r.rerender(<Screen panes={panes} zoomed={zoomed} />);
    return r;
  }
  return render(<Screen panes={panes} zoomed={zoomed} />);
}

const termOf = (id: string) => (getSearchAddon(id) as unknown as { term: FakeTerminal }).term;
const webglOf = (id: string) => FakeWebglAddon.all.filter((a) => a.term === termOf(id));
/** Panes whose addon (any of them) has been disposed. */
const evicted = () => [...used].filter((id) => webglOf(id).some((a) => a.disposed));
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const B = ids("b", 8);

const sizes = { offsetWidth: 0, offsetHeight: 0 } as Record<string, PropertyDescriptor | undefined>;

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.push(cb); return frames.length; });
  for (const key of Object.keys(sizes)) {
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
  useSettingsStore.setState({ gpuRendering: true, showBanner: false });
});

afterEach(async () => {
  cleanup();
  await settle();
  for (const id of used) destroyInstance(id);
  used.clear();
  __resetGpuForTests();
  FakeWebglAddon.all = [];
  events.length = 0;
  ptys.length = 0;
  frames = [];
  h.invoke.mockClear();
});

describe("seating terminals as panes mount", () => {
  // AC12
  it("switching to a multi-pane tab evicts once", async () => {
    const r = show(null, B);
    await settle();
    expect(FakeWebglAddon.all).toHaveLength(8);
    expect(evicted()).toEqual([]);

    show(r, ["a1"]);
    await settle();
    expect(FakeWebglAddon.all).toHaveLength(9);
    expect(webglOf("a1")).toHaveLength(1);
    expect(evicted()).toEqual(["b1"]);

    const before = FakeWebglAddon.all.length;
    show(r, B);
    await settle();
    expect(FakeWebglAddon.all.length - before).toBe(1);
    expect(webglOf("b1").filter((a) => !a.disposed)).toHaveLength(1);
    expect(evicted().sort()).toEqual(["a1", "b1"]);
    for (const id of B.slice(1)) {
      expect(webglOf(id)).toHaveLength(1);
      expect(webglOf(id)[0].disposed).toBe(false);
    }
  });

  // AC13
  it("zoom and un-zoom evict at most once", async () => {
    const r = show(null, B);
    await settle();
    expect(FakeWebglAddon.all).toHaveLength(8);

    show(r, B, "b1");
    await settle();
    show(r, B);
    await settle();
    expect(FakeWebglAddon.all).toHaveLength(8);
    expect(evicted()).toEqual([]);

    show(r, B, "b1");
    await settle();
    show(r, ["a1"]);
    await settle();
    expect(webglOf("a1")).toHaveLength(1);
    expect(evicted()).toEqual(["b2"]);
    show(r, B, "b1");
    await settle();

    const before = FakeWebglAddon.all.length;
    show(r, B);
    await settle();
    expect(FakeWebglAddon.all.length - before).toBe(1);
    expect(evicted().sort()).toEqual(["a1", "b2"]);
    for (const id of B) expect(webglOf(id).filter((a) => !a.disposed)).toHaveLength(1);
  });

  // AC14
  it("a new pane gets WebGL and its real size before the shell starts", async () => {
    show(null, ["n1"]);
    await settle();
    const [addon] = webglOf("n1");
    expect(addon).toBeDefined();
    expect(addon.connectedAtLoad).toBe(true);
    const pty = events.indexOf("create_pty");
    expect(pty).toBeGreaterThan(0);
    expect(events.indexOf("webgl")).toBeLessThan(pty);
    // The fit the shell's size comes from ran on the WebGL renderer.
    expect(events.slice(0, pty).filter((e) => e.startsWith("fit:"))).toEqual(["fit:true"]);
    expect(ptys).toEqual([{ rows: 40, cols: 120 }]);
  });

  // AC15
  it("a re-shown pane is seated before the next frame", async () => {
    useSettingsStore.setState({ gpuRendering: false });
    const r = show(null, ["p1"]);
    await settle();
    show(r, []);
    await settle();
    expect(webglOf("p1")).toHaveLength(0);

    useSettingsStore.setState({ gpuRendering: true });
    show(r, ["p1"]);
    await microtasks();
    expect(frames.length).toBeGreaterThan(0);
    expect(webglOf("p1")).toHaveLength(1);
    expect(webglOf("p1")[0].connectedAtLoad).toBe(true);
  });

  // AC16
  it("a pane closed before seating gets no WebGL", async () => {
    const r = show(null, ["c1"]);
    show(r, []);
    await settle();
    expect(FakeWebglAddon.all).toHaveLength(0);
    const wrapper = termOf("c1").element!.parentElement!;
    expect(wrapper.parentElement).toBeNull();
  });

  // D1: the mount count is taken after the effect's null-container return.
  it("a pane rendered without a container is not counted as on screen", async () => {
    const r = show(null, B);
    await settle();
    show(r, []);
    await settle();

    const ghost = render(<NoContainer id="b1" />);
    ghost.unmount();

    show(r, ["x1"]);
    await settle();
    expect(webglOf("x1")).toHaveLength(1);
    expect(evicted()).toEqual(["b1"]);
  });
});

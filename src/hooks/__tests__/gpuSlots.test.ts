import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * The WebGL slot policy: WebGL follows the terminals on screen. A terminal
 * seated in a container takes one of MAX_GPU slots; when they are all taken,
 * the least recently seated terminal that is not mounted gives its slot up and
 * goes back to the DOM renderer while hidden. Mounted terminals are never
 * evicted. Driven with fake terminals and a fake WebglAddon.
 */

interface FakeGl {
  loseContext: () => void;
  getExtension: (name: string) => { loseContext: () => void } | null;
}

interface FakeTerm {
  element: HTMLElement;
  rows: number;
  options: Record<string, unknown>;
  loadAddon: (addon: { activate: (t: FakeTerm) => void }) => void;
  refresh: (start: number, end: number) => void;
  dispose: () => void;
}

const h = vi.hoisted(() => {
  const log: string[] = [];
  const invoke = vi.fn(async (_cmd: string, _args?: unknown) => null as unknown);

  class FakeWebglAddon {
    static all: FakeWebglAddon[] = [];
    /** Every constructor call, including ones that throw. */
    static constructed = 0;
    static throwOnConstruct: Error | null = null;
    /** Errors the next activations throw, after appending their canvas. */
    static failActivate: Error[] = [];
    /** Activations of an addon that was already disposed or already loaded. */
    static reused = 0;

    static reset() {
      FakeWebglAddon.all = [];
      FakeWebglAddon.constructed = 0;
      FakeWebglAddon.throwOnConstruct = null;
      FakeWebglAddon.failActivate = [];
      FakeWebglAddon.reused = 0;
    }

    term: FakeTerm | null = null;
    disposed = false;
    activated = false;
    connectedAtLoad: boolean | null = null;
    loss: (() => void) | null = null;
    canvas: HTMLCanvasElement | null = null;
    gl: FakeGl;
    /** Runs inside dispose(), as a renderer's own context-loss event could. */
    onDispose: (() => void) | null = null;

    constructor() {
      FakeWebglAddon.constructed++;
      if (FakeWebglAddon.throwOnConstruct) throw FakeWebglAddon.throwOnConstruct;
      const lose = vi.fn(() => { log.push("loseContext"); });
      this.gl = { loseContext: lose, getExtension: (name) => (name === "WEBGL_lose_context" ? { loseContext: lose } : null) };
      FakeWebglAddon.all.push(this);
    }

    onContextLoss(cb: () => void) {
      this.loss = cb;
      return { dispose() {} };
    }

    activate(term: FakeTerm) {
      if (this.disposed || this.term) FakeWebglAddon.reused++;
      this.term = term;
      this.connectedAtLoad = term.element.isConnected;
      // WebglRenderer appends its canvas before it can fail.
      const canvas = document.createElement("canvas");
      const gl = this.gl;
      (canvas as unknown as { getContext: (kind: string) => unknown }).getContext = (kind) => (kind === "webgl2" ? gl : null);
      term.element.appendChild(canvas);
      this.canvas = canvas;
      const err = FakeWebglAddon.failActivate.shift();
      if (err) throw err;
      this.activated = true;
    }

    dispose() {
      log.push("dispose");
      this.disposed = true;
      // A working renderer takes its canvas with it; a failed one never got that far.
      if (this.activated) this.canvas?.remove();
      this.onDispose?.();
    }
  }

  return { log, invoke, FakeWebglAddon };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke, Channel: class { onmessage: unknown = null; } }));
vi.mock("@xterm/addon-webgl", () => ({ WebglAddon: h.FakeWebglAddon }));

import {
  MAX_GPU,
  seatTerminal,
  notePaneMounted,
  notePaneUnmounted,
  detachInstance,
  destroyInstance,
  __resetGpuForTests,
  __setInstanceForTests,
} from "../useTerminal";
import { useSettingsStore } from "../../stores/settingsStore";

const { FakeWebglAddon, log } = h;
type Addon = InstanceType<typeof FakeWebglAddon>;
type Inst = Parameters<typeof seatTerminal>[2];

/** A pane with a fake terminal in a detached wrapper, and its container on the page. */
function pane(id: string) {
  const element = document.createElement("div");
  const wrapper = document.createElement("div");
  wrapper.appendChild(element);
  const writes: Array<[string, unknown]> = [];
  const options = new Proxy<Record<string, unknown>>({ scrollSensitivity: 1 }, {
    set(target, key, value) {
      writes.push([String(key), value]);
      target[String(key)] = value;
      return true;
    },
  });
  const term: FakeTerm = {
    element,
    rows: 24,
    options,
    loadAddon: vi.fn((addon: { activate: (t: FakeTerm) => void }) => addon.activate(term)),
    refresh: vi.fn(),
    dispose: vi.fn(() => { log.push("term.dispose"); }),
  };
  const inst = { term, wrapper, fitAddon: {}, searchAddon: {}, serializeAddon: {}, ptyId: null } as unknown as Inst;
  const container = document.createElement("div");
  document.body.appendChild(container);

  const p = {
    id, term, inst, wrapper, container, writes,
    seat: () => seatTerminal(id, container, inst),
    /** Mounted and seated, as the pane's effect does it. */
    show: () => { notePaneMounted(id); p.seat(); },
    /** Unmounted: the effect's cleanup. */
    hide: () => { notePaneUnmounted(id); wrapper.remove(); },
    addons: (): Addon[] => FakeWebglAddon.all.filter((a) => a.term === term),
    addon: (): Addon => p.addons()[p.addons().length - 1],
  };
  return p;
}
type Pane = ReturnType<typeof pane>;

const ids = (n: number, prefix = "p") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

/** n terminals that each took a slot while shown, then were hidden. */
function hiddenHolders(n: number, prefix = "p"): Pane[] {
  const ps = ids(n, prefix).map(pane);
  for (const p of ps) p.show();
  for (const p of ps) p.hide();
  return ps;
}

/** n terminals that each took a slot and are still on screen. */
function shownHolders(n: number, prefix = "p"): Pane[] {
  const ps = ids(n, prefix).map(pane);
  for (const p of ps) p.show();
  return ps;
}

const disposed = (ps: Pane[]) => ps.filter((p) => p.addons().some((a) => a.disposed)).map((p) => p.id);
const logErrors = () => h.invoke.mock.calls.filter(([cmd]) => cmd === "log_error");
const transient = () => new Error("could not initialize WebGL state");
const unsupported = () => new Error("WebGL2 not supported null");

/** The D7 nudge: scrollSensitivity written to another value, then back. */
function expectRespaced(p: Pane) {
  expect(p.writes).toHaveLength(2);
  expect(p.writes[0][0]).toBe("scrollSensitivity");
  expect(p.writes[0][1]).not.toBe(1);
  expect(p.writes[1]).toEqual(["scrollSensitivity", 1]);
  expect(p.term.options.scrollSensitivity).toBe(1);
}

const registered: string[] = [];

beforeEach(() => {
  __resetGpuForTests();
  FakeWebglAddon.reset();
  log.length = 0;
  h.invoke.mockClear();
  useSettingsStore.setState({ gpuRendering: true });
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const id of registered.splice(0)) detachInstance(id);
});

describe("WebGL slots follow the terminals on screen", () => {
  it("has 8 slots", () => {
    expect(MAX_GPU).toBe(8);
  });

  // AC1
  it("a seated terminal gets WebGL once", () => {
    const a = pane("a");
    a.show();
    expect(a.addons()).toHaveLength(1);
    expect(a.addon().connectedAtLoad).toBe(true);
    a.seat();
    a.seat();
    expect(a.addons()).toHaveLength(1);
    expect(a.term.loadAddon).toHaveBeenCalledTimes(1);
    expect(a.addon().disposed).toBe(false);
  });

  // AC2
  it("the 9th terminal gets WebGL while 8 hidden ones hold slots", () => {
    const held = hiddenHolders(8);
    const i = pane("i");
    i.show();
    expect(i.addons()).toHaveLength(1);
    expect(i.addon().disposed).toBe(false);
    expect(disposed(held)).toHaveLength(1);
  });

  // AC3
  it("evicts the least recently seated hidden terminal", () => {
    const [a, b, ...rest] = hiddenHolders(8);
    a.show();
    a.hide();
    pane("i").show();
    expect(disposed([a, b, ...rest])).toEqual([b.id]);
  });

  // AC4
  it("never evicts a mounted terminal", () => {
    // 8 mounted holders, one of them not (or no longer) in its container yet.
    const held = shownHolders(8);
    held[0].wrapper.remove();
    const i = pane("i");
    i.show();
    expect(i.addons()).toHaveLength(0);
    expect(disposed(held)).toEqual([]);

    // 7 mounted and 1 hidden, with a mounted one the oldest: the hidden one goes.
    __resetGpuForTests();
    FakeWebglAddon.reset();
    const q = shownHolders(8, "q");
    q[7].hide();
    const j = pane("j");
    j.show();
    expect(j.addons()).toHaveLength(1);
    expect(disposed(q)).toEqual([q[7].id]);

    // Mounted twice (StrictMode) and unmounted once is still mounted.
    __resetGpuForTests();
    FakeWebglAddon.reset();
    const r = shownHolders(8, "r");
    notePaneMounted("r1");
    for (const p of r) p.hide();
    pane("k").show();
    expect(disposed(r)).toEqual(["r2"]);
  });

  // AC5
  it("a re-shown terminal regains WebGL with a new addon", () => {
    const held = hiddenHolders(8);
    const [a, b] = held;
    const first = a.addon();
    const i = pane("i");
    i.show();
    i.hide();
    expect(first.disposed).toBe(true);

    a.show();
    expect(a.addons()).toHaveLength(2);
    expect(a.addon()).not.toBe(first);
    expect(a.addon().disposed).toBe(false);
    expect(disposed(held.slice(1))).toEqual([b.id]);
    expect(FakeWebglAddon.reused).toBe(0);
  });

  // AC6
  it("releases in order and ignores a stale context loss", () => {
    const held = hiddenHolders(8);
    const [a, b] = held;
    const old = a.addon();
    // A renderer that fires its context loss while being disposed.
    old.onDispose = () => old.loss!();
    log.length = 0;

    const i = pane("i");
    i.show();
    // The slot was gone before dispose ran, and dispose ran before loseContext.
    expect(log).toEqual(["dispose", "loseContext"]);
    expect(a.term.refresh).not.toHaveBeenCalled();

    // A late context loss from the evicted addon changes no slot.
    old.onDispose = null;
    old.loss!();
    expect(a.term.refresh).not.toHaveBeenCalled();

    // Nor once the terminal holds a new slot.
    i.hide();
    a.show();
    expect(disposed(held.slice(1))).toEqual([b.id]);
    old.loss!();
    expect(a.addon()).not.toBe(old);
    expect(a.addon().disposed).toBe(false);
    expect(a.term.refresh).not.toHaveBeenCalled();

    // The slots are still all taken: the next seat evicts once.
    a.hide();
    const before = disposed([...held, i]).length;
    pane("j").show();
    expect(disposed([...held, i]).length).toBe(before + 1);
  });

  // AC7
  it("context loss frees the slot", () => {
    const held = shownHolders(8);
    const [a, b] = held;
    a.addon().loss!();
    expect(a.addon().disposed).toBe(true);
    expect(a.term.refresh).toHaveBeenCalledWith(0, 23);

    // The next seat takes the freed slot without evicting anyone.
    const i = pane("i");
    i.show();
    expect(i.addons()).toHaveLength(1);
    expect(disposed(held)).toEqual([a.id]);

    // A terminal that lost its context gets a new addon on its next seat.
    const lost = b.addon();
    lost.loss!();
    b.seat();
    expect(b.addons()).toHaveLength(2);
    expect(b.addon()).not.toBe(lost);
    expect(b.addon().disposed).toBe(false);
  });

  // AC8
  it("the setting off means no WebGL", () => {
    const held = shownHolders(8);
    const [a] = held;
    useSettingsStore.setState({ gpuRendering: false });
    const x = pane("x");
    x.show();
    expect(FakeWebglAddon.constructed).toBe(8);

    a.seat();
    expect(a.addon().disposed).toBe(true);
    expect(log).toContain("loseContext");

    useSettingsStore.setState({ gpuRendering: true });
    const i = pane("i");
    i.show();
    expect(i.addons()).toHaveLength(1);
    expect(disposed(held)).toEqual([a.id]);
  });

  // AC9
  it("detach and destroy free the slot", () => {
    const held = shownHolders(8);
    for (const p of held) {
      __setInstanceForTests(p.id, p.inst);
      registered.push(p.id);
    }
    const [a, b] = held;

    log.length = 0;
    detachInstance(a.id);
    expect(log.indexOf("dispose")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("dispose")).toBeLessThan(log.indexOf("term.dispose"));
    const i = pane("i");
    i.show();
    expect(i.addons()).toHaveLength(1);
    expect(disposed(held)).toEqual([a.id]);

    log.length = 0;
    destroyInstance(b.id);
    expect(log.indexOf("dispose")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("dispose")).toBeLessThan(log.indexOf("term.dispose"));
    const j = pane("j");
    j.show();
    expect(j.addons()).toHaveLength(1);
    expect(disposed(held)).toEqual([a.id, b.id]);
  });

  // AC10
  it("a failed load cleans up and does not latch", () => {
    const [a, b] = shownHolders(2);
    const c = pane("c");
    FakeWebglAddon.failActivate.push(transient());
    expect(() => c.show()).not.toThrow();

    const failed = c.addon();
    expect(failed.disposed).toBe(true);
    expect(failed.canvas!.isConnected).toBe(false);
    expect(c.term.element.querySelector("canvas")).toBeNull();
    expect(failed.gl.loseContext).toHaveBeenCalled();

    // Every other holder keeps its addon through its next seat.
    a.seat();
    b.seat();
    expect(a.addons()).toHaveLength(1);
    expect(b.addons()).toHaveLength(1);
    expect(a.addon().disposed).toBe(false);
    expect(b.addon().disposed).toBe(false);

    // No slot was taken, and one failure does not latch: the next seat tries again.
    c.seat();
    expect(c.addons()).toHaveLength(2);
    expect(c.addon().disposed).toBe(false);
    expect(logErrors()).toEqual([]);
  });

  // AC11
  it("a DOM-rendered terminal re-measures its spacing when seated", () => {
    // Holding a slot: no option is touched, seated once or again.
    const held = shownHolders(8);
    held[0].seat();
    for (const p of held) expect(p.writes).toEqual([]);

    // All holders mounted: no slot.
    const full = pane("full");
    full.show();
    expect(full.addons()).toHaveLength(0);
    expectRespaced(full);

    // Setting off.
    useSettingsStore.setState({ gpuRendering: false });
    const off = pane("off");
    off.show();
    expectRespaced(off);
    useSettingsStore.setState({ gpuRendering: true });

    // A failed load.
    held[7].hide();
    const failed = pane("failed");
    FakeWebglAddon.failActivate.push(transient());
    failed.show();
    expectRespaced(failed);

    // Latched off.
    held[6].hide();
    const latch = pane("latch");
    FakeWebglAddon.failActivate.push(unsupported());
    latch.show();
    const after = pane("after");
    after.show();
    expect(after.addons()).toHaveLength(0);
    expectRespaced(after);
  });
});

// AC17
describe("WebGL latches off only when unsupported or failing repeatedly", () => {
  it("latches at once when WebGL2 is not supported", () => {
    FakeWebglAddon.failActivate.push(unsupported());
    pane("x").show();
    expect(logErrors()).toHaveLength(1);
    expect(logErrors()[0][1]).toEqual({ message: expect.stringContaining("WebGL2 not supported") });
    const before = FakeWebglAddon.constructed;
    pane("y").show();
    expect(FakeWebglAddon.constructed).toBe(before);
    expect(logErrors()).toHaveLength(1);
  });

  it("latches at once when the addon cannot be constructed", () => {
    FakeWebglAddon.throwOnConstruct = new Error("Webgl2 is only supported on Safari 16 and above");
    pane("x").show();
    FakeWebglAddon.throwOnConstruct = null;
    expect(logErrors()).toHaveLength(1);
    const before = FakeWebglAddon.constructed;
    pane("y").show();
    expect(FakeWebglAddon.constructed).toBe(before);
  });

  it("latches after three transient failures in a row", () => {
    for (const id of ["x1", "x2"]) {
      FakeWebglAddon.failActivate.push(transient());
      pane(id).show();
    }
    expect(logErrors()).toHaveLength(0);
    FakeWebglAddon.failActivate.push(transient());
    pane("x3").show();
    expect(logErrors()).toHaveLength(1);
    expect(logErrors()[0][1]).toEqual({ message: expect.stringContaining("could not initialize WebGL state") });
    const before = FakeWebglAddon.constructed;
    pane("y").show();
    expect(FakeWebglAddon.constructed).toBe(before);
  });

  it("does not latch when a success comes between failures", () => {
    for (const id of ["x1", "x2"]) {
      FakeWebglAddon.failActivate.push(transient());
      pane(id).show();
    }
    pane("ok").show();
    for (const id of ["x3", "x4"]) {
      FakeWebglAddon.failActivate.push(transient());
      pane(id).show();
    }
    const y = pane("y");
    y.show();
    expect(y.addons()).toHaveLength(1);
    expect(y.addon().disposed).toBe(false);
    expect(logErrors()).toHaveLength(0);
  });

  it("once latched, constructs nothing, evicts nothing and keeps the holders", () => {
    const held = hiddenHolders(7);
    FakeWebglAddon.failActivate.push(unsupported());
    pane("x").show();
    const before = FakeWebglAddon.constructed;

    for (const p of held) p.show();
    for (const p of held) p.hide();
    const y = pane("y");
    y.show();
    expect(y.addons()).toHaveLength(0);
    expect(FakeWebglAddon.constructed).toBe(before);
    expect(disposed(held)).toEqual([]);
    for (const p of held) expect(p.addons()).toHaveLength(1);
    expect(logErrors()).toHaveLength(1);
  });
});

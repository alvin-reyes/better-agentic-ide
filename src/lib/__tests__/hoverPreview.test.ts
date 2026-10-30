import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { attachHoverDismissal, createHoverController, textMoved, type BufferState, type HoverCard } from "../hoverPreview";
import { PeekCache, type PeekFrame } from "../filePeek";

const A = "pane-a";
const B = "pane-b";
const K1 = { abs: "/p/src/App.tsx", key: "/p/src/App.tsx\u00003,4-14,4" };
const K2 = { abs: "/p/docs/plan.md", key: "/p/docs/plan.md\u00001,9-12,9" };
const at = (x: number, y = 100, buttons = 0) => ({ x, y, buttons });

function textFrame(text: string, stamp = "s1"): PeekFrame {
  return { peek: { size: text.length, modifiedMs: 0, stamp, body: { type: "text", text, truncated: false } }, payload: new Uint8Array() };
}

/** A controller with `peek` answered by hand, and `show`/`hide` recorded. */
function setup() {
  const peeks: { path: string; kind: string; known?: string; resolve: (f: PeekFrame) => void; reject: (e: unknown) => void }[] = [];
  const peek = vi.fn(
    (path: string, kind: string, known?: string) =>
      new Promise<PeekFrame>((resolve, reject) => peeks.push({ path, kind, known, resolve, reject })),
  );
  const show = vi.fn((_card: HoverCard) => {});
  const hide = vi.fn(() => {});
  const cache = new PeekCache();
  const state = { enabled: true };
  const c = createHoverController({ peek, cache, show, hide, enabled: () => state.enabled });
  const lastShown = () => show.mock.lastCall?.[0];
  return { c, peek, peeks, show, hide, cache, state, lastShown };
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** A card for K1 at x 100, answered at once. */
async function shown(t: ReturnType<typeof setup>) {
  t.c.pointerMoved(A, at(100));
  t.c.enter(A, K1, at(100));
  await tick(350);
  t.peeks[t.peeks.length - 1].resolve(textFrame("hello"));
  await tick(0);
  expect(t.lastShown()).toMatchObject({ abs: K1.abs, state: "ready" });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("createHoverController", () => {
  it("delays, cancels and drops stale previews", async () => {
    // No peek before 350 ms; an answer within 200 ms shows no loading card.
    let t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(349);
    expect(t.peek).not.toHaveBeenCalled();
    await tick(1);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.peek).toHaveBeenCalledWith(K1.abs, "text", undefined);
    await tick(199);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(0);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()).toEqual({
      abs: K1.abs,
      point: { x: 100, y: 100 },
      state: "ready",
      content: { size: 5, modifiedMs: 0, body: { type: "text", text: "hello", truncated: false } },
    });
    await tick(1000);
    expect(t.show).toHaveBeenCalledTimes(1);

    // A real leave at 349 ms, then the grace runs out: no peek and no card.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(349);
    t.c.pointerMoved(A, at(101));
    t.c.leave(A, K1.key);
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.hide).not.toHaveBeenCalled();

    // An answer that arrives after a dismissal is cached, but shows nothing.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    t.c.dismiss();
    t.peeks[0].resolve(textFrame("late", "s9"));
    await tick(1000);
    expect(t.show).not.toHaveBeenCalled();
    expect(t.cache.get(K1.abs)).toMatchObject({ stamp: "s9", content: { type: "text", text: "late" } });

    // A stale answer, landing while the next link loads, leaves that card alone.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    t.c.pointerMoved(A, at(500));
    t.c.enter(A, K2, at(500));
    await tick(350 + 100);
    t.peeks[0].resolve(textFrame("stale"));
    await tick(100);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()).toEqual({ abs: K2.abs, point: { x: 500, y: 100 }, state: "loading" });

    // The same for a stale rejection.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    t.c.pointerMoved(A, at(500));
    t.c.enter(A, K2, at(500));
    await tick(350 + 100);
    t.peeks[0].reject("gone");
    await tick(100);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()).toEqual({ abs: K2.abs, point: { x: 500, y: 100 }, state: "loading" });

    // A slower answer shows the loading card first.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350 + 199);
    expect(t.show).not.toHaveBeenCalled();
    await tick(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()).toEqual({ abs: K1.abs, point: { x: 100, y: 100 }, state: "loading" });
    t.peeks[0].resolve(textFrame("slow"));
    await tick(0);
    expect(t.show).toHaveBeenCalledTimes(2);
    expect(t.lastShown()).toMatchObject({ state: "ready", content: { body: { text: "slow" } } });

    // With the setting off, enter calls nothing.
    t = setup();
    t.state.enabled = false;
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.hide).not.toHaveBeenCalled();

    // A rejected peek shows an error card.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    t.peeks[0].reject("permission denied");
    await tick(0);
    expect(t.lastShown()).toEqual({ abs: K1.abs, point: { x: 100, y: 100 }, state: "error", error: "permission denied" });
  });

  it("a repeat hover sends the cached stamp and shows the cached text when unchanged", async () => {
    const t = setup();
    await shown(t);
    expect(t.cache.get(K1.abs)?.stamp).toBe("s1");
    t.c.pointerMoved(A, at(500));
    t.c.enter(A, K2, at(500));
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    expect(t.peek).toHaveBeenLastCalledWith(K1.abs, "text", "s1");
    t.peeks[t.peeks.length - 1].resolve({ peek: { size: 5, modifiedMs: 0, stamp: "s1", body: { type: "unchanged" } }, payload: new Uint8Array() });
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K1.abs, state: "ready", content: { body: { type: "text", text: "hello" } } });
    // A binary answer is not cached: the next hover sends no stamp.
    t.c.pointerMoved(A, at(500));
    t.c.enter(A, K2, at(500));
    await tick(350);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
    t.peeks[t.peeks.length - 1].resolve({ peek: { size: 9, modifiedMs: 0, stamp: "b", body: { type: "binary" } }, payload: new Uint8Array() });
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K2.abs, content: { body: { type: "binary" } } });
    expect(t.cache.get(K2.abs)).toBeUndefined();
  });

  it("an image answer is kept as a Blob of its type", async () => {
    const t = setup();
    const svg = { abs: "/p/logo.svg", key: "/p/logo.svg\u00000,2-11,2" };
    const bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, svg, at(100));
    await tick(350);
    expect(t.peek).toHaveBeenLastCalledWith(svg.abs, "image", undefined);
    t.peeks[0].resolve({ peek: { size: bytes.length, modifiedMs: 0, stamp: "v1", body: { type: "bytes", length: bytes.length } }, payload: bytes });
    await tick(0);
    const body = t.lastShown()?.content?.body;
    expect(body).toMatchObject({ type: "image" });
    const blob = (body as { blob: Blob }).blob;
    expect(blob.type).toBe("image/svg+xml");
    // jsdom's Blob has no `arrayBuffer`; FileReader reads it, on real timers.
    vi.useRealTimers();
    const read = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    expect([...new Uint8Array(read)]).toEqual([...bytes]);
    expect(t.cache.get(svg.abs)).toMatchObject({ stamp: "v1", content: { type: "image", blob } });
  });

  it("an evicted entry is kept by its request", async () => {
    const t = setup();
    const img = (n: number) => ({ abs: `/p/shot${n}.png`, key: `/p/shot${n}.png\u00000,${n}-12,${n}` });
    const imageFrame = (stamp: string): PeekFrame => ({
      peek: { size: 10_000_000, modifiedMs: 0, stamp, body: { type: "bytes", length: 10_000_000, width: 640, height: 480 } },
      payload: new Uint8Array(10_000_000),
    });
    const hover = async (n: number) => {
      t.c.pointerMoved(A, at(100 + n));
      t.c.enter(A, img(n), at(100 + n));
      await tick(350);
    };

    // The first image is shown and cached.
    await hover(0);
    expect(t.peek).toHaveBeenLastCalledWith(img(0).abs, "image", undefined);
    t.peeks[0].resolve(imageFrame("x1"));
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: img(0).abs, state: "ready", content: { body: { type: "image", width: 640, height: 480 } } });
    const blob = (t.lastShown()?.content?.body as { blob: Blob }).blob;
    expect(blob.size).toBe(10_000_000);
    expect(blob.type).toBe("image/png");

    // Three more are asked for, then the first again, with its stamp.
    for (const n of [1, 2, 3]) await hover(n);
    await hover(0);
    expect(t.peek).toHaveBeenLastCalledWith(img(0).abs, "image", "x1");
    // Their answers land first: 40 MB, so the first image is evicted.
    for (const n of [1, 2, 3]) t.peeks[n].resolve(imageFrame(`s${n}`));
    await tick(0);
    expect(t.cache.get(img(0).abs)).toBeUndefined();
    expect(t.cache.size).toBe(3);

    // `unchanged` is still served, from the entry the request kept.
    t.peeks[4].resolve({ peek: { size: 10_000_000, modifiedMs: 0, stamp: "x1", body: { type: "unchanged" } }, payload: new Uint8Array() });
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: img(0).abs, state: "ready", content: { body: { type: "image", blob, width: 640, height: 480 } } });
    expect(t.cache.get(img(0).abs)?.content).toMatchObject({ type: "image", blob });
  });

  it("a redraw leave keeps the card; a vanished path closes it", async () => {
    const t = setup();
    await shown(t);
    // xterm redraws the rows under a still pointer: leave, then the same link again.
    t.c.leave(A, K1.key);
    await tick(900);
    t.c.enter(A, K1, at(100));
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);

    // No re-hover: the path went away, and the card closes at 1000 ms.
    t.c.leave(A, K1.key);
    await tick(999);
    expect(t.hide).not.toHaveBeenCalled();
    await tick(1);
    expect(t.hide).toHaveBeenCalledTimes(1);

    // It was a dismissal: new content under the still pointer opens nothing.
    t.c.enter(A, K2, at(100));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    // Until the pointer moves, which reopens the link now under it.
    t.c.pointerMoved(A, at(102));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);

    // The vanished path's dismissal suppresses like any other: leaving the
    // terminal (a move, but no pointerMoved) does not lift it.
    const u = setup();
    await shown(u);
    u.c.leave(A, K1.key);
    await tick(1000);
    u.c.pointerLeft(A);
    u.c.enter(A, K2, at(100));
    await tick(2000);
    expect(u.peek).toHaveBeenCalledTimes(1);
  });

  it("content drawn under a still pointer opens no card", async () => {
    let t = setup();
    await shown(t);
    t.c.leave(A, K1.key);
    t.c.enter(A, K2, at(100));
    expect(t.hide).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);

    // No card yet: an accepted K1, then K2 with no pointer move in between.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(100);
    t.c.enter(A, K2, at(100));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();
  });

  it("real leaves, row crossings and double hovers", async () => {
    let t = setup();
    await shown(t);
    // Moving along a link that wraps onto the next row: leave, then the same key.
    t.c.pointerMoved(A, at(160, 100));
    t.c.leave(A, K1.key);
    await tick(100);
    t.c.pointerMoved(A, at(20, 117));
    t.c.enter(A, K1, at(20, 117));
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()?.point).toEqual({ x: 100, y: 100 });
    expect(t.peek).toHaveBeenCalledTimes(1);

    // Leaving for real: hidden at 150 ms, without suppressing.
    t.c.pointerMoved(A, at(40, 140));
    t.c.leave(A, K1.key);
    await tick(149);
    expect(t.hide).not.toHaveBeenCalled();
    await tick(1);
    expect(t.hide).toHaveBeenCalledTimes(1);
    // Not suppressed: the next link opens with no further pointer move.
    t.c.enter(A, K2, at(40, 140));
    await tick(349);
    expect(t.peek).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(t.peek).toHaveBeenCalledTimes(2);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
    t.peeks[1].resolve(textFrame("plan"));
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K2.abs, point: { x: 40, y: 140 }, state: "ready" });

    // And after a further pointer move too; a late leave of the old link is ignored.
    t.c.pointerMoved(A, at(300));
    t.c.enter(A, K1, at(300));
    t.c.leave(A, K2.key);
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(3);
    t.peeks[2].resolve(textFrame("again"));
    await tick(1000);
    expect(t.lastShown()).toMatchObject({ abs: K1.abs, state: "ready" });

    // Two hovers with no leave between them (a late provider reply): one card, one peek.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(200);
    t.c.enter(A, K1, at(100));
    await tick(150);
    expect(t.peek).toHaveBeenCalledTimes(1);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(0);
    t.c.enter(A, K1, at(100));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.hide).not.toHaveBeenCalled();
  });

  it("a wait holds back what the card would show until the link is back", async () => {
    // The delay ends during a redraw wait: no peek until the re-hover.
    let t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(300);
    t.c.leave(A, K1.key);
    await tick(100);
    expect(t.peek).not.toHaveBeenCalled();
    t.c.enter(A, K1, at(100));
    await tick(0);
    expect(t.peek).toHaveBeenCalledTimes(1);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(0);
    expect(t.lastShown()).toMatchObject({ state: "ready" });

    // The answer lands during a grace: shown once the same link is hovered again.
    t = setup();
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    t.c.pointerMoved(A, at(101));
    t.c.leave(A, K1.key);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(100);
    expect(t.show).not.toHaveBeenCalled();
    t.c.enter(A, K1, at(101));
    await tick(0);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()).toMatchObject({ state: "ready", point: { x: 100, y: 100 } });
  });

  it("a dismissal holds until the pointer moves, then reopens the link under it", async () => {
    const term = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
    const dismissals: [string, (t: ReturnType<typeof setup>) => void][] = [
      ["keydown", () => term.child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))],
      ["mousedown", () => term.child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))],
      ["wheel", () => term.child.dispatchEvent(new WheelEvent("wheel", { bubbles: true }))],
      ["activate", (t) => t.c.dismiss()],
      ["blur", () => window.dispatchEvent(new Event("blur"))],
      ["contentMoved", (t) => t.c.contentMoved(A)],
    ];
    for (const [name, dismissal] of dismissals) {
      const t = setup();
      const detach = attachHoverDismissal(term.term, A, t.c);
      await shown(t);
      // The pointer moved inside the link (no new hover), then the dismissal.
      t.c.pointerMoved(A, at(104));
      dismissal(t);
      expect(t.hide, name).toHaveBeenCalledTimes(1);

      // A redraw under the pointer brings nothing back, however long it waits.
      t.c.leave(A, K1.key);
      t.c.enter(A, K1, at(104));
      await tick(2000);
      expect(t.peek, name).toHaveBeenCalledTimes(1);
      expect(t.show, name).toHaveBeenCalledTimes(1);

      // Nudging the pointer on the link reopens it, with no new hover from xterm.
      t.c.pointerMoved(A, at(108));
      await tick(349);
      expect(t.peek, name).toHaveBeenCalledTimes(1);
      await tick(1);
      expect(t.peek, name).toHaveBeenCalledTimes(2);
      t.peeks[1].resolve({ peek: { size: 5, modifiedMs: 0, stamp: "s1", body: { type: "unchanged" } }, payload: new Uint8Array() });
      await tick(0);
      expect(t.lastShown(), name).toMatchObject({ abs: K1.abs, point: { x: 108, y: 100 }, state: "ready" });
      detach();
    }

    // A hover that went stale while suppressed is forgotten.
    const t = setup();
    await shown(t);
    t.c.dismiss();
    t.c.enter(A, K1, at(100));
    t.c.leave(A, K1.key);
    t.c.pointerMoved(A, at(120));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    // That move lifted the suppression: the next link xterm reports opens.
    t.c.enter(A, K2, at(120));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
  });

  it("dragging a selection shows no card", async () => {
    const t = setup();
    t.c.pointerMoved(A, at(100, 100, 1));
    t.c.enter(A, K1, at(100, 100, 1));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();

    // A press dismisses; dragging with the button held does not lift that.
    await shown(t);
    t.c.dismiss();
    t.c.pointerMoved(A, at(130, 100, 1));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    // Released and moved: the link under the pointer comes back.
    t.c.pointerMoved(A, at(131));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
  });
});

/** A terminal with a real element, a fake buffer, and onResize/onScroll emitters. */
function fakeTerminal(buffer: BufferState) {
  const element = document.createElement("div");
  const child = document.createElement("span");
  element.appendChild(child);
  document.body.appendChild(element);
  // xterm's own handlers stop some events from bubbling: only capture sees them.
  for (const type of ["mousemove", "mousedown", "wheel", "keydown"]) child.addEventListener(type, (e) => e.stopPropagation());
  const emitter = () => {
    const listeners = new Set<() => void>();
    return {
      fire: () => listeners.forEach((l) => l()),
      on: (l: () => void) => {
        listeners.add(l);
        return { dispose: () => listeners.delete(l) };
      },
    };
  };
  const resize = emitter();
  const scroll = emitter();
  const state = { ...buffer };
  const term = {
    element,
    get rows() {
      return state.rows;
    },
    options: { scrollback: state.scrollback },
    buffer: { active: state },
    onResize: resize.on,
    onScroll: scroll.on,
  } as unknown as Terminal;
  return { term, element, child, state, resize, scroll };
}

describe("textMoved", () => {
  const notFull = { length: 500, rows: 30, scrollback: 1000 };
  const full = { length: 1030, rows: 30, scrollback: 1000 };

  it("content moves exactly when xterm moves the text", async () => {
    // Scrollback not full, following output: both move up by one.
    expect(textMoved({ ...notFull, viewportY: 469, baseY: 469 }, { ...notFull, length: 501, viewportY: 470, baseY: 470 })).toBe(true);
    // Not full, scrolled back: the view stays.
    expect(textMoved({ ...notFull, viewportY: 200, baseY: 469 }, { ...notFull, length: 501, viewportY: 200, baseY: 470 })).toBe(false);
    // Not full, the view moved up by one: a real scroll, not a trim.
    expect(textMoved({ ...notFull, viewportY: 200, baseY: 469 }, { ...notFull, viewportY: 199, baseY: 469 })).toBe(true);
    // Full, following output: nothing changes, but the oldest line is recycled.
    expect(textMoved({ ...full, viewportY: 1000, baseY: 1000 }, { ...full, viewportY: 1000, baseY: 1000 })).toBe(true);
    // Full, scrolled back: the view drops by one, the text stays put.
    expect(textMoved({ ...full, viewportY: 400, baseY: 1000 }, { ...full, viewportY: 399, baseY: 1000 })).toBe(false);
    // Full, scrolled back, unchanged: nothing moved.
    expect(textMoved({ ...full, viewportY: 400, baseY: 1000 }, { ...full, viewportY: 400, baseY: 1000 })).toBe(false);
    // Full, at the very top: it cannot drop, so the text moves.
    expect(textMoved({ ...full, viewportY: 0, baseY: 1000 }, { ...full, viewportY: 0, baseY: 1000 })).toBe(true);
    // Full, dropping by more than one: a real scroll.
    expect(textMoved({ ...full, viewportY: 400, baseY: 1000 }, { ...full, viewportY: 398, baseY: 1000 })).toBe(true);
    // A jump of five, in either buffer.
    expect(textMoved({ ...full, viewportY: 400, baseY: 1000 }, { ...full, viewportY: 405, baseY: 1000 })).toBe(true);
    expect(textMoved({ ...notFull, viewportY: 200, baseY: 469 }, { ...notFull, viewportY: 205, baseY: 469 })).toBe(true);

    // Through attachHoverDismissal: a full, scrolled-back trim keeps the card;
    // following output in a full buffer closes it.
    const t = setup();
    const term = fakeTerminal({ ...full, viewportY: 400, baseY: 1000 });
    const detach = attachHoverDismissal(term.term, A, t.c);
    await shown(t);
    term.state.viewportY = 399;
    term.scroll.fire();
    term.state.viewportY = 398;
    term.scroll.fire();
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    term.state.viewportY = 1000;
    term.scroll.fire();
    expect(t.hide).toHaveBeenCalledTimes(1);
    term.scroll.fire();
    expect(t.hide).toHaveBeenCalledTimes(1);
    detach();
  });
});

describe("attachHoverDismissal", () => {
  const spyController = () => ({
    enter: vi.fn(),
    leave: vi.fn(),
    dismiss: vi.fn(),
    pointerMoved: vi.fn(),
    pointerLeft: vi.fn(),
    contentMoved: vi.fn(),
    resized: vi.fn(),
    forget: vi.fn(),
  });
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  const setVisibility = (v: string) => Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
  afterEach(() => {
    delete (document as { visibilityState?: string }).visibilityState;
    if (visibility) Object.defineProperty(Document.prototype, "visibilityState", visibility);
  });

  it("every dismissal path is wired", async () => {
    const term = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
    const c = spyController();
    const detach = attachHoverDismissal(term.term, A, c);

    // The child's own handlers stop these bubbling: the listeners capture.
    term.child.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    expect(c.dismiss).toHaveBeenCalledTimes(1);
    term.child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(c.dismiss).toHaveBeenCalledTimes(2);
    // A key press closes the card and still reaches the terminal.
    const key = new KeyboardEvent("keydown", { key: "x", bubbles: true, cancelable: true });
    term.child.dispatchEvent(key);
    expect(c.dismiss).toHaveBeenCalledTimes(3);
    expect(key.defaultPrevented).toBe(false);
    window.dispatchEvent(new Event("blur"));
    expect(c.dismiss).toHaveBeenCalledTimes(4);
    window.dispatchEvent(new Event("resize"));
    expect(c.dismiss).toHaveBeenCalledTimes(5);
    // A pane resize is this terminal's own: it goes to `resized`, scoped.
    term.resize.fire();
    expect(c.resized).toHaveBeenCalledWith(A);
    expect(c.dismiss).toHaveBeenCalledTimes(5);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(c.dismiss).toHaveBeenCalledTimes(5);
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(c.dismiss).toHaveBeenCalledTimes(6);
    term.state.viewportY = 3;
    term.state.baseY = 3;
    term.scroll.fire();
    expect(c.contentMoved).toHaveBeenCalledWith(A);

    term.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 12, clientY: 34, buttons: 1 }));
    expect(c.pointerMoved).toHaveBeenCalledWith(A, { x: 12, y: 34, buttons: 1 });
    // mouseleave does not bubble, but a child's still reaches a capture listener.
    term.child.dispatchEvent(new MouseEvent("mouseleave"));
    expect(c.pointerLeft).not.toHaveBeenCalled();
    term.element.dispatchEvent(new MouseEvent("mouseleave"));
    expect(c.pointerLeft).toHaveBeenCalledWith(A);

    expect(c.forget).not.toHaveBeenCalled();
    detach();
    expect(c.forget).toHaveBeenCalledWith(A);
    term.child.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    term.child.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    term.child.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("resize"));
    term.resize.fire();
    document.dispatchEvent(new Event("visibilitychange"));
    term.state.viewportY = 5;
    term.scroll.fire();
    term.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    term.element.dispatchEvent(new MouseEvent("mouseleave"));
    expect(c.dismiss).toHaveBeenCalledTimes(6);
    expect(c.resized).toHaveBeenCalledTimes(1);
    expect(c.contentMoved).toHaveBeenCalledTimes(1);
    expect(c.pointerMoved).toHaveBeenCalledTimes(1);
    expect(c.pointerLeft).toHaveBeenCalledTimes(1);

    // Leaving the terminal is a real leave: 150 ms, not the 1000 ms redraw wait,
    // whichever of xterm's leave and the element's mouseleave comes first.
    for (const order of ["pointerLeft first", "leave first"]) {
      const t = setup();
      const real = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
      const off = attachHoverDismissal(real.term, A, t.c);
      await shown(t);
      if (order === "pointerLeft first") {
        real.element.dispatchEvent(new MouseEvent("mouseleave"));
        t.c.leave(A, K1.key);
      } else {
        t.c.leave(A, K1.key);
        real.element.dispatchEvent(new MouseEvent("mouseleave"));
      }
      await tick(149);
      expect(t.hide, order).not.toHaveBeenCalled();
      await tick(1);
      expect(t.hide, order).toHaveBeenCalledTimes(1);
      off();
    }

    // Leaving forgets the link: coming back elsewhere after a dismissal reopens nothing.
    const t = setup();
    const back = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
    const offBack = attachHoverDismissal(back.term, A, t.c);
    await shown(t);
    back.child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    back.element.dispatchEvent(new MouseEvent("mouseleave"));
    back.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 300 }));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offBack();
  });
});

/** Two terminals, A and B, attached to one controller. */
function twoTerminals() {
  const t = setup();
  const a = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
  const b = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
  const offA = attachHoverDismissal(a.term, A, t.c);
  const offB = attachHoverDismissal(b.term, B, t.c);
  /** Output arriving at the bottom: the text moves up. */
  const output = (x: typeof a) => {
    x.state.viewportY += 1;
    x.state.baseY += 1;
    x.scroll.fire();
  };
  return { t, a, b, offA, offB, output };
}

describe("one controller, many terminals", () => {
  it("output in another terminal leaves the card alone", async () => {
    const { t, a, b, offA, offB, output } = twoTerminals();
    await shown(t);
    output(b);
    output(b);
    expect(t.hide).not.toHaveBeenCalled();
    // Not suppressed either: a redraw of A's link keeps the card...
    t.c.leave(A, K1.key);
    t.c.enter(A, K1, at(100));
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    // ...and a real leave then a new link in A opens it.
    t.c.pointerMoved(A, at(300));
    t.c.leave(A, K1.key);
    await tick(150);
    expect(t.hide).toHaveBeenCalledTimes(1);
    t.c.enter(A, K2, at(300));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
    t.peeks[1].resolve(textFrame("plan"));
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K2.abs, state: "ready" });
    // A's own output closes it, even while a redraw wait runs (the leave
    // cleared `hovered`; the card is still A's).
    t.c.leave(A, K2.key);
    output(b);
    expect(t.hide).toHaveBeenCalledTimes(1);
    output(a);
    expect(t.hide).toHaveBeenCalledTimes(2);
    offA();
    offB();
  });

  it("output in the terminal of the hovered link counts with no card", async () => {
    // A drag that began outside the terminal: A's link is hovered, no card,
    // nothing suppressed. A's output suppresses; releasing and nudging reopens it.
    const t = setup();
    t.c.pointerMoved(A, at(100, 100, 1));
    t.c.enter(A, K1, at(100, 100, 1));
    t.c.contentMoved(B);
    t.c.pointerMoved(A, at(101));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    t.c.contentMoved(A);
    t.c.pointerMoved(A, at(102));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(1);
  });

  it("output under a resting pointer opens no card", async () => {
    // The pointer rests on a URL link in A (no card, no hovered file link).
    // Output moves the text, and xterm's redraw re-asks every provider: a file
    // link now under the still pointer opens nothing until the pointer moves.
    let { t, a, b, offA, offB, output } = twoTerminals();
    a.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 100 }));
    output(a);
    t.c.enter(A, K1, at(100));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    a.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 101, clientY: 100 }));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offA();
    offB();

    // Output in B, where the pointer isn't, leaves A alone.
    ({ t, a, b, offA, offB, output } = twoTerminals());
    a.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 100 }));
    output(b);
    t.c.enter(A, K1, at(100));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offA();
    offB();

    // Crossing from A into B while A's card is up: B's move forgets A's link,
    // but the card is still A's, and A's output closes it.
    ({ t, a, b, offA, offB, output } = twoTerminals());
    await shown(t);
    b.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 700, clientY: 100 }));
    output(a);
    expect(t.hide).toHaveBeenCalledTimes(1);
    offA();
    offB();

    // Once the pointer has left A, A's output is not under it.
    ({ t, a, b, offA, offB, output } = twoTerminals());
    a.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 100 }));
    a.element.dispatchEvent(new MouseEvent("mouseleave"));
    output(a);
    t.c.enter(B, K1, at(100));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("only the owning terminal's resize closes the card", async () => {
    const { t, a, b, offA, offB } = twoTerminals();
    await shown(t);
    b.resize.fire();
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    a.resize.fire();
    expect(t.hide).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("a pointer in one terminal never reopens another's link", async () => {
    // A tab switch away from A by key: the key dismisses, A's wrapper leaves
    // the DOM (useTerminal calls forget), then the pointer moves in B.
    let { t, a, b, offA, offB } = twoTerminals();
    await shown(t);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", metaKey: true }));
    a.element.remove();
    t.c.forget(A);
    b.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 200 }));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offA();
    offB();

    // Without any forget, a move in B still clears A's link: after another
    // dismissal, a move back in A reopens nothing.
    ({ t, a, b, offA, offB } = twoTerminals());
    await shown(t);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    b.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 200 }));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    a.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 100, clientY: 100 }));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offA();
    offB();

    // A key is compared with its terminal: B showing the same path at the
    // same row is a different link.
    let u = setup();
    await shown(u);
    // B's leave or pointerLeft for that key touches neither A's card nor A's link.
    u.c.leave(B, K1.key);
    u.c.pointerLeft(B);
    await tick(2000);
    expect(u.hide).not.toHaveBeenCalled();
    u.c.dismiss();
    u.c.pointerMoved(A, at(104));
    await tick(350);
    expect(u.peek).toHaveBeenCalledTimes(2);
    // And B hovering it is a new link.
    u = setup();
    await shown(u);
    u.c.pointerMoved(B, at(600));
    u.c.enter(B, K1, at(600));
    await tick(350);
    expect(u.peek).toHaveBeenCalledTimes(2);

    // useTerminal forgets a terminal wherever its wrapper leaves the DOM.
    const source = readFileSync(resolve(__dirname, "../../hooks/useTerminal.ts"), "utf8");
    const detachBody = source.slice(source.indexOf("function detachInstance("), source.indexOf("\n}\n", source.indexOf("function detachInstance(")));
    expect(detachBody).toContain("hoverPreview.forget(paneId)");
    const removal = source.slice(source.indexOf("if (inst && inst.wrapper.parentElement === container) {"));
    expect(removal.slice(0, removal.indexOf("}"))).toContain("hoverPreview.forget(paneId)");
    // Its links reach the controller with the pane id bound.
    expect(source).toContain("enter: (link, pointer) => hoverPreview.enter(paneId, link, pointer)");
    expect(source).toContain("leave: (key) => hoverPreview.leave(paneId, key)");
    expect(source).toContain("attachHoverDismissal(term, paneId, hoverPreview)");
  });

  it("disposing a terminal clears its card and hover", async () => {
    // A shown card: hidden, and its link forgotten.
    let { t, offA, offB } = twoTerminals();
    await shown(t);
    offA();
    expect(t.hide).toHaveBeenCalledTimes(1);
    t.c.dismiss();
    t.c.pointerMoved(A, at(100));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    offB();

    // A pending delay: cancelled.
    ({ t, offA, offB } = twoTerminals());
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(100);
    offA();
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    offB();

    // A read in flight: its late answer shows nothing.
    ({ t, offA, offB } = twoTerminals());
    t.c.pointerMoved(A, at(100));
    t.c.enter(A, K1, at(100));
    await tick(350);
    offA();
    t.peeks[0].resolve(textFrame("late"));
    await tick(1000);
    expect(t.show).not.toHaveBeenCalled();
    expect(t.hide).not.toHaveBeenCalled();

    // Another terminal's card is not its business.
    t.c.pointerMoved(B, at(400));
    t.c.enter(B, K2, at(400));
    await tick(350);
    t.peeks[1].resolve(textFrame("b"));
    await tick(0);
    t.c.forget(A);
    expect(t.hide).not.toHaveBeenCalled();
    offB();
    expect(t.hide).toHaveBeenCalledTimes(1);

    // Forgetting is not a dismissal: the next link opens without a nudge
    // (the pointer left A, which counts as a move).
    const v = setup();
    await shown(v);
    v.c.forget(A);
    v.c.pointerLeft(A);
    v.c.enter(B, K2, at(400));
    await tick(350);
    expect(v.peek).toHaveBeenCalledTimes(2);
  });

  it("a nudge opens nothing when the setting is off", async () => {
    const t = setup();
    await shown(t);
    t.state.enabled = false;
    t.c.dismiss();
    t.c.pointerMoved(A, at(104));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
  });

  it("the move that reopens a link counts as a move", async () => {
    // After a key press, a nudge from one link onto the next on the same row:
    // the capture listener reopens K1, then xterm leaves K1 and hovers K2.
    const t = setup();
    await shown(t);
    t.c.dismiss();
    t.c.pointerMoved(A, at(130));
    t.c.leave(A, K1.key);
    t.c.enter(A, K2, at(130));
    await tick(350);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
  });

  it("a move during the redraw wait makes it a real leave", async () => {
    const t = setup();
    await shown(t);
    t.c.leave(A, K1.key);
    await tick(100);
    t.c.pointerMoved(A, at(300));
    await tick(149);
    expect(t.hide).not.toHaveBeenCalled();
    await tick(1);
    expect(t.hide).toHaveBeenCalledTimes(1);
    // A real leave does not suppress.
    t.c.enter(A, K2, at(300));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { attachHoverDismissal, createHoverController, textMoved, type BufferState, type HoverCard } from "../hoverPreview";
import { PeekCache, type PeekFrame } from "../filePeek";

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
  t.c.pointerMoved(at(100));
  t.c.enter(K1, at(100));
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
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
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
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(349);
    t.c.pointerMoved(at(101));
    t.c.leave(K1.key);
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.hide).not.toHaveBeenCalled();

    // An answer that arrives after a dismissal is cached, but shows nothing.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(350);
    t.c.dismiss();
    t.peeks[0].resolve(textFrame("late", "s9"));
    await tick(1000);
    expect(t.show).not.toHaveBeenCalled();
    expect(t.cache.get(K1.abs)).toMatchObject({ stamp: "s9", content: { type: "text", text: "late" } });

    // A stale answer, landing while the next link loads, leaves that card alone.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(350);
    t.c.pointerMoved(at(500));
    t.c.enter(K2, at(500));
    await tick(350 + 100);
    t.peeks[0].resolve(textFrame("stale"));
    await tick(100);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()).toEqual({ abs: K2.abs, point: { x: 500, y: 100 }, state: "loading" });

    // A slower answer shows the loading card first.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
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
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();
    expect(t.hide).not.toHaveBeenCalled();

    // A rejected peek shows an error card.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(350);
    t.peeks[0].reject("permission denied");
    await tick(0);
    expect(t.lastShown()).toEqual({ abs: K1.abs, point: { x: 100, y: 100 }, state: "error", error: "permission denied" });
  });

  it("a repeat hover sends the cached stamp and shows the cached text when unchanged", async () => {
    const t = setup();
    await shown(t);
    expect(t.cache.get(K1.abs)?.stamp).toBe("s1");
    t.c.pointerMoved(at(500));
    t.c.enter(K2, at(500));
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(350);
    expect(t.peek).toHaveBeenLastCalledWith(K1.abs, "text", "s1");
    t.peeks[t.peeks.length - 1].resolve({ peek: { size: 5, modifiedMs: 0, stamp: "s1", body: { type: "unchanged" } }, payload: new Uint8Array() });
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K1.abs, state: "ready", content: { body: { type: "text", text: "hello" } } });
    // A binary answer is not cached: the next hover sends no stamp.
    t.c.pointerMoved(at(500));
    t.c.enter(K2, at(500));
    await tick(350);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
    t.peeks[t.peeks.length - 1].resolve({ peek: { size: 9, modifiedMs: 0, stamp: "b", body: { type: "binary" } }, payload: new Uint8Array() });
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K2.abs, content: { body: { type: "binary" } } });
    expect(t.cache.get(K2.abs)).toBeUndefined();
  });

  it("a redraw leave keeps the card; a vanished path closes it", async () => {
    const t = setup();
    await shown(t);
    // xterm redraws the rows under a still pointer: leave, then the same link again.
    t.c.leave(K1.key);
    await tick(900);
    t.c.enter(K1, at(100));
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);

    // No re-hover: the path went away, and the card closes at 1000 ms.
    t.c.leave(K1.key);
    await tick(999);
    expect(t.hide).not.toHaveBeenCalled();
    await tick(1);
    expect(t.hide).toHaveBeenCalledTimes(1);

    // It was a dismissal: new content under the still pointer opens nothing.
    t.c.enter(K2, at(100));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    // Until the pointer moves, which reopens the link now under it.
    t.c.pointerMoved(at(102));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);

    // The vanished path's dismissal suppresses like any other: leaving the
    // terminal (a move, but no pointerMoved) does not lift it.
    const u = setup();
    await shown(u);
    u.c.leave(K1.key);
    await tick(1000);
    u.c.pointerLeft();
    u.c.enter(K2, at(100));
    await tick(2000);
    expect(u.peek).toHaveBeenCalledTimes(1);
  });

  it("content drawn under a still pointer opens no card", async () => {
    let t = setup();
    await shown(t);
    t.c.leave(K1.key);
    t.c.enter(K2, at(100));
    expect(t.hide).toHaveBeenCalledTimes(1);
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);

    // No card yet: an accepted K1, then K2 with no pointer move in between.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(100);
    t.c.enter(K2, at(100));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();
  });

  it("real leaves, row crossings and double hovers", async () => {
    let t = setup();
    await shown(t);
    // Moving along a link that wraps onto the next row: leave, then the same key.
    t.c.pointerMoved(at(160, 100));
    t.c.leave(K1.key);
    await tick(100);
    t.c.pointerMoved(at(20, 117));
    t.c.enter(K1, at(20, 117));
    await tick(2000);
    expect(t.hide).not.toHaveBeenCalled();
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.lastShown()?.point).toEqual({ x: 100, y: 100 });
    expect(t.peek).toHaveBeenCalledTimes(1);

    // Leaving for real: hidden at 150 ms, without suppressing.
    t.c.pointerMoved(at(40, 140));
    t.c.leave(K1.key);
    await tick(149);
    expect(t.hide).not.toHaveBeenCalled();
    await tick(1);
    expect(t.hide).toHaveBeenCalledTimes(1);
    // Not suppressed: the next link opens with no further pointer move.
    t.c.enter(K2, at(40, 140));
    await tick(349);
    expect(t.peek).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(t.peek).toHaveBeenCalledTimes(2);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
    t.peeks[1].resolve(textFrame("plan"));
    await tick(0);
    expect(t.lastShown()).toMatchObject({ abs: K2.abs, point: { x: 40, y: 140 }, state: "ready" });

    // And after a further pointer move too; a late leave of the old link is ignored.
    t.c.pointerMoved(at(300));
    t.c.enter(K1, at(300));
    t.c.leave(K2.key);
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(3);
    t.peeks[2].resolve(textFrame("again"));
    await tick(1000);
    expect(t.lastShown()).toMatchObject({ abs: K1.abs, state: "ready" });

    // Two hovers with no leave between them (a late provider reply): one card, one peek.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(200);
    t.c.enter(K1, at(100));
    await tick(150);
    expect(t.peek).toHaveBeenCalledTimes(1);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(0);
    t.c.enter(K1, at(100));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    expect(t.hide).not.toHaveBeenCalled();
  });

  it("a wait holds back what the card would show until the link is back", async () => {
    // The delay ends during a redraw wait: no peek until the re-hover.
    let t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(300);
    t.c.leave(K1.key);
    await tick(100);
    expect(t.peek).not.toHaveBeenCalled();
    t.c.enter(K1, at(100));
    await tick(0);
    expect(t.peek).toHaveBeenCalledTimes(1);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(0);
    expect(t.lastShown()).toMatchObject({ state: "ready" });

    // The answer lands during a grace: shown once the same link is hovered again.
    t = setup();
    t.c.pointerMoved(at(100));
    t.c.enter(K1, at(100));
    await tick(350);
    t.c.pointerMoved(at(101));
    t.c.leave(K1.key);
    t.peeks[0].resolve(textFrame("hello"));
    await tick(100);
    expect(t.show).not.toHaveBeenCalled();
    t.c.enter(K1, at(101));
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
      ["contentMoved", (t) => t.c.contentMoved()],
    ];
    for (const [name, dismissal] of dismissals) {
      const t = setup();
      const detach = attachHoverDismissal(term.term, t.c);
      await shown(t);
      // The pointer moved inside the link (no new hover), then the dismissal.
      t.c.pointerMoved(at(104));
      dismissal(t);
      expect(t.hide, name).toHaveBeenCalledTimes(1);

      // A redraw under the pointer brings nothing back, however long it waits.
      t.c.leave(K1.key);
      t.c.enter(K1, at(104));
      await tick(2000);
      expect(t.peek, name).toHaveBeenCalledTimes(1);
      expect(t.show, name).toHaveBeenCalledTimes(1);

      // Nudging the pointer on the link reopens it, with no new hover from xterm.
      t.c.pointerMoved(at(108));
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
    t.c.enter(K1, at(100));
    t.c.leave(K1.key);
    t.c.pointerMoved(at(120));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    expect(t.show).toHaveBeenCalledTimes(1);
    // That move lifted the suppression: the next link xterm reports opens.
    t.c.enter(K2, at(120));
    await tick(350);
    expect(t.peek).toHaveBeenCalledTimes(2);
    expect(t.peek).toHaveBeenLastCalledWith(K2.abs, "text", undefined);
  });

  it("dragging a selection shows no card", async () => {
    const t = setup();
    t.c.pointerMoved(at(100, 100, 1));
    t.c.enter(K1, at(100, 100, 1));
    await tick(2000);
    expect(t.peek).not.toHaveBeenCalled();
    expect(t.show).not.toHaveBeenCalled();

    // A press dismisses; dragging with the button held does not lift that.
    await shown(t);
    t.c.dismiss();
    t.c.pointerMoved(at(130, 100, 1));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
    // Released and moved: the link under the pointer comes back.
    t.c.pointerMoved(at(131));
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
    attachHoverDismissal(term.term, t.c);
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
    const detach = attachHoverDismissal(term.term, c);

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
    term.resize.fire();
    expect(c.dismiss).toHaveBeenCalledTimes(6);
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(c.dismiss).toHaveBeenCalledTimes(6);
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(c.dismiss).toHaveBeenCalledTimes(7);

    term.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 12, clientY: 34, buttons: 1 }));
    expect(c.pointerMoved).toHaveBeenCalledWith({ x: 12, y: 34, buttons: 1 });
    // mouseleave does not bubble, but a child's still reaches a capture listener.
    term.child.dispatchEvent(new MouseEvent("mouseleave"));
    expect(c.pointerLeft).not.toHaveBeenCalled();
    term.element.dispatchEvent(new MouseEvent("mouseleave"));
    expect(c.pointerLeft).toHaveBeenCalledTimes(1);

    detach();
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
    expect(c.dismiss).toHaveBeenCalledTimes(7);
    expect(c.contentMoved).not.toHaveBeenCalled();
    expect(c.pointerMoved).toHaveBeenCalledTimes(1);
    expect(c.pointerLeft).toHaveBeenCalledTimes(1);

    // Leaving the terminal is a real leave: 150 ms, not the 1000 ms redraw wait,
    // whichever of xterm's leave and the element's mouseleave comes first.
    for (const order of ["pointerLeft first", "leave first"]) {
      const t = setup();
      const real = fakeTerminal({ viewportY: 0, baseY: 0, length: 30, rows: 30, scrollback: 1000 });
      const off = attachHoverDismissal(real.term, t.c);
      await shown(t);
      if (order === "pointerLeft first") {
        real.element.dispatchEvent(new MouseEvent("mouseleave"));
        t.c.leave(K1.key);
      } else {
        t.c.leave(K1.key);
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
    attachHoverDismissal(back.term, t.c);
    await shown(t);
    back.child.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    back.element.dispatchEvent(new MouseEvent("mouseleave"));
    back.child.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 300, clientY: 300 }));
    await tick(2000);
    expect(t.peek).toHaveBeenCalledTimes(1);
  });
});

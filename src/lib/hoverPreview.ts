import type { Terminal } from "@xterm/xterm";
import { peekKind, type PeekBody, type PeekCache, type PeekFrame, type PeekKind } from "./filePeek";

/**
 * The hover card's lifecycle for file links in terminal output, kept free of
 * React and xterm so it can be tested with fake timers. It is shaped by what
 * xterm 6.0.0's Linkifier actually does:
 *
 * - On a row change, even inside one wrapped link, it calls `leave` and asks
 *   for links again; moving within a row on the same link calls nothing.
 * - On any redraw of the rows under a link it calls `leave`, then `hover`
 *   again with the pointer unmoved. A late provider reply can call `hover`
 *   twice with no `leave` between.
 * - `onScroll` fires for every line pushed into the scrollback, whether or not
 *   the text on screen moved (see `textMoved`).
 *
 * So a same-link hover is a no-op, a leave waits before hiding (150 ms when
 * the pointer moved, 1000 ms for a redraw under a still pointer), and every
 * dismissal holds until the pointer moves again.
 *
 * One controller serves every terminal in the window, background tabs
 * included, so each terminal-side call names its terminal. Output or a resize
 * in a terminal that owns neither the card nor the hovered link is ignored;
 * keys, clicks, wheel, blur and window resizes dismiss window-wide.
 */

/** A file link: its resolved path, and a key that names it on screen (see `terminalFileLinks.ts`). */
export interface HoverLink {
  abs: string;
  key: string;
}

export interface HoverPointer {
  x: number;
  y: number;
  /** `MouseEvent.buttons`: non-zero while a button is held, as in a drag-select. */
  buttons: number;
}

export interface HoverContent {
  size: number;
  modifiedMs: number | null;
  body: PeekBody;
}

/** What the card shows: `fileHoverStore` holds it, `FileHoverCard` renders it. */
export interface HoverCard {
  abs: string;
  /** The pointer when the link was accepted: the card stays where it opened. */
  point: { x: number; y: number };
  state: "loading" | "ready" | "error";
  content?: HoverContent;
  error?: string;
}

/** The pane id of the terminal a call comes from. */
export type TerminalId = string;

/**
 * The window's controller, shared by all its terminals (background tabs
 * included). Terminal-side calls carry the terminal they came from.
 */
export interface HoverController {
  /** xterm reports `link` under the pointer. */
  enter(term: TerminalId, link: HoverLink, pointer: HoverPointer): void;
  /** xterm reports the link with `key` is no longer under the pointer. */
  leave(term: TerminalId, key: string): void;
  /** Window-wide: close any card and ignore hovers until the pointer moves. */
  dismiss(): void;
  pointerMoved(term: TerminalId, pointer: HoverPointer): void;
  /** The pointer left the terminal element. */
  pointerLeft(term: TerminalId): void;
  /** The terminal's text moved (output, a real scroll); dismisses only if `term` owns the card or the hovered link. */
  contentMoved(term: TerminalId): void;
  /** The terminal was resized (`term.onResize`); dismisses only if `term` owns the card or the hovered link. */
  resized(term: TerminalId): void;
  /** The terminal was disposed or taken out of view: forget its link and card, without suppressing. */
  forget(term: TerminalId): void;
}

export interface HoverControllerOptions {
  peek: (path: string, kind: PeekKind, known?: string) => Promise<PeekFrame>;
  cache: PeekCache;
  show: (card: HoverCard) => void;
  hide: () => void;
  /** Read at every hover, so the setting applies at once. */
  enabled: () => boolean;
  delayMs?: number;
  loadingAfterMs?: number;
  graceMs?: number;
  redrawWaitMs?: number;
}

type Timer = ReturnType<typeof setTimeout>;

interface Pending {
  term: TerminalId;
  link: HoverLink;
  point: { x: number; y: number };
  token: number;
  delayDone: boolean;
  fetching: boolean;
  /** What the card would show now; held back while a leave wait runs. */
  view: HoverCard | null;
  /** What is on screen. */
  shown: HoverCard | null;
}

export function createHoverController({
  peek,
  cache,
  show,
  hide,
  enabled,
  delayMs = 350,
  loadingAfterMs = 200,
  graceMs = 150,
  redrawWaitMs = 1000,
}: HoverControllerOptions): HoverController {
  // The link xterm last reported under the pointer, and its terminal.
  let hovered: { term: TerminalId; link: HoverLink } | null = null;
  // The pending, loading or shown preview.
  let card: Pending | null = null;
  let suppressed = false;
  let movedSinceEnter = false;
  let token = 0;
  let delayTimer: Timer | undefined;
  let loadingTimer: Timer | undefined;
  // A leave of the card's link: a grace after a real leave, a longer wait for xterm's re-hover after a redraw.
  let wait: { kind: "grace" | "redraw"; timer: Timer } | null = null;

  const drop = () => {
    clearTimeout(delayTimer);
    clearTimeout(loadingTimer);
    if (wait) clearTimeout(wait.timer);
    wait = null;
    if (card?.shown) hide();
    card = null;
  };

  const dismiss = () => {
    drop();
    suppressed = true;
  };

  // Put the card's view on screen, unless a leave wait holds it back.
  const render = () => {
    if (!card || wait || !card.view || card.view === card.shown) return;
    card.shown = card.view;
    show(card.view);
  };

  const fetch = () => {
    const c = card;
    if (!c) return;
    c.fetching = true;
    const { abs } = c.link;
    // Kept by this request: an `unchanged` answer is served from it even if
    // a newer answer evicts it meanwhile. Without one, no stamp is sent.
    const kept = cache.get(abs);
    loadingTimer = setTimeout(() => {
      if (card?.token !== c.token || c.view) return;
      c.view = { abs, point: c.point, state: "loading" };
      render();
    }, loadingAfterMs);
    peek(abs, peekKind(abs), kept?.stamp).then(
      ({ peek: p }) => {
        let body = p.body;
        if (body.type === "unchanged" && kept) body = kept.content;
        // Cached even when stale: the work is done.
        if (body.type === "text") cache.set(abs, { stamp: p.stamp, size: p.size, modifiedMs: p.modifiedMs, content: body });
        else cache.delete(abs);
        if (card?.token !== c.token) return;
        clearTimeout(loadingTimer);
        c.view = { abs, point: c.point, state: "ready", content: { size: p.size, modifiedMs: p.modifiedMs, body } };
        render();
      },
      (err: unknown) => {
        if (card?.token !== c.token) return;
        clearTimeout(loadingTimer);
        c.view = { abs, point: c.point, state: "error", error: err instanceof Error ? err.message : String(err) };
        render();
      },
    );
  };

  // `moved`: accepted by a pointer move (after a dismissal), which counts as one.
  const accept = (term: TerminalId, link: HoverLink, pointer: HoverPointer, moved = false) => {
    drop();
    movedSinceEnter = moved;
    const c: Pending = { term, link, point: { x: pointer.x, y: pointer.y }, token: ++token, delayDone: false, fetching: false, view: null, shown: null };
    card = c;
    delayTimer = setTimeout(() => {
      c.delayDone = true;
      if (!wait) fetch();
    }, delayMs);
  };

  const startWait = (kind: "grace" | "redraw") => {
    if (wait) clearTimeout(wait.timer);
    const timer = setTimeout(
      () => {
        wait = null;
        // A real leave hides without suppressing: the pointer moved. A redraw
        // with no re-hover means the path is gone from under a still pointer.
        if (kind === "grace") drop();
        else dismiss();
      },
      kind === "grace" ? graceMs : redrawWaitMs,
    );
    wait = { kind, timer };
  };

  // The card's link is back under the pointer: carry on where the wait held it.
  const endWait = () => {
    if (!wait || !card) return;
    clearTimeout(wait.timer);
    wait = null;
    if (card.delayDone && !card.fetching) fetch();
    render();
  };

  // Only the terminal that produced the card's or the hovered link can close
  // it by its own events: background tabs keep receiving output.
  const owns = (term: TerminalId) => card?.term === term || hovered?.term === term;

  return {
    enter(term, link, pointer) {
      hovered = { term, link };
      if (!enabled() || pointer.buttons !== 0 || suppressed) return;
      // Redraw churn, double hovers and row crossings inside one link.
      if (card?.term === term && card.link.key === link.key) {
        endWait();
        return;
      }
      // New content drawn under a still pointer.
      if (!movedSinceEnter) {
        dismiss();
        return;
      }
      accept(term, link, pointer);
    },

    leave(term, key) {
      // Cleared in any state, so a hover that went stale while suppressed
      // can't open a card later for a path that has gone.
      if (hovered?.term === term && hovered.link.key === key) hovered = null;
      if (card?.term !== term || card.link.key !== key || wait) return;
      startWait(movedSinceEnter ? "grace" : "redraw");
    },

    dismiss,

    pointerMoved(term, pointer) {
      movedSinceEnter = true;
      // The pointer is in this terminal: another's link is not under it.
      if (hovered && hovered.term !== term) hovered = null;
      // A redraw wait assumed a still pointer.
      if (wait?.kind === "redraw") startWait("grace");
      // Dragging with a button held (a selection) keeps a dismissal.
      if (!suppressed || pointer.buttons !== 0) return;
      suppressed = false;
      // xterm never re-fires `hover` for a move inside the same link, so the
      // link still under the pointer is reopened from here.
      if (hovered && enabled()) accept(term, hovered.link, pointer, true);
    },

    pointerLeft(term) {
      movedSinceEnter = true;
      if (hovered?.term === term) hovered = null;
      // xterm's leave comes first, while the pointer still looked still.
      if (card?.term === term && wait?.kind === "redraw") startWait("grace");
    },

    contentMoved(term) {
      if (owns(term)) dismiss();
    },

    resized(term) {
      if (owns(term)) dismiss();
    },

    // Taken out of view or disposed: xterm sends no leave. Not a dismissal.
    forget(term) {
      if (hovered?.term === term) hovered = null;
      if (card?.term === term) drop();
    },
  };
}

/** The part of xterm's active buffer that says whether the text on screen moved. */
export interface BufferState {
  viewportY: number;
  baseY: number;
  length: number;
  rows: number;
  scrollback: number;
}

/**
 * Whether the text under the pointer moved between two `onScroll`s. xterm
 * fires one for every line pushed into the scrollback, and what the view does
 * depends on whether the scrollback is full (`BufferService.scroll`):
 *
 * - Following output (`viewportY === baseY`): the text moves up, full or not.
 * - Scrolled back, not full: `viewportY` stays and so does the text.
 * - Scrolled back, full: the oldest line is trimmed and `viewportY` drops by
 *   exactly 1, so the text stays put; at `viewportY` 0 it can't drop, and
 *   the text moves.
 *
 * Any other change of `viewportY` is a real scroll.
 */
export function textMoved(prev: BufferState, now: BufferState): boolean {
  if (now.viewportY === now.baseY) return true;
  const full = now.length >= now.rows + now.scrollback;
  if (full && now.viewportY === 0 && prev.viewportY === 0) return true;
  const delta = now.viewportY - prev.viewportY;
  if (delta === 0) return false;
  return !(full && delta === -1);
}

/**
 * The terminal-side events that move or close the card. Pointer and wheel
 * listeners capture, because xterm's scrollable element stops wheel events
 * and its handlers run below `term.element`; the key listener is passive and
 * never prevents anything, so keys still reach the terminal. Returns a
 * disposer, which also forgets the terminal's link and card.
 */
export function attachHoverDismissal(term: Terminal, paneId: TerminalId, controller: HoverController): () => void {
  const el = term.element;
  if (!el) return () => {};
  const snapshot = (): BufferState => {
    const b = term.buffer.active;
    return { viewportY: b.viewportY, baseY: b.baseY, length: b.length, rows: term.rows, scrollback: term.options.scrollback ?? 1000 };
  };
  let prev = snapshot();

  const onMove = (e: MouseEvent) => controller.pointerMoved(paneId, { x: e.clientX, y: e.clientY, buttons: e.buttons });
  // `mouseleave` doesn't bubble, but a child's still reaches a capture
  // listener: with the DOM renderer every span or row crossing would count.
  const onLeave = (e: MouseEvent) => {
    if (e.target === el) controller.pointerLeft(paneId);
  };
  const dismiss = () => controller.dismiss();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") controller.dismiss();
  };

  el.addEventListener("mousemove", onMove, true);
  el.addEventListener("mouseleave", onLeave, true);
  el.addEventListener("mousedown", dismiss, true);
  el.addEventListener("wheel", dismiss, { capture: true, passive: true });
  window.addEventListener("keydown", dismiss, { capture: true, passive: true });
  window.addEventListener("blur", dismiss);
  window.addEventListener("resize", dismiss);
  document.addEventListener("visibilitychange", onVisibility);
  // After a pane resize xterm calls `leave` with the pointer unmoved.
  const resized = term.onResize(() => controller.resized(paneId));
  const scrolled = term.onScroll(() => {
    const now = snapshot();
    if (textMoved(prev, now)) controller.contentMoved(paneId);
    prev = now;
  });

  return () => {
    el.removeEventListener("mousemove", onMove, true);
    el.removeEventListener("mouseleave", onLeave, true);
    el.removeEventListener("mousedown", dismiss, true);
    el.removeEventListener("wheel", dismiss, { capture: true });
    window.removeEventListener("keydown", dismiss, { capture: true });
    window.removeEventListener("blur", dismiss);
    window.removeEventListener("resize", dismiss);
    document.removeEventListener("visibilitychange", onVisibility);
    resized.dispose();
    scrolled.dispose();
    controller.forget(paneId);
  };
}

import { invoke, Channel } from "@tauri-apps/api/core";
import { create } from "zustand";
import { shellQuote } from "./shellQuote";
import { useTabStore, allTabPanes, viewOfPane } from "../stores/tabStore";
import { createSubTerminalInstance, getTerminalDimensions } from "../hooks/useTerminal";
import { holdPtyInput } from "./terminalCommands";

/**
 * The window's half of `ade open` (`.ade/context/terminal-open.md`): Rust
 * sends a request for a sub-terminal of the caller's tab; the window adds it,
 * creates its terminal at once, and answers with the new PTY's id.
 */

export interface OpenRequest {
  requestId: number;
  /** Milliseconds since the epoch: nothing is done after it. */
  expiresAt: number;
  callerPtyId: number;
  cwd: string;
  command: string[] | null;
  split: "right" | "down" | null;
  name: string | null;
  focus: boolean;
}

export type OpenMessage =
  | { request: OpenRequest }
  | { expired: number }
  | { typed: number; ok: boolean; why: string | null };

type Size = { cols: number; rows: number };

export interface OpenDeps {
  invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  store: typeof useTabStore;
  createSubTerminal: (
    paneId: string,
    setPtyId: (paneId: string, ptyId: number) => void,
    opts: { cwd: string | null; size: Size; requestId: number; inputHeld: () => boolean },
  ) => Promise<{ ptyId: number | null }>;
  /** The caller's terminal size, null when it has no instance here. */
  dimensions: (paneId: string) => Size | null;
  now: () => number;
}

const defaultDeps = (): OpenDeps => ({
  invoke,
  store: useTabStore,
  createSubTerminal: createSubTerminalInstance,
  dimensions: getTerminalDimensions,
  now: Date.now,
});

/** The size of a new terminal whose caller has no instance in this window. */
const FALLBACK_SIZE: Size = { cols: 80, rows: 24 };

/** What each request added, until it expires or is forgotten. */
const added = new Map<number, { tabId: string; viewId: string; expiresAt: number }>();

/**
 * A sub-terminal opened with a command, until it is typed: `starting` (the
 * strip's spinner) until Rust's `typed` arrives, then `not-typed` if it
 * failed (the strip's mark and the view's notice). A typed command, and a
 * sub-terminal opened with none, have no entry. In memory only, never saved:
 * `line` is the full command, for Insert command.
 */
export interface OpenStatus {
  status: "starting" | "not-typed";
  /** `noticeWord(command)`: the command word after any `VAR=value`, all the notice shows of it. */
  firstWord: string;
  line: string;
  why: string | null;
  paneId: string;
}

export const useOpenStatus = create<{ byView: Record<string, OpenStatus> }>(() => ({ byView: {} }));

const statusKey = (tabId: string, viewId: string) => `${tabId}/${viewId}`;

export function openStatusOf(state: { byView: Record<string, OpenStatus> }, tabId: string, viewId: string): OpenStatus | null {
  return state.byView[statusKey(tabId, viewId)] ?? null;
}

function setStatus(tabId: string, viewId: string, status: OpenStatus | null) {
  useOpenStatus.setState((s) => {
    const byView = { ...s.byView };
    if (status) byView[statusKey(tabId, viewId)] = status;
    else delete byView[statusKey(tabId, viewId)];
    return { byView };
  });
}

/** Dismiss a sub-terminal's not-typed notice (and its mark). */
export function clearOpenStatus(tabId: string, viewId: string) {
  setStatus(tabId, viewId, null);
}

// A view that is gone (closeView, closeTab, a detach) takes its status, and
// the line held for Insert command, with it (review finding m5).
useTabStore.subscribe((state) => {
  const byView = useOpenStatus.getState().byView;
  const keys = Object.keys(byView);
  if (keys.length === 0) return;
  const live = keys.filter((key) => {
    const cut = key.lastIndexOf("/");
    return state.tabs.find((t) => t.id === key.slice(0, cut))?.views[key.slice(cut + 1)] !== undefined;
  });
  if (live.length !== keys.length) useOpenStatus.setState({ byView: Object.fromEntries(live.map((k) => [k, byView[k]])) });
});

/** A word typed as it is. Anything else goes through the quoter. */
const BARE_WORD = /^[\w./-]+$/;

/**
 * The line typed for a command: each word bare when it matches
 * `^[\w./-]+$`, else quoted with `shellQuote` (ADR 0008), so it is the same
 * words in sh, bash, zsh and fish.
 */
export function commandLine(words: string[]): string {
  return words.map((w) => (BARE_WORD.test(w) ? w : shellQuote(w))).join(" ");
}

/**
 * How long after `expiresAt` the window stops holding input if no `typed`
 * arrives (review finding m1): Rust answers within 5 s of the window's
 * answer, which comes before `expiresAt`; 1 s more is the margin.
 */
const HOLD_RELEASE_AFTER_EXPIRY_MS = 5_000 + 1_000;

/** Entries this long past their expiry can't be expired any more. */
const FORGET_AFTER_MS = 60_000;

/**
 * Characters a name can't hold: control (Cc), format (Cf: bidi overrides,
 * zero-width characters...), line and paragraph separators (Zl, Zp). Rust
 * refuses a `--name` with any of them; a derived name has them removed.
 */
const UNSAFE_NAME_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** A leading `VAR=value` word: the shell's assignment before a command. */
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** The command's word: the first after any leading `VAR=value` words. */
function commandWord(command: string[]): string | undefined {
  return command.find((w) => !ASSIGNMENT.test(w));
}

/**
 * All the not-typed notice shows of a command: the name rule's command word,
 * or, for a command of assignments only, the first one's `NAME=…`. Never a
 * value, which may be a secret the caller's shell expanded (review finding M2).
 */
export function noticeWord(command: string[]): string {
  const word = commandWord(command);
  if (word !== undefined) return word;
  return `${(command[0] ?? "").split("=")[0]}=…`;
}

/**
 * A sub-terminal's name: the one given (Rust has checked it); else the
 * command's first word after any leading `VAR=value` words (its basename);
 * else the folder's name; else "Terminal". A derived name has its unsafe
 * characters removed, and one left empty falls through. Never the command
 * line: names are saved and synced.
 */
export function defaultSubTerminalName(name: string | null, command: string[] | null, cwd: string | null): string {
  if (name) return name;
  const word = commandWord(command ?? []);
  const base = (path: string) => (path.split("/").filter(Boolean).pop() ?? "").replace(UNSAFE_NAME_CHARS, "");
  return (word && base(word)) || (cwd && base(cwd)) || "Terminal";
}

export async function handleOpenMessage(msg: OpenMessage, deps: OpenDeps = defaultDeps()): Promise<void> {
  if ("request" in msg) return onRequest(msg.request, deps);
  if ("expired" in msg) return onExpired(msg.expired, deps);
  return onTyped(msg);
}

function answer(d: OpenDeps, requestId: number, result: { error: string } | { ptyId: number; focused: boolean; line: string | null }) {
  const error = "error" in result ? result.error : null;
  const ptyId = "ptyId" in result ? result.ptyId : null;
  const focused = "focused" in result ? result.focused : false;
  const line = "line" in result ? result.line : null;
  void d.invoke("terminal_open_done", { requestId, error, ptyId, line, focused }).catch(() => {});
}

function onTyped(msg: { typed: number; ok: boolean; why: string | null }) {
  const a = added.get(msg.typed);
  if (!a) return;
  added.delete(msg.typed);
  const entry = openStatusOf(useOpenStatus.getState(), a.tabId, a.viewId);
  if (!entry) return;
  setStatus(a.tabId, a.viewId, msg.ok ? null : { ...entry, status: "not-typed", why: msg.why });
}

async function onRequest(r: OpenRequest, d: OpenDeps): Promise<void> {
  const now = d.now();
  if (now > r.expiresAt) return;
  for (const [id, a] of added) if (a.expiresAt + FORGET_AFTER_MS < now) added.delete(id);

  const state = d.store.getState();
  const tab = state.tabs.find((t) => allTabPanes(t).some((p) => p.ptyId === r.callerPtyId));
  const caller = tab && allTabPanes(tab).find((p) => p.ptyId === r.callerPtyId);
  const spawner = tab && caller && viewOfPane(tab, caller.id);
  if (!tab || !caller || !spawner) return answer(d, r.requestId, { error: "the terminal you ran this from isn't in this ADE window" });

  // --focus is honoured only from the tab in sight: a command in a
  // background tab can't take the window over (the answer says so).
  const focus = r.focus && state.activeTabId === tab.id;
  // Always a sibling in the caller's tab, never nested: spawnedBy is the
  // caller's view ("own" for the tab's own terminal).
  const viewId = state.addView(tab.id, {
    name: defaultSubTerminalName(r.name, r.command, r.cwd),
    cwd: r.cwd,
    focus,
    spawnedBy: spawner.id,
  });
  const view = viewId ? d.store.getState().tabs.find((t) => t.id === tab.id)?.views[viewId] : undefined;
  if (!viewId || !view) return answer(d, r.requestId, { error: "this tab can't hold sub-terminals" });
  added.set(r.requestId, { tabId: tab.id, viewId, expiresAt: r.expiresAt });
  const line = r.command && r.command.length > 0 ? commandLine(r.command) : null;
  if (r.command && line !== null) {
    setStatus(tab.id, viewId, { status: "starting", firstWord: noticeWord(r.command), line, why: null, paneId: view.activePaneId });
  }

  // Until the command is typed, the user's input is held back: with --focus
  // this terminal takes the keyboard while its shell starts, and keys meant
  // for another pane would land in front of the typed line (hotfix 0.23.2).
  // Typed or not (`typed`), expired or closed, the status goes and input flows.
  // If no `typed` ever comes, input flows again after a bounded time.
  // The terminal's own keys are held by wireInput (inputHeld); every other
  // write from this window by writePty, which is told the PTY id as it lands.
  const releaseAt = r.expiresAt + HOLD_RELEASE_AFTER_EXPIRY_MS;
  const inputHeld = () => d.now() < releaseAt && openStatusOf(useOpenStatus.getState(), tab.id, viewId)?.status === "starting";
  const setPtyId = (paneId: string, ptyId: number) => {
    if (inputHeld()) holdPtyInput(ptyId, inputHeld);
    state.setPtyId(paneId, ptyId);
  };

  // Created now, headless, at the caller's size: a sub-terminal is usually
  // never shown, and a later mount finds this instance.
  const size = d.dimensions(caller.id) ?? FALLBACK_SIZE;
  const { ptyId } = await d.createSubTerminal(view.activePaneId, setPtyId, { cwd: r.cwd, size, requestId: r.requestId, inputHeld });

  if (!added.has(r.requestId)) {
    // Expired meanwhile: its view is closed, so the terminal goes too.
    if (ptyId !== null) void d.invoke("kill_pty", { id: ptyId }).catch(() => {});
    return;
  }
  if (ptyId === null) {
    // No dead "Failed to start shell" sub-terminal is left behind.
    added.delete(r.requestId);
    setStatus(tab.id, viewId, null);
    d.store.getState().closeView(tab.id, viewId);
    return answer(d, r.requestId, { error: "the new terminal's shell didn't start" });
  }
  answer(d, r.requestId, { ptyId, focused: focus, line });
}

function onExpired(requestId: number, d: OpenDeps) {
  const a = added.get(requestId);
  if (!a) return;
  added.delete(requestId);
  setStatus(a.tabId, a.viewId, null);
  d.store.getState().closeView(a.tabId, a.viewId);
}

let listening = false;

/**
 * Listen for `ade open` requests to this window. Once per window: a second
 * call while listening does nothing. The returned function stops handling
 * them (Rust forgets the listener when the window is destroyed).
 */
export function startTerminalOpen(): () => void {
  if (listening) return () => {};
  listening = true;
  const onEvent = new Channel<OpenMessage>();
  onEvent.onmessage = (msg) => void handleOpenMessage(msg);
  invoke("terminal_open_listen", { onEvent }).catch(() => {
    listening = false;
  });
  return () => {
    onEvent.onmessage = () => {};
    listening = false;
  };
}

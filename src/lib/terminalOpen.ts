import { invoke, Channel } from "@tauri-apps/api/core";
import { useTabStore, allTabPanes, viewOfPane } from "../stores/tabStore";
import { createSubTerminalInstance, getTerminalDimensions } from "../hooks/useTerminal";

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
    opts: { cwd: string | null; size: Size; requestId: number },
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
/** Entries this long past their expiry can't be expired any more. */
const FORGET_AFTER_MS = 60_000;

/**
 * A sub-terminal's name: the one given; else the command's first word after
 * any leading `VAR=value` words (its basename); else the folder's name; else
 * "Terminal". Never the command line: names are saved and synced.
 */
export function defaultSubTerminalName(name: string | null, command: string[] | null, cwd: string | null): string {
  if (name) return name;
  const word = (command ?? []).find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
  const base = (path: string) => path.split("/").filter(Boolean).pop() ?? "";
  return (word && base(word)) || (cwd && base(cwd)) || "Terminal";
}

export async function handleOpenMessage(msg: OpenMessage, deps: OpenDeps = defaultDeps()): Promise<void> {
  if ("request" in msg) return onRequest(msg.request, deps);
  if ("expired" in msg) return onExpired(msg.expired, deps);
  // `typed` sets an entry's status once commands are typed (story 9).
}

function answer(d: OpenDeps, requestId: number, result: { error: string } | { ptyId: number }) {
  const error = "error" in result ? result.error : null;
  const ptyId = "ptyId" in result ? result.ptyId : null;
  // The line to type is story 9's.
  void d.invoke("terminal_open_done", { requestId, error, ptyId, line: null }).catch(() => {});
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

  // Always a sibling in the caller's tab, never nested: spawnedBy is the
  // caller's view ("own" for the tab's own terminal).
  const viewId = state.addView(tab.id, {
    name: defaultSubTerminalName(r.name, r.command, r.cwd),
    cwd: r.cwd,
    focus: r.focus,
    spawnedBy: spawner.id,
  });
  const view = viewId ? d.store.getState().tabs.find((t) => t.id === tab.id)?.views[viewId] : undefined;
  if (!viewId || !view) return answer(d, r.requestId, { error: "this tab can't hold sub-terminals" });
  added.set(r.requestId, { tabId: tab.id, viewId, expiresAt: r.expiresAt });

  // Created now, headless, at the caller's size: a sub-terminal is usually
  // never shown, and a later mount finds this instance.
  const size = d.dimensions(caller.id) ?? FALLBACK_SIZE;
  const { ptyId } = await d.createSubTerminal(view.activePaneId, state.setPtyId, { cwd: r.cwd, size, requestId: r.requestId });

  if (!added.has(r.requestId)) {
    // Expired meanwhile: its view is closed, so the terminal goes too.
    if (ptyId !== null) void d.invoke("kill_pty", { id: ptyId }).catch(() => {});
    return;
  }
  if (ptyId === null) return answer(d, r.requestId, { error: "the new terminal's shell didn't start" });
  answer(d, r.requestId, { ptyId });
}

function onExpired(requestId: number, d: OpenDeps) {
  const a = added.get(requestId);
  if (!a) return;
  added.delete(requestId);
  d.store.getState().closeView(a.tabId, a.viewId);
}

let listening = false;

/** Listen for `ade open` requests to this window. Once per window. */
export function startTerminalOpen() {
  if (listening) return;
  listening = true;
  const onEvent = new Channel<OpenMessage>();
  onEvent.onmessage = (msg) => void handleOpenMessage(msg);
  invoke("terminal_open_listen", { onEvent }).catch(() => {
    listening = false;
  });
}

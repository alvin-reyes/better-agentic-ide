import { invoke } from "@tauri-apps/api/core";

/**
 * Auto-save of app state to disk.
 *
 * The stores keep using localStorage as before; this module makes disk the
 * source of truth underneath them:
 *
 *  1. hydrateFromDisk() runs before React renders and copies every saved key
 *     from <app data>/state/kv into localStorage, so the stores read restored
 *     values on their first load.
 *  2. startAutoSave() wraps localStorage.setItem/removeItem. Any write to a
 *     persisted key is queued and flushed to disk shortly after, so a crash or
 *     kill loses at most the last second of changes, not the whole session.
 *
 * Keeping the stores unchanged means every existing setting, note, prompt,
 * workspace and session is covered without touching each store.
 */

/** Exact keys that are persisted. */
export const PERSISTED_KEYS = new Set([
  "ade-session", // tabs, splits, folders, scrollback
  "ade-scratchpad-draft", // unsent scratchpad text
  "better-terminal-settings", // theme, fonts, AI settings
  "better-terminal-workspaces",
  "better-terminal-prompt-history",
  "better-terminal-saved-notes",
  "better-terminal-orchestrator",
  "better-terminal-agent-tracker",
  "better-terminal-tour-done",
  "ade-bmad-dismissed",
  "ade-file-browser",
  "ade-recordings-index",
]);

/** Key prefixes that are persisted (one key per recording). */
export const PERSISTED_PREFIXES = ["ade-rec-"];

export function isPersistedKey(key: string): boolean {
  return PERSISTED_KEYS.has(key) || PERSISTED_PREFIXES.some((p) => key.startsWith(p));
}

const FLUSH_DELAY_MS = 800;
const SNAPSHOT_EVERY_MS = 10 * 60 * 1000;

type Batch = Record<string, string | null>;

let pending: Batch = {};
let flushTimer: number | null = null;
let started = false;

async function flush(): Promise<void> {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  const batch = pending;
  pending = {};
  if (Object.keys(batch).length === 0) return;
  try {
    await invoke("state_write", { entries: batch });
  } catch (err) {
    // Put the batch back (newer queued values win) and retry on the next write.
    pending = { ...batch, ...pending };
    console.warn("auto-save failed", err);
  }
}

function queue(key: string, value: string | null) {
  pending[key] = value;
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => void flush(), FLUSH_DELAY_MS);
}

/**
 * Copy saved state from disk into localStorage. Returns how many keys were
 * restored. On first run after upgrading, disk is empty: the current
 * localStorage values are written to disk instead, so nothing is lost.
 */
export async function hydrateFromDisk(): Promise<number> {
  let saved: Record<string, string>;
  try {
    saved = await invoke<Record<string, string>>("state_read_all");
  } catch {
    return 0; // Not running under Tauri (tests, plain browser).
  }
  const keys = Object.keys(saved).filter(isPersistedKey);
  if (keys.length === 0) {
    const seed: Batch = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && isPersistedKey(k)) seed[k] = localStorage.getItem(k);
    }
    if (Object.keys(seed).length > 0) {
      await invoke("state_write", { entries: seed }).catch(() => {});
    }
    return 0;
  }
  for (const k of keys) {
    try {
      localStorage.setItem(k, saved[k]);
    } catch {
      // Quota exceeded for one key (e.g. a huge recording); keep going.
    }
  }
  return keys.length;
}

/**
 * Mirror every write to a persisted key onto disk. Also takes a snapshot on
 * start and every 10 minutes, and flushes when the window is hidden or closed.
 * Safe to call more than once.
 */
export function startAutoSave(): void {
  if (started) return;
  started = true;

  const proto = Object.getPrototypeOf(localStorage) as Storage;
  const origSet = proto.setItem;
  const origRemove = proto.removeItem;
  proto.setItem = function (this: Storage, key: string, value: string) {
    origSet.call(this, key, value);
    if (this === localStorage && isPersistedKey(key)) queue(key, String(value));
  };
  proto.removeItem = function (this: Storage, key: string) {
    origRemove.call(this, key);
    if (this === localStorage && isPersistedKey(key)) queue(key, null);
  };

  const snapshot = () => invoke("state_snapshot").catch(() => {});
  void snapshot();
  window.setInterval(snapshot, SNAPSHOT_EVERY_MS);

  window.addEventListener("beforeunload", () => void flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
  });
}

/** Write anything queued right away (used before closing the window). */
export function flushNow(): Promise<void> {
  return flush();
}

/** Test seam. */
export function __resetForTests() {
  pending = {};
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = null;
  started = false;
}

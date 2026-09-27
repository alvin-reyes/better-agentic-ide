import { invoke } from "@tauri-apps/api/core";
import { flushNow } from "./persistence";

export interface SyncConfig {
  remote: string;
  device: string;
  includeClaudeMemory: boolean;
}

export interface SyncReport {
  pushed: boolean;
  importedKeys: string[];
  importedMemory: string[];
  conflicts: string[];
  devices: string[];
  lastSyncMs: number;
}

/** How long startup waits for the pre-launch pull before giving up on it. */
const STARTUP_SYNC_TIMEOUT_MS = 6000;
const SYNC_INTERVAL_MS = 3 * 60 * 1000;

type Listener = (r: SyncReport | null, err: string | null) => void;
const listeners = new Set<Listener>();
let lastReport: SyncReport | null = null;
let lastError: string | null = null;
let running: Promise<SyncReport | null> | null = null;

export function onSyncResult(l: Listener): () => void {
  listeners.add(l);
  l(lastReport, lastError);
  return () => listeners.delete(l);
}

export function getSyncConfig(): Promise<SyncConfig | null> {
  return invoke<SyncConfig | null>("sync_get_config");
}

export function setSyncConfig(config: SyncConfig): Promise<void> {
  return invoke("sync_set_config", { config });
}

/**
 * Run one sync. `applyRemote` imports other machines' changes into local state
 * and ~/.claude, so it is only passed at startup, before the stores load; while
 * the app runs, imported values would be overwritten by in-memory state.
 */
export function syncNow(applyRemote = false, importDeadlineMs?: number): Promise<SyncReport | null> {
  if (running) return running;
  running = (async () => {
    try {
      await flushNow();
      const report = await invoke<SyncReport | null>("sync_now", {
        applyRemote,
        importDeadlineMs: importDeadlineMs ?? null,
      });
      lastReport = report ?? lastReport;
      lastError = null;
      return report;
    } catch (err) {
      lastError = String(err);
      return null;
    } finally {
      running = null;
      listeners.forEach((l) => l(lastReport, lastError));
    }
  })();
  return running;
}

/** Pull and apply remote changes before the app loads (bounded by a timeout). */
export async function syncBeforeLaunch(): Promise<void> {
  let config: SyncConfig | null = null;
  try {
    config = await getSyncConfig();
  } catch {
    return; // Not running under Tauri.
  }
  if (!config) return;
  // The race can't cancel the sync, so tell the backend when we stop waiting:
  // a sync still running then skips its import, which would otherwise land
  // after the stores loaded and be overwritten by them. A small margin keeps
  // an import from finishing just as hydrate reads the files.
  const deadline = Date.now() + STARTUP_SYNC_TIMEOUT_MS - 500;
  await Promise.race([
    syncNow(true, deadline),
    new Promise((resolve) => window.setTimeout(resolve, STARTUP_SYNC_TIMEOUT_MS)),
  ]);
}

let periodicStarted = false;

/** Push local changes every few minutes and when the window is hidden. */
export function startPeriodicSync(): void {
  if (periodicStarted) return;
  periodicStarted = true;
  const tick = async () => {
    if (await getSyncConfig().catch(() => null)) void syncNow(false);
  };
  window.setInterval(tick, SYNC_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void tick();
  });
}

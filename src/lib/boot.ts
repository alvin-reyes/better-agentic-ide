import { hydrateFromDisk, startAutoSave } from "./persistence";
import { startPeriodicSync, syncBeforeLaunch } from "./sync";
import { moveAnthropicKeyToVault } from "./anthropicKey";

/**
 * The two launch sequences `main.tsx` picks between, before it loads the
 * settings store, paints the theme and renders.
 *
 * Imports only `@tauri-apps/api/core`, `./persistence`, `./sync` and
 * `./anthropicKey` (the plan's import rules, checked by a test). No store may
 * be imported here: a store reads localStorage when its module is first
 * evaluated, so it must not load before `hydrateFromDisk()` has restored it.
 * `projectSetup` is loaded dynamically for the same reason.
 */

export interface MainBootDeps {
  /** Pull other machines' changes before the restore (bounded wait). */
  syncBeforeLaunch: () => Promise<void>;
  /** The launch steps that need auto-save running (project setup's). */
  afterAutoSave: () => Promise<void>;
  startPeriodicSync: () => void;
}

const mainDefaults: MainBootDeps = {
  syncBeforeLaunch,
  startPeriodicSync,
  afterAutoSave: projectSetupSteps,
};

/**
 * The main window: sync, restore the saved state, move the old plain-text
 * Anthropic key into the vault, then mirror the state to disk. The move runs
 * before `startAutoSave`, whose first act is a snapshot of `kv/`: that
 * snapshot copies a clean file, and the boot scrub never races auto-save. A
 * failed move never stops the launch.
 */
export async function bootMain(deps: Partial<MainBootDeps> = {}): Promise<void> {
  const d = { ...mainDefaults, ...deps };
  await d.syncBeforeLaunch();
  await hydrateFromDisk();
  await moveAnthropicKeyToVault();
  startAutoSave();
  await d.afterAutoSave();
  d.startPeriodicSync();
}

/**
 * A detached window: localStorage is shared, but each window has its own
 * Storage prototype, so mirror this window's writes (notes, prompt history)
 * too. It never restores, syncs or moves the key.
 */
export async function bootDetached(): Promise<void> {
  startAutoSave({ snapshots: false });
}

/**
 * After the restore, so "no kept list yet" is true only on the first launch
 * with one; after auto-save starts, so the list reaches disk.
 */
async function projectSetupSteps(): Promise<void> {
  const { migrateKept, reaskV4Projects } = await import("./projectSetup");
  migrateKept();
  // Not awaited: it asks the disk about each kept project, and launch
  // doesn't wait on that.
  void reaskV4Projects();
}

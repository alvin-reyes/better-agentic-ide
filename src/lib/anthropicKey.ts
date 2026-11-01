import { invoke } from "@tauri-apps/api/core";

/**
 * The Orchestrator's Anthropic API key lives in the vault (the OS keychain)
 * under an app-only name, which `vault.rs` never exports to terminals
 * (ADR 0013). Older versions saved it in plain text as a settings field; this
 * module moves that copy into the vault once, at boot, and offers the user a
 * way to delete it when the move cannot run (no working keychain).
 *
 * Imports only `@tauri-apps/api/core`: `boot.ts` loads it before
 * `hydrateFromDisk` has restored the state, so it must not pull in a store.
 */

/** Must equal `vault::ORCHESTRATOR_ANTHROPIC_KEY` in `src-tauri/src/vault.rs`. */
export const ANTHROPIC_VAULT_NAME = "ADE_ORCHESTRATOR_ANTHROPIC_KEY";
/** The old settings field. The only place in `src/` that names it. */
export const LEGACY_FIELD = "anthropicApiKey";
/** The note saved with the vault entry. */
export const ANTHROPIC_KEY_NOTE = "Orchestrator: Anthropic API key. Not exported to terminals.";

const SETTINGS_KEY = "better-terminal-settings";
/** Steps 3-4 of the move share this bound, so a hung keychain can't hold up launch. */
const VAULT_TIMEOUT_MS = 5000;

/**
 * - `moved`: the key was written to the vault and stripped from settings.
 * - `stripped`: the field was removed without a vault write (empty, or the vault already had a key).
 * - `nothing`: no field to move.
 * - `failed`: see `lastMoveError()`; the settings are untouched.
 */
export type MoveResult = "moved" | "stripped" | "nothing" | "failed";

/** Why the last move failed, and whether the key was already safe in the vault by then. */
export interface MoveFailure {
  reason: string;
  /** True when the failure came after the vault was known to hold a key (step 5). */
  keyInVault: boolean;
}

let moveFailure: MoveFailure | null = null;

/** Why the last move failed, or null if it didn't. */
export function lastMoveError(): string | null {
  return moveFailure?.reason ?? null;
}

/** The last move's failure with the step it reached, or null if it didn't fail. */
export function lastMoveFailure(): MoveFailure | null {
  return moveFailure;
}

/** What `state_scrub_secrets` did: files written or deleted, and files it couldn't change. */
export interface ScrubReport {
  changed: number;
  skipped: number;
}

/**
 * `removeSavedCopy` failed. `settingsCleared` is true when the settings (disk
 * and localStorage) no longer hold the key and only the snapshot clean-up
 * failed, so trying again only needs to repeat that.
 */
export class SavedCopyError extends Error {
  constructor(
    message: string,
    readonly settingsCleared: boolean,
  ) {
    super(message);
    this.name = "SavedCopyError";
  }
}

function errText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** The saved settings object, or null if missing, unreadable or not an object. */
function readSettings(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function without(settings: Record<string, unknown>): string {
  const { [LEGACY_FIELD]: _drop, ...rest } = settings;
  return JSON.stringify(rest);
}

/** True while localStorage still holds a plain-text copy of the key. */
export function hasSavedCopy(): boolean {
  const value = readSettings()?.[LEGACY_FIELD];
  return typeof value === "string" && value !== "";
}

/**
 * For `persistSettings`: the store never holds the old field, so a save would
 * drop it. Until the move (or `removeSavedCopy`) strips it from localStorage,
 * copy it into what is saved; afterwards, keep it out.
 */
export function carryLegacyField(json: string): string {
  const current = readSettings();
  const carried = current !== null && Object.prototype.hasOwnProperty.call(current, LEGACY_FIELD);
  let next: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return json;
    next = parsed as Record<string, unknown>;
  } catch {
    return json;
  }
  if (carried) return JSON.stringify({ ...next, [LEGACY_FIELD]: current[LEGACY_FIELD] });
  if (LEGACY_FIELD in next) return without(next);
  return json;
}

class TimedOut extends Error {}

/**
 * Steps 3-4: put `key` in the vault unless it already holds one. Resolves
 * true if a write happened. `isAbandoned` stops it between calls once the
 * shared timeout has fired; a call already in flight can only add the key.
 */
async function toVault(key: string, isAbandoned: () => boolean): Promise<boolean> {
  try {
    const existing = await invoke<string>("vault_get", { name: ANTHROPIC_VAULT_NAME });
    if (existing) return false; // The vault wins.
  } catch (err) {
    if (errText(err) !== "not found") throw err;
  }
  // From here the vault held no usable key, so whatever it holds next was written by this move.
  if (isAbandoned()) throw new TimedOut();
  await invoke("vault_set", { name: ANTHROPIC_VAULT_NAME, value: key, note: ANTHROPIC_KEY_NOTE });
  if (isAbandoned()) throw new TimedOut();
  const back = await invoke<string>("vault_get", { name: ANTHROPIC_VAULT_NAME });
  if (back !== key) {
    // Past the bound, a different value may be one the user has just saved:
    // the move deletes only within its 5 s bound (owner, 2026-11-01).
    if (isAbandoned()) throw new TimedOut();
    // Best effort: a wrong value left behind would read as "the vault wins" at
    // the next launch, which would then strip the only good copy.
    await invoke("vault_delete", { name: ANTHROPIC_VAULT_NAME }).catch(() => {});
    throw new Error("The system keychain returned a different value after saving the key.");
  }
  return true;
}

function withinBound<T>(run: (isAbandoned: () => boolean) => Promise<T>): Promise<T> {
  let abandoned = false;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      abandoned = true;
      reject(new TimedOut(`The system keychain didn't answer within ${VAULT_TIMEOUT_MS / 1000} s.`));
    }, VAULT_TIMEOUT_MS);
    run(() => abandoned).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Step 7. Leftover temp files are always deleted. The settings copies are
 * stripped only with `strip`, when the vault is known to hold the key.
 */
async function scrubAtBoot(strip: boolean): Promise<void> {
  try {
    const report = await invoke<ScrubReport>("state_scrub_secrets", { atBoot: true, strip });
    if (report && report.skipped > 0) {
      console.warn(`scrubbing the old Anthropic key from saved state skipped ${report.skipped} file(s); retried next launch`);
    }
  } catch (err) {
    console.warn("scrubbing the old Anthropic key from saved state failed", err);
  }
}

/** Names only (`vault_list`): whether the vault holds the key. False if the list can't be read. */
async function vaultListsKey(): Promise<boolean> {
  try {
    const list = await invoke<{ name: string }[]>("vault_list");
    return list.some((s) => s.name === ANTHROPIC_VAULT_NAME);
  } catch (err) {
    console.warn("couldn't read the vault's names; the boot scrub leaves the settings copies for the next launch", err);
    return false;
  }
}

/**
 * The one-time move, run at boot after `hydrateFromDisk` and before
 * `startAutoSave` (see the plan's "The move, step by step"). The key is in at
 * least one place at every moment: each step runs only if the one before it
 * worked, so a failure or crash leaves the next launch to start again. Never
 * throws.
 */
export async function moveAnthropicKeyToVault(): Promise<MoveResult> {
  moveFailure = null;
  let keyInVault = false;
  try {
    // 1. Nothing to move. The settings copies are stripped only if the vault
    // lists the key: otherwise a restore that silently missed the settings key
    // would let the scrub strip the only copies left on disk.
    const settings = readSettings();
    if (settings === null || !Object.prototype.hasOwnProperty.call(settings, LEGACY_FIELD)) {
      await scrubAtBoot(await vaultListsKey());
      return "nothing";
    }
    // 2-4. An empty field (or one that isn't a string) needs no vault call.
    const key = settings[LEGACY_FIELD];
    let wrote = false;
    if (typeof key === "string" && key !== "") {
      wrote = await withinBound((isAbandoned) => toVault(key, isAbandoned));
      keyInVault = true;
    }
    // 5. Disk first, with no timeout: a late write could overwrite a newer flush.
    const json = without(settings);
    await invoke("state_write", { entries: { [SETTINGS_KEY]: json } });
    // 6. Auto-save hasn't started, so this queues no second write.
    localStorage.setItem(SETTINGS_KEY, json);
    // 7. Strip the settings copies only when the vault holds the key: this
    // move put it there or found it, or (for an empty field) `vault_list`
    // lists it. Otherwise the snapshots may hold the last copy of a key.
    await scrubAtBoot(keyInVault || (await vaultListsKey()));
    return wrote ? "moved" : "stripped";
  } catch (err) {
    moveFailure = { reason: errText(err), keyInVault };
    return "failed";
  }
}

/**
 * Delete the plain-text copy while the app runs (when the move can't): from
 * disk, localStorage, and the snapshots. Rejects with the error if the disk
 * write fails, leaving localStorage as it was; rejects with a
 * `SavedCopyError` (`settingsCleared: true`) if only the snapshot clean-up
 * failed or skipped files. Never touches the vault.
 */
export async function removeSavedCopy(): Promise<void> {
  // Dynamic, so this module's only static import stays `@tauri-apps/api/core`.
  const { flushNow } = await import("./persistence");
  // 1. Queued writes land first.
  await flushNow();
  // 2. Disk, from a fresh read.
  const settings = readSettings();
  if (settings !== null) {
    await invoke("state_write", { entries: { [SETTINGS_KEY]: without(settings) } });
    // 3. Read again: another window may have saved during the await.
    const latest = readSettings();
    if (latest !== null && Object.prototype.hasOwnProperty.call(latest, LEGACY_FIELD)) {
      localStorage.setItem(SETTINGS_KEY, without(latest));
    }
  }
  // 4. Snapshots and restore directories; kv/ was written in step 2.
  let report: ScrubReport;
  try {
    report = await invoke<ScrubReport>("state_scrub_secrets", { atBoot: false, strip: true });
  } catch (err) {
    throw new SavedCopyError(`The key was removed from ADE's settings, but cleaning its saved snapshots failed: ${errText(err)}`, true);
  }
  if (report && report.skipped > 0) {
    const n = report.skipped;
    throw new SavedCopyError(
      `The key was removed from ADE's settings, but ${n} saved ${n === 1 ? "copy" : "copies"} under ADE's state folder couldn't be cleaned.`,
      true,
    );
  }
}

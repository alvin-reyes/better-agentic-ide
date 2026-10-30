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

let moveError: string | null = null;

/** Why the last move failed, or null if it didn't. */
export function lastMoveError(): string | null {
  return moveError;
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
  if (isAbandoned()) throw new TimedOut();
  await invoke("vault_set", { name: ANTHROPIC_VAULT_NAME, value: key, note: ANTHROPIC_KEY_NOTE });
  if (isAbandoned()) throw new TimedOut();
  const back = await invoke<string>("vault_get", { name: ANTHROPIC_VAULT_NAME });
  if (back !== key) throw new Error("The system keychain returned a different value after saving the key.");
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

async function scrubAtBoot(): Promise<void> {
  try {
    await invoke("state_scrub_secrets", { atBoot: true });
  } catch (err) {
    console.warn("scrubbing the old Anthropic key from saved state failed", err);
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
  moveError = null;
  try {
    // 1. Nothing to move: only the scrub runs.
    const settings = readSettings();
    if (settings === null || !Object.prototype.hasOwnProperty.call(settings, LEGACY_FIELD)) {
      await scrubAtBoot();
      return "nothing";
    }
    // 2-4. An empty field (or one that isn't a string) needs no vault call.
    const key = settings[LEGACY_FIELD];
    let wrote = false;
    if (typeof key === "string" && key !== "") {
      wrote = await withinBound((isAbandoned) => toVault(key, isAbandoned));
    }
    // 5. Disk first, with no timeout: a late write could overwrite a newer flush.
    const json = without(settings);
    await invoke("state_write", { entries: { [SETTINGS_KEY]: json } });
    // 6. Auto-save hasn't started, so this queues no second write.
    localStorage.setItem(SETTINGS_KEY, json);
    // 7.
    await scrubAtBoot();
    return wrote ? "moved" : "stripped";
  } catch (err) {
    moveError = errText(err);
    return "failed";
  }
}

/**
 * Delete the plain-text copy while the app runs (when the move can't): from
 * disk, localStorage, and the snapshots. Rejects with the error if the disk
 * write fails, leaving localStorage as it was. Never touches the vault.
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
  await invoke("state_scrub_secrets", { atBoot: false });
}

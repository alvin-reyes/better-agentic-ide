# Writing shared local keys

- **Decided in:** ADR 0033 (revision 5).
- **Design:** `docs/superpowers/specs/2026-11-10-thoughts-panel-architecture.md`, sections 2 and 3.

## The rule

It applies to a JSON `localStorage` key that **more than one window writes**. In one synchronous step, the writer:

1. re-reads the key;
2. changes only what it means to change;
3. writes the result;
4. updates its own store with `set`.

- **Objects: field-level.** Use `writeJsonFields(key, patch, base)` (`src/lib/storage.ts`). It applies `patch` to the top-level fields. `base`, the window's full copy, is used only when the key is absent or unreadable.
- **Arrays: operation-level.** Re-read the array and apply one operation to it: add (with the key's de-duplication), remove by id or by value (never by index), or replace one entry by id. Cap it, write it, then set the store from what was written.
- **Never write a window's whole in-memory copy of such a key**, from any window, main or detached. In particular, never call `persistSettings(get())` after load.
- A handler that applies another window's change (a Tauri event) updates its store with `set` and writes nothing.
- **This is best effort across windows.** Writes to one key within the time `localStorage` takes to reach every window can lose one field until the next write. Do not build anything that needs more.

## Keys under the rule

- `better-terminal-settings`: every `settingsStore` setter, through `save(patch)`. Load-time migrations are applied in memory only and must stay in the code. Unset fields stay absent and follow their default.
- `ade-thoughts-layout`: through `writeThoughtsLayoutField` (`src/lib/thoughtsLayout.ts`).
- `ade-file-browser`: F3 s1c's `setShowHidden` read-modify-write and the mirror.

## Known exceptions (follow-up F-1)

These are written whole from stale copies today, in both kinds of window:

- `better-terminal-prompt-history` (`Scratchpad.tsx` `saveHistory`);
- `better-terminal-saved-notes` (`Scratchpad.tsx` `persistNotes`);
- `better-terminal-agent-tracker` (`agentTrackerStore.ts` `persistSessions`).

Do not copy their pattern. F-1 moves them to operation-level writes.

## Single writer: plain `setItem` allowed

`ade-session`, `ade-viewer-state`, `ade-thoughts-dock-notice`, `better-terminal-workspaces`, `better-terminal-orchestrator` and `ade-bmad-dismissed`. These are written by the main window only. If a detached window starts writing one, it comes under the rule.

## Disk queue (`src/lib/persistence.ts`)

- `queue(key)` records the key only.
- `flush()`, and its retry after a failed `state_write`, read each queued key's value from `localStorage` at flush time. `null` means remove.
- After applying a cross-window settings event, the main window calls `flushNow()` (`applyThoughtsDock` in `src/lib/thoughtsDockSync.ts`).
- After a snapshot restore, `state_write` (`src-tauri/src/state.rs`) drops every write until restart. The flag is a `RestoreGuard` in Tauri managed state, not a static; only `guarded_write` (the `state_write` command) checks it and only `guarded_restore` (the `state_restore_snapshot` command) sets it. It is set under the guard's lock, which is held for the whole restore, and only once the restore has returned `Ok`. **Nothing sets it to false:** a restore that fails leaves it as it was, so a failed restore after a successful one leaves every write dropped. A second restore before the restart is allowed. `write_batch` knows nothing of it. `state_write` and `state_restore_snapshot` are `async fn`s that run their bodies with `tauri::async_runtime::spawn_blocking`, so a write waiting on the guard holds a blocking-pool thread, not a tokio worker. Each command passes `guard.inner().clone()` to the guarded function, never a new `RestoreGuard`. Test A-9 (a string test in `state.rs`, over production code lines only) checks that, and that `lib.rs` registers `.manage(state::RestoreGuard::default())`.
- `suspendAutoSave()` stops the calling window's flush timer; it does not stop the 10-minute snapshot interval, which never writes `kv/`. While suspended, `queue(key)` still records the key but starts no timer. When a restore succeeds, `SyncSettings` calls `markRestored()`, which sets `restoredThisRun` and `suspended`. When a restore fails, it calls `resumeAutoSave()`. That function is the only code that clears `suspended`: it returns `false` and does nothing once `restoredThisRun` is set, and otherwise flushes the recorded keys with their current values and returns `true`. **Never clear `suspended` any other way.** After a successful restore nothing resumes until restart, whatever later restores do.

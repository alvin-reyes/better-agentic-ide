# 0033: Shared local keys are written field by field, and the disk queue reads at flush time

- **Status:** Proposed (2026-11-10), revision 3. With the Thoughts panel dock architecture note, revision 3.
- **Context:**
  - Every app window holds its own copy of each store. It reads that copy once, when its JS loads. `localStorage` is shared by all the windows.
  - Settings setters today write the window's whole copy (`persistSettings(get())`). The Thoughts dock (UX amendment 2026-11-10, N1) is the first setting that a detached window writes. A whole-copy write from a window opened before a theme, font or API-key change would put the old values back, and sync would carry them to every Mac.
  - The same thing can happen in reverse. A main-window setter that runs before the `ade://thoughts-dock` event arrives would overwrite the detached window's dock.
  - Each window mirrors its own writes to disk through its own queue (`persistence.ts`). That queue captures the value at `setItem` time. A queued, or retried, older value can therefore reach disk after a newer one from another window.
  - Existing code already writes three shared array keys whole, from copies read earlier, in both kinds of window. These are `better-terminal-prompt-history` and `better-terminal-saved-notes` (`Scratchpad.tsx` `saveHistory`, `persistNotes`) and `better-terminal-agent-tracker` (`agentTrackerStore.ts`, reached from detached windows through `useTerminal`).
  - `suspendAutoSave()` after a snapshot restore stops only the window that calls it.
- **Decision:**
  - **Scope.** The rule covers a JSON key in `localStorage` that more than one window writes. A key with a single writing window may use plain `setItem`.
  - Such a key is written in one synchronous step:
    1. re-read the key;
    2. change only what is being changed;
    3. write it back;
    4. then update the window's store with `set`.
  - **Object keys are field-level.** The helper is `writeJsonFields(key, patch, base)` in `src/lib/storage.ts`. `base` is used only when the key is absent or unreadable. Top-level fields are the unit.
  - **Array keys are operation-level.** The writer re-reads the array and applies its one operation to it: add with the key's de-duplication, remove by id or by value (never by index), or replace one entry by id. It caps the array, writes it, and sets its store from what it wrote.
  - No window writes its whole in-memory copy of such a key.
  - Every `settingsStore` setter follows this rule, not only the ones a detached window calls.
  - A listener that applies another window's change (for example `ade://thoughts-dock`) calls `set` only and writes nothing.
  - The disk queue holds keys, not values. `flush()` and its retry read `localStorage` at flush time.
  - The main window calls `flushNow()` after applying `ade://thoughts-dock`.
  - After a snapshot restore, `state_write` in Rust drops every write until the process restarts, because every window's writes meet there. The flag is a `RestoreGuard` held in Tauri managed state (not a process-wide static, so parallel `cargo test` threads each use their own), set before the swap and cleared if the restore fails (note section 3.4).
  - **Known exceptions:** the three array keys above. They are left as they are by the Thoughts work and are fixed by follow-up F-1 (architecture note, section 2.1).
- **Consequences:**
  - A stale window can no longer undo another window's change in `localStorage` or on disk, whichever window flushes last, provided the two writes are further apart than the time a write takes to reach every window.
  - **This is best effort across windows, not atomic.** `state_write` is async, and WebKit propagates `localStorage` between processes asynchronously. Two writes to one key within that interval can lose one field until the key is next written. The next flush of the key, from any window, writes the converged value. No lock is added.
  - Every future cross-window setting gets this for free, provided it uses `writeJsonFields`. Code review should refuse a whole-object or whole-array `setItem` on a key more than one window writes.
  - **Settings no longer persist load-time migrations or untouched defaults.** The legacy `fontFamily`, `RETIRED_MODELS` and the `gemini` fallback stay applied in memory at each load and stay on disk until the user sets that field, so those migrations must not be deleted. A field the user never set stays absent, so it follows future changes of its default. Changing a default is therefore a change for those users.
  - A field write costs one extra `getItem` and `JSON.parse`. Settings writes are rare, so this does not matter.
  - A nested object, such as a custom theme, is replaced whole, as it is today. Two windows editing different parts of one nested field would still race. No such case exists.
  - Keys with a single writer (`ade-session`, `ade-viewer-state`, `ade-thoughts-dock-notice`, `better-terminal-workspaces`, `better-terminal-orchestrator`, `ade-bmad-dismissed`) may keep plain `setItem`.

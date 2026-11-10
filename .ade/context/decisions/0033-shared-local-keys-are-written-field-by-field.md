# 0033: Shared local keys are written field by field, and the disk queue reads at flush time

- **Status:** Proposed (2026-11-10). With the Thoughts panel dock architecture note.
- **Context:**
  - Every app window holds its own copy of each store. It reads that copy once, when its JS loads. `localStorage` is shared by all the windows.
  - Settings setters today write the window's whole copy (`persistSettings(get())`). The Thoughts dock (UX amendment 2026-11-10, N1) is the first setting that a detached window writes. A whole-copy write from a window opened before a theme, font or API-key change would put the old values back, and sync would carry them to every Mac.
  - The same thing can happen in reverse. A main-window setter that runs before the `ade://thoughts-dock` event arrives would overwrite the detached window's dock.
  - Each window mirrors its own writes to disk through its own queue (`persistence.ts`). That queue captures the value at `setItem` time. A queued, or retried, older value can therefore reach disk after a newer one from another window.
- **Decision:**
  - A JSON key in `localStorage` that more than one window reads or writes is written in one synchronous step:
    1. re-read the key;
    2. change only the fields being written;
    3. write it back;
    4. then update the window's store with `set`.
  - No window writes its whole in-memory copy of such a key. The helper is `writeJsonFields(key, patch, base)` in `src/lib/storage.ts`. `base` is used only when the key is absent or unreadable.
  - Every `settingsStore` setter follows this rule, not only the ones a detached window calls.
  - A listener that applies another window's change (for example `ade://thoughts-dock`) calls `set` only and writes nothing.
  - The disk queue holds keys, not values. `flush()` and its retry read `localStorage` at flush time.
  - The main window calls `flushNow()` after applying `ade://thoughts-dock`.
- **Consequences:**
  - A stale window can no longer undo another window's change in `localStorage` or on disk, whichever window flushes last.
  - Every future cross-window setting gets this for free, provided it uses `writeJsonFields`. Code review should refuse a whole-object `setItem` on a shared key.
  - A field write costs one extra `getItem` and `JSON.parse`. Settings writes are rare, so this does not matter.
  - Top-level fields are the unit. A nested object, such as a custom theme, is replaced whole, as it is today. Two windows editing different parts of one nested field would still race. No such case exists.
  - Keys written by a single window (`ade-session`, `ade-viewer-state`, `ade-thoughts-dock-notice`) may keep plain `setItem`.

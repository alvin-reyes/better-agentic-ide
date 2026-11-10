# Writing shared local keys

- **Decided in:** ADR 0033.
- **Design:** `docs/superpowers/specs/2026-11-10-thoughts-panel-architecture.md`, sections 2 and 3.

## The rule

- A JSON `localStorage` key that more than one window reads or writes is written with `writeJsonFields(key, patch, base)` (`src/lib/storage.ts`). In one synchronous step it:
  1. re-reads the key;
  2. applies `patch` to the top-level fields;
  3. writes the result.
- `base` is the window's full copy. It is used only when the key is absent or unreadable.
- **Never write a window's whole in-memory copy of such a key**, from any window, main or detached. In particular, never call `persistSettings(get())` after load.
- A handler that applies another window's change (a Tauri event) updates its store with `set` and writes nothing.

## Keys under the rule

- `better-terminal-settings`: every `settingsStore` setter, through `save(patch)`.
- `ade-thoughts-layout`: through `writeThoughtsLayoutField` (`src/lib/thoughtsLayout.ts`).
- `ade-file-browser`: F3 S1 story 3's `setShowHidden` read-modify-write and the mirror.

Keys with a single writer may use plain `setItem`: `ade-session`, `ade-viewer-state` and `ade-thoughts-dock-notice`.

## Disk queue (`src/lib/persistence.ts`)

- `queue(key)` records the key only.
- `flush()`, and its retry after a failed `state_write`, read each queued key's value from `localStorage` at flush time. `null` means remove.
- After applying a cross-window settings event, the main window calls `flushNow()`.

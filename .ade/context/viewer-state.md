# Viewer state: per-view file browser and preview panel

- **Decided in:** ADR 0031 (storage, matching, saving) and ADR 0032 (per-view open file).
- **Design:** `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md`.
- **PRD:** F3.
- **Status:** proposed 2026-11-10, design revision 2; not built. Version 1 below is what F3 S1 writes.

## Viewer key

- `View.viewerKey: string` is 32 lower-case hex characters (128 random bits, `crypto.getRandomValues`). It is minted when the view is created.
- It is saved in `ade-session` as `SavedTab.viewerKey` (the own view, every tab type) and as `SavedView.viewerKey` (each sub-terminal).
- On load it must match `/^[0-9a-f]{32}$/` and be unique in the session; otherwise a new key is minted and that view gets the defaults.
- It is the **only** thing that matches a state to a view. Tab, view and pane ids are never used for this.
- It moves with its `View` object (Move to New Tab). Move to New Window carries it only from F3 S3: today `tabFromDetached` rebuilds the view through `ownViewOnly`, which mints a new key. Duplicate and Reopen Closed Tab mint a new key and copy the state (S5).
- `saveSession` writes `viewerKey` as the **last** field of each saved record.
- A new view's layout source is passed by its creator with `seedLayout(newKey, sourceKey)` (`src/lib/viewerSeed.ts`) just before the tab-store `set`; it is never a `View` field. `addView`: the spawning view, else the tab's shown view. Top-level tab creators: the main window's view in sight. Restored views are never seeded.

## Load order (main window)

1. `hydrateViewerState()`: parse `ade-viewer-state` into `viewerStore.pending` (not `states`), apply the 500 cap, raise `seq`.
2. `loadSession()`: reconciliation gives each restored view `pending[key]`, else the defaults.
3. `endRestore()` (in `finally`): clear `pending`, apply legacy `previewPath` to default states, mark dirty.
4. `startViewerPersistence()`. Before this, `flushViewerState()` is a no-op.

Reconciliation runs synchronously on every tab-store change, and once at module init (the tab store holds `tab-1` already). Precedence for a new key: `pending[key]`, then the seed's layout, then the defaults.
- Never put it in any payload that leaves the machine. Build payloads by picking fields; never spread a `View`.

## Storage key `ade-viewer-state`

- It is in `PERSISTED_KEYS` (`src/lib/persistence.ts`) and is not in `SHARED_KEYS` or `DEVICE_KEYS` (`src-tauri/src/sync.rs`).
- It is written only by the main window (`startViewerPersistence()` in `App.tsx`), at most once every 2 s, plus a flush at the start of `saveSession`.
- `sync.rs` `SESSION_LOCAL_FIELDS` = `["serializedBuffer", "viewerKey", "previewPath"]`.

```ts
type Saved = { v: 1; states: Record<ViewerKey, SavedState> };
type SavedState = {
  opener: string | null;                  // non-terminal tabs only
  expanded: [path: string, seq: number][]; // oldest first
  file: { path: string; pos: Position | null } | null;
  layout: { browserOpen: boolean; browserWidth: number; previewOpen: boolean; previewWidth: number };
  seen: number;                           // seq when last in sight; 0 = never
};
type Position =
  | { kind: "code"; top: number; line: number; col: number }               // S1: whole numbers >= 1
  | { kind: "md"; digest: string; occ: number; px: number; frac: number }  // S2: digest = 32 hex (SHA-256/128 of the slug)
  | { kind: "pdf"; page: number; frac: number; zoom: number }              // S2
  | { kind: "html"; frac: number }                                         // S2
  | { kind: "docx"; frac: number };                                        // S2
```

## Reading rules

- A `v` other than `1`, or JSON that does not parse, is read as "no state": every view gets the defaults.
- An unknown `pos.kind` is read as `pos: null`.
- A malformed `layout` drops that state.
- An `expanded` entry whose path is not a string, or whose `seq` is not a positive safe integer, is dropped.
- An expanded set over 500 entries keeps the 500 with the highest `seq`.
- Widths are clamped: file browser 180..500, preview panel 280..900.
- The root is **not stored**:
  - for a terminal view it is `usePaneCwd.cwds[activePaneId] ?? savedCwd ?? initialCwd`;
  - for a non-terminal tab it is the tab's own folder (editor: `project_root` of the file's folder; contracts: `contractsRoot`; orchestrator: `projectDir` from S4), else `opener`, else the home folder. A folder counts only if `list_directory` resolves.

## Defaults (a view with no state)

| Field | Default |
|---|---|
| file browser | `ade-file-browser`'s `isOpen` and `width` (clamped), else closed at 240 |
| preview panel | closed at 480 |
| `expanded` | `[]` |
| `file` | `null`; a saved legacy `previewPath` becomes the own view's file |
| `seen` | 0 |

A new view copies only the layout of the view it was opened from (D1).

## Sequence numbers

- There is one counter per window's `viewerStore`. Every expansion and every change of the view in sight takes `++seq`.
- At hydrate (before `loadSession`), `seq = max(seq, every saved expanded seq and seen)`. No counter field is saved. A restored state keeps its `seen`; a new state starts at 0; the view in sight gets `seen = next()` whenever it changes.

## The 500-folder cap

- `viewerStore.expand(key, path)` sets `expanded[path] = next()`; at 501 entries it deletes the one with the lowest `seq`. The evicted folder shows collapsed; its descendants stay in the set.
- `collapse(key, path)` deletes only that path.
- A successful listing of P removes from the set each direct child of P that is no longer a folder there, and every expanded path below it. A listing error removes nothing.
- Numbers from different windows are never compared. States that arrive from another window are renumbered on arrival by `renumberOnArrival(states, localSeq)`: their relative order is kept and they are shifted to start at `localSeq + 1` (S3).

## Caps, applied at write time

`buildSavedViewerState(states, inSightKey, keep)` is a pure function and never changes memory.
- **Size:** `bytes(x)` is the UTF-8 length of `JSON.stringify(x)`; 1 KB = 1,024 bytes.
- **Path rule:** a path over 4,096 bytes is not stored. An expanded folder that long is left out; an open file or opener that long is saved as `null`.
- **Filter:** `viewerPathFilter()` from `src/lib/viewerFilter.ts` is `(paths: string[]) => Promise<boolean[]>`. The default keeps every path, and F1's PE-4 AC4 story sets the real one. Each write snapshots the states, asks the filter about that snapshot's paths only, and builds from the same snapshot; a path with no `true` decision is refused (left out, or saved as `null` with no position). If the filter rejects or returns a malformed result, a **layout-only** value is written (`expanded: []`, `file: null`, `opener: null`, layouts and `seen` kept) and `console.warn` reports it on the 1st and every 10th consecutive failure.
- **Write generation:** each write takes `++writeGen`; it lands only if its generation is not below the last one that landed (the same generation may go from full to lean to removed).
- **Per view:** one view's size is `bytes(key) + 1 + bytes(state)`, at most 32,768. Over that, drop the fewest expanded entries with the lowest `seq` that make it fit (binary search, re-serializing at each probe).
- **All views:** the whole value must be at most 262,144 bytes. Order the views by `seen` ascending, with the view in sight last. Empty their expanded sets in that order, the last one needed only partly; if still over, drop whole states in that order. Sizes are recomputed by serializing, never by subtraction.
- **`saveSession` ladder** (after one awaited flush; then synchronous on that flush's full and lean strings; `MAX_SESSION_SIZE` measures `ade-session` alone):
  0. viewer full; on a throw lean; on a throw remove. Never affects `ade-session`;
  1. session over `MAX_SESSION_SIZE`: viewer lean, then today's scrollback tail;
  2. session `setItem` throws: viewer lean, retry;
  3. still throws: remove `ade-viewer-state`, retry with the same scrollback;
  4. still throws: strip scrollback, retry;
  5. still throws: remove `ade-session` (today's last resort).

## `ade-file-browser`

- The shape is unchanged: `{ isOpen, width, showHidden }`.
- The main window writes `isOpen` and `width` from its view in sight's file browser whenever either shown value changes. A switch to the same values writes nothing.
- `showHidden` stays global; toggling it writes that field alone, by read-modify-write.
- Detached windows never write `isOpen` or `width`.

## Seams for tests

- `src/lib/paneFolder.ts` `readPaneFolder(paneId)` is the only reader of a pane's folder: today `getPtyCwd`, later OSC 7 (ADR 0021). Only the latest request per pane may write `usePaneCwd`. Tests mock `getPtyCwd` (`src/hooks/useTerminal`) and keep `readPaneFolder` real.
- `monacoStub.tsx` adds `lineHeight` = 20, `layout()` setting `laidOut`, `getTopForLineNumber`, `getVisibleRanges` (`[]` until `layout()`), `onDidScrollChange` and `onDidChangeCursorPosition`.
- The golden fixture `src-tauri/tests/fixtures/f3-viewer-session.json` is produced by the TypeScript serializers (vitest asserts equality; `UPDATE_F3_GOLDEN=1 npx vitest run src/stores/__tests__/viewerGolden.test.ts` regenerates it) and read by the `sync.rs` export tests. Test views use fixed keys from `testKey(n)` (`src/stores/__tests__/viewerKeys.ts`).

## File browser tree (`fileBrowserStore`)

- State: `{ gen, viewerKey, rootPath, listings: Record<path, {entries} | "loading" | "error">, showHidden }`. No `isExpanded` on nodes: a folder is expanded exactly when its path is in the view's expanded set.
- `show(key, root)` bumps `gen` and clears `listings`. Every listing result carrying an older `gen` is dropped. Non-terminal root resolution is guarded by a token and by the key still being in sight.
- Listings are lazy (only folders whose ancestors are all expanded) and go through one queue, at most 4 `list_directory` calls in flight.
- `loadDirectory(path)` rejects on error.

## Code editor in the side panel

- `CodeView` keys `MonacoWrapper` by `viewerKey + ":" + path`.
- `MonacoWrapper` `initialView?: {top, line, col}` and `onViewChange?(v)`. Restore: `layout()`, clamp to the line count, `setScrollTop(getTopForLineNumber(top))`, `setPosition`. Recording ignores events until the restore is applied and skips when `getVisibleRanges()` is empty.

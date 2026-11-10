# Viewer state: per-view file browser and preview panel

- **Decided in:** ADR 0031 (storage, matching, saving) and ADR 0032 (per-view open file).
- **Design:** `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md`.
- **PRD:** F3.
- **Status:** proposed 2026-11-10; not built. Version 1 below is what F3 S1 writes.

## Viewer key

- `View.viewerKey: string` is 32 lower-case hex characters (128 random bits, `crypto.getRandomValues`). It is minted when the view is created.
- It is saved in `ade-session` as `SavedTab.viewerKey` (the own view, every tab type) and as `SavedView.viewerKey` (each sub-terminal).
- On load it must match `/^[0-9a-f]{32}$/` and be unique in the session; otherwise a new key is minted and that view gets the defaults.
- It is the **only** thing that matches a state to a view. Tab, view and pane ids are never used for this.
- It moves with its `View` object (Move to New Tab, Move to New Window). Duplicate and Reopen Closed Tab mint a new key and copy the state.
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
- On load, `seq` is set to the maximum over every saved `expanded` seq and `seen`. No counter field is saved.
- Numbers from different windows are never compared. States that arrive from another window are renumbered on arrival by `renumberOnArrival(states, localSeq)`: their relative order is kept and they are shifted to start at `localSeq + 1` (S3).

## Caps, applied at write time

`buildSavedViewerState(states, inSightKey, keep)` is a pure function and never changes memory.
- **Size:** `bytes(x)` is the UTF-8 length of `JSON.stringify(x)`; 1 KB = 1,024 bytes.
- **Path rule:** a path over 4,096 bytes is not stored. An expanded folder that long is left out; an open file or opener that long is saved as `null`.
- **Filter:** `viewerPathFilter()` from `src/lib/viewerFilter.ts` is `(paths: string[]) => Promise<boolean[]>`. The default keeps every path, and F1's PE-4 AC4 story sets the real one. A refused path is left out, or saved as `null` with no position. If the filter rejects, the write is skipped.
- **Per view:** one view's size is `bytes(key) + 1 + bytes(state)`, at most 32,768. Over that, drop the expanded entries with the lowest `seq`.
- **All views:** the whole value must be at most 262,144 bytes. Order the views by `seen` ascending, with the view in sight last. First empty their expanded sets in that order; if still over, drop whole states in that order.
- **`saveSession` ladder:**
  1. viewer full;
  2. viewer lean (every `expanded` emptied);
  3. scrollback tail or strip (today's steps);
  4. remove `ade-viewer-state`;
  5. remove `ade-session` (today's last resort).

## `ade-file-browser`

- The shape is unchanged: `{ isOpen, width, showHidden }`.
- The main window writes `isOpen` and `width` from its view in sight's file browser whenever either shown value changes. A switch to the same values writes nothing.
- `showHidden` stays global; toggling it writes that field alone, by read-modify-write.
- Detached windows never write `isOpen` or `width`.

## Seams for tests

- `src/lib/paneFolder.ts` `readPaneFolder(paneId)` is the only reader of a pane's folder: today `getPtyCwd`, later OSC 7 (ADR 0021). Mock it.
- `monacoStub.tsx` adds `lineHeight` = 20, `getTopForLineNumber`, `getVisibleRanges`, `onDidScrollChange` and `onDidChangeCursorPosition`.
- The golden fixture `src-tauri/tests/fixtures/f3-viewer-session.json` is produced by the TypeScript serializers (vitest asserts equality) and read by the `sync.rs` export tests.

# Side panel files: `read_text_head` and `watch_file`

Decided in ADR 0009 (`decisions/0009-one-side-panel-shows-clicked-files-read-only.md`); built in Story 1 of `_bmad-output/plan-code-viewer-panel.md`. The two Tauri commands the side panel (Preview panel) uses for text files. `read_file`, `read_file_base64` and `watch_directory` are unchanged.

## `read_text_head(path, maxBytes) -> TextHead`

`src-tauri/src/lib.rs`, `#[tauri::command(async)]`. Invoke as `invoke<TextHead>("read_text_head", { path, maxBytes })`. The panel passes `maxBytes: 2097152` (2 MiB).

```ts
type TextHead = { text: string; size: number; truncated: boolean; binary: boolean; lossy: boolean };
```

- **Regular files only.** `std::fs::metadata` (links followed) must say `is_file()`, checked before any open; otherwise `Err("Not a regular file: <path>")`. FIFOs, sockets, devices and folders are refused without being opened. A missing or unreadable file is `Err("Failed to read <path>: <reason>")`.
- **Binary:** a NUL byte in the first 8 KiB (whatever `maxBytes` is) gives `binary: true`, `text: ""`, `truncated: false`; nothing past 8 KiB is read. UTF-16 counts as binary only when its first 8 KiB hold a NUL, as mostly-ASCII UTF-16 does; UTF-16 without NULs there (e.g. CJK text) comes back as lossy text.
- **Truncated:** at most `maxBytes + 1` bytes are read; `truncated` is whether more than `maxBytes` arrived. The text keeps the first `maxBytes`, minus an incomplete UTF-8 character at the cut.
- **Lossy:** invalid UTF-8 is replaced with U+FFFD and `lossy: true`. A character cut at the cap is dropped, not counted as lossy.
- **size:** `max(metadata length, bytes read)`, for text (truncated or not) and binary results alike, so files under `/proc` (which report 0) and files that grow mid-read never report less than was read. Owner approved 2026-10-17 (plan, Implementation Notes).
- `~` and `~/…` expand to the home folder.

## `watch_file(path, onEvent) -> id`

`src-tauri/src/watcher.rs`, `#[tauri::command(async)]` (off the main thread). Invoke as `invoke<number>("watch_file", { path, onEvent: channel })` with a `Channel<WatchEvent>` (the same `WatchEvent` as `watch_directory`). Stop with `invoke("unwatch_directory", { id })`: same `WatcherManager`.

- `path` is canonicalised (links followed, `.`/`..` resolved); a missing path is `Err("Can't watch <path>: …")`. No `~` expansion: pass an absolute path.
- **One non-recursive watch of the file's canonical folder.** Only the file's events are forwarded, matched component by component (case-insensitive on macOS and Windows).
- Every event carries the **canonical** file path. `created` / `removed` / `changed` by the OS event kind; any other non-read kind is `changed`; reads (`Access`: inotify reports opening the file and listing the folder) are dropped, or the panel's re-read would loop. An event with no paths (inotify's queue overflow, `Rescan`) is sent as `changed`. `changed` never carries content (`content: ""`): re-read with `read_text_head`.
- **Any non-read event on the watched folder itself** is sent as `removed` for the file's path. The panel treats any `removed` as "watch stale, re-arm after the next good read".
  - Deleted: on Linux the child's deletion and then the folder's `DELETE_SELF` arrive, and the inotify watch is dead afterwards; on macOS only the folder's own events arrive, none for the child.
  - Moved (`mv dir dir.old`): on Linux the watch follows the moved folder, and its later events arrive under the **old** path, so they still look like the file's. The panel's re-read finds the truth (not found at the path) and re-arms.
  - A `chmod` or `touch` of the folder itself also gives the file's `removed`, on both platforms. It only causes an extra re-read and re-arm.
- Watcher errors are sent as `{ type: "error", message }`.
- Don't rely on the event kind: renames arrive as `changed`, and FSEvents can merge flags so `removed` follows `created`. Decide "deleted" by reading.
- A symlinked file is watched at its target; retargeting the link is not seen.

## The panel (Story 2)

- **Every file clicked in the terminal opens in the active tab's panel** (`openFileFromTerminal` dispatches `open-preview` for all kinds; `opensInPreview` is gone). Focus stays where it was. The file browser still opens a tab until Story 5.
- **One kind dispatch:** `PreviewPanel` picks its view with `viewerKind()`: `pdf`/`docx`/`image` → `BinaryView`; `markdown` → `MarkdownView` and `html` → the `sandbox="allow-scripts"` iframe, both via `read_file`; `text` → `read_text_head(path, PANEL_TEXT_MAX_BYTES)` then `viewer/CodeView`, loaded with `React.lazy` (Monaco is never in `PreviewPanel`'s static imports).
- **Read-only editor:** `MonacoWrapper` with `readOnly` is uncontrolled: `defaultValue`, never `value`; a later `content` is applied with `saveViewState` → `setValue` → `restoreViewState`; options add `readOnly`, `domReadOnly`, no minimap, `renderValidationDecorations: "off"`; no save action. `autoFocus` (default true) and `ariaLabel` (`"<file name>, read-only"` in the panel). The file tab's props and behavior are unchanged.
- **Open in tab** (`addEditorTab(path)`) shows only for a plain text head. Truncated: "Showing the first 2.0 MB of N MB." and "Too large to open in a tab". Lossy: "Not UTF-8 text, can't be edited in a tab". Binary: "Binary file (N MB), not shown." and no editor. A failed read: "Can't open <name>: <reason>". Every such message is `role="status"` `aria-live="polite"` (`Status` in `viewer/shared.tsx`).
- `TextHead`, `PANEL_TEXT_MAX_BYTES` (2 MiB) and `formatSize` live in `src/lib/textHead.ts`.
- **Focus:** the panel root is `role="complementary"` `aria-label="Preview"`; its body region has `tabIndex={-1}`. `App` passes `focusRequest`, bumped only when ⌘⇧B or the palette opens the panel and reset to 0 on close; the panel serves a new value once, to the code editor after it mounts (else the body), and drops it when the file changes. Closing goes through `closePreviewFocus(panelEl)` (`src/lib/previewFocus.ts`), which focuses `.xterm-helper-textarea` when focus is inside the panel.
- Live follow is still today's `watch_directory` effect until Story 3. With LIVE on it reloads every kind, code included, on a `changed` event for the path (it filters by the file's extension, so a file without one isn't followed).
- Tab-only views: a terminal click on a `.mmd` or a contract ABI/IDL `.json` now shows it as code in the panel; the diagram and ABI views are reached with *Open in tab*.
- **Focus rules in code:** `usePreviewPanel()` in `src/lib/previewFocus.ts` holds `open` and `focusRequest` for App: `toggle` (⌘⇧B, palette) bumps the request when opening, `openForFile` (the `open-preview` event) opens without one, `close` runs `closePreviewFocus` and resets the request to 0. In the panel a served request is spent: `MonacoWrapper`'s `onFocused` (through `CodeView`) or focusing the body clears it, so a later reload or remount of the same file never takes focus.


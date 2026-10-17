# Side panel files: `read_text_head` and `watch_file`

Decided in ADR 0009 (`decisions/0009-one-side-panel-shows-clicked-files-read-only.md`); built in Story 1 of `_bmad-output/plan-code-viewer-panel.md`. The two Tauri commands the side panel (Preview panel) uses for text files. `read_file`, `read_file_base64` and `watch_directory` are unchanged.

## `read_text_head(path, maxBytes) -> TextHead`

`src-tauri/src/lib.rs`, `#[tauri::command(async)]`. Invoke as `invoke<TextHead>("read_text_head", { path, maxBytes })`. The panel passes `maxBytes: 2097152` (2 MiB).

```ts
type TextHead = { text: string; size: number; truncated: boolean; binary: boolean; lossy: boolean };
```

- **Regular files only.** `std::fs::metadata` (links followed) must say `is_file()`, checked before any open; otherwise `Err("Not a regular file: <path>")`. FIFOs, sockets, devices and folders are refused without being opened. A missing or unreadable file is `Err("Failed to read <path>: <reason>")`.
- **Binary:** a NUL byte in the first 8 KiB (whatever `maxBytes` is) gives `binary: true`, `text: ""`, `truncated: false`; nothing past 8 KiB is read. UTF-16 text counts as binary.
- **Truncated:** at most `maxBytes + 1` bytes are read; `truncated` is whether more than `maxBytes` arrived. The text keeps the first `maxBytes`, minus an incomplete UTF-8 character at the cut.
- **Lossy:** invalid UTF-8 is replaced with U+FFFD and `lossy: true`. A character cut at the cap is dropped, not counted as lossy.
- **size:** the file's length in bytes; when not truncated, `max(metadata length, bytes read)` (files under `/proc` report 0).
- `~` and `~/…` expand to the home folder.

## `watch_file(path, onEvent) -> id`

`src-tauri/src/watcher.rs`, `#[tauri::command(async)]` (off the main thread). Invoke as `invoke<number>("watch_file", { path, onEvent: channel })` with a `Channel<WatchEvent>` (the same `WatchEvent` as `watch_directory`). Stop with `invoke("unwatch_directory", { id })`: same `WatcherManager`.

- `path` is canonicalised (links followed, `.`/`..` resolved); a missing path is `Err("Can't watch <path>: …")`. No `~` expansion: pass an absolute path.
- **One non-recursive watch of the file's canonical folder.** Only the file's events are forwarded, matched component by component (case-insensitive on macOS and Windows).
- Every event carries the **canonical** file path. `created` / `removed` / `changed` by the OS event kind; any other non-read kind is `changed`; reads (`Access`) are dropped. `changed` never carries content (`content: ""`): re-read with `read_text_head`.
- **Events on the watched folder itself** (deleted, moved; on Linux the inotify watch is dead afterwards) are sent as `removed` for the file's path. The panel treats any `removed` as "watch stale, re-arm after the next good read".
- Watcher errors are sent as `{ type: "error", message }`.
- Don't rely on the event kind: renames arrive as `changed`, and FSEvents can merge flags so `removed` follows `created`. Decide "deleted" by reading.
- A symlinked file is watched at its target; retargeting the link is not seen.

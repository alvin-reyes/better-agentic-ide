# 0009: One side panel shows clicked files, read-only

- Status: Proposed (architect, 2026-10-17), with the plan `_bmad-output/plan-code-viewer-panel.md`. Becomes Accepted when the owner approves the plan.
- Context: The owner wants a code viewer in "a side panel by the terminal" that shows the file you click instead of opening a new tab. ADE already has one docked panel there, the Preview panel (⌘⇧B), which holds a per-tab file (`Tab.previewPath`), watches it and resizes by its left edge, but renders only Markdown, HTML, PDFs and images: any other file shows as a plain `<pre>`, and terminal clicks on code go to a tab (`opensInPreview`). The file tab (`EditorTab`) picks a viewer with `viewerKind()` and edits text in `MonacoWrapper`. `@monaco-editor/react` 4.7.0 applies a changed `value` prop itself, resetting the cursor and scroll of a read-only editor. The panel's current watch (`watch_directory`) is a sync, recursive command that compares event paths with the spelling the terminal gave, which the OS often reports differently.
- Decision:
  - **One side panel.** The Preview panel becomes the viewer for every file kind, choosing its view with the shared `viewerKind()`. Source files render in the existing `MonacoWrapper`, loaded lazily, not a second editor. No second panel and no new shortcut.
  - **Read-only.** The panel never edits or saves. Its editor is uncontrolled (`defaultValue`); reloads restore the view state around `setValue`. Editing happens in the file tab, reached by *Open in tab* or a modifier-click (⌘ on macOS, Ctrl on Linux).
  - **A click lands in the panel.** Files clicked in the terminal and in the file browser open in the active tab's panel; a modifier-click opens a tab.
  - **Bounded reads, decided in Rust.** `read_text_head` reads only regular files, at most 2 MiB, calls a file binary when its first 8 KiB hold a NUL byte, and decodes invalid UTF-8 lossily, which is safe only because the panel never writes back.
  - **One file, one watch.** `watch_file` canonicalises the path, watches its folder non-recursively off the main thread, and matches events to the file itself. Any event means "re-read"; whether the file is gone is decided by the read.
- Consequences:
  - Two defaults change: a terminal click on a code file, and every file-browser click, used to open a tab and now open the panel. Users who want a tab use ⌘-click / Ctrl-click or *Open in tab*. A setting to restore the old default is deferred to the owner (plan, Open question 7).
  - A clicked file has one destination, and the terminal stays in view and keeps focus.
  - There is no second dirty buffer: an agent's writes and the user's edits never race in the panel, and the panel never asks about unsaved changes.
  - Truncated, lossily decoded and binary files have no *Open in tab*, because the tab still reads whole files as UTF-8 with `read_file`; only the panel is bounded.
  - Anything that later wants to edit beside the terminal must revisit this ADR, since the lossy decode and the truncation both assume read-only.
  - `MonacoWrapper`'s cursor-keeping branch for the file tab stays dead (the library resets the view first); fixing the tab is separate work.
  - The panel keeps the name "Preview" for now; renaming it is presentation, not a change to this decision.

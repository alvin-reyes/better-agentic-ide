# 0009: One side panel shows clicked files, read-only

- Status: Proposed (architect, 2026-10-17), with the plan `_bmad-output/plan-code-viewer-panel.md`. Becomes Accepted when the owner approves the plan.
- Context: The owner wants a code viewer in "a side panel by the terminal" that shows the file you click instead of opening a new tab. ADE already has one docked panel there, the Preview panel (⌘⇧B), which holds a per-tab file (`Tab.previewPath`), watches it live and resizes by its left edge, but renders only Markdown, HTML, PDFs and images; any other file shows as a plain `<pre>`, and terminal clicks on code go to a tab (`opensInPreview`). The file tab (`EditorTab`) picks a viewer with `viewerKind()` and edits text in `MonacoWrapper`. The right-hand side already fits the file browser, Preview and the board into a 1200 px window by a tested width budget.
- Decision:
  - **One side panel.** The Preview panel becomes the viewer for every file kind, choosing its view with the shared `viewerKind()`. Source files render in the existing `MonacoWrapper`, not a second editor. No second panel and no new shortcut.
  - **Read-only.** The panel never edits or saves. Editing happens in the file tab, reached by *Open in tab* or a modifier-click (⌘ on macOS, Ctrl on Linux).
  - **A click lands in the panel.** Files clicked in the terminal and in the file browser open in the active tab's panel; a modifier-click opens a tab.
  - **Bounded reads.** Text for the panel comes from a Rust command, `read_text_head`, that reads at most 2 MiB, reports the true size and whether it truncated, and calls a file binary when its first 8 KiB hold a NUL byte. Invalid UTF-8 is decoded lossily, which is safe only because the panel never writes back.
- Consequences:
  - A clicked file has one destination, and the terminal stays in view. Opening in a tab becomes the deliberate gesture rather than the default, which changes the file browser's long-standing behavior.
  - There is no second dirty buffer: an agent's writes and the user's edits never race in the panel, and closing a tab or the panel never asks about unsaved changes in it.
  - Anything that later wants to edit beside the terminal must revisit this ADR, since the lossy decode and the truncation both assume read-only.
  - The file tab still reads whole files with `read_file`; only the panel is bounded.
  - The panel keeps the name "Preview" for now; renaming it is presentation, not a change to this decision.

# Screenshot Capture — Design

**Date:** 2026-07-19
**Status:** Approved (design). Standalone — no dependency on the other features. Build order: after multi-model and the dashboard (per user), but implementable any time.
**App:** ADE — Agentic Development Environment (Tauri v2 + React 19 + xterm.js + Zustand), macOS.

## Summary

Capture a screenshot (region / window / full screen) from within ADE, save it, view it in the
existing image preview, and optionally send it to the active agent. Viewing and image storage
already exist; **capture** is the new piece.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| What's new | **Capture screenshots into ADE** (viewing already exists via PreviewPanel) |
| Mechanism | macOS built-in `screencapture` (no extra native deps) |
| Post-capture | View in existing PreviewPanel + optional "send to agent" via existing image path |
| Platform | macOS-only |

## Existing code this builds on

- `src-tauri/src/lib.rs` — `save_temp_image` already writes to `~/.ade/images`; screenshots reuse
  this directory. Add the new `capture_screenshot` command alongside it and register in `invoke_handler![]`.
- `src/components/PreviewPanel.tsx` — already renders PNG (image mode); reused for viewing.
- `src/components/Scratchpad.tsx` — existing image paste → `save_temp_image` → active PTY attach flow;
  reused for "send to agent".
- `src/components/CommandPalette.tsx` — add capture entries.

## Components

### 1. Capture command (Rust)
`#[tauri::command] capture_screenshot(mode: String) -> Result<String, String>`:
- `mode == "region"` → `screencapture -i <path>` (interactive crosshair region select)
- `mode == "window"` → `screencapture -iW <path>` (click to pick a window)
- `mode == "fullscreen"` → `screencapture <path>` (all displays)

Writes to `~/.ade/images/screenshot-<timestamp>.png` (timestamp from system time in Rust). Returns the
path on success. If the interactive capture is cancelled (no file created), returns a distinct
`Cancelled` signal (e.g. `Ok("")` or a typed result) so the frontend treats it as a no-op.

Pure helper `screencapture_args(mode: &str, path: &str) -> Vec<String>` is unit-tested (mode → args
mapping); the actual capture is manual/interactive.

### 2. Trigger (frontend)
- A camera button in the Scratchpad (next to the existing image affordance).
- Command Palette entries: "Screenshot: Capture region", "…window", "…full screen".
- Optional keybinding.
Each invokes `capture_screenshot(mode)`.

### 3. View
On a non-empty returned path, open it in `PreviewPanel` (image mode already supports PNG). No new
viewer component.

### 4. Send to agent
A "Send to agent" action on the captured image reuses the Scratchpad's existing image-attach → active
PTY flow (same path `save_temp_image` outputs feed today), so a screenshot is handed to the agent like
a pasted image.

## Data flow

```
capture button/palette ──▶ invoke capture_screenshot(mode)
  ──▶ screencapture writes ~/.ade/images/screenshot-<ts>.png ──▶ returns path
path ──▶ PreviewPanel (view)   and/or   Scratchpad image-attach ──▶ active PTY (send to agent)
```

## Error handling

- Interactive capture cancelled (no file) → no-op, no error toast.
- `screencapture` missing / non-macOS → clear "screenshot capture is macOS-only" message.
- File write / command failure → error toast; no crash.

## Testing

- **Rust:** `screencapture_args` mapping — region → `["-i", path]`, window → `["-iW", path]`,
  fullscreen → `[path]`; filename construction uses the `~/.ade/images` dir and a `.png` extension.
- **Frontend:** capture button invokes with the correct mode; a non-empty returned path routes into
  PreviewPanel; an empty/cancelled result is a no-op.

## Scope guard (YAGNI)

- macOS-only (`screencapture`); no cross-platform capture.
- No annotation / markup editor.
- Reuses existing image storage (`~/.ade/images`), preview (PreviewPanel), and send-to-agent paths —
  no new storage or viewer.

## Open items for the plan

- Exact cancellation signal shape (`Ok("")` vs a typed enum) and how the frontend distinguishes it.
- Whether to auto-open PreviewPanel on capture or just toast with a "view" action.
- Multi-display handling for fullscreen (screencapture writes one file per display with a suffix; decide
  whether to capture main display only via `-D 1`).

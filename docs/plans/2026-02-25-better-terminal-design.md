# Better Terminal — Design Document

**Date:** 2026-02-25
**Status:** Approved

## Overview

A Tauri v2 desktop app for agentic AI development (primarily Claude Code) with named/grouped tabs, split panes, workspace presets, and a keyboard-first thoughts scratchpad with copy + direct-inject to terminal.

**Design principle:** No mouse required. Every action is keyboard-accessible.

## Architecture

- **Frontend:** React 19 + TypeScript + Tailwind CSS
- **Terminal:** xterm.js with WebGL addon + fit addon
- **Backend:** Tauri v2 (Rust) with `portable-pty` for PTY management
- **State:** Zustand for tab/pane/workspace state
- **IPC:** Tauri commands + events for frontend ↔ Rust communication

### Data Flow

1. User opens a tab → React sends `create_pty` command to Rust
2. Rust spawns a PTY process → streams output via Tauri events to xterm.js
3. User types in xterm.js → keystrokes sent via Tauri command to Rust → written to PTY stdin
4. Scratchpad "Send to Terminal" → text written directly to the active PTY's stdin

## Tab & Pane System

### Tabs
- Each tab has: name (editable), color tag (optional), working directory, and 1+ panes
- Tab bar supports drag-to-reorder
- Right-click context menu: rename, change color, duplicate, close
- `+` button creates a new tab in the current workspace directory

### Panes
- Within a tab, split horizontally or vertically
- Drag dividers to resize panes
- Click a pane to make it active (subtle border highlight)
- Each pane runs its own independent PTY process

### Workspace Presets
- A workspace = named collection of tabs with pane layouts, directories, and optional startup commands
- Stored as JSON in `~/.better-terminal/workspaces/`
- Dropdown in top-left to switch/create workspaces

## Thoughts Scratchpad

A collapsible drawer at the bottom of the window. Toggle with `Cmd+J`.

### Workflow
1. `Cmd+J` → opens/focuses the scratchpad
2. Type thoughts freely (multi-line, `Enter` is newline)
3. `Cmd+Enter` → sends text to active terminal pane's PTY stdin
4. `Cmd+Shift+Enter` → copies text to clipboard
5. `Escape` or `Cmd+J` → closes scratchpad, focus returns to terminal

### Behavior
- Text clears after sending (configurable: keep or clear)
- History of previously sent thoughts via `Cmd+Up/Down`

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+J` | Toggle scratchpad |
| `Cmd+Enter` | Send scratchpad to active terminal |
| `Cmd+Shift+Enter` | Copy scratchpad to clipboard |
| `Escape` | Close scratchpad, focus terminal |
| `Cmd+T` | New tab |
| `Cmd+W` | Close tab |
| `Cmd+1-9` | Switch to tab N |
| `Cmd+Shift+[` / `]` | Previous / next tab |
| `Cmd+D` | Split pane horizontally |
| `Cmd+Shift+D` | Split pane vertically |
| `Cmd+Option+Arrow` | Navigate between panes |
| `Cmd+Shift+F` | Fullscreen active pane (toggle) |
| `Cmd+K` | Command palette |

## Visual Design

- Dark theme by default, minimal chrome, maximize terminal real estate
- Tab bar: thin, tab name + color dot, active tab has subtle underline
- Pane borders: 1px subtle separator, active pane gets colored left border
- Scratchpad: slightly different background shade
- Font: configurable, default JetBrains Mono
- Terminal colors: standard themes (Dracula, One Dark, Solarized, etc.)
- Tab color tags: 6-8 color palette

## Project Structure

```
better-terminal/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Tauri app entry
│   │   ├── pty.rs          # PTY management
│   │   └── workspace.rs    # Workspace preset load/save
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── components/
│   │   ├── TabBar.tsx
│   │   ├── TerminalPane.tsx
│   │   ├── PaneContainer.tsx
│   │   ├── Scratchpad.tsx
│   │   └── CommandPalette.tsx
│   ├── stores/
│   │   ├── tabStore.ts
│   │   └── workspaceStore.ts
│   ├── hooks/
│   │   ├── useTerminal.ts
│   │   └── useKeybindings.ts
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vite.config.ts
```

## MVP Scope (v0.1)

1. Single window with tab bar
2. Create/close/rename/switch tabs (keyboard-driven)
3. Horizontal and vertical pane splitting
4. Functional terminal via xterm.js + PTY
5. Scratchpad with `Cmd+Enter` to send, `Cmd+Shift+Enter` to copy
6. Basic dark theme

## Deferred

- Workspace presets (v0.2)
- Command palette (v0.2)
- Tab colors/grouping (v0.2)
- Custom themes/font settings (v0.3)
- Scratchpad history (v0.3)

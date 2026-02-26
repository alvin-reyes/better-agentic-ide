# Better Terminal

A modern desktop terminal built for agentic AI development. Keyboard-first design with smart tab management, split panes, a thoughts scratchpad, and deep customization.

Built with [Tauri v2](https://v2.tauri.app/) (Rust) + React 19 + TypeScript + [xterm.js](https://xtermjs.org/) + Zustand.

## Features

### Terminal
- **Named tabs** — Create, rename (`Cmd+R` or double-click), and switch tabs with `Cmd+1-9`
- **Split panes** — Split horizontally (`Cmd+D`) or vertically (`Cmd+Shift+D`), resize by dragging
- **Persistent sessions** — Terminals survive splits and tab switches without resetting

### Thoughts Scratchpad
- **Toggle** with `Cmd+J` — intelligent focus cycling between scratchpad and terminal
- **Send to terminal** with `Cmd+Enter` — injects text directly into the active PTY
- **Copy** with `Cmd+Shift+Enter` — copies to clipboard
- **Save as note** with `Cmd+S` — persists prompts for reuse
- **Prompt history** — all sent prompts are saved and searchable
- **Send Enter** with `Cmd+E` — send a bare Enter to the terminal (confirm prompts without switching focus)

### Theming & Customization
- **8 built-in themes** — GitHub Dark, Dracula, Monokai Pro, Nord, Catppuccin Mocha, Solarized Dark, Tokyo Night, One Dark
- **Adjustable font size** — 10px to 24px with quick presets
- **Font family selection** — JetBrains Mono, SF Mono, Fira Code, Cascadia Code, and more
- **Custom colors** — override any UI or terminal color with a color picker
- **Cursor settings** — bar, block, or underline with optional blink
- **Line height & scrollback** — fine-tune terminal density

### Workspace Management
- **Save workspaces** — snapshot your current tab layout with names
- **Restore workspaces** — reload saved configurations instantly
- **Tab renaming** — name tabs to organize your workflow

### Keyboard-First
Every action has a keyboard shortcut. No mouse required.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+T` | New tab |
| `Cmd+W` | Close tab |
| `Cmd+1-9` | Switch to tab N |
| `Cmd+Shift+[` / `]` | Previous / next tab |
| `Cmd+R` | Rename active tab |
| `Cmd+D` | Split pane horizontally |
| `Cmd+Shift+D` | Split pane vertically |
| `Cmd+J` | Toggle scratchpad / cycle focus |
| `Cmd+Enter` | Send scratchpad to terminal |
| `Cmd+Shift+Enter` | Copy scratchpad to clipboard |
| `Cmd+S` | Save scratchpad as note |
| `Cmd+E` | Send Enter to terminal |
| `Cmd+,` | Open settings |
| `Escape` | Switch focus to terminal |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable)
- macOS (cross-platform support planned)

### Install & Run

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

The built app will be at `src-tauri/target/release/better-terminal`.

## Architecture

```
better-terminal/
├── src-tauri/              Rust backend
│   ├── src/
│   │   ├── main.rs         App entry point
│   │   ├── lib.rs          Tauri command registration
│   │   └── pty.rs          PTY management (portable-pty + Channel API)
│   └── Cargo.toml
├── src/                    React frontend
│   ├── components/
│   │   ├── TabBar.tsx      Tab management with settings gear
│   │   ├── TerminalPane.tsx  xterm.js wrapper
│   │   ├── PaneContainer.tsx Split pane layout (react-resizable-panels)
│   │   ├── Scratchpad.tsx  Thoughts panel with history & notes
│   │   ├── SettingsPanel.tsx Theme, font, workspace settings
│   │   └── ShortcutsBar.tsx  Keyboard shortcut reference
│   ├── stores/
│   │   ├── tabStore.ts     Tab & pane state (Zustand)
│   │   └── settingsStore.ts Theme, font, workspace persistence
│   ├── hooks/
│   │   ├── useTerminal.ts  Terminal lifecycle & PTY bridge
│   │   └── useKeybindings.ts Global keyboard shortcuts
│   └── index.css           CSS variables & base styles
└── package.json
```

### Key Design Decisions

- **Global terminal instance map** — Terminal instances live outside React in a `Map<string, TerminalInstance>` so they survive component remounts during splits
- **Tauri Channel API** — PTY output streams via `Channel<PtyEvent>` for reliable real-time data delivery
- **Carriage return (`\r`)** — PTY Enter simulation uses `\r`, not `\n`
- **localStorage persistence** — Settings, themes, notes, history, and workspaces persist across sessions

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri v2 |
| Backend | Rust + portable-pty |
| Frontend | React 19 + TypeScript |
| Terminal | xterm.js + WebGL addon |
| State | Zustand |
| Styling | Tailwind CSS v4 + CSS variables |
| Layout | react-resizable-panels |

## License

ISC

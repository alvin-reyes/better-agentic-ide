<p align="center">
  <img src="ade_logo.png" alt="ADE - Agentic Development Environment" width="120" style="border-radius: 20px;">
</p>

<h1 align="center">ADE — Agentic Development Environment</h1>

<p align="center">
  <a href="https://github.com/alvin-reyes/better-agentic-ide/releases"><img src="https://img.shields.io/github/v/release/alvin-reyes/better-agentic-ide?style=for-the-badge&color=blue" alt="Release"></a>
  <a href="https://github.com/alvin-reyes/better-agentic-ide/blob/main/LICENSE"><img src="https://img.shields.io/github/license/alvin-reyes/better-agentic-ide?style=for-the-badge" alt="License"></a>
  <a href="https://github.com/alvin-reyes/better-agentic-ide/stargazers"><img src="https://img.shields.io/github/stars/alvin-reyes/better-agentic-ide?style=for-the-badge" alt="Stars"></a>
  <a href="https://docs.anthropic.com/en/docs/claude-code"><img src="https://img.shields.io/badge/Works_with-Claude_Code-F97316?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code"></a>
</p>

<p align="center">A modern desktop terminal built for agentic AI development. Keyboard-first design with smart tab management, split panes, a thoughts scratchpad, and deep customization.</p>

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
- **Voice dictation** — microphone button for hands-free brainstorming (Web Speech API)
- **Prompt chaining** — separate prompts with `---` to run multi-step chains sequentially, waiting for agent completion between steps

### Theming & Customization
- **8 built-in themes** — GitHub Dark, Dracula, Monokai Pro, Nord, Catppuccin Mocha, Solarized Dark, Tokyo Night, One Dark
- **Adjustable font size** — 10px to 24px with quick presets
- **Font family selection** — JetBrains Mono, SF Mono, Fira Code, Cascadia Code, and more
- **Custom colors** — override any UI or terminal color with a color picker
- **Cursor settings** — bar, block, or underline with optional blink
- **Line height & scrollback** — fine-tune terminal density

### AI Agent Terminals
- **20+ pre-configured agent profiles** — Launch specialized AI agents with `Cmd+Shift+A`
- **5 categories** — Backend (API, DB, Auth), Frontend (UI, CSS, State), DevOps (Docker, CI/CD, Infra, K8s), Testing (Unit, E2E, Perf), General (Debug, Review, Docs, Interview Coach, LinkedIn Tech Leader)
- **Continuous mode** — Autonomous agent execution with `--dangerously-skip-permissions` (with safety disclaimer)
- **Each agent gets its own named tab** — organized workflow with color-coded categories

### Preview Panel
- **Multi-format preview** — View HTML, images, PDF, and markdown files in a side panel
- **Live auto-refresh** — Files update automatically when saved (native filesystem watcher)
- **Resizable** — Drag the panel edge to resize (280px–900px)
- **Toggle** with `Cmd+Shift+B` — opens alongside your terminal

### Fleet View & Cost Tracker
- **Fleet view** (`Cmd+.`) — live timeline of the Claude Code sub-agents running in the active tab's working directory, with running count and total cost; expand it into a full tab for a detail pane and range control
- **Session tracking** — duration, estimated token usage, and cost per session
- **Cost estimation** — per-provider rates for Claude, Codex, and Gemini
- **Notifications** — system notification + in-app toast when an agent finishes a task
- **Session history** — review past sessions with token and cost breakdowns (persisted in localStorage)

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
| `Cmd+Shift+W` | Close active pane |
| `Cmd+←` / `Cmd+→` | Move between panes |
| `Cmd+Shift+Enter` | Zoom / unzoom pane (scratchpad closed) |
| `Cmd+J` | Toggle scratchpad / cycle focus |
| `Cmd+Enter` | Send scratchpad to terminal |
| `Cmd+Shift+Enter` | Copy scratchpad to clipboard (scratchpad open) |
| `Cmd+S` | Save scratchpad as note |
| `Cmd+E` | Send Enter to terminal |
| `Cmd+B` | Toggle file browser |
| `Cmd+Shift+B` | Toggle preview panel |
| `Cmd+Shift+A` | Launch AI agent picker |
| `Cmd+Shift+O` | Open orchestrator |
| `Cmd+.` | Fleet view |
| `Cmd+P` | Command palette |
| `Cmd+F` | Search in terminal |
| `Cmd+,` | Open settings |
| `Escape` | Close open panels and focus terminal |

## Install

### Homebrew (recommended)

```bash
brew install --cask alvin-reyes/tap/ade
```

No Gatekeeper warnings — Homebrew handles code quarantine automatically.

### Manual Download

Download the latest installer from the [Releases page](https://github.com/alvin-reyes/better-agentic-ide/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `.dmg` |
| macOS (Intel) | `.dmg` |
| Windows | `.msi` / `.exe` |
| Linux | `.deb` / `.AppImage` |

> **macOS manual install:** If you see "app is damaged", run: `xattr -cr /Applications/Better\ Terminal.app`

### Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — required for AI agent features (`npm install -g @anthropic-ai/claude-code`)

### Build from Source

```bash
# Prerequisites: Node.js 18+, Rust (stable)
npm install
npm run tauri dev     # development
npm run tauri build   # production
npm test              # frontend unit tests (Vitest)
(cd src-tauri && cargo test)  # backend unit tests
```

## Architecture

```
better-terminal/
├── src-tauri/              Rust backend
│   ├── src/
│   │   ├── main.rs         App entry point
│   │   ├── lib.rs          Tauri command registration
│   │   ├── pty.rs          PTY management (portable-pty + Channel API)
│   │   ├── watcher.rs      Native filesystem watcher (notify crate)
│   │   ├── subagent.rs     Claude Code sub-agent transcript watcher (fleet view)
│   │   └── bmad.rs         BMAD scaffolding & status
│   └── Cargo.toml
├── src/                    React frontend
│   ├── components/
│   │   ├── TabBar.tsx      Tab management with settings gear
│   │   ├── TerminalPane.tsx  xterm.js wrapper
│   │   ├── PaneContainer.tsx Split pane layout (react-resizable-panels)
│   │   ├── Scratchpad.tsx  Thoughts panel with history & notes
│   │   ├── AgentPicker.tsx AI agent launcher (20+ profiles, 5 categories)
│   │   ├── fleet/          Fleet view (panel, tab, timeline, summary)
│   │   ├── FileBrowser.tsx File tree side panel
│   │   ├── PreviewPanel.tsx Multi-format file preview (HTML, images, PDF, markdown)
│   │   ├── CommandPalette.tsx Cmd+P command palette
│   │   ├── SettingsPanel.tsx Theme, font, workspace settings
│   │   └── ShortcutsBar.tsx  Keyboard shortcut reference
│   ├── stores/
│   │   ├── tabStore.ts     Tab & pane state (Zustand)
│   │   ├── settingsStore.ts Theme, font, workspace persistence
│   │   ├── agentTrackerStore.ts Agent session & cost tracking
│   │   └── fleetStore.ts   Sub-agent fleet state
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
| Backend | Rust + portable-pty + notify (fs watcher) |
| Frontend | React 19 + TypeScript |
| Terminal | xterm.js + WebGL addon |
| State | Zustand |
| Styling | Tailwind CSS v4 + CSS variables |
| Layout | react-resizable-panels |

## License

ISC

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

<p align="center">A desktop terminal built for running AI coding agents. Split panes, a prompt scratchpad, a file viewer, and a live fleet view of every agent across every terminal — all keyboard-first.</p>

<p align="center">
  <a href="https://github.com/alvin-reyes/better-agentic-ide/actions/workflows/ci.yml"><img src="https://github.com/alvin-reyes/better-agentic-ide/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

Built with [Tauri v2](https://v2.tauri.app/) (Rust) + React 19 + TypeScript + [xterm.js](https://xtermjs.org/) + Zustand.

## Install

### Homebrew (macOS)

```bash
brew install --cask alvin-reyes/tap/ade
```

Upgrade with `brew upgrade --cask ade`. The cask clears the quarantine flag, so there's no Gatekeeper prompt.

### Download

Grab the installer for your platform from the [latest release](https://github.com/alvin-reyes/better-agentic-ide/releases/latest):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Better.Terminal_<version>_aarch64.dmg` |
| macOS (Intel) | `Better.Terminal_<version>_x64.dmg` |
| Windows | `.msi` or `-setup.exe` |
| Linux | `.deb` or `.AppImage` |

> **macOS manual install:** if macOS says the app "is damaged", run `xattr -cr "/Applications/Better Terminal.app"`.

### Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) for the AI agent features (`npm install -g @anthropic-ai/claude-code`). Codex, Gemini CLI and Ollama are also supported by the agent picker.

## Features

### Terminal
- **Named tabs** — create (`Cmd+T`), rename (`Cmd+R` or double-click), switch (`Cmd+1-9`, `Cmd+Shift+[` / `]`)
- **Split panes** — horizontal (`Cmd+D`) or vertical (`Cmd+Shift+D`), drag to resize, zoom one pane (`Cmd+Shift+Enter`), move between panes (`Cmd+←/→`)
- **Persistent sessions** — terminals survive splits and tab switches
- **Search** (`Cmd+F`) — incremental search with case-sensitive, whole-word and regex toggles; `Enter` / `Shift+Enter` step through matches
- **Detach to window** — right-click a tab → *Move to New Window*; the processes keep running
- **Recording & playback** — the `REC` button on a pane records its output; replay from *View Recordings* in the command palette at 1×/2×/4×

### Thoughts Scratchpad
- **Toggle** with `Cmd+J` — cycles focus between the scratchpad and the terminal
- **Send to terminal** with `Cmd+Enter`; **send a bare Enter** with `Cmd+E` to answer agent prompts without switching focus
- **Copy** with `Cmd+Shift+Enter`, **save as note** with `Cmd+S`
- **Prompt history & templates** — every sent prompt is saved and searchable
- **Prompt chaining** — separate prompts with `---` to run them in sequence, waiting for the agent to finish between steps
- **Voice dictation** — microphone button (Web Speech API)

### Files
- **File browser** (`Cmd+B`) — a tree of the active terminal's folder that follows `cd` and refreshes when files change; `.*` toggles hidden files
- **File viewer** — click any file to open it in a tab that picks the right view:
  - **PDF** — page through and zoom (rendered with pdf.js, so it works on Linux too)
  - **Word (.docx)** — a readable rendering of the document
  - **Images** — PNG, JPEG, GIF, SVG, WebP, BMP, ICO
  - **Markdown** — rendered, including ```` ```mermaid ```` diagrams, with a *Source* toggle for editing
  - **HTML** — static render (no scripts) with a *Source* toggle
  - **Everything else** — the Monaco code editor with syntax highlighting; `Cmd+S` saves
- **Mermaid diagrams** — `.mmd` files open with a live diagram preview and a chat box that edits the diagram through a local Ollama model
- Rendered markdown and documents are sanitized before display, so a malicious README can't run code

### Preview Panel
- **Side-by-side preview** (`Cmd+Shift+B`) of HTML, images, PDF and markdown next to your terminal
- **Live refresh** — updates on save through a native filesystem watcher; handy for watching an agent write a spec
- Also opens when you click a file path in the terminal

### AI Agents
- **Agent picker** (`Cmd+Shift+A`) — 23 pre-configured agent profiles across Backend, Frontend, DevOps, Testing and General (debugging, code review, docs, architecture, git, brainstorming and more)
- **Task routing** — describe a task and the picker suggests the best-matching agent
- **Providers** — Claude Code, Codex, Gemini CLI or Ollama
- **Continuous mode** — autonomous runs with `--dangerously-skip-permissions` (with a safety warning)
- Each agent gets its own named, color-coded tab

### Fleet View
- **One terminal or all of them** — `Cmd+.` opens the fleet panel; toggle between *This terminal* and *All terminals*. *Fleet: All terminals* in the command palette opens it as a full tab.
- **All terminals** — a section per terminal tab showing its folder, its agents and the Claude Code sub-agents they spawned, with running count and cost per terminal; *Go to tab* jumps straight there
- **Timeline** — swimlanes of every agent and sub-agent over the last 5 min / 15 min / 1 h / all time; click an agent to jump to its pane
- **Cost tracking** — estimated tokens and cost per session for Claude, Codex and Gemini, plus session history
- **Notifications** — a system notification and in-app toast when an agent finishes

### Orchestrator
- **Plan with an AI, then dispatch** (`Cmd+Shift+O`) — chat through a project in the Orchestrator tab (type in the scratchpad), and it breaks the work into tasks with an agent profile, priority and dependencies
- **Dispatch** a task, or *Dispatch All* ready tasks, each into its own terminal running `claude` with the task and a generated `SPEC.md`
- Uses the Anthropic API (key in *Settings → AI API*) or a local Ollama model

### BMAD Method
- **One-click setup** — ADE offers to install a bundled, pinned copy of [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) into a project (`.bmad-core/` plus Claude Code commands); nothing is downloaded and existing files are never overwritten
- **Persona panel** — launch the Analyst, PM, UX Expert, Architect, Product Owner, Scrum Master, Developer or QA persona in the active terminal

### Browser Tab
- **Open Browser Tab** from the command palette to view a local dev server (defaults to `http://localhost:3000`) inside ADE

### Theming & Settings
- **8 built-in themes** — GitHub Dark, Dracula, Monokai Pro, Nord, Catppuccin Mocha, Solarized Dark, Tokyo Night, One Dark
- **Fonts** — size (10–24px), family (JetBrains Mono, SF Mono, Fira Code, Cascadia Code, …), line height
- **Custom colors** — override any UI or terminal color
- **Cursor** — bar, block or underline, optional blink; configurable scrollback
- **Workspaces** — save and restore tab layouts by name

## Keyboard Shortcuts

`Cmd` is `Ctrl` on Windows and Linux.

| Shortcut | Action |
|---|---|
| `Cmd+P` | Command palette |
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
| `Cmd+F` | Search in terminal |
| `Cmd+J` | Toggle scratchpad / cycle focus |
| `Cmd+Enter` | Send scratchpad to terminal |
| `Cmd+Shift+Enter` | Copy scratchpad (scratchpad open) |
| `Cmd+S` | Save scratchpad as note / save file in the editor |
| `Cmd+E` | Send Enter to terminal |
| `Cmd+B` | Toggle file browser |
| `Cmd+Shift+B` | Toggle preview panel |
| `Cmd+Shift+A` | AI agent picker |
| `Cmd+.` | Fleet view |
| `Cmd+Shift+O` | Orchestrator |
| `Cmd+,` | Settings |
| `Escape` | Close open panels and focus the terminal |

## Development

```bash
# Prerequisites: Node.js 18+, Rust (stable); on Linux also the Tauri system libraries:
# https://v2.tauri.app/start/prerequisites/
npm install
npm run tauri dev       # run the app with hot reload
npm run tauri build     # build installers for your platform

npm test                # frontend unit tests (Vitest)
npx tsc --noEmit        # typecheck
(cd src-tauri && cargo test)   # backend unit tests
```

CI runs the typecheck, frontend tests, a production build and the Rust tests on every pull request.

### Releasing

1. Bump `version` in `src-tauri/tauri.conf.json` and merge to `main`.
2. Push a tag: `git tag v<version> && git push origin v<version>`. The *Build & Release Installers* workflow builds macOS (ARM + Intel), Windows and Linux installers and attaches them to a GitHub release.
3. Update the Homebrew cask in [alvin-reyes/homebrew-tap](https://github.com/alvin-reyes/homebrew-tap) (`Casks/ade.rb`): set `version` and the two `sha256` values for the new `.dmg` files.

## Architecture

```
better-agentic-ide/
├── src-tauri/                 Rust backend
│   └── src/
│       ├── main.rs            App entry point
│       ├── lib.rs             Tauri command registration, file commands
│       ├── pty.rs             PTY management (portable-pty + Channel API)
│       ├── watcher.rs         Native filesystem watcher (notify)
│       ├── subagent.rs        Claude Code sub-agent transcript watcher (fleet view)
│       └── bmad.rs            BMAD scaffolding and status
├── src/                       React frontend
│   ├── components/
│   │   ├── TabBar.tsx, PaneContainer.tsx, TerminalPane.tsx    Tabs, splits, xterm.js panes
│   │   ├── Scratchpad.tsx     Thoughts panel, history, notes, chaining
│   │   ├── FileBrowser.tsx    File tree side panel
│   │   ├── EditorTab.tsx      File tab: picks a viewer or the editor
│   │   ├── viewer/            PDF, .docx, image, markdown and HTML viewers
│   │   ├── editor/            Monaco wrapper, Mermaid preview, diagram chat
│   │   ├── fleet/             Fleet panel, tab, per-terminal groups, timeline
│   │   ├── PreviewPanel.tsx   Side-by-side live preview
│   │   ├── AgentPicker.tsx    Agent launcher and task routing
│   │   ├── OrchestratorTab.tsx, BmadPanel.tsx, BrowserTab.tsx
│   │   ├── RecordingControls.tsx, RecordingPlayer.tsx, TerminalSearch.tsx
│   │   └── CommandPalette.tsx, SettingsPanel.tsx, ShortcutsBar.tsx, Tour.tsx
│   ├── stores/                Zustand stores (tabs, settings, fleet, agents, orchestrator, BMAD)
│   ├── hooks/                 Terminal lifecycle, keybindings, fleet data, recording
│   ├── lib/                   Viewer dispatch, HTML sanitizing, Mermaid config, Anthropic client
│   └── data/                  Agent profiles, task router, BMAD personas
└── .github/workflows/         CI and release builds
```

### Key design decisions

- **Global terminal instance map** — terminal instances live outside React in a `Map` so they survive remounts during splits
- **Tauri Channel API** — PTY output and watcher events stream over `Channel`s
- **One watcher per folder** — the fleet view refcounts a sub-agent watcher per terminal folder, so several views share them
- **Sanitize before render** — the webview can reach Tauri IPC, so markdown and documents from any repo go through DOMPurify and Mermaid's strict mode
- **localStorage persistence** — settings, themes, notes, history, workspaces and recordings persist across sessions

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Tauri v2 |
| Backend | Rust + portable-pty + notify |
| Frontend | React 19 + TypeScript |
| Terminal | xterm.js + WebGL addon |
| Editor & viewers | Monaco, pdf.js, mammoth, marked, Mermaid |
| State | Zustand |
| Styling | Tailwind CSS v4 + CSS variables |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

ISC

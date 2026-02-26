# Contributing to ADE (Agentic Development Environment)

Thanks for your interest in contributing to ADE! This guide will help you get started.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) (stable toolchain)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — for AI agent features (`npm install -g @anthropic-ai/claude-code`)

### Setup

```bash
# Clone the repository
git clone https://github.com/alvin-reyes/better-agentic-ide.git
cd better-agentic-ide

# Install frontend dependencies
npm install

# Run in development mode
npm run tauri dev
```

## Project Structure

```
├── src-tauri/           Rust backend (Tauri v2)
│   ├── src/
│   │   ├── lib.rs       Command registration
│   │   ├── pty.rs       PTY management
│   │   └── watcher.rs   Filesystem watcher
│   └── Cargo.toml
├── src/                 React frontend
│   ├── components/      UI components
│   ├── data/            Agent profiles, static data
│   ├── hooks/           Custom hooks (terminal, keybindings)
│   └── stores/          Zustand state stores
├── docs/                Website (GitHub Pages)
└── package.json
```

## How to Contribute

### Reporting Bugs

Open an [issue](https://github.com/alvin-reyes/better-agentic-ide/issues) with:
- Steps to reproduce
- Expected vs actual behavior
- OS and version
- Screenshots if applicable

### Suggesting Features

Open an issue with the `enhancement` label describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test locally with `npm run tauri dev`
5. Commit with a descriptive message
6. Push and open a PR against `main`

### Adding AI Agent Profiles

Agent profiles live in `src/data/agentProfiles.ts`. To add a new agent:

1. Add an entry to the `AGENT_PROFILES` array with:
   - `id` — unique kebab-case identifier
   - `name` — display name
   - `icon` — emoji or short text (2 chars max)
   - `color` — hex color matching the category
   - `category` — one of `Backend`, `Frontend`, `DevOps`, `Testing`, `General`
   - `description` — one-line description
   - `command` — the Claude CLI command to run

2. Test that it appears in the agent picker (`Cmd+Shift+A`)

### Adding Themes

Themes are defined in `src/stores/settingsStore.ts` in the `THEMES` object. Each theme maps color variable names to hex values.

## Code Style

- TypeScript strict mode
- Functional React components with hooks
- Zustand for state management
- CSS variables for theming (no Tailwind utility classes in component logic)

## Development Tips

- **Hot reload** — `npm run tauri dev` supports frontend hot reload
- **Rust changes** — Rust backend changes require a restart of `tauri dev`
- **Terminal instances** — Live in a global `Map` outside React (see `useTerminal.ts`)
- **PTY communication** — Uses Tauri Channel API for streaming data

## License

By contributing, you agree that your contributions will be licensed under the ISC License.

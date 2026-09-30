<p align="center">
  <img src="ade_logo.png" alt="ADE - Agentic Development Environment" width="120" style="border-radius: 20px;">
</p>

<h1 align="center">ADE — Agentic Development Environment</h1>

<p align="center"><strong>The terminal for building products with AI.</strong></p>

<p align="center">
  <a href="https://alvin-reyes.github.io/better-agentic-ide/"><strong>Website</strong></a> ·
  <a href="https://alvin-reyes.github.io/better-agentic-ide/#pricing"><strong>Pricing</strong></a> ·
  <a href="https://alvin-reyes.github.io/better-agentic-ide/guide/"><strong>User guide</strong></a> ·
  <a href="https://github.com/alvin-reyes/better-agentic-ide/releases/latest"><strong>Download</strong></a>
</p>

ADE is a desktop app for macOS, Windows and Linux built around two pillars: **AI agents** and **blockchain engineering tooling**. Run Claude Code, Codex and Gemini side by side, have every project set up for them, see exactly what each agent costs, and take smart contracts from first test to reviewed deploy, all from the keyboard.

## AI Agents

- **Ten agents at once** — run Claude Code, Codex, Gemini or any CLI agent (Ollama for local models) in parallel tabs and split panes. The fleet view tracks every agent and sub-agent on a live timeline with its real cost, read from Claude Code's usage records.
- **40 agent profiles** — Backend (including senior Go and Rust engineers), Frontend, DevOps, Testing, Web3, Architects and General. Pick one and run it in this terminal or a new tab.
- **Project setup** — every project is set up for agents once, automatically. See [below](#project-setup).
- **Prompt scratchpad** — draft long prompts under every terminal with prompt tips and de-slop, send with one key, chain steps and reuse from history. Drafts survive crashes.
- **Tokens & cost** — spend at API prices, cache savings and context meters, plus one-click token savers (compact paste, context guard, context diet).
- **Anti-slop** — the ADE plugin for Claude Code (anti-slop skill, a slop check before Claude finishes, `/ade:deslop`, Web3/Go/Rust sub-agents and architect skills), plus a slop check on your uncommitted changes.
- **MCP library & Secrets vault** — 15 curated MCP servers added to `.mcp.json` in one click, with `${NAME}` references to secrets kept in your OS keychain and never synced.

### Project setup

Every project ADE opens (New project, Open project, or any git repo a terminal enters) is set up once:

- **BMAD** — `.bmad-core/` and the `/BMad` slash commands.
- **The ADE methodology**, "verified, not vibed": Plan → Approve → Shard → Build → Verify. A story is Done only when the agreed verification command passes, and no agent certifies its own work. The rules live in `.ade/rules.md` and load from `CLAUDE.md` (an existing `CLAUDE.md` gets one import line and is never replaced), with a context store, a decision log (ADRs) and a session journal under `.ade/`, plus `llms.txt`.
- **Eight core roles** as Claude Code sub-agents in `.claude/agents/`: product manager, architect, designer, scrum master, developer, QA, DevOps and adversarial reviewer.
- **Agents for your stack** — Foundry or Hardhat: Solidity engineer, smart contract auditor, gas optimizer, Web3 DevOps engineer. Anchor/Solana: Solana/Anchor engineer, auditor, Web3 DevOps engineer, senior Rust engineer. `go.mod`: senior Go engineer. `Cargo.toml`: senior Rust engineer.

Only missing files are written, and the toast that lists them has Undo. Add or remove agents any time in *Integrations → Agents*; turn automatic setup off in *Settings → Terminal*. See the [project setup guide](https://alvin-reyes.github.io/better-agentic-ide/guide/project-setup/).

## Blockchain Engineering Tooling

- **Contracts panel** — one key opens build, test, gas report, coverage, Slither and Aderyn analysis and a local chain for Foundry, Hardhat and Anchor projects.
- **Workbench** — run Foundry tests one at a time with gas, fuzz runs and counterexamples, then deploy and call contracts on Anvil with decoded events and reverts.
- **Reviewed deploys** — real-network deploy commands are typed into the terminal for you to review, never run automatically. ADE never handles, stores or syncs private keys.
- **ABI viewer** — functions, events and errors with their selectors, and Anchor IDLs with their accounts.
- **Web3 agents** — Solidity engineer (Foundry, test-first, fuzz and invariant tests), smart contract auditor (reentrancy, access control, oracle and MEV, proof-of-concept tests), gas optimizer, Solana/Anchor engineer and Web3 DevOps engineer, plus DeFi, tokenomics, contract systems, Web3 infrastructure, cross-chain and AI x Web3 architects.

## Also in ADE

- **Clickable files and live preview** — Markdown with Mermaid, PDF, Word, images and HTML open beside the terminal.
- **Auto-save and sync** — sessions restore after a crash; settings, notes and Claude memory sync through your own private git repo.

## Install

**Homebrew (macOS)**

```bash
brew install --cask alvin-reyes/tap/ade
```

**Installers** — download from the [latest release](https://github.com/alvin-reyes/better-agentic-ide/releases/latest): `.dmg` for macOS (Apple Silicon and Intel), `.msi` or `-setup.exe` for Windows, `.deb` or `.AppImage` for Linux.

ADE works with [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Codex, Gemini CLI and Ollama. See the [user guide](https://alvin-reyes.github.io/better-agentic-ide/guide/) to get started.

## Licensing

ADE is commercial software. Try it free; if you keep using it, [buy a license](https://alvin-reyes.github.io/better-agentic-ide/#pricing). Licensing is on the honor system: there are no license keys and no DRM. See [LICENSE](LICENSE) for the terms.

## aracademy

ADE is the tool used in aracademy's AI training, and a license is included with the course. Details are on the [website](https://alvin-reyes.github.io/better-agentic-ide/#training).

## Support

For help, licensing and team purchases, get in touch via the [website](https://alvin-reyes.github.io/better-agentic-ide/). The [troubleshooting guide](https://alvin-reyes.github.io/better-agentic-ide/guide/troubleshooting/) covers common issues.

© 2025–2026 Alvin Reyes. All rights reserved.

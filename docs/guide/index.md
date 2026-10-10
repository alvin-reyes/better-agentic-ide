---
title: Getting started
lead: Install ADE, open your first project and run an agent (or build and test a smart contract) in a few minutes.
description: Install ADE on macOS or Linux and run your first AI coding agent.
---

## Install

### macOS and Linux

One command installs either:

```bash
curl -fsSL https://ade.ardata.tech/install.sh | bash
```

It picks the build for your machine, checks it against the release's
`SHA256SUMS` where the release publishes them, and installs to a
user-writable location without calling sudo. Run it again to upgrade.
`--dry-run` resolves and verifies the download, then stops before
installing anything.

- **macOS**: copies the app to `/Applications` and clears the quarantine
  flag, so the first launch isn't blocked. Set `ADE_PREFIX` to install
  somewhere else.
- **Linux**: puts the AppImage in `~/.local/bin`. `--dir PATH` changes
  where, and `--deb` installs the `.deb` with dpkg instead. `--deb` is
  the one path that needs root; the script says so before it asks.

Pass options after `-s --` when piping: `curl -fsSL … | bash -s -- --deb`.

Builds are not notarised by Apple yet. If you install the `.dmg` by hand
and macOS says the app "is damaged", see
[Troubleshooting]({{ '/guide/troubleshooting/' | relative_url }}#macos-says-the-app-is-damaged).

Every build is also on the [download page]({{ '/#downloads' | relative_url }})
and the [latest release]({{ site.repo }}/releases/latest): `aarch64` for
Apple Silicon, `x64` for Intel Macs, `.deb` for Debian and Ubuntu, and a
portable `.AppImage` for any distro.

### Windows

```powershell
irm https://ade.ardata.tech/install.ps1 | iex
```

Windows builds are not published yet, so this reports that and stops. It is
ready for when they are: see [issue #22](https://github.com/alvin-reyes/better-agentic-ide/issues/22).

## Install an agent

ADE works with any command-line agent. The agent picker has presets for:

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)**: `npm install -g @anthropic-ai/claude-code`
- **Codex** and **Ollama** (local models)

The fleet view reads Claude Code's own transcripts, so Claude Code gets the most out of ADE.

## First launch

1. ADE opens with one terminal in your home folder and a short tour. Skip it or step through it; it won't show again.
2. `cd` into a project. The file browser, the fleet view and the clickable file links all follow the terminal's current folder.
3. Start an agent: type `claude`, or press {% include key.html mac="⌘⇧A" other="Ctrl+Alt+Shift+A" %} to open the agent picker and choose a profile.
4. Open the scratchpad with {% include key.html mac="⌘J" other="Ctrl+Shift+J" %}, write your prompt, and send it with {% include key.html mac="⌘↵" other="Ctrl+Enter" %}.
5. When the agent writes a file, click its path in the terminal to see it.

The first time you open a project, ADE sets it up for agents: BMAD, the ADE methodology and a team of Claude Code sub-agents, adding only files that are missing. A new project is asked which BMAD to use, v6 (the default) or v4. See [Project setup]({{ '/guide/project-setup/' | relative_url }}).

> Shortcuts on this site follow your platform. Switch between macOS and Linux with the buttons in the sidebar.

## Where to go next

- [Project setup]({{ '/guide/project-setup/' | relative_url }}): BMAD, the methodology and agents in every project
- [Agents & fleet]({{ '/guide/agents/' | relative_url }}): the agent picker and fleet view
- [Smart contracts]({{ '/guide/contracts/' | relative_url }}): Foundry, Hardhat and Anchor tooling
- [Tokens & cost]({{ '/guide/tokens/' | relative_url }}): what sessions cost and how to spend less
- [Terminal]({{ '/guide/terminal/' | relative_url }}): tabs, panes, search and clickable files
- [Scratchpad]({{ '/guide/scratchpad/' | relative_url }}): prompt chaining, history and voice
- [Auto-save & sync]({{ '/guide/sync/' | relative_url }}): keep your setup on every machine
- [Keyboard shortcuts]({{ '/guide/shortcuts/' | relative_url }}): the full list

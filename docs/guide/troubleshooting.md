---
title: Troubleshooting
lead: Fixes for the problems people run into most.
description: Solutions to common ADE problems on macOS, Linux and Windows.
---

## macOS says the app is damaged

Builds downloaded directly from GitHub aren't notarized yet, so macOS quarantines them. Clear the flag once:

```bash
xattr -cr "/Applications/Better Terminal.app"
```

Installing with Homebrew (`brew install --cask alvin-reyes/tap/ade`) does this for you.

## A shortcut types into my shell instead (Linux/Windows)

App shortcuts on Linux and Windows use <kbd>Ctrl+Shift</kbd> (and <kbd>Ctrl+Alt+Shift</kbd>), not plain <kbd>Ctrl</kbd>. For example, a new tab is <kbd>Ctrl+Shift+T</kbd>, while <kbd>Ctrl+T</kbd> goes to the shell. See [Keyboard shortcuts]({{ '/guide/shortcuts/' | relative_url }}).

## A file path in the terminal isn't clickable

- The file has to exist. Links appear once the agent has written the file.
- Relative paths resolve against the terminal's current folder. If you `cd` elsewhere afterwards, older relative paths may point at the wrong place.
- Hover the path for a moment; links are detected as the pointer moves over a line.

## The app won't start on Linux

The `.deb` and AppImage need WebKitGTK 4.1. On Debian and Ubuntu:

```bash
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0
```

## Sync fails

- **"git push failed" / authentication errors** — ADE runs git non-interactively. Make sure `git push` to the repo works from a terminal without a password prompt: an SSH key in your agent, or a configured credential helper.
- **"Unsupported git remote"** — use an `https://`, `ssh://` or `git@host:path` URL.
- **A `.sync-conflict` file appeared** in `~/.claude` — the file was changed on two machines. Merge the two versions and delete the conflict file.

## Start over with a clean state

Quit ADE and move its data folder aside (see the paths in [Auto-save & sync]({{ '/guide/sync/' | relative_url }}#auto-save)). To go back to an earlier state instead, restore a [snapshot]({{ '/guide/sync/' | relative_url }}#snapshots).

## Report a bug

Contact support through the [website]({{ '/' | relative_url }}) with your OS, the ADE version and the steps to reproduce.

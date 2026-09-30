---
title: Terminal
lead: Tabs, split panes, search and clickable file paths — a full terminal with a real shell in every pane.
description: Tabs, split panes, search, detached windows, recordings and clickable file paths in ADE.
---

## Tabs

**New tab: terminal or project?** A new tab first asks where to start. Press <kbd>T</kbd> for a plain terminal in your home folder, <kbd>O</kbd> to pick a project folder, or <kbd>1</kbd>–<kbd>9</kbd> for a recent project. The shell starts in that folder. To skip the question, tick *Don't ask again* in the dialog; turn it back on in *Settings → Terminal*.

| Action | Shortcut |
|---|---|
| New tab | {% include key.html mac="⌘T" other="Ctrl+Shift+T" %} |
| Close tab | {% include key.html mac="⌘W" other="Ctrl+Shift+W" %} |
| Reopen closed tab | {% include key.html mac="⌘⇧T" other="Ctrl+Alt+Shift+T" %} |
| Go to tab (search) | {% include key.html mac="⌘K" other="Ctrl+Shift+K" %} or the ⌄ button after + |
| Go to tab 1–9 | {% include key.html mac="⌘1 … ⌘9" other="Ctrl+Shift+1 … 9" %} |
| Previous / next tab | {% include key.html mac="⌘⇧[ / ⌘⇧]" other="Ctrl+PageUp / Ctrl+PageDown" %} |
| Rename tab | {% include key.html mac="⌘R" other="Ctrl+Shift+R" %} or double-click the name |

Drag tabs to reorder them. A tab whose terminal is busy shows an activity pulse; closing it asks for confirmation.

**Telling tabs apart:** a terminal tab you haven't renamed shows its current folder, and hovering shows the full path. Right-click a tab to give it a color. A dot appears on a tab whose output finished while you were looking at another one.

**Projects:** neighbouring tabs in the same git project get a project chip in front of them. Click the chip to collapse the group into one tab, and again to expand it. *Sort Tabs by Project* (right-click menu) brings each project's tabs together.

**Finding a tab:** {% include key.html mac="⌘K" other="Ctrl+Shift+K" %} opens *Go to tab*. Type part of a tab's name, folder or project, then press Enter. It also shows which tabs are working and which finished.

**Closing and reopening:** the right-click menu has *Close Others* and *Close Tabs to the Right*, which ask once if anything is still running. {% include key.html mac="⌘⇧T" other="Ctrl+Alt+Shift+T" %} reopens the last closed terminal tab in the same folder, with its name and color. It reopens the folder, not the process that was running.

**Move to a new window:** right-click a tab and choose *Move to New Window*. The shell and anything running in it keep going.

## Split panes

| Action | Shortcut |
|---|---|
| Split side by side | {% include key.html mac="⌘D" other="Ctrl+Shift+D" %} |
| Split top and bottom | {% include key.html mac="⌘⇧D" other="Ctrl+Alt+Shift+D" %} |
| Close pane | {% include key.html mac="⌘⇧W" other="Ctrl+Alt+Shift+W" %} |
| Move between panes | {% include key.html mac="⌘← / ⌘→" other="Ctrl+Shift+Left / Right" %} |
| Zoom / unzoom pane | {% include key.html mac="⌘⇧↵" other="Ctrl+Alt+Shift+Enter" %} |

New panes open in the same folder as the pane you split. Drag the divider to resize.

## Clickable files

Any file path printed in a terminal becomes a link once the file exists. That covers the paths agents print as they work:

```text
⏺ Write(docs/plan.md)
  ⎿  Updated src/App.tsx:42:7
Saved the report to ./out/report.pdf
```

- Relative paths resolve against the terminal's **current folder**, so they keep working after `cd`.
- `~/…` and absolute paths work too. A trailing `:line` or `:line:col` is ignored.
- **Markdown, HTML, PDFs and images** open in the [preview panel]({{ '/guide/files/' | relative_url }}#preview-panel) beside the terminal. **Everything else** opens in a tab.
- A path that wraps onto the next line is still one link.
- Words that only look like files (`v1.2.3`, a path that doesn't exist) are not links.

Web addresses are links too; they open in your browser.

## Search

Press {% include key.html mac="⌘F" other="Ctrl+Shift+F" %} to search the active pane. Toggle case-sensitive, whole-word and regex matching; <kbd>Enter</kbd> and <kbd>Shift+Enter</kbd> step through matches.

## Recording and playback

Click **REC** in a pane's corner to record its output. Stop it the same way, then open *View Recordings* from the command palette ({% include key.html mac="⌘P" other="Ctrl+Shift+P" %}) to replay a session at 1×, 2× or 4×.

## Notifications

When an agent finishes in a terminal you aren't looking at, ADE shows a system notification and an in-app toast.

## Your shell keys

On **Linux**, app shortcuts use <kbd>Ctrl+Shift</kbd>, so plain <kbd>Ctrl</kbd> keys always reach your shell: <kbd>Ctrl+R</kbd> searches history, <kbd>Ctrl+W</kbd> deletes a word, <kbd>Ctrl+D</kbd> sends end-of-file. On **macOS**, app shortcuts use <kbd>⌘</kbd> and <kbd>Ctrl</kbd> is left entirely to the terminal.

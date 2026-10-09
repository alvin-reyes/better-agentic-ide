---
title: Settings
lead: Themes, fonts, cursor, workspaces and the AI provider for the orchestrator.
description: Configure themes, fonts, cursor, workspaces and AI providers in ADE.
---

Open settings with {% include key.html mac="⌘," other="Ctrl+Shift+," %} or the gear in the tab bar. Every change applies immediately and is [saved and synced]({{ '/guide/sync/' | relative_url }}).

## Themes

Nine built-in themes. **Precision** is the default; the rest are GitHub Dark, Dracula, Monokai Pro, Nord, Catppuccin Mocha, Solarized Dark, Tokyo Night and One Dark. Each themes both the app and the terminal colors, and every terminal palette is checked to stay legible against the UI behind it.

Under **Custom colors** you can override any UI or terminal color; *Reset to preset* removes your overrides.

Your theme is painted before the first frame is drawn, so starting ADE never flashes a default palette on the way to yours.

![Theme settings]({{ '/assets/img/themes-settings.webp' | relative_url }})

## Terminal

- **Font size** from 10 to 24 px, with quick presets
- **Font family**: JetBrains Mono, SF Mono, Fira Code, Cascadia Code, Source Code Pro, IBM Plex Mono or the system monospace font
- **Line height**
- **Cursor**: bar, block or underline, with optional blink
- **Scrollback**: from 1,000 to 100,000 lines

## Workspace

Rename any open tab, and save the current set of tabs as a named workspace. **Load** reopens a workspace's tabs.

## AI API

**Default agent provider** sets which provider the [agent picker]({{ '/guide/agents/' | relative_url }}#agent-picker) starts on. Providers with no verified way to accept a role are left out, since one could never launch an agent. **DeepSeek** runs the `claude` CLI against DeepSeek's Anthropic-compatible endpoint and needs `DEEPSEEK_API_KEY` in the [vault]({{ '/guide/integrations/' | relative_url }}#secrets-vault); see [DeepSeek]({{ '/guide/agents/' | relative_url }}#deepseek).

The [orchestrator]({{ '/guide/agents/' | relative_url }}#orchestrator) needs a model:

- **Anthropic**: paste an API key (`sk-ant-…`) and pick a model. The key stays on this machine; sync never copies it.
- **DeepSeek**: calls DeepSeek's Anthropic-compatible endpoint with the `DEEPSEEK_API_KEY` already in the [vault]({{ '/guide/integrations/' | relative_url }}#secrets-vault), so there is no second key to enter.
- **Ollama (local)**: set the endpoint (default `http://localhost:11434`) and a model name such as `llama3.2` or `qwen2.5-coder`.

Agents you launch from the agent picker use their own CLI logins and don't need this.

## Sync

See [Auto-save & sync]({{ '/guide/sync/' | relative_url }}).

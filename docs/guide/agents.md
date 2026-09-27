---
title: Agents & fleet
lead: Launch agents from profiles, watch every agent and sub-agent on one timeline, and plan work with the orchestrator.
description: ADE's agent picker, fleet view, orchestrator, BMAD personas and browser tab.
---

## Agent picker

Press {% include key.html mac="⌘⇧A" other="Ctrl+Alt+Shift+A" %} to launch an agent in a new, color-coded tab.

- **26 profiles** across Backend, Frontend, DevOps, Testing, Web3 and General — API Builder, Database Engineer, Smart Contract Auditor, Debugger, Code Reviewer, Docs Writer and more. Each starts the agent with a role prompt. See [Smart contracts]({{ '/guide/contracts/' | relative_url }}#web3-agents) for the Web3 ones.
- **Describe a task** in the search box and the picker suggests the best match.
- **Provider** — switch between Claude Code, Codex, Gemini CLI and Ollama with <kbd>Tab</kbd>.
- **Continuous mode** runs the agent without permission prompts (Claude Code's `--dangerously-skip-permissions`). ADE asks you to confirm first; use it only in projects you trust.

![The agent picker]({{ '/assets/img/agents.webp' | relative_url }})

## Fleet view

Claude Code agents spawn sub-agents — Explore, Plan, code reviewers — that normally run out of sight. ADE reads Claude Code's transcripts and shows each one as it starts and finishes.

- {% include key.html mac="⌘." other="Ctrl+Shift+." %} opens the fleet panel for the active terminal. Switch to **All terminals** to see every terminal at once, each with its folder, running count and estimated cost; *Go to tab* jumps there.
- *Fleet: All terminals* in the command palette opens the same view as a full tab.
- The **timeline** shows swimlanes for the last 5 minutes, 15 minutes, hour or all time. Click an agent to jump to its pane.
- **Cost** is estimated from token counts for Claude, Codex and Gemini sessions.

![Fleet timeline with sub-agents]({{ '/assets/img/fleet.webp' | relative_url }})

## Orchestrator

Press {% include key.html mac="⌘⇧O" other="Ctrl+Alt+Shift+O" %} to open an Orchestrator tab and talk through a project (type in the scratchpad). It breaks the work into tasks, each with an agent profile, a priority and its dependencies.

- **Dispatch** one task, or **Dispatch All** ready tasks. Each runs in its own terminal with `claude`, the task, and a generated `SPEC.md`.
- The orchestrator uses the Anthropic API (add your key in *Settings → AI API*) or a local Ollama model.

## BMAD personas

When you open a project without [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD), ADE offers to install it. The bundled, pinned copy goes into `.bmad-core/` along with Claude Code commands; nothing is downloaded and existing files are never overwritten.

The BMAD panel then launches the Analyst, PM, UX Expert, Architect, Product Owner, Scrum Master, Developer or QA persona in the active terminal.

## Browser tab

Choose *Open Browser Tab* in the command palette to keep a local dev server (by default `http://localhost:3000`) open in ADE, next to the agent building it.

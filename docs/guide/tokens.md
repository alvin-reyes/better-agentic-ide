---
title: Tokens & cost
lead: See what your Claude Code sessions cost, how much prompt caching saves, and how full each context is. Then act on tips for spending less.
description: Real token usage and cost from Claude Code transcripts in ADE, with context meters, savings tips and read-deny rules that keep agents out of generated folders.
---

Press {% include key.html mac="⌘⇧G" other="Ctrl+Alt+Shift+G" %} (or *Tokens: Usage, cost and ways to save* in the command palette).

![The Tokens panel: spend, cache savings, tips, sessions with context meters, usage by model and the context diet]({{ '/assets/img/tokens.webp' | relative_url }})

## Where the numbers come from

Claude Code records the exact token usage of every API response in its session transcripts under `~/.claude/projects/`. ADE reads those files, including sub-agents, locally. Nothing is sent anywhere.

- **This folder** shows the sessions started in the active terminal's folder. **All projects** shows every project.
- Choose **Today**, **7 days** or **30 days**.
- Costs use Anthropic's API list prices for each model, counting fresh input, 5-minute and 1-hour cache writes, cache reads and output at their own rates. On a Pro or Max plan you don't pay per token, but the same tokens count toward your usage limits.

At the top of the panel:

| Figure | What it means |
|---|---|
| Spent | Cost at API prices for the period |
| Saved by prompt caching | What the same requests would have cost with no cache, minus what they cost |
| From cache | Share of prompt tokens served from cache, which cost a tenth of fresh input or less |
| In / out | Prompt and output tokens, and the number of requests |

## Sessions and context

Each session shows its first prompt, model and cost. It also has a **context meter**: the size of its latest request against the model's context window. That's how much the next turn resends. The meter turns amber at half full and red at three quarters.

## Ways to save

The panel suggests savings based on your own usage:

- **A large context.** Send `/compact` to the agent in the active terminal with one click. `/compact` summarizes the conversation so far; `/clear` starts fresh for a new task.
- **A low cache hit rate.** Long pauses let the cache expire, and changing `CLAUDE.md`, the model or MCP servers mid-session invalidates it.
- **Sub-agents on the top-tier model.** Give search and reading agents `model: haiku` or `model: sonnet` in their `.claude/agents/*.md` frontmatter.
- **Long responses.** Output costs about five times as much as input, so ask for targeted edits instead of whole files.
- **Large `CLAUDE.md` files and many MCP servers.** Both are part of every request.

## Context diet

For the active terminal's folder, the panel lists:

- **What loads into every request:** `CLAUDE.md`, `CLAUDE.local.md`, `.claude/CLAUDE.md` and your user-level `~/.claude/CLAUDE.md`, with rough token counts, plus the MCP servers in `.mcp.json`.
- **Generated and dependency paths an agent could wander into:** `node_modules`, `dist`, `build`, `out`, `target`, `.next`, `coverage`, `vendor`, virtualenvs, and large lockfiles.

Tick the paths to exclude and click **Add read-deny rules**. ADE adds rules such as `Read(./node_modules/**)` to `permissions.deny` in `.claude/settings.json` and keeps everything else in the file. Claude Code's file tools then skip those paths, so a stray search can't pull in thousands of tokens. New sessions pick the rules up. Paths that are already denied are marked.

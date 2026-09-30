---
title: Anti-slop
lead: Keep agents from shipping stubs, debug leftovers and AI-sounding prose, in ADE and in any Claude Code session.
description: ADE's anti-slop tools. The ADE plugin for Claude Code adds anti-slop rules, a slop check before Claude finishes, and a de-slopper. ADE checks a project's changes and tightens prompts in the scratchpad.
---

Open it with *Anti-slop: Check changes and the ADE plugin* in the command palette, or the **Anti-slop** tab in {% include key.html mac="⌘⇧I" other="Ctrl+Alt+Shift+I" %}.

## The ADE plugin for Claude Code

**Install** adds the plugin with Claude Code's own plugin manager, in a new tab. It ships with ADE, and once installed it works in every Claude Code session, inside ADE or not. It adds about 1,000 tokens to each session.

| Part | What it does |
|---|---|
| `anti-slop` skill | Rules Claude follows when it writes code or docs: no stubs or TODOs in place of real code, no debug output or commented-out code left behind, comments that explain why rather than narrate, no unrequested files, and plain writing without AI-tell words. |
| Slop check | Before Claude finishes, a hook reads the lines it added in the repository and sends any findings back once, so Claude fixes them or says why they're intended. Set `ADE_SLOP_CHECK=0` to turn it off. |
| `/ade:deslop` | Rewrites a file or pasted text so it doesn't read as AI-generated, keeping every fact. |
| Web3 sub-agents | Solidity engineer, auditor, gas optimizer and Solana engineer, which Claude can delegate to. |
| `/ade:arch-…` | The architects from the agent picker (DeFi, tokenomics, RAG, AI agents and more) as skills you start yourself. |

To install it by hand:

```bash
claude plugin marketplace add "<ADE's claude-plugin folder>"
claude plugin install ade@ade --scope user
```

**Update** pulls the plugin that ships with your current ADE version.

## Check a project's changes

**Check** reads the lines added since the last commit, including new files, and lists likely slop by file and line:

- `TODO`, `FIXME` and placeholder code ("implement this", "your code here")
- `console.log` and `debugger` left in
- Commented-out code
- Comments that narrate the code ("This function is used to...")
- AI-sounding wording and emoji headings in Markdown

**Ask the agent to fix** types a request into the active terminal for you to check and send. The rules are the same ones the plugin's hook uses, so ADE and Claude Code agree. Some findings will be intended, like a TODO you asked for.

## In the scratchpad

- **Tips** appear under a draft that's vague ("make it better"), doesn't name what to work on, has no way to tell when it's done, or packs several tasks together. Hide them for the current draft with ✕.
- **De-slop** swaps AI-sounding words for plain ones and drops filler phrases in your draft, like "in today's fast-paced world" or "it's worth noting that". *Undo de-slop* puts it back. For a full rewrite, ask the agent to run `/ade:deslop`.

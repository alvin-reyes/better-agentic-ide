---
title: Scratchpad
lead: A place to write the prompt before you send it, with history, notes, chaining and voice.
description: Draft, send, chain and save prompts with ADE's scratchpad.
---

The scratchpad sits under the terminals. Long prompts are easier to write, review and reuse there than on a shell prompt.

## Open and send

| Action | Shortcut |
|---|---|
| Open the scratchpad, or switch focus between it and the terminal | {% include key.html mac="⌘J" other="Ctrl+Shift+J" %} |
| Send the text to the active terminal | {% include key.html mac="⌘↵" other="Ctrl+Enter" %} |
| Send a bare Enter to the terminal | {% include key.html mac="⌘E" other="Ctrl+Shift+E" %} |
| Copy the text | {% include key.html mac="⌘⇧↵" other="Ctrl+Alt+Shift+Enter" %} |
| Save as a note | {% include key.html mac="⌘S" other="Ctrl+S" %} |
| Close and go back to the terminal | <kbd>Esc</kbd> |

**Send Enter** answers an agent's "Do you want to proceed?" without moving focus out of the scratchpad.

Your unsent draft is saved as you type and comes back after a restart.

## Prompt chaining

Separate prompts with a line containing only `---`:

```text
Write failing tests for the webhook handler.
---
Make the tests pass.
---
Update docs/plan.md and mark task 2 done.
```

ADE sends the first step, waits until the terminal has been quiet for a few seconds, then sends the next. You can cancel a running chain from the scratchpad.

## History, notes and templates

- **History**: every prompt you send is saved and searchable. Click one to load it back.
- **Notes**: save the current text with {% include key.html mac="⌘S" other="Ctrl+S" %} to keep it for later.
- **Templates**: ready-made prompt starters for common tasks.

History and notes are part of what [sync]({{ '/guide/sync/' | relative_url }}) shares between your machines.

## Images and voice

- **Paste or drop a screenshot** into the scratchpad. ADE saves it to a temporary file and includes its path when you send, so the agent can open the image.
- **Voice dictation**: click the microphone button and speak; the text appears in the scratchpad.

## Token count and compact paste

The footer shows roughly how many tokens your prompt is. Paste a long or noisy log and ADE offers to compact it before you send it. See [Tokens & cost]({{ '/guide/tokens/' | relative_url }}#in-the-scratchpad).

## Prompt tips and de-slop

A vague draft gets a tip, such as naming the file to change or saying how to tell it's done. **De-slop** swaps AI-sounding words in your draft for plain ones. See [Anti-slop]({{ '/guide/anti-slop/' | relative_url }}#in-the-scratchpad).

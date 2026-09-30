---
name: deslop
description: Rewrite text so it doesn't read as AI-generated. Use when the user asks to de-slop, humanize, tighten or clean up writing, or runs /ade:deslop on a file or pasted text.
argument-hint: "[file path or text]"
---

# De-slop

Rewrite the text in `$ARGUMENTS` (a file path, or the text itself; if empty, ask for it) so a careful human editor would sign off on it.

## Keep

- Every fact, number, name, link, code block and instruction. Don't add claims.
- The author's structure and headings unless they're the problem.
- The format: Markdown stays Markdown, a commit message stays a commit message.

## Change

- Replace AI-tell words with plain ones: delve → look into, leverage/utilize → use, robust → reliable (or cut), seamless → smooth (or cut), cutting-edge → new, elevate/supercharge/unlock → say what actually improves.
- Cut filler openers and closers: "In today's fast-paced world", "It's worth noting that", "Great question", "I hope this helps", "Let me know if...".
- Cut recaps and throat-clearing. Lead each section with its point.
- Break up stacked hedges ("may potentially help to possibly...") and hype ("revolutionary", "game-changing").
- Remove emoji from headings and decorative bullets, and bold that isn't doing work.
- Prefer short, concrete sentences. Vary rhythm; avoid the triad habit ("fast, simple, and powerful") unless all three are true and needed.
- Turn bullet lists that are really one thought into a sentence.

## Output

For a file: edit it in place and summarize the kinds of changes in two or three lines. For pasted text: return only the rewritten text.

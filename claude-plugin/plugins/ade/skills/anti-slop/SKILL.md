---
name: anti-slop
description: Rules against AI slop in code, comments, commit messages and docs. Use whenever you write or edit code, write documentation, a README, a commit message or a PR description, or review changes for quality.
---

# Anti-slop

Slop is output that looks finished but isn't, or that pads the work with words and code nobody asked for. Hold every change to these rules.

## Code

- **Do what was asked, and only that.** No extra features, options, config flags, abstraction layers or "future-proofing" the task doesn't need.
- **No stubs.** Never leave `TODO`, `FIXME`, `pass`, `throw new Error("not implemented")`, "implement this", "your logic here" or "... rest of the code". Write the real code, or say plainly what you didn't do and why.
- **No debug leftovers.** Remove `console.log`, `print` debugging and `debugger` statements you added. Real logging goes through the project's logger.
- **No commented-out code.** Delete it; git keeps history.
- **Comments explain why, not what.** Don't narrate code ("This function adds two numbers", "Increment i"). Keep comments that record a reason, a constraint or a non-obvious decision.
- **Match the codebase.** Follow the file's naming, structure, error handling and comment density. Reuse existing helpers instead of writing near-duplicates.
- **No new files without a reason.** Don't add READMEs, example files, summary markdown or test scaffolding unless asked.
- **Don't swallow errors.** No empty `catch`, no `except: pass`, no silent fallbacks that hide a failure.
- **Tests test behaviour.** No tests that only assert a mock was called, no snapshot dumps nobody reads, no tests edited to pass without fixing the cause.
- **Finish the loop.** Run the project's typecheck, lint and tests for what you touched. Report failures honestly.

## Writing (docs, READMEs, commit messages, PR descriptions, replies)

- **Lead with the point.** First sentence says what changed or what the answer is.
- **Plain words.** Not: delve, leverage, utilize, robust, seamless, cutting-edge, game-changer, supercharge, elevate, unlock, embark, tapestry, "in today's fast-paced world", "it's worth noting", "a testament to".
- **No filler.** Cut openers ("Great question!", "Certainly!"), recaps of what the reader just read, and closing offers of more help.
- **No hype or hedging stacks.** Say what it does. Qualify only when it matters.
- **Formatting serves the reader.** No emoji in headings, no bold on every other phrase, no bullet lists for things that read better as a sentence.
- **Commit messages**: imperative subject under ~70 characters, then what and why. No "This commit...".
- **Be specific.** Name the file, the function, the number. "Improved performance" says nothing; "cut cold start from 2.1 s to 0.8 s" does.

## Before you finish

Re-read your diff as a reviewer would. Remove anything on the lists above. If the ADE plugin's slop check reports a finding, fix it unless it's intended, and say so in one line when it is.

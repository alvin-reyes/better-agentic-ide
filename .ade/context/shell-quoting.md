# Shell quoting

Decided in ADR 0008 (`decisions/0008-one-shell-quoter-safe-in-posix-shells-and-fish.md`); built in Story A of `_bmad-output/plan-hermes-provider.md`.

## The quoter

`shellQuote(value)` in `src/lib/shellQuote.ts` is the only function that quotes a word for a command ADE types into a pane. Its output means the same word in sh, bash, zsh (with or without `RC_QUOTES`) and fish.

- `src/lib/agentCommand.ts` re-exports it (`import { shellQuote } from "../lib/agentCommand"` still works).
- `src/lib/contracts.ts` exports its own `shellQuote`: a word matching `^[\w./-]+$` is left bare, anything else goes through the one quoter.
- Callers still collapse control characters first (`UNTYPEABLE` in `agentCommand.ts`).
- `pluginInstallCommand(marketplace, update)` (`src/components/AntiSlopTab.tsx`) and `traceCommand(contract, test)` (`src/components/ContractsWorkbench.tsx`) are the exported builders for those two commands.

## The scan

`src/lib/__tests__/shellQuote.test.ts` › "there is one shell quoter" fails on `.replace(/'/g` or `.replace(/"/g` anywhere in `src/` outside `__tests__`, and on a `'` or `"` just before `${` on a line calling `writePty(`, `runInNewTab(` or `runInNewTabPane(`. Its `EXEMPT` map lists the files allowed to escape quotes for something other than a shell, each with a reason. Build a command string in a named function with `shellQuote`, not inline.

## Test helpers for later stories

`src/lib/__tests__/shellTokenize.ts` (test-only):

- `tokenizePosix`, `tokenizeZshRcQuotes`, `tokenizeFish(text): string[]`: words and the operators `;`, `&&`, `|`; a `#` comment is dropped. They throw on an unterminated quote and on anything unquoted they do not model (`$`, double quotes, backticks, parentheses, globs). Use them on the quoted words, or on a command made only of bare words, quoted words and those operators.
- `REAL_SHELLS`: sh, bash `--norc --noprofile`, zsh `-f`, zsh `-f -o RC_QUOTES`, fish `--no-config`, each ending in `-c`.
- `shellAvailable(shell)`: true when the program is on PATH. Locally a missing one returns false and prints `<shell> not found: verified by the reference tokenizer only`; with `CI` set it throws.
- `runShell(shell, script, cwd, input?)`: `{ stdout, stderr, status }`.
- `seeded(seed)`: a deterministic PRNG for generated corpora.

CI's `frontend` job installs `fish` and `zsh` before `npm test`.

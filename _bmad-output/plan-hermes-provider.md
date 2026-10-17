---
title: 'Fish-safe shell quoting, a provider-neutral busy check, and Hermes Agent as an ADE provider'
type: 'feature'
ticket: ''
created: '2026-10-17'
status: 'ready-for-dev'
baseline_revision: 'origin/main at branch hermes-openclaw-plan'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 4
context: ['.ade/context/decisions/0008-one-shell-quoter-safe-in-posix-shells-and-fish.md']
---

Three stories, built in order. Each is one slice with its own acceptance criteria and Verification section.

- **Story A** (bug): ADE's shell quoting becomes injection-safe in fish as well as sh, bash and zsh. This applies to every command ADE types into a pane: every provider's launch, the orchestrator, the contracts tools and the plugin installer. CI runs real fish and zsh. ADR 0008 (Accepted, 2026-10-17) records the decision.
- **Story B:** the "this pane is busy" check becomes provider-neutral. It covers the picker's "This terminal" offer and all five close paths. It is testable without Hermes.
- **Story C:** Hermes Agent (Nous Research) becomes a fifth agent provider. It depends on A for quoting and on B for busy-pane behaviour.

The shared intent, the owner's decisions and the verified facts come first.

**OpenClaw is out of scope** (owner, 2026-10-17). It is listed once under non-goals.

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:**
- **Hermes is not a provider.** The owner wants to run Hermes Agent, an interactive terminal agent, in ADE the way Claude Code, DeepSeek and Ollama run today: found on PATH, launched in a pane with a composed ADE role, given a fleet lane, and offered in the picker and the board's Dispatch. `Provider` is a closed union of four ids, and Hermes is not one of them.
- **Quoting is unsafe in fish.** ADE's quoting is POSIX-only. In fish, `\'` and `\\` are escapes inside single quotes, so a value with a backslash before a quote can end the string and run what follows. This affects every provider's launch. Two more command builders also hand-roll their quoting.
- **The busy check knows only Claude.** A busy pane is recognised by finding the word "claude" in its text. So for any other agent, the picker offers "This terminal" over a running agent, and closing the pane asks for no confirmation.

**Approach:**
- **A.** One quoter (ADR 0008) whose output means the same word in sh, bash, zsh and fish, used by every command ADE types. Real shells prove it in CI, and reference tokenizers prove it where a shell is missing.
- **B.** A pane is busy when it has a running tracked agent session, or when its terminal's foreground process, judged by its pid, its name and its argv, is something other than an interactive shell at its prompt. The picker and every close path use this check.
- **C.** Add `"hermes"` to `Provider` and `PROVIDERS`, and give `buildLaunchCommand` a `hermes` case:
  - it always starts the classic CLI (`--cli`) with the `chat` subcommand;
  - the role goes in through the documented `HERMES_EPHEMERAL_SYSTEM_PROMPT`, read from the role file;
  - the task goes through `chat -q`, and continuous mode adds `--yolo`;
  - `prepareAgentLaunch` checks the role file before anything is typed.

## Owner's decisions (2026-10-17)

1. **Scope:** Hermes only. OpenClaw is dropped.
2. **M1, the busy check:** fixed in this work, for all providers. It is provider-neutral, and both the "This terminal" offer and the close confirmation respect it. The tests include a Hermes pane and an Ollama pane. Per review m11 it is its own story (B) in this plan, so each story stays one slice; the decision itself is unchanged.
3. **M2, fish:** a separate bug story, ordered first (A). `shellQuote` becomes injection-safe in fish as well as sh, bash and zsh, for every provider's launch, with fish cases in the tests. Fish runs for real where it is available; otherwise a documented fallback applies.

## Scope

**In (A):**
- `src/lib/shellQuote.ts`, the one quoter.
- `agentCommand.ts` re-exports it. `contracts.ts` keeps its bare-word fast path and delegates the rest.
- `AntiSlopTab.tsx:29` and `ContractsWorkbench.tsx:145` move onto it.
- `ci.yml`'s frontend job installs `fish` and `zsh`.
- The tests, and one guide line.

**In (B):**
- `pty_foreground_job` (Tauri), which reports the foreground process's pid and name and classifies it.
- An async `paneBusy`, with a re-sample before it answers "busy".
- The picker treats the pane as busy until the check resolves, and re-checks before typing into "This terminal".
- All five close paths go through the confirmation: tab, pane, "Close others" and "to the right", and the command palette's Close Tab and Close Pane.

**In (C):**
- The Hermes provider: `Provider`, `PROVIDERS`, the `hermes` case, and `unsupported` on Windows.
- The Hermes-only role-file check and `.ade/rules.md` line.
- Tests that pin the picker, the rendered Settings default, Dispatch and the fleet lane.
- The guide and `README.md`.

**Non-goals:**
- **OpenClaw**: dropped by the owner on 2026-10-17. It gets no stories, touch points or ADR.
- Installing Hermes, updating it, or running `hermes setup`, `hermes model`, `hermes tools` or `hermes config set` on the user's behalf.
- Choosing the Hermes model or provider from ADE (open question 1).
- Cost or tokens on Hermes lanes, and Hermes sub-agent lanes.
- The orchestrator stays Claude-only (`OrchestratorTab.tsx:323`); its quoting is covered by A.
- Hermes's TUI, gateway, profiles and worktree mode, and launching Hermes on native Windows.
- Quoting for PowerShell (ADR 0008).
- Seeing inside tmux or screen: a pane whose foreground process is a multiplexer counts as busy.
- The marketing site (`docs/index.html`, open question 4).
- Any change to `relay/` or `mobile/`. In `src-tauri/`, only `pty_foreground_job` (B).

</frozen-after-approval>

## Verified facts

### Hermes (2026-10-17)

These were checked against the official repository `NousResearch/hermes-agent` (MIT; latest release v0.22.2, published 2026-10-15) and its docs site. Source paths are in that repository, read on `main` on 2026-10-17.

| Fact | Value | Source |
|---|---|---|
| Binary | `hermes` | [README](https://github.com/NousResearch/hermes-agent) |
| Install | `curl -fsSL https://hermes-agent.nousresearch.com/install.sh \| bash` (Linux, macOS, WSL2); `install.ps1` for native Windows; then `hermes setup` | [README](https://github.com/NousResearch/hermes-agent), [quickstart](https://hermes-agent.nousresearch.com/docs/getting-started/quickstart) |
| Install location | Code in `~/.hermes/hermes-agent`; the command is put on PATH through `~/.local/bin`, which the installer adds to the shell's rc file (fish included) | [`scripts/install.sh`](https://github.com/NousResearch/hermes-agent/blob/main/scripts/install.sh) lines 30, 97, 1060-1085 |
| Interface choice | Bare `hermes` and `hermes chat` start the **TUI** if `--tui` or `HERMES_TUI=1` is set, or, on a real TTY, if `display.interface: tui` is in the config; otherwise they start the classic CLI. **`--cli` wins over all of these.** `--cli`, `--tui` and `--yolo` are accepted before the subcommand and after `chat` | `hermes_cli/main.py:283-305` (`_wants_tui_early`), `hermes_cli/_parser.py:196-212, 307-323` |
| Opening prompt | `-q, --query` is defined **only on `chat`**. Its help reads: "On a real TTY the prompt seeds an interactive session (submitted literally as the first turn); combined with --oneshot or -Q, or on a non-TTY, it answers and exits." `--oneshot` is "the pre-0.21 single-query behavior" | `hermes_cli/_parser.py:228-236`; [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) |
| Skip approvals | `--yolo`, or `HERMES_YOLO_MODE=1` | [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands), [env vars](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/environment-variables.md) |
| Model | `-m, --model`, `--provider` (default `auto`), `HERMES_INFERENCE_MODEL`; in a session, `/model [provider:model]`; persistently, `hermes model` | [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) |
| System prompt | No flag. `HERMES_EPHEMERAL_SYSTEM_PROMPT` is documented as "Ephemeral system prompt injected at API-call time (never persisted to sessions)". The **classic CLI** reads it at `hermes_cli/cli_init_mixin.py:319`, and `agent/turn_context.py` appends it. **The TUI ignores it** (`tui_gateway/agent_factory.py:605-609`) | env vars doc line 855; source as cited |
| Precedence of that variable | It replaces the user's `display.personality` or `agent.system_prompt` overlay (`hermes_cli/personality.py:118-124`). `hermes config set` saves UPPER_SNAKE names to `~/.hermes/.env` (env vars doc, line 980). That file loads with `override=True` (`hermes_cli/env_loader.py:516`), so a value saved there replaces ADE's role without any message | source as cited |
| Project context | One file is read: the first that exists of `.hermes.md`/`HERMES.md`, `AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`. Files are scanned for prompt injection, and a match is blocked. There is no sign of `@path` import expansion (`agent/prompt_builder.py` reads `CLAUDE.md` as text) | [Context files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files); `agent/prompt_builder.py` |
| Config | `~/.hermes/config.yaml`, `~/.hermes/.env`, `HERMES_HOME` | [CLI reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands), env vars doc line 127 |

**Not confirmed:** the output format of `hermes --version`, which matters only for open question 3. On macOS, the name the OS reports for the Hermes process may be its Python interpreter rather than `hermes`; Story B's labels do not depend on it.

### Shell quoting

| Shell | Inside single quotes | Outside quotes | Source |
|---|---|---|---|
| sh, bash | Everything is literal; a single quote cannot appear | `\c` is a literal `c` | POSIX Shell Command Language §2.2 |
| zsh | Literal, but with `RC_QUOTES` set, `''` inside a quoted string is a literal `'` | `\c` is a literal `c` | zsh manual, "Quoting" and `RC_QUOTES` |
| fish | `\'` and `\\` are escapes; everything else is literal | `\'` and `\\` are literal `'` and `\` | [fish language docs](https://fishshell.com/docs/current/language.html), "Quotes" |
| fish versions | `VAR=value cmd` since 3.1; `"$(…)"` since 3.4.0 (2022-03-12) | | [fish docs](https://fishshell.com/docs/current/language.html), [3.4 release notes](https://fishshell.com/docs/3.4/relnotes.html) |

**The defect, shown:** today's `shellQuote("a\\'; touch X; #")` is `'a\'\''; touch X; #'`. In fish, that is the word `a''` followed by the command `touch X`.

**Where fish is available:** not on this machine (checked 2026-10-17), and not on CI today. Story A adds it to CI's frontend job, which is `ubuntu-latest`, with `apt-get install fish zsh`.

---

# Story A: fish-safe shell quoting (bug, every command ADE types)

## Code Map (A)

- `src/lib/agentCommand.ts:25-28` -- `shellQuote` (POSIX only), used at :51, :73, :130; re-imported by `OrchestratorTab.tsx:11,319`.
- `src/lib/contracts.ts:45-48` -- a second `shellQuote` with a bare-word fast path; used by `actionsFor` and `contractRunner.ts:14`.
- `src/components/AntiSlopTab.tsx:29` -- `"${marketplace.replace(/"/g, '\\"')}"`: double-quoted, so `$` and backticks in the path still expand.
- `src/components/ContractsWorkbench.tsx:145` -- `'^${contract}$'` and `'^${test}\\('` interpolated into single quotes unescaped. Test and contract names come from the project's source files.
- `src/lib/__tests__/agentCommand.test.ts:170-230`, `src/lib/__tests__/contracts.test.ts:102-107` -- existing quoting tests.
- `.github/workflows/ci.yml:16-41` -- the `frontend` job (`ubuntu-latest`, `npm test`).
- `docs/guide/agents.md` -- the guide line.

## Design Notes (A)

**The quoter** (`src/lib/shellQuote.ts`), as ADR 0008 decides:

```ts
/** A word that sh, bash, zsh (with or without RC_QUOTES) and fish all read as `value`. */
export function shellQuote(value: string): string {
  if (value === "") return "''";
  return value
    .split(/([\\'])/)
    .filter((part) => part !== "")
    .map((part) => (part === "'" ? "\\'" : part === "\\" ? "\\\\" : `'${part}'`))
    .join("");
}
```

- **Shape of the output.** Maximal runs without `'` or `\` are single-quoted, and each `'` and `\` is escaped outside quotes. Two quoted runs are never adjacent, and no backslash appears inside quotes.
- **Already checked.** The planner ran this against real `sh`, `bash`, `zsh` and `zsh -f -o RC_QUOTES` on 14 hostile values. All read back exactly, and nothing was executed.
- **Unchanged output.** Ordinary values quote exactly as before (`'it'\''s'`, `'/tmp/my proj'`). Callers keep collapsing control characters (`UNTYPEABLE`).

**Users:**
- `agentCommand.ts` re-exports `shellQuote`.
- `contracts.ts` keeps `/^[\w./-]+$/` as a bare word and otherwise returns `shellQuote(s)`.
- `AntiSlopTab.tsx` uses `shellQuote(marketplace)`.
- `ContractsWorkbench.tsx` uses `--match-contract ${shellQuote(`^${contract}$`)} --match-test ${shellQuote(`^${test}\\(`)}`. The shell passes forge the same regex as today.

**The tests** (`src/lib/__tests__/shellQuote.test.ts`).

*Corpus:*
- Fixed hostile strings: `'`, `''`, `\`, `\\`, `\'`, `a\'; touch X; #`, `$(touch X)`, `` `touch X` ``, `$HOME`, `"`, `;&|<>(){}*?[]~!#`, a space, a leading or trailing `'` or `\`, the empty string, and non-ASCII.
- Plus 500 strings generated with a fixed seed over `' \ " $ ` ( ) ; & | ! # ~ *`, a space, letters and digits.
- Control characters are excluded, because callers collapse them.

*Reference tokenizers (test-only):*
- They read **only** what the quoter emits: bare characters, single-quoted runs, and backslash escapes outside quotes, plus the operators `;`, `&&` and `|` and a `#` comment at word start.
- They do **not** model double quotes or `$( … )`. Story C's fallback relies on them for quoted words only.
- They return a token list (words and operators, comments dropped), or throw on an unterminated quote.
- There are three: `tokenizePosix` (sh, bash), `tokenizeZshRcQuotes` (POSIX, plus `''` inside quotes as `'`) and `tokenizeFish` (`\'` and `\\` escapes inside quotes).

*Checking the tokenizers themselves:*
- **Pinned cases where the shells disagree:** `'\\'` is `\\` in POSIX but `\` in fish. `'a\'b'` is unterminated in POSIX but `a'b` in fish. `'a''b'` is `ab` in POSIX but `a'b` under `RC_QUOTES`.
- **Against the real shells:** 300 strings are generated with a fixed seed from the tokenizers' own grammar (review R2). Fish has many more escapes outside quotes (`\a`, `\b`, a trailing backslash and others) than the tokenizers model, so free random text would fail on real fish for reasons that have nothing to do with the quoter. The grammar:
  - a sequence of words separated by single spaces;
  - each word a non-empty concatenation of plain characters from `a` and `b`;
  - single-quoted runs whose content is drawn from `a`, `b`, a space and `\`;
  - outside quotes, `\'` or `\\` only (a backslash only immediately before `'` or `\`, and never last);
  - adjacent runs allowed, so `''` and `\` before a closing quote occur.

  Each string runs through `bash --norc --noprofile -c 'printf "%s\0" <s>'`, `zsh -f [-o RC_QUOTES] -c …`, and `fish --no-config -c …` where fish exists. The real word list, or a syntax error, must equal that shell's tokenizer result. A `\` inside quotes, and `''`, are where the shells legitimately differ, so each shell is compared only with its own tokenizer. That checks the tokenizers against the shells themselves, within exactly the subset the quoter emits.

*Real shells:*
- For each corpus value, run `printf '%s' <quoted>` in a temp directory. Assert that stdout equals the value and that no file `X` was created.
- The shells run with no user config: `sh -c`, `bash --norc --noprofile -c`, `zsh -f -c`, `zsh -f -o RC_QUOTES -c` and `fish --no-config -c`.
- **RC_QUOTES must be enabled on the command line.** A `setopt RC_QUOTES` inside the `-c` string comes after the string has already been parsed.
- An in-test sanity check proves the option is on: `zsh -f -o RC_QUOTES -c "printf '%s' 'a''b'"` must print `a'b`.

*Availability:*
- On CI, `sh`, `bash`, `zsh` and `fish` are all required, so the real runs always happen there.
- Locally, a missing `zsh` or `fish` is skipped, and the test prints `<shell> not found: verified by the reference tokenizer only`.
- On CI (`process.env.CI`), a missing shell fails the test, so a broken install step cannot pass silently.

**CI** (`ci.yml`, `frontend` job): one step before "Unit tests", `sudo apt-get update && sudo apt-get install -y --no-install-recommends fish zsh`. `ubuntu-latest` (24.04) ships fish 3.7, which is above the 3.4 that Story C needs. The change is small and in DevOps's file; the DevOps owner reviews it with the story.

**Guide.** One line in `docs/guide/agents.md`: agent commands are quoted for sh, bash, zsh and fish, and fish needs 3.1 for DeepSeek's `VAR=value` prefix. Hermes's fish 3.4 requirement is Story C's.

## Acceptance Criteria (A)

1. For every corpus value v, `tokenizePosix`, `tokenizeZshRcQuotes` and `tokenizeFish` of `shellQuote(v)` each return exactly `[v]`. -- `shellQuote.test.ts` › "means the same word in sh, zsh with RC_QUOTES, and fish"
2. `shellQuote(v)` never has a `\` inside a quoted run, and never has two quoted runs side by side. -- › "keeps to the subset every shell reads the same way"
3. **The old quoter's injection is caught.**
   - The old quoter's output for `a\'; touch X; #` is the text `'a\'\''; touch X; #'`.
     - `tokenizeFish` of that text returns exactly `["a''", ";", "touch", "X", ";"]`: an injected command.
     - `tokenizePosix` returns exactly `["a\\'; touch X; #"]`: one word. Real `bash --norc` printed `[a\'; touch X; #]` for it on 2026-10-17.
   - Also pinned: `'\\'` gives `["\\\\"]` in POSIX and `["\\"]` in fish; `'a\'b'` throws in POSIX and gives `["a'b"]` in fish; `'a''b'` gives `["ab"]` in POSIX and `["a'b"]` under RC_QUOTES.
   - -- › "the reference tokenizers read each shell's quoting exactly"
4. On 300 seeded strings generated from the tokenizers' grammar (plain `a`, `b` and spaces; single-quoted runs; a backslash outside quotes only before `'` or `\`), each tokenizer agrees with its real shell: `bash --norc --noprofile`, `zsh -f` (with and without `-o RC_QUOTES`), and `fish --no-config` where present. Agreement means the same word list, or a syntax error in both. The three pinned divergence cases of AC 3 also run through the real shells. -- › "the reference tokenizers agree with the real shells"
5. Through real `sh`, `bash --norc --noprofile`, `zsh -f`, `zsh -f -o RC_QUOTES` (after the `'a''b'` → `a'b` sanity check passes) and `fish --no-config`, `printf '%s' <shellQuote(v)>` prints v and creates no `X`, for every corpus value. On CI, every one of those shells must be present. -- › "real shells print the value and run nothing"
6. Ordinary values are unchanged: `shellQuote("it's")` is `'it'\''s'`, and `shellQuote("/tmp/my proj")` is `'/tmp/my proj'`. The existing quoting tests pass without edits. -- › "ordinary values quote as before"; existing tests
7. **Every command ADE types is fish-safe.** For each builder below, the argument's quoted word read with `tokenizeFish` gives back the original value, for a value containing `\` and `'`:
   - the claude, deepseek and ollama launch commands;
   - the `cd` built by `contractRunner`;
   - the plugin install command in `AntiSlopTab`;
   - the trace command in `ContractsWorkbench` (both `--match-*` words; extract the builder into an exported function so it can be tested).
   - -- `agentCommand.test.ts` › "every provider's command is fish-safe"; `contracts.test.ts` › "contract commands are fish-safe"; `src/components/__tests__/commandQuoting.test.ts` › "the plugin and trace commands are fish-safe"
8. **There is one quoter.** A source scan of `src/` (excluding `__tests__`) finds no `.replace(/'/g` or `.replace(/"/g`, and, on lines that call `writePty(`, `runInNewTab(` or `runInNewTabPane(`, no `'` or `"` directly or nearly before `${` (regex `['"][^'"\s]*\$\{`). The only exceptions are an exempt list in the test, each with a reason: `src/lib/shellQuote.ts`; the `src/lib/bmadRuntime/` Python and TOML literals; and `compat.ts`'s HTML escaping. The scan fails on today's `AntiSlopTab.tsx:29` and `ContractsWorkbench.tsx:145`. -- › "there is one shell quoter"
9. `ci.yml`'s `frontend` job installs `fish` and `zsh` with `--no-install-recommends` before `npm test`. -- `scripts/ciShells.test.ts` › "CI runs the real shells"

## Verification (A)

**Commands (the repo's verification command, unchanged, run one after another):**
- `cd relay && cargo test` -- expected: all pass (no relay change)
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including `shellQuote.test.ts`. Locally, the output says whether real zsh and fish ran. On CI, all of them ran.
- `cd src-tauri && cargo test` -- expected: all pass (no Rust change)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (no mobile change)

**Also:** the CI run on the story's PR shows the `frontend` job installing fish and zsh, and `shellQuote.test.ts` running them. QA records the job link.

**Manual checks:**
- In fish, launch a Claude agent from the picker on a story whose file name contains `'`. The agent starts with the task intact.
- In the Anti-Slop tab, install the plugin from a home folder path containing a space. The command runs.

**Results (A):** to be filled in by QA.

---

# Story B: a provider-neutral busy check (all providers)

Independent of A and C, and testable without Hermes. C relies on it for busy Hermes panes.

## Why the obvious checks are not enough

- **The tracked session alone.** A tracked session ends at the first 3 s idle (`useTerminal.ts:63-91`), so an agent waiting at its prompt has none.
- **The foreground pgid against the shell's pid alone** (review N2):
  - an rc file that does `exec tmux` or `exec ssh` keeps the shell's pid, so the pane would read as idle;
  - a nested interactive shell at its prompt (`bash` typed in a zsh pane, `nix develop`) is a different pid, so the pane would read as busy;
  - a running shell script's foreground process is named `bash` or `sh`, so a rule based on the name alone would call it idle (review R1);
  - a prompt hook running an external command reads as busy for a moment.

So the decision uses the tracked session, the foreground process's pid and its name, and a second sample.

## Design Notes (B)

**`pty_foreground_job` (Tauri, `src-tauri/src/pty.rs`)** reads the foreground process group's leader, `inst.master.process_group_leader()`, which `get_pty_cwd` already uses at :277. It returns that process's classification, not raw data.
- **Facts read through sysinfo** (already a dependency): its pid; its `name()`; and its `cmd()` argv.
- **The command's answers:** `Unknown` when there is no foreground group, and `Err` on non-Unix.

**Names are normalised before any comparison** (review r3, r5). Both sysinfo's `name()` and the basename of `cmd()[0]` are candidates. Each one is:
- basename-only;
- lowercased;
- stripped of a leading `-` (a login shell);
- stripped of a leading `.` and a trailing `-wrapped` (nix wrappers, `.zsh-wrapped`).

A candidate **matches** a listed name when it is equal to it, or, if the candidate is exactly 15 characters, when the listed name starts with it. 15 characters is Linux's `comm` limit.

Using both candidates matters on macOS. There, sysinfo names Claude's process after its resolved executable (for example `2.1.301`), while `cmd()[0]` is `…/.local/bin/claude`.

The classification is a pure function, `classify(shell_pid, fg: Option<FgFacts>) -> Fg`, in Rust. Rows are checked in order:

| Foreground | Result |
|---|---|
| none | `Unknown` |
| a candidate is a multiplexer (`tmux screen zellij`) | `Busy(label)`: ADE cannot see inside, and typing into it reaches whatever runs there |
| a candidate is a known shell (`sh bash zsh fish dash ksh mksh tcsh csh nu elvish`) **and** `cmd()` is an interactive invocation: after the program, only options and their values (`-i`, `-l`, `--login`, `--norc`, `--noprofile`, `-f`, `-o X`, `--rcfile X`, `--init-file X`, `-C X` for fish), with no `-c` and no operand (review R1) | `Shell` (idle), same pid or nested |
| a known shell with `-c`, or with an operand such as a script path (`bash script.sh`, `sh -c 'sleep 5; true'`) | `Busy(label)`: a running script. On macOS, `/bin/sh` hands off to bash, so this is common |
| an empty or unreadable `cmd()` for a shell name | `Busy(label)`: the safe direction |
| anything else, including the shell's own pid with a non-shell name (`exec ssh`) | `Busy(label)` |

`label` is the normalised `cmd()[0]` basename when there is one, otherwise the normalised name. The command returns the classification; the frontend never compares pids or names itself, except for the label match below.

**`paneBusy(paneId): Promise<string | null>`** (`src/hooks/useTerminal.ts`). The decision is a pure function, `decideBusy`, in `src/lib/paneBusy.ts`, which takes injected samplers:
1. If the tracker has a running session for the pane, return its agent name.
2. Otherwise sample `pty_foreground_job`:
   - `Shell` → `null`.
   - `Busy(label)` → wait 250 ms, then sample again:
     - `Busy` again → the pane is busy. The re-sample filters out prompt hooks.
     - `Shell` → idle.
     - `Unknown`, or a rejected call (for example, the pane closed during the wait) → the text fallback below (review r6).
   - **The label** (review m8, r3) fits the dialog's sentence "This pane has a live X session":
     - It is the most recent tracker session's agent name when `binaryFor(session.provider)` matches the foreground's normalised name or its `cmd()[0]` basename. Rust returns both candidates with the `Busy` result for this purpose.
     - Otherwise it is the program's own label, for example "vim" ("a live vim session"). It is never a phrase that would read as "a live a running program session".
   - `Unknown` or a rejected call (Windows, no pty) → the old text heuristic, `hasActiveProcess`, kept only as this fallback.
   - **A second close during the wait.** A second <kbd>Cmd</kbd>+<kbd>W</kbd> during the 250 ms opens at most a second request for the same tab. If the first close goes through, the later `closeTab` on a missing id does nothing (`tabStore.ts:297-300`), so the overlap is harmless.

**Picker (`AgentPicker.tsx`):**
- `currentBusy` is state, initially `"checking"`. `launchItem` sets it from `await paneBusy(activePane)`.
- `canUseCurrent()` is false while the state is `"checking"` or names a process (review N4). So the render at :751 and the keys at :231-233 stay synchronous, and are safe while the check runs.
- `runAgent` (:182) re-checks `await paneBusy(activePane)` immediately before `writePty` when `where === "current"`. If the pane is busy, it sets `launchError` ("This terminal is running X. Choose New tab.") and types nothing. A disabled button's `onMouseEnter`, or Enter, can still select "current", so the check at the point of typing is what guarantees it.

**Close paths (five):**
- `App.tsx:345-370` `requestCloseTab`;
- `:373-387` `requestClosePane`;
- `:396-410` "Close others" and "to the right";
- `CommandPalette.tsx:88` Close Tab now dispatches `request-close-tab` with the active tab id, instead of calling `closeTab`;
- `CommandPalette.tsx:92-94` Close Pane dispatches a new `request-close-pane` event (`{ tabId, paneId }`), which `App.tsx` handles with `requestClosePane`, next to the `request-close-tab` listener.

Every one awaits `paneBusy`. The dialogs keep their wording ("a live X session").

**Guide.** One sentence in `docs/guide/agents.md` (Agent picker): a pane running any program, not only Claude, is never offered as "This terminal", and closing it asks first. A tmux or screen pane always counts as busy, and so do the prompts of wrappers that stay in the foreground (`sudo -s`, `poetry shell`, `xonsh`).

## Risks (B)

| Risk | Effect | Handling |
|---|---|---|
| `exec tmux` / `exec ssh` in the rc | Same pid as the shell | Judged by name: `Busy` (Rust test) |
| A nested shell at its prompt (`bash` typed in a zsh pane, `nix develop`) | Different pid | Judged by name and interactive argv: `Shell`, idle (Rust test). `nix develop` runs a plain `bash --rcfile <file>`, which the interactive-argv rule accepts |
| A script fed through stdin (`bash < script.sh`, `sh -s`) | Argv looks interactive (no operand, no `-c`), so it reads as idle while the script runs | Accepted and documented: rare in a terminal pane, and a running tracked session or the text fallback still catches agents. `-s` is not in the interactive option list, so `sh -s` with arguments after it reads as busy |
| Combined short flags (`zsh -il`, `bash -li`) | Without parsing they would read as busy | **Parsed in B:** a single-dash cluster of the no-value flags (`i`, `l`, `f`, `x`, `v`, `e`, `u`, `m`, `p`) is split letter by letter. A cluster containing `c` is `-c`. Value-taking flags (`-o`, `-C`) count only on their own. Covered by B-AC1 |
| A running shell script (`bash script.sh`, `sh -c '…'`, and macOS `/bin/sh`, which hands off to bash) | The name is a shell | `cmd()` has an operand or `-c`, so it is `Busy` (Rust tests) |
| Wrappers that stay in the foreground: `sudo -s` (sudo 1.9.14 and later runs the command in its own pty), `poetry shell` (poetry stays the foreground process), `xonsh` (runs as Python) | Their prompt reads as busy, not idle | The safe direction (asks before closing, offers New tab). Documented in the guide |
| A prompt hook runs an external command | Busy for a moment | Re-sampled after 250 ms (`paneBusy.test.ts`) |
| A shell without job control (`set +m`, some `sh` setups) | Children stay in the shell's process group, so a running command reads as `Shell` | Detected only by a running tracked session or the text fallback. ADE's panes start an interactive login shell, which has job control. Documented |
| A shell missing from the name list (an exotic shell) | Its prompt reads as busy | Safe direction (asks first, offers New tab). The list lives in one constant |
| tmux or screen | Always busy, even at an inner prompt | Accepted. Documented in the guide |
| sysinfo cannot read the name or argv | Nothing to judge by | Treated as `Busy`, labelled "unknown program": the safe direction |
| Linux truncates `comm` to 15 characters; macOS reports a resolved exe name (`2.1.301` for Claude) | Name matching misses | Names are normalised, `cmd()[0]` is a second candidate, and 15-character names match by prefix (B-AC1, B-AC3) |
| The 250 ms re-sample | The picker's "This terminal" enables a moment later; a close dialog appears a moment later | Accepted |

## Code Map (B)

- `src-tauri/src/pty.rs:269-283` -- `get_pty_cwd`, the model; tests at :505-540.
- `src-tauri/src/lib.rs:438` -- command registration.
- `src/hooks/useTerminal.ts:558-571,610` -- `hasActiveProcess` (fallback only); new `paneBusy` export.
- `src/lib/paneBusy.ts` (new) -- `decideBusy`.
- `src/stores/agentTrackerStore.ts:85` -- `getActiveSession`.
- `src/data/providers.ts:23` -- `binaryFor`, for the label.
- `src/App.tsx:345-410` and the `request-close-tab` listener.
- `src/components/CommandPalette.tsx:88,92-94`.
- `src/components/AgentPicker.tsx:170-205,231-233,751`.

## Acceptance Criteria (B)

1. **`classify` (Rust, pure).** Each case and its result:
   - no foreground → `Unknown`;
   - name `-zsh`, argv `["-zsh"]`, the shell's pid → `Shell`;
   - `bash`, argv `["bash", "--rcfile", "x", "-i"]`, another pid (a nested shell) → `Shell`;
   - `.zsh-wrapped`, argv `["/nix/store/…/zsh"]` → `Shell`;
   - `bash`, argv `["bash", "script.sh"]` → `Busy("bash")`;
   - `sh`, argv `["sh", "-c", "sleep 5; true"]` → `Busy("sh")`;
   - `zsh`, argv `["zsh", "-il"]`, and `bash`, argv `["bash", "-li"]` → `Shell` (combined flags parsed);
   - `sh`, argv `["sh", "-ic", "sleep 5"]` → `Busy` (a cluster containing `c`);
   - `bash` with an empty argv → `Busy`;
   - `tmux` with the shell's pid (exec'd) → `Busy("tmux")`;
   - `ssh` with the shell's pid → `Busy("ssh")`;
   - `vim` → `Busy("vim")`;
   - a 15-character truncated name `abcdefghijklmno` matches the listed `abcdefghijklmnopq`; a 14-character one does not match by prefix;
   - an empty name and argv → `Busy`, labelled "unknown program".
   - -- `pty.rs` tests › `classify_judges_by_name_argv_and_pid`
2. **Real ptys.** These tests are `#[cfg(unix)]`, because the Windows backend job runs `cargo test`. Each polls with a 10 s timeout, generous for macOS runners. Each case and its result:
   - `/bin/sh -i` at its prompt → `Shell`;
   - after `sleep 5` is written → `Busy("sleep")`;
   - after `sh -c 'sleep 5; true'` is written → `Busy`, labelled `sh`;
   - after `bash <tmp>/script.sh` is written (the script sleeps) → `Busy`, labelled `bash`;
   - `/bin/sh -c 'exec sleep 5'` as the pty's process (an exec'd process keeping the shell's pid) → `Busy("sleep")`;
   - `/bin/sh -i` running a nested `sh -i` at its prompt → `Shell`.
   - -- `pty.rs` tests › `reports_a_running_command`, `reports_a_running_shell_script`, `reports_an_execd_process`, `a_nested_shell_at_its_prompt_is_idle`
3. **`decideBusy`.**
   - A running tracked Hermes session → its agent name, without sampling.
   - A completed Ollama session, with two samples of `Busy("ollama")` → the Ollama session's agent name.
   - A completed Hermes session, with the foreground name `python3.12` and `cmd()[0]` `/usr/bin/python3.12` twice → the label `python3.12`, not the agent name, because neither matches `binaryFor("hermes")`. The dialog reads "a live python3.12 session".
   - **macOS-style Claude:** a completed Claude session, with name `2.1.301` and `cmd()[0]` `/Users/u/.local/bin/claude` → the Claude session's agent name, matched through `cmd()[0]`.
   - `Busy("git")` then `Shell` (a prompt hook) → `null`.
   - `Busy("vim")`, then a re-sample that rejects (the pane closed) → the fallback's result.
   - `Shell` → `null`.
   - `Unknown`, or a rejected first call → the fallback's result.
   - -- `src/lib/__tests__/paneBusy.test.ts` › "a pane is busy by tracked session or foreground program, for any provider", "a brief foreground program is not busy", "the agent is named only when it is the foreground program"
4. **Picker.**
   - While `paneBusy` is pending, "This terminal" is disabled, and <kbd>C</kbd> does nothing.
   - With the pane busy as a Hermes pane, and again as an Ollama pane, "New tab" is preselected, and "This terminal" stays disabled.
   - With `paneBusy` → `null`, "This terminal" is offered.
   - -- `AgentPicker.test.tsx` › "a busy or unchecked pane is never offered as This terminal, whatever the provider"
5. With the target forced to "current" (through `onMouseEnter` on the disabled option, then Enter), and `paneBusy` resolving busy at launch, `writePty` is never called, no tracker session starts, and the error is shown. -- `AgentPicker.test.tsx` › "Enter on This terminal over a busy pane types nothing"
6. **Close paths.** With `paneBusy` mocked busy (a Hermes pane in one case, an Ollama pane in another), each of the five paths shows "Active process running" and closes only on confirm:
   - closing a tab;
   - closing a pane;
   - "Close others";
   - the command palette's Close Tab;
   - the command palette's Close Pane.

   With `paneBusy` idle, each closes without a dialog.
   - -- `src/__tests__/closeConfirm.test.tsx` (new) › "every close path asks first when a pane runs any agent"
7. `CommandPalette` no longer calls `closeTab` or `closePane` directly. It dispatches `request-close-tab` and `request-close-pane`. -- `src/components/__tests__/CommandPalette.test.tsx` › "close actions go through the confirmation"
8. Outside `paneBusy`'s fallback, no code calls `hasActiveProcess(`. -- `paneBusy.test.ts` › "the text heuristic is only a fallback" (a source scan)

## Verification (B)

**Commands (the repo's verification command, unchanged, run one after another):**
- `cd relay && cargo test` -- expected: all pass (no relay change)
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including `paneBusy.test.ts`, `closeConfirm.test.tsx` and the new picker and palette cases
- `cd src-tauri && cargo test` -- expected: all pass, including the new `pty.rs` tests
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (no mobile change)

**Manual checks:**
- Each of these makes the pane busy: "This terminal" disabled, and closing the pane asks first.
  - An Ollama agent waiting at its prompt, well after its lane went idle.
  - `vim` in a plain pane.
  - A shell script that sleeps (`bash ./wait.sh`), and on macOS `sh -c 'sleep 30'`.
  - An rc that ends in `exec tmux`.
- Each of these is idle: "This terminal" offered, and the pane closes without a dialog.
  - `bash` started inside a zsh pane, sitting at its prompt.
  - An idle prompt with a slow prompt hook (for example, a git status prompt in a large repository).
- Close Tab and Close Pane from the command palette ask first over a running agent.

**Results (B):** to be filled in by QA.

---

# Story C: Hermes Agent as a provider

Depends on A (quoting and the fish tokenizer) and on B (busy Hermes panes).

## The launch command

```
test -s '<rolePath>' && HERMES_EPHEMERAL_SYSTEM_PROMPT="$(cat '<rolePath>')" hermes --cli[ --yolo] chat[ -q '<task>']
```

(The quoted words are A's `shellQuote` output; for ordinary values it is the plain form shown.)

- **`--cli` always.** It forces the classic CLI, the only interface that reads `HERMES_EPHEMERAL_SYSTEM_PROMPT`. Without it, a `display.interface: tui` or `HERMES_TUI=1` setting would drop the role silently.
- **`chat` before `-q`.** `-q` exists only on `chat`. `--cli` and `--yolo` go before it.
- **Role delivery.** `prepareAgentLaunch` writes the role markdown to an absolute `rolePath` before the command is typed (`agentLaunch.ts:52-55`). The shell reads it into the documented variable. The substitution's output is not parsed again, so the role text cannot inject syntax. Trailing newlines are dropped, which makes no difference to the prompt.
- **Missing role file.** It is caught twice:
  - **In the app:** `prepareAgentLaunch` checks the composed text is not blank and the written file exists (`path_exists`). If either check fails, it returns an error before anything is typed or tracked.
  - **In the shell:** `test -s … &&` is a second guard, which fails **silently**: the shell returns to its prompt, and Hermes never runs without its role.
- **Task and continuous mode.** `chat -q` takes the quoted task, after `UNTYPEABLE` runs are collapsed. Continuous mode adds `--yolo`, reached only through the picker's disclaimer.
- **No model, provider or key** goes in the command.
- **Shells.** sh, bash and zsh, and fish 3.4 or later (for `"$(…)"`).
- **Windows.** The pane shell is PowerShell (`src-tauri/src/platform.rs:52`), so the case returns `unsupported` when `opts.windows` is set. `prepareAgentLaunch` sets it from `onWindows()` (moved from `AgentStatusToggle.tsx:12` to `src/lib/platform.ts`). Known gap: the pill looks available on Windows, and the reason shows at launch.

## Security: what ADE will and won't do

**Will:**
- Detect `hermes` with the existing `check_command_exists` probe.
- Launch it only when the user chooses it in the picker or with Dispatch, with the composed role and the user's task.
- Add `--yolo` only after the continuous-mode disclaimer. With `--yolo`, Hermes runs shell commands without asking, as Claude Code does with `--dangerously-skip-permissions`.

**Won't:**
- **Install Hermes.** The installer is `curl … | bash`. It runs remote code, edits rc files and installs uv, Python and Node. ADE does not run it, offers no button for it and does not download it. The guide links the official page. There is no case for installing automatically.
- **Write Hermes's files.** ADE does not touch `~/.hermes/config.yaml`, `.env`, `SOUL.md`, skills, memory or profiles, and runs none of `hermes config set`, `setup`, `skills`, `claw migrate` or `update`.
- **Pass credentials.** No vault key is injected; Hermes reads its own `~/.hermes/.env`.
- **Vouch for Hermes's sandbox, skills or injection scanning.** The guide says Hermes runs commands under its own rules.

**Exposure the design accepts:** the role text sits in the Hermes process's environment (`ps eww`, same user). Role files hold no secrets, and the command never contains the role text.

## Risks (C)

| Risk | Effect | Handling |
|---|---|---|
| Hermes older than 0.21 | `chat -q` answers and exits | The guide states 0.21 or later (open question 3) |
| `HERMES_EPHEMERAL_SYSTEM_PROMPT` saved in `~/.hermes/.env` (for example by `hermes config set`) | That file loads with `override=True`, so the saved value replaces ADE's role without any message | The guide says so and says how to check. Manual check |
| The role replaces the user's Hermes personality | Their persona is gone in ADE sessions | Intended. Documented. Open question 2 |
| The user's config chooses the TUI | The role would be dropped | `--cli` is always passed (AC 1). Manual check |
| The probe and the pane see different PATHs | "Installed" in the picker but "command not found" in the pane, or the reverse | The guide notes it |
| Hermes cannot see the project's rules | The Done rule is unknown to the agent | The role text points to `.ade/rules.md` (AC 12). Manual check |
| A Hermes release changes the variable, `chat -q` or `--cli` | Launch breaks | Tests pin ADE's side. `hermes chat --help` is re-checked on upgrade |

## Code Map (C)

- `src/lib/agentCommand.ts:3,5-19,68-146` -- `Provider` gains `"hermes"`; `LaunchOptions` gains `windows?`; `case "hermes"`.
- `src/data/providers.ts:15-20` -- `{ id: "hermes", name: "Hermes", color: "#a78bfa" }`.
- `src/lib/agentLaunch.ts:21-58` -- Hermes-only: rules line, blank and `path_exists` checks, `windows`.
- `src/lib/platform.ts` (new) -- `onWindows()`.
- `src-tauri/src/lib.rs:377` -- the existing `path_exists` (no Rust change in C).
- `src/components/AgentPicker.tsx`, `src/components/SettingsPanel.tsx:882`, `src/components/board/BoardPanel.tsx:217,220`, `src/stores/fleetStore.ts:152,211` -- follow automatically.
- `docs/guide/agents.md:16,21,95`, `docs/guide/index.md:52-56`, `docs/guide/settings.md:37`, `README.md:35,91`.

## Design Notes (C)

**The case:**

```ts
case "hermes": {
  if (opts.windows) return { kind: "unsupported", reason: HERMES_WINDOWS_REASON };
  const yolo = opts.continuous ? " --yolo" : "";
  const task = opts.task ? ` -q ${shellQuote(opts.task.replace(UNTYPEABLE_RUNS, " "))}` : "";
  return {
    kind: "command",
    command: `test -s ${path} && HERMES_EPHEMERAL_SYSTEM_PROMPT="$(cat ${path})" hermes --cli${yolo} chat${task}`,
  };
}
```

- The comment cites the env var doc, `cli_init_mixin.py:319`, `_wants_tui_early` and `_parser.py:228-236`.
- `HERMES_WINDOWS_REASON` reads: "Hermes launches need a POSIX shell, and the Windows terminal runs PowerShell. Run Hermes in WSL."

**`prepareAgentLaunch`, Hermes only:**
- Append to `roleText`: "\n\nThis project's rules may be in `.ade/rules.md`. If that file exists, read it before you start and follow it. It defines when work is Done."
- If `roleText.trim()` is empty, return an error.
- After writing, if `invoke<boolean>("path_exists", { path: rolePath })` is false, return an error.
- Pass `windows: onWindows()`.
- Other providers are untouched.

**The entry's color.** `#a78bfa` measures at least 4.12:1 against bgPrimary, bgSecondary and bgTertiary of all nine themes (measured 2026-10-17). It is not an agent color, so ADR 0007 doesn't apply. Open question 5.

**Guide.**
- `agents.md`:
  - The Provider bullet adds Hermes.
  - A "Hermes" section covers:
    - the command, and why it uses `--cli` and `chat -q`;
    - the role variable, which replaces the user's personality;
    - that a value saved in `.env` wins over ADE's role, and how to check for one;
    - that ADE never installs Hermes or edits `~/.hermes`, with a link to the install page;
    - the requirements: Hermes 0.21 or later, **fish 3.4 or later** if fish, and no native Windows (use WSL);
    - that the model comes from `hermes model`;
    - that the install probe's PATH and the pane's PATH can differ.
  - The Continuous bullet names `--yolo`.
  - The cost line names Hermes.
- `index.md` and `settings.md` get one line each.
- `README.md:35,91` name Hermes.

**Contract.** None new. `Provider`, `PROVIDERS` and `LaunchOptions` only gain members.

## Acceptance Criteria (C)

Each criterion names the test that covers it. The developer writes the test first and sees it fail.

1. `buildLaunchCommand("hermes", "/r/a b.md")` returns `{ kind: "command", command: "test -s '/r/a b.md' && HERMES_EPHEMERAL_SYSTEM_PROMPT=\"$(cat '/r/a b.md')\" hermes --cli chat" }`. -- `src/lib/__tests__/agentCommand.test.ts` › "hermes gets its role through HERMES_EPHEMERAL_SYSTEM_PROMPT in the classic CLI"
2. With `{ continuous: true, task: "fix it's bug\n" }`, the command ends `hermes --cli --yolo chat -q 'fix it'\''s bug '`. Without `continuous`, `--yolo` is absent. -- `agentCommand.test.ts` › "hermes takes the task through chat -q and continuous mode through --yolo"
3. The role path appears only as `shellQuote(rolePath)`, in both `test -s` and `cat`. The command contains no role text. -- `agentCommand.test.ts` › "hermes quotes the role path in both places"
4. `supportsRoleDelivery("hermes")` is true, and `taskUnsupportedReason("hermes")` is null. -- `agentCommand.test.ts` › new cases
5. With `{ windows: true }`, the case returns `unsupported`, with a reason mentioning WSL. Other providers' results are unchanged by `windows`. -- `agentCommand.test.ts` › "hermes is unsupported on Windows"
6. `PROVIDERS` has exactly one `hermes` entry, named "Hermes", and `binaryFor("hermes")` is `"hermes"`. -- `src/data/__tests__/providers.test.ts` › "hermes probes as hermes"
7. **Picker.**
   - With `check_command_exists` resolving for `hermes`, the pill is shown without UNAVAILABLE or "(not installed)".
   - When the probe rejects it, the title says "(not installed)".
   - <kbd>Tab</kbd> reaches Hermes.
   - -- `src/components/__tests__/AgentPicker.test.tsx` › "offers Hermes when it is installed"
8. Launching a role with Hermes active (`path_exists` true, `paneBusy` idle) types a command containing `hermes --cli` and `chat`, and starts a tracker session with provider `"hermes"`. -- `AgentPicker.test.tsx` › "launches a role on Hermes"
9. Rendering `SettingsPanel` on the AI API tab shows a "Hermes" button under "Default agent provider". Clicking it sets `defaultProvider` to `"hermes"`. -- `src/components/__tests__/SettingsPanel.test.tsx` (new) › "offers Hermes as the default agent provider"
10. **Real shells.**
    - **Set-up:** a stand-in `hermes` on `PATH` records its argv and `$HERMES_EPHEMERAL_SYSTEM_PROMPT`. The role path contains `'`, `\`, `$`, a backtick, a space and `$(touch X)`. The role text contains the same characters plus `` `touch Y` ``. The task is `it's \ $HOME `touch Z` $(touch X)`.
    - **Shells:** `sh -c`, `bash --norc --noprofile -c`, `zsh -f -c`, and `fish --no-config -c` (required on CI, by Story A).
    - **Expect:**
      - argv is exactly `--cli`, `chat`, `-q`, the task;
      - the variable equals the file without trailing newlines;
      - none of X, Y or Z exists.
    - **Failure path:** with the file removed, the stand-in never runs.
    - **Locally, without fish:** the fallback covers **only the quoted words**. `tokenizeFish(shellQuote(rolePath))` and `tokenizeFish(shellQuote(task))` give back the originals. The command's unquoted structure (`test -s`, `&&`, `VAR="$(cat …)"`, `hermes --cli`, `chat`, `-q`) is pinned exactly by AC 1 and AC 2. The test logs that real fish did not run.
    - -- `src/lib/__tests__/hermesShell.test.ts` › "the hermes command passes argv and role exactly, and runs nothing from them"
11. **`prepareAgentLaunch` for Hermes.**
    - When `path_exists` returns false, it returns `{ ok: false }` with an error naming the role file.
    - When the role is blank, it returns `{ ok: false }` without writing.
    - In both cases, `dispatchAgent` types nothing and starts no session.
    - For `claude`, `path_exists` is never invoked.
    - -- `src/lib/__tests__/agentLaunch.test.ts` › "a hermes launch stops before typing when the role file is missing", "only hermes checks the role file"
12. The Hermes role file ends with the `.ade/rules.md` line, and the claude one does not contain it. -- `agentLaunch.test.ts` › "hermes is told where the project rules are"
13. Board Dispatch with `defaultProvider` `"hermes"` is enabled. -- `src/components/__tests__/BoardPanel.test.tsx` › "enables Dispatch when the default provider is hermes"
14. A Hermes lane has `provider: "hermes"` and its `roleId`. `withUsage` leaves its cost and tokens null, even beside Claude sessions in the same folder. -- `src/stores/__tests__/fleetStore.test.ts` › "a Hermes lane shows no cost"

## Verification (C)

**Commands (the repo's verification command, unchanged, run one after another):**
- `cd relay && cargo test` -- expected: all pass (no relay change)
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all files pass, including `hermesShell.test.ts`, `SettingsPanel.test.tsx` and the new cases above. On CI, `hermesShell.test.ts` ran real fish.
- `cd src-tauri && cargo test` -- expected: all pass (no Rust change in C)
- `cd mobile && npx tsc --noEmit && npx jest` -- expected: all pass (no mobile change)

**Manual checks (owner, with Hermes 0.21 or later installed and set up through `hermes setup`):**
- **Flags:** `hermes chat --help` lists `-q/--query`, `--cli` and `--yolo`, and `hermes --help` does not list `-q`.
- **Picker:** the Hermes pill is enabled. Without Hermes, it reads "(not installed)".
- **Role:**
  - Launch the Architect role on Hermes. Ask "What is your role and what files do you own?" The answer matches the Architect role.
  - Ask "When is a story Done?" The answer names the verification command.
  - Confirm no `[BLOCKED: CLAUDE.md …]` line appeared.
- **TUI config:** set `display.interface: tui` (or `HERMES_TUI=1`) and launch again. The classic CLI starts, with the role. Remove the setting.
- **`.env` override:** `hermes config set HERMES_EPHEMERAL_SYSTEM_PROMPT "You are a pirate."`, then launch. Hermes answers as a pirate, which confirms the documented risk. Remove the line from `~/.hermes/.env`.
- **Dispatch:** with Hermes as the default provider, Dispatch a story. The session opens with the story path as its first turn and stays interactive afterwards.
- **Continuous:** the typed command contains `--yolo` before `chat`.
- **Busy (with Story B):** while Hermes waits at its prompt, "This terminal" is disabled, and closing the pane asks first.
- **Fleet:** the Hermes lane shows running while it produces output, with no cost. It turns completed at the first ~3 s idle period, the same as every provider.
- **Missing role file:** make `~/.ade/roles/` read-only and launch. The picker shows the error, and nothing is typed. Restore the permissions.
- **fish:** in fish 3.4 or later, launch Hermes with a task containing `'` and `\`. It starts with the task intact.

**Results (C):** to be filled in by QA.

---

## Open Questions (owner)

All six were answered by the owner on 2026-10-17, as recommended, when the plan was approved.

1. **Model choice.** ADE leaves the model to Hermes's configuration. Should it add a "Hermes model" Settings field that passes `-m`? **Answered (owner, 2026-10-17): no.** There is no model setting and no Story D.
2. **Personality override.** ADE's role replaces the user's Hermes personality in ADE-launched sessions. Is that acceptable? **Answered: yes, accepted.**
3. **Old Hermes.** Should ADE probe `hermes --version` and refuse versions before 0.21? **Answered: no probe.** The guide documents that Hermes 0.21 or later is required.
4. **Website.** Should Hermes be added to `docs/index.html` (lines 4 and 575)? **Answered: in a later story, not this plan.**
5. **Pill color.** Is `#a78bfa` acceptable for the Hermes pill? **Answered: yes, `#a78bfa`.**
6. **ADR 0008.** Accept it with the plan? It binds every future command builder. **Answered: accepted.**

## Review Triage Log

- 2026-10-17, adversarial review of the first draft: BLOCKED. Fixed in revision 1:
  - **B1:** `-q` exists only on `chat`. The command is now `hermes --cli[ --yolo] chat[ -q …]`, and the facts table is corrected.
  - **B2:** the TUI ignores the variable. `--cli` is always passed, with a manual TUI-config check.
  - **M3:** `prepareAgentLaunch` checks the role text and file before typing. The shell guard is described as silent.
  - **M4:** the real-shell test with a stand-in `hermes`, plus `hermes chat --help`.
  - **m1:** `unsupported` on Windows.
  - **m2:** the `.env` risk is reworded, with a manual check.
  - **m3:** `SettingsPanel` is rendered.
  - **m4:** lanes complete on idle output.
  - **m5:** the role text points to `.ade/rules.md`, with Done-rule and `CLAUDE.md`-block checks.
  - **m6:** the PATH caveat.
  - **M1** and **M2** went to the owner.
- 2026-10-17, owner's decisions on M1 and M2. Applied in revision 2:
  - **M2:** a separate bug story, ordered first, recorded as ADR 0008 (Proposed). It is one quoter, with real shells plus reference tokenizers.
  - **M1:** a provider-neutral busy check for all providers, with Hermes and Ollama pane tests. The tracked session alone misses agents waiting at their prompt, so the foreground process was added.
  - The placeholders were removed.
- 2026-10-17, second review: PASS after fixes. Applied in revision 3:
  - **N1:** zsh with RC_QUOTES runs as `zsh -f -o RC_QUOTES -c`, with an in-test `'a''b'` → `a'b` sanity check. Every shell runs without user config: `bash --norc --noprofile`, `zsh -f`, `fish --no-config` (A-AC5, C-AC10).
  - **N2:** the foreground is judged by name as well as pid:
    - a known interactive shell, same pid or nested, is idle;
    - tmux, screen and zellij are busy;
    - a non-shell name on the shell's pid (exec'd) is busy;
    - a busy sample is re-taken after 250 ms.
    - Rust tests were added for an exec'd process and a nested shell (B-AC1, B-AC2), and a prompt-hook case to `decideBusy` (B-AC3). These cases are in Risks (B).
  - **N3:** five close paths. The command palette's Close Tab and Close Pane go through `request-close-tab` and a new `request-close-pane` (B-AC6, B-AC7).
  - **N4:**
    - the pane is treated as busy until `paneBusy` resolves;
    - `runAgent` re-checks right before `writePty` for "current" and refuses if busy;
    - an AC covers Enter on a busy "This terminal" (B-AC4, B-AC5).
  - **N5:**
    - Story C's fish fallback is limited to the quoted words. The tokenizers model only what the quoter emits.
    - A-AC3 pins exact tokens, including `'\\'`, `'a\'b'` and `'a''b'`, where the shells differ.
    - A-AC4 checks the tokenizers against real bash, zsh and fish on random input.
    - CI's `frontend` job installs `fish` and `zsh` (A-AC9), so CI runs real fish, and a missing shell on CI fails.
  - **m7:** `AntiSlopTab.tsx:29` and `ContractsWorkbench.tsx:145` move onto the shared quoter. A-AC8's scan catches both patterns (`.replace(/"/g`, and quotes wrapping `${` on command-typing lines). ADR 0008 lists them.
  - **m8:** the busy dialog names the agent only when the tracker's provider binary matches the foreground name; otherwise the label is generic (B-AC3).
  - **m9:** shells without job control are in Risks (B).
  - **m10:** Hermes's fish 3.4 line moved from Story A's guide line to Story C.
  - **m11:** the busy check is its own Story B. Hermes is Story C, which depends on A and B. Intent, Scope and the owner's decision 2 were updated to match.
- 2026-10-17, final review: PASS after fixes. Applied in revision 4:
  - **R1:** a shell name is `Shell` only when `cmd()` is an interactive invocation: options and their values only, with no `-c` and no operand. A shell running `-c` or a script is `Busy`. `bash script.sh` and `sh -c 'sleep 5; true'` cases were added to B-AC1 and B-AC2, and running shell scripts are in Risks (B).
  - **R2:** A-AC4's random strings are generated from the tokenizers' own grammar: `a`, `b` and spaces; single-quoted runs; outside quotes, a backslash only before `'` or `\`. Fish's other escapes (`\a`, `\b`, a trailing backslash) are outside what the quoter emits. The three pinned divergence cases are kept and also run through the real shells.
  - **r3:** `cmd()[0]`'s basename is a second name candidate, so macOS's resolved-exe name for Claude (`2.1.301`) still matches. The generic label is the program's own name, so the dialog reads "a live vim session". A macOS-style Claude case was added to B-AC3.
  - **r4:** Risks corrected: `sudo -s` (sudo 1.9.14 and later, own pty), `poetry shell` (poetry stays in the foreground) and `xonsh` (Python) read as busy. `xonsh` was removed from the shell list. The "why not enough" examples were updated.
  - **r5:** names are normalised: basename, lowercase, leading `-` and `.` stripped, trailing `-wrapped` stripped. A 15-character name matches by prefix, for Linux's `comm` limit (B-AC1).
  - **r6:** a re-sample that returns `Unknown` or fails falls back to the text match (B-AC3). A second close during the wait is harmless, because `closeTab` on a missing id does nothing (`tabStore.ts:297-300`).
  - **r7:** B's real-pty Rust tests are `#[cfg(unix)]`, because the Windows backend job runs `cargo test`, and they poll with 10 s timeouts for macOS runners (B-AC2).
  - **r8:** the CI step uses `--no-install-recommends` (A-AC9). `ubuntu-latest` ships fish 3.7.
- 2026-10-17, **plan approved by the owner**. Open questions 1 to 6 answered as recommended. ADR 0008 accepted. Build order: A and B in parallel, then C. The final review's two minors were applied at approval:
  - a script fed through stdin (`bash < script.sh`, `sh -s`) reads as idle: accepted and documented in Risks (B);
  - combined short flags (`zsh -il`, `bash -li`) are parsed in B rather than noted, with a cluster containing `c` treated as `-c` (B-AC1).

  Also corrected: `nix develop` runs a plain `bash --rcfile`, not a `-wrapped` bash.

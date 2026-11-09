---
title: "ade open -- COMMAND: typing the command into the new shell"
ticket: 9
status: ready-for-dev
---

# Story 9: ade open -- COMMAND: typing the command into the new shell

Ticket 9 in `tickets.toml`, in this folder. It refines the entry of 2026-11-02 for build on 2026-11-09. This file holds the build plan and the acceptance criteria; QA's Verification section is at the end and stays empty until QA runs it.

**Not yet buildable.** The entry's `unknown` holds it blocked until the owner answers two questions (see "Status and blockers"). The criteria below are final for those answers' recommended options.

## Goal

`"$ADE_HOOK_BIN" open [--cwd DIR] [--name NAME] [--focus] -- COMMAND [ARG...]` adds a sub-terminal to the caller's tab, creates its shell, and types `COMMAND` into that shell with Enter, once the shell's line editor is ready. The caller's session keeps running. If the command cannot be typed, the shell is left alone, the CLI exits 5, and the sub-terminal shows a notice with the masked command and an **Insert command** button.

Story 4a answers `command` with 422 "not supported yet". This story removes that answer, and story 4c's CLI test for it. Everything else in the contract for `command` is added here.

## Status and blockers (checked 2026-11-09)

Checked against GitHub and the branches. Nothing below is merged to `main` except the items marked **on main**.

| Item | State | Consequence |
|---|---|---|
| Story 4a (`st4a-open-endpoint`, commit 25cd1c1) | PR #96 **open**, stacked on #95 (merged) | Not on main. Needed. |
| Story 4c (`st4c-open-cli`, commit 26b0dc8, contains 4a) | PR #97 **open**, stacked on #96 | Not on main. Needed. Its head is the 4a+4c stack. |
| `feat/cli-guard` (head b2c8130) | PR #94 **open** (the merge commit c6e4ad1 brings it up to date with main) | Not on main. Needed for `pty_line_editor_ready`, the PTY writer thread and the guard. |
| `hermes-a-quoting` (head 8b06ea4, "Fish-safe shell quoting") | on `origin`, **not on main** | See the next row. |
| `shellQuote` on main | **Does not satisfy ADR 0008 or D9.** | See below. |
| `hermes-b-busy-panes` (`paneBusy`, `pty_foreground_job`) | **on main** (`src/lib/paneBusy.ts`, `pty_foreground_job` in `pty.rs`, `.ade/context/pane-busy.md`) | Not a blocker. Insert command uses it. |

### The quoter (the owner's question)

`shellQuote` on main exists in two places, both the old form: `src/lib/agentCommand.ts:26` and `src/lib/contracts.ts:46`. Each is `'…'` with `'` written as `'\''`. ADR 0008 (`.ade/context/decisions/0008-one-shell-quoter-safe-in-posix-shells-and-fish.md`, Accepted on main) says this form is **unsafe in fish**: inside fish single quotes `\'` and `\\` are escapes, so a value with a backslash before a quote can end the string early. So the main copy does not satisfy "shellQuote, ADR 0008, D9".

What is missing on main, all of it on `origin/hermes-a-quoting` at 8b06ea4:

- `src/lib/shellQuote.ts`: the fish-safe quoter (ADR 0008's rule: maximal runs wrapped in `'…'`, each `'` and `\` escaped outside quotes, `''` for the empty string).
- `src/lib/__tests__/shellQuote.test.ts` (runs real `sh` and `bash`, and `zsh` and `fish` when present, plus reference tokenizers) and its helper `src/lib/__tests__/shellTokenize.ts`.
- The migration of `agentCommand.ts`, `contracts.ts`, `AntiSlopTab.tsx` and `ContractsWorkbench.tsx` to that one quoter, and the source-scan test that bans hand-rolled quotes (`commandQuoting.test.ts`). That migration belongs to Hermes, not to this story.

Trial merges (`git merge-tree`, run 2026-11-09):

- `main` with `hermes-a-quoting`: conflicts only in `.ade/knowledge/developer.md` (append-only; keep both).
- `feat/cli-guard` with `hermes-a-quoting`: **conflicts in `src/lib/agentCommand.ts` and its test.** Both branches change the agent-launch quoting code. This is the real conflict between them, and it is not this story's to resolve.

**Recommended route (D9, second option, owner ruling needed):** cherry-pick the three new files (`shellQuote.ts`, `shellQuote.test.ts`, `shellTokenize.ts`) unchanged. They are self-contained (their only imports are Node builtins and each other), and none of the three exists on main or on `feat/cli-guard`, so the cherry-pick conflicts with nothing. Leave `agentCommand.ts` and `contracts.ts` alone. This story then has the one fish-safe quoter that ADR 0008 asks for, used by the new window code, and the old copies stay until `hermes-a-quoting` lands. The agent-launch migration remains Hermes's. If the owner prefers to wait instead, this story waits for `hermes-a-quoting` to merge and resolves its conflict with `feat/cli-guard` first.

### The build base (the owner's request)

An integration of `origin/st4c-open-cli` and `origin/feat/cli-guard`. A trial merge (`git merge-tree`) shows three conflicts, all already described in the merge notes of #96 and #97:

1. `src-tauri/src/pty.rs`: `create_pty` and the test literals. Keep `feat/cli-guard`'s `PtyInstance::new(id, child, master, pid, sink)` (with `let mut instance`), set `owner`, `request_id` and `opened_by_open` after construction, as 4a does (#96 merge notes 1 to 4).
2. `src-tauri/ade-hook/src/main.rs`: the dispatch order is `guard` first (`cli_guard::main`), then `mode()` (`Mode::Cli => std::process::exit(ade_cli::main(`), then the hook (`Mode::Hook => hook_forward::main()`). #97 says a test checks the two `mode()` lines. Keep the `#[path]` includes from both.
3. `.ade/knowledge/developer.md`: append-only, keep both.

Everything else merges clean. `lib.rs` merges clean (both add `mod` lines; keep both).

Build order: first, the integration (the three conflicts above, one merge commit, verification run once on the integration before any story code). Second, the cherry-pick of the three quoter files, if the owner takes the recommended route. Third, the criteria in test-first order. When #94, #96 and #97 reach main, the base collapses into main and the Dev rebases the story onto it.

## Sources (read these, not the owner's checkout)

- `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`: "What you see" (the flags, `--name`, `--focus`, `-- COMMAND`, the exit table), "Backend" (sections "Typing (story 9, R2)", "Quoting", "Known typing failures", "Deadline", "Refusals", "Limits"), "Busy check (R1)" (the Insert command rule), "The guard and `ade open` (story 9, amends ADR 0011)", and "Testing" (the Typing and guard bullets).
- `docs/superpowers/specs/2026-11-02-sub-terminals-ux.md`: "Starting" (the spinner, only when a command was given), "Command not typed" and the notice under "Notices inside a sub-terminal's view" (masked line, Insert command, disabled titles), "Accessibility" (the announcement "npm: command not typed"), and the state table row for the not-typed notice.
- `.ade/context/terminal-open.md`: the request and the answers table (the `command` rule, 200 `typed:false`, 504), the `OpenMessage` union (`{typed}`), "Typing" and "Insert command", and the window's answer with `line`.
- `.ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`: the decision record for typing.
- `.ade/context/decisions/0008-one-shell-quoter-safe-in-posix-shells-and-fish.md` (on main): the quoter rule.
- `.ade/context/pane-busy.md` and `src/lib/paneBusy.ts` (on main): the busy check that Insert command uses.
- Branch code, as named in "Status and blockers": `feat/cli-guard` `src-tauri/src/pty.rs` (`pty_line_editor_ready`, `line_editor_ready`, the writer thread, its `real_pty` and `line_editor_tests` helpers), `src-tauri/src/cli_guard/` (`resolve.rs`, `tables.rs`, `mod.rs`), `.ade/context/decisions/0011-cli-library-guarded-by-a-command-hook.md`; `st4c-open-cli` `src-tauri/src/terminal_open.rs` and `src-tauri/src/ade_cli.rs`; `origin/hermes-a-quoting` `src/lib/shellQuote.ts` and its tests.
- The 4a and 4c plans in this folder: the window and endpoint this story extends, and the CLI it changes.

## Acceptance criteria

Each criterion is one or more named tests. Write the test first, watch it fail, then write the minimal code. Criteria T1 to T9 are the entry's criteria (1) to (9), in order. H1 to H3 are the new end-to-end criteria that the owner asked for, and the harness is described under "Automated end-to-end harness".

**T1 (entry 1). Typing waits for the line editor (R2).** `terminal_open.rs` polls `line_editor_ready` for the new shell's PTY every 50 ms (`feat/cli-guard`'s `line_editor_ready(master, shell pid)`, made `pub(crate)` if needed). It types after two `true` answers in a row. It gives up 5 s after the window's answer. Giving up is `typed:false` with why "the shell's line editor didn't start". The probe, the clock and the sleep are injected. The line is sent through the new `PtyInstance`'s `input` channel to its writer thread, never a blocking write.
  - `types_only_after_two_ready_answers_in_a_row` (probe `false, true, false, true, true`: the write happens on the fifth poll, and only once).
  - `not_ready_for_five_seconds_gives_typed_false` (probe always `false`; the answer is `typed:false` with the stated why, at 5 s on the injected clock).
  - `a_shell_that_exits_first_gives_typed_false` (probe returns `None`; why "the shell exited before the command was typed").
  - `a_terminal_that_never_reads_does_not_block_the_answer` (real PTY whose child never reads; the `/open` answer arrives inside the budget).
  - `a_5000_byte_line_arrives_whole` (real PTY: the line is 5,000 bytes, and the shell receives all of it; reuses `feat/cli-guard`'s `real_pty` helper).
  - `a_shell_that_never_prompts_gives_typed_false` (real PTY: the shell is `sh -c 'exec sleep 30'`, which is canonical and in the foreground, so it never becomes ready; after 5 s the answer is `typed:false`). This is the known failure in "Known typing failures" of the spec, made deterministic. It does not depend on `dash`, which is absent on macOS.

**T2 (entry 2). Quoting and limits.** The window builds the line from the words with `shellQuote` from `src/lib/shellQuote.ts`, and leaves a word bare when it matches `^[\w./-]+$`. Words must be printable ASCII, 1 to 64 words, each non-empty. The typed line is at most 4096 bytes. Rust refuses a bad command at `/open` (422), before the window sees it, and re-checks the `line` the window sends.
  - `src/lib/__tests__/shellQuote.test.ts` (cherry-picked unchanged; its real-shell cases are the proof of the quoter, per ADR 0008). Under the recommended route, this is the first commit of the story, and the Dev says so in the Verification section.
  - `src/lib/__tests__/terminalOpen.test.ts` `the_line_quotes_each_word_with_shellQuote_except_bare_words` (`["npm","run","dev"]` gives `npm run dev`; `["sh","-c","echo 'a b'; ls"]` gives the quoted form).
  - `src/lib/__tests__/terminalOpen.test.ts` `a_word_with_a_quote_or_backslash_is_one_word_in_sh_and_fish` (the line is tokenised with `shellTokenize`, as `shellQuote.test.ts` does, and equals the words).
  - `terminal_open.rs` `a_non_ascii_or_control_word_is_422`; `more_than_64_words_is_422`; `an_empty_word_is_422`; `a_command_line_over_4096_bytes_is_422`.
  - `terminal_open.rs` `a_line_that_fails_the_recheck_is_not_typed` (the window sends a line with a control byte; the answer is `typed:false`, and nothing is written).

**T3 (entry 3). Shell allowlist and no-line-editor shells.** Rust refuses a command unless the new shell's basename is `sh`, `bash`, `zsh`, `fish`, `dash` or `ksh` (422, checked at admit, before any bucket token is spent). A shell with no line editor (`dash`, `ksh` without emacs or vi) never becomes ready, so it is `typed:false`, which T1 covers without a shell name. The shell's basename is kept on the sub-terminal's instance at creation, so the notice can name the shell (T6).
  - `terminal_open.rs` `a_shell_outside_the_allowlist_is_422_and_types_nothing` (an injected default shell of `/bin/tcsh`).
  - `terminal_open.rs` `the_allowlist_accepts_each_listed_basename` (six cases, injected).
  - `pty.rs` `the_shell_basename_is_kept_on_the_instance` (a test of the new field set at creation; the window's Insert command reads it).

**T4 (entry 4). Not typed.** A command that cannot be typed leaves the shell alone and answers 200 `{"ok":true,"typed":false,"why":...}`. The window gets `{typed: requestId, ok: false, why}`. The CLI exits 5 and prints `ade: opened, but the command wasn't typed: <why>` on stderr. Its exit 0 path is unchanged.
  - `ade_cli.rs` `exit_5_when_opened_but_not_typed` (listener answers `typed:false`; exit 5; stderr names the why).
  - `ade_cli.rs` `typed_true_prints_nothing_and_exits_0` (regression for C2's exit 0 with the command present).
  - `terminal_open.rs` `typed_false_is_200_and_the_window_gets_typed` (the `typed` message is sent once, with the request id).
  - `src/lib/__tests__/terminalOpen.test.ts` `typed_false_sets_the_entry_to_not_typed_with_the_why` (the entry's status changes; the why is kept in memory only).

**T5 (entry 5). Deadline.** The window's answer starts a fresh 5 s budget for typing, so the worst case from request to `/open` answer is about 10 s. ADE answers within 11 s. Expiry before the window answers types nothing (4a's `expired` rule is unchanged).
  - `terminal_open.rs` `the_typing_budget_starts_at_the_windows_answer` (injected clock: window answers at 4.9 s of a 5 s request budget; typing gives up 5 s later; the answer is at 9.9 s, under 11 s).
  - `terminal_open.rs` `a_window_answer_after_expiry_types_nothing` (regression for 4a's late-answer rule, with the command present).

**T6 (entry 6). Insert command and the notice.** A not-typed sub-terminal shows a notice inside its view (a bar above the terminal, not a modal) reading "The command (`<first word> …`) wasn't typed: <why>." It shows only the first word and `…`, never the full line (the masked-line rule). **Insert command** puts the full quoted line at the prompt without Enter, from memory only. It is enabled only when `paneBusy(paneId)` is null for the pane **and** `pty_line_editor_ready` is true for its PTY. Both are checked again on click; if either fails, nothing is written and the button is disabled again. Disabled titles: "Available once the shell is back at its prompt" (busy, or not yet ready) and "This shell has no line editor; type the command yourself" (basename `dash`, or `ksh` without editing, from T3's field).
  - `src/components/__tests__/SubTerminalNotice.test.tsx` (new) `the_notice_shows_only_the_first_word_and_an_ellipsis`.
  - `SubTerminalNotice.test.tsx` `insert_is_disabled_while_paneBusy_names_a_program` (with a busy `paneBusy` mock, title "Available once the shell is back at its prompt").
  - `SubTerminalNotice.test.tsx` `insert_is_disabled_while_the_line_editor_is_not_ready` (a `read -s` prompt is simulated by `pty_line_editor_ready` false).
  - `SubTerminalNotice.test.tsx` `insert_is_disabled_for_dash_with_its_own_title` (basename `dash`).
  - `SubTerminalNotice.test.tsx` `insert_rechecks_both_on_click_and_writes_nothing_if_either_fails` (the mock turns busy between render and click: no `write_pty`).
  - `SubTerminalNotice.test.tsx` `insert_writes_the_full_quoted_line_without_enter` (the written bytes equal the quoted line, with no `\r`).

**T7 (entry 7). The guard resolves `"$ADE_HOOK_BIN"` and sees through `ade open` (ADR 0011 amendment).** On `feat/cli-guard`, `cli_guard/resolve.rs` and `tables.rs` resolve `"$ADE_HOOK_BIN"` (also `$ADE_HOOK_BIN` and `${ADE_HOOK_BIN}`) to the helper, unless the line assigns `ADE_HOOK_BIN`. With the verb `open`, the words after `--` are classified as the command, as a runner is. `ade open` with no `--` is not guarded. The verb constant is one value that the guard's test enumerates (P6(b)). `guard` and hook mode are unchanged. The amendment is written into `.ade/context/decisions/0011-cli-library-guarded-by-a-command-hook.md` as an amendment note.
  - `cli_guard` `open_double_dash_gh_repo_delete_asks_as_the_bare_line_does` (`"$ADE_HOOK_BIN" open -- gh repo delete o/r` asks).
  - `cli_guard` `open_with_name_and_no_double_dash_does_not_ask` (`"$ADE_HOOK_BIN" open --name x` does not ask).
  - `cli_guard` `a_line_that_assigns_ade_hook_bin_still_asks` (`ADE_HOOK_BIN=/x "$ADE_HOOK_BIN" open -- gh repo delete o/r` asks, as the spec's assignment rule says).
  - `cli_guard` `the_ade_verbs_are_enumerated` (the constant lists `open`, and the test fails if a verb is added without a test row).
  - `cli_guard` `guard_and_hook_mode_are_unchanged` (the existing guard tests pass unchanged).

**T8 (entry 8). Guide entry (R6).** The guide's terminals page (`docs/guide/agents.md` or `docs/guide/index.md`; the Dev names which, and it must describe sub-terminals) gains a section "Opening terminals from a terminal" that says: a typed command runs after the user's rc files and through their aliases and functions, which the guard cannot see; to pass a secret, expand it inside the new terminal (D3). It is documentation, not a question asked of the user (D1 stands).
  - `src/lib/__tests__/guideOpen.test.ts` `the_guide_documents_aliases_and_secrets` (the heading exists, and its text mentions "alias", "rc" and "secret").

**T9 (entry 9). The spinner clears when the typed result arrives.** A request with a command shows the sub-terminal's spinner (10 px, `--text-secondary`, title "Starting: typing the command"), and the spinner clears when `{typed}` arrives, or at expiry. A request with no command shows no spinner. The aria label of the spinner is "starting", and the not-typed mark has the label "command not typed", as the UX spec says.
  - `src/lib/__tests__/terminalOpen.test.ts` `the_spinner_clears_when_typed_arrives` (typed true and typed false both clear it).
  - `SubTerminalStrip.test.tsx` `no_spinner_without_a_command` (regression).

**H1 to H3. The owner's flow, automated end to end (new).** These run the real endpoint, real PTYs and the real CLI code, driven from a caller that is a real shell inside ADE's environment. They are the automated form of the flow the owner described: from a shell inside an ADE terminal, `"$ADE_HOOK_BIN" open --cwd DIR --name NAME -- CMD` adds a sub-terminal to the caller's tab and types `CMD` once the new shell's line editor is ready, and the caller's session keeps running.
  - **H1.** `e2e_open_from_a_caller_adds_types_and_keeps_the_caller_running`: a caller PTY is made with `create_pty`'s environment (`ADE_HOOK_PORT`, `ADE_HOOK_TOKEN`, `ADE_PTY_ID`, `ADE_HOOK_BIN`). The CLI runs with the caller's environment and the argv `open --cwd <tmp> --name smoke -- <line>`, and no TTY. The window side receives `{request}` with `callerPtyId` equal to the caller and the expected `cwd`, `name` and `command`. The window creates the new PTY through the core of `create_pty`, runs `bash --norc --noprofile -i` there, and answers `terminal_open_done` with the `ptyId` and the line. The new shell runs the typed line, which writes a marker file, and the test waits up to 10 s for it. The CLI exits 0 with nothing on stdout or stderr. The caller PTY is still live afterwards, and a marker typed into the caller shell after the open is written, so the caller's session kept running.
  - **H2.** `e2e_a_shell_that_never_prompts_keeps_the_caller_running_and_exits_5`: the window's new shell is `sh -c 'exec sleep 30'` (T1's never-ready case). After about 5 s the CLI exits 5 with the not-typed message on stderr, no marker is written, and the caller is still live.
  - **H3.** `e2e_a_closed_caller_gets_exit_4_and_opens_nothing`: the caller PTY is killed before the CLI runs. The CLI exits 4 (the 410 row), the window receives no request, and no PTY is created.

**Entry criteria are complete when:** every test named in T1 to T9, H1 to H3 and T7's `cli_guard` tests appears by name in the verification output and passes.

## Test-first order

Write the failing test, then the minimal code, in this order. Each step is green before the next starts.

1. Pure Rust: T2's validation (`validate_command`), T3's allowlist, T5's budget arithmetic.
2. Pure Rust with injected probe, clock and sleep: T1's typing function (`type_when_ready`), T4's answer mapping.
3. Real PTY: T1's writer-thread cases and the 5,000-byte line, using `feat/cli-guard`'s helpers.
4. Window (TS, pure first): T2's line builder, the cherry-pick of `shellQuote` and its tests, then T9's spinner state, then T4's `typed` handling.
5. CLI: T4's exit 5 and its stderr message; delete the command half of C-criterion `split_and_command_come_back_422_not_supported_yet_and_exit_1` (see Files) and keep its split half.
6. Guard: T7 on `feat/cli-guard`, with the ADR amendment.
7. Components: T6 (`SubTerminalNotice.tsx`) and the strip's spinner (T9).
8. Guide: T8.
9. Harness: H1, then H2 and H3. H1 first makes the whole path work once.

## Automated end-to-end harness

- **File:** `src-tauri/src/terminal_open_e2e.rs` (new), compiled with `#[cfg(all(test, unix))] mod terminal_open_e2e;` in `lib.rs`. It is a test module, not part of the app.
- **Real:** the hook endpoint (`AgentStatus` with a real `tiny_http` listener on `127.0.0.1` and a real `OpenService`); the `PtyManager`; real PTYs for the caller and for the sub-terminal (`bash --norc --noprofile -i`, never `sh`, which is dash on Linux and never becomes ready); the CLI's own code (`ade_cli::main`, in-process, with an injected environment and captured stdio).
- **Stand-in for the window:** a test thread receives `OpenMessage` on a channel (the same channel the Tauri `Channel` would carry), calls the core of `create_pty` (the function `create_pty` calls, without the Tauri window), then calls the function `terminal_open_done` calls. This needs `create_pty`'s body split into a core function with no `tauri::WebviewWindow` argument. That split is part of this story, and its test is H1's setup.
- **The line** the stand-in sends is built by the test (a fixed, already-quoted string). The quoting is proved by T2 in TypeScript, against real shells; the harness does not re-test quoting.
- **Not covered by the harness:** the `"$ADE_HOOK_BIN"` expansion by a real shell (the variable must hold the helper's path, and the helper binary must be built); the Tauri window; the frontend store; a real Claude Code session. These are the manual checks.

## Files (the only ones to touch)

Rust (`src-tauri/src/`):
- `terminal_open.rs` (from 4a): `validate_command`, the allowlist, `type_when_ready` with its injected probe, clock and sleep, the typing path after `terminal_open_done`, the re-check of `line`, `typed` messages, the typing budget.
- `pty.rs`: `line_editor_ready` made `pub(crate)` if it is not; the shell basename kept on `PtyInstance`; `create_pty`'s body split into a core function with no window argument (the stand-in calls it); the writer `input` used by the typing path.
- `terminal_open_e2e.rs` (new, `#[cfg(all(test, unix))]`).
- `lib.rs`: the one `mod` line for the test module.
- `cli_guard/resolve.rs`, `cli_guard/tables.rs`, `cli_guard/mod.rs` (on `feat/cli-guard`): T7.
- `ade-hook/src/main.rs`: no change beyond the integration's three-way dispatch (see "Build base").

CLI (`src-tauri/src/ade_cli.rs`, from 4c):
- Exit 5 and its stderr message (T4).
- Remove the `command` half of `split_and_command_come_back_422_not_supported_yet_and_exit_1` (4c's test, C4). Rename it to `split_answers_not_supported_yet_and_exit_1`. Its split half stays.

Window and components (`src/`):
- `src/lib/terminalOpen.ts` (from 4a): the line builder, the `command` path (no longer 422), `{typed}` handling, the spinner state.
- `src/lib/shellQuote.ts` and `src/lib/__tests__/shellQuote.test.ts`, `src/lib/__tests__/shellTokenize.ts`: cherry-picked unchanged from `origin/hermes-a-quoting` 8b06ea4 (recommended route, D9). Nothing else from that commit.
- `src/lib/__tests__/terminalOpen.test.ts` (from 4a): new cases for T2, T4, T9.
- `src/components/SubTerminalNotice.tsx` (new) and `src/components/__tests__/SubTerminalNotice.test.tsx` (new): T6.
- `src/components/SubTerminalStrip.tsx` (from 4a): the spinner (T9).
- `src/lib/__tests__/guideOpen.test.ts` (new): T8.
- `docs/guide/agents.md` or `docs/guide/index.md`: the section (T8).

Context:
- `.ade/context/decisions/0011-cli-library-guarded-by-a-command-hook.md` (on `feat/cli-guard`): the amendment note (T7).
- `.ade/context/terminal-open.md`: the status line only ("typing: built" for story 9), in the same commit as the code that makes it true.
- `.ade/context/agent-events.md`: nothing, unless a row changes.

Not touched: `src/lib/agentCommand.ts`, `src/lib/contracts.ts`, `AntiSlopTab.tsx`, `ContractsWorkbench.tsx` and the other `hermes-a-quoting` files (Hermes's migration); `src/stores/tabStore.ts`.

## Merge notes

- **Build base:** see "The build base". Resolve the three conflicts in the order written there, in one merge commit.
- **`hermes-a-quoting`:** the cherry-pick adds three files that no other branch has. A later merge of the full `hermes-a-quoting` branch conflicts with this story only on those three files, which will be identical, so the Hermes merge takes either side. Its conflict with `feat/cli-guard` in `agentCommand.ts` remains Hermes's to resolve.
- **Story 4a and 4c tests change:** A3's `split_and_command_answer_not_supported_yet` and C4's `split_and_command_come_back_422_not_supported_yet_and_exit_1` lose their command half here (see Files). No other 4a or 4c test changes.
- **ADR 0009 number:** the spec cites `0009-manual-checks-do-not-gate-done` (unmerged, on `docs/claude-md-paths`), while main's `0009` is `0009-one-side-panel-shows-clicked-files-read-only`. The slug is unambiguous; the number is not, and this story does not renumber anything.

## Verification

The six lines of "Verification command, in force" in `docs/architecture.md`, each from the repository root, each exit 0. The sixth is required from story 4 on:

```
npx tsc --noEmit
npm test
(cd src-tauri && cargo test)
(cd relay && cargo test)
(cd mobile && npx tsc --noEmit && npx jest)
(cd src-tauri && cargo check -p ade-hook)
```

Plus: every test named in T1 to T9, H1 to H3 and T7 appears by name in the output and passes. No manual check gates this story.

## Manual checks (recorded, not gating)

These are the spec's V2 and the owner's real-session check. They are recorded in the Verification section by QA and do not gate Done.

- **M1.** On a running ADE (macOS), from a Claude Code session in an ADE terminal, `"$ADE_HOOK_BIN" open --cwd . --name smoke -- npm --version`: the sub-terminal appears in the tab's strip, its spinner clears, `npm --version` is visible as typed, and the Claude Code session keeps going. This is the owner's flow with the real Bash tool.
- **M2.** A line over 1,024 bytes (the macOS canonical buffer) is typed and runs whole in the user's own zsh with its rc files.
- **M3.** A fish user's shell: a typed line with `VAR=value cmd` runs (fish 3.1 or later, as the spec's minimum).
- **M4.** Insert command: disabled at a busy prompt, enabled at an idle one, and inserts the quoted line without running it.
- **M5.** The harness (H1 to H3) passes on Linux as well as macOS, in the CI runner.

## Out of scope

- `--split` (story 8). `--focus` is story 4a's and is unchanged.
- Migrating the agent launches and contracts to the new quoter (Hermes).
- Merging `feat/cli-guard`, `st4c-open-cli` or the Hermes branch (the owner decides the order; this story builds on the integration base).
- The hidden-terminal budget and the dev helpers (story 4b), Move to New Window (story 5), `ade` on `PATH` (story 7), Windows.
- Exit codes shown in the strip (cut from v1).

## Known uncertainty

- **Owner decision, D9 route:** cherry-pick the quoter (recommended) or wait for `hermes-a-quoting`. The entry's `unknown` stays until the owner answers.
- **Owner decision, build base:** the integration of `st4c-open-cli` and `feat/cli-guard` (as asked), or wait for #94, #96 and #97 to merge to main. Both are workable; the integration is only a stop-gap.
- The shell's basename on the instance (T3) is a new field; if `create_pty` does not already return the shell path, the Dev adds it at creation and says so.
- `bash --norc -i` is the harness shell. macOS's `/bin/bash` is 3.2; if its readline behaves differently from the user's shell, the harness is still a valid line-editor test, and M2 and M3 cover the user's own shells.
- Entry 8's guide page: the Dev picks `agents.md` or `index.md` and says which in the Verification section.

## Verification (QA)

_Empty until QA runs the verification command against the story's work. QA records the real output here._

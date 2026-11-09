---
title: "ade open: the CLI and its exit codes"
ticket: 4c
status: done
---

# Story 4c: ade open: the CLI and its exit codes

Ticket 4c in `tickets.toml`, in this folder. The second half of the former story 4, split on 2026-11-09 (see story 4a's plan, "Split"). This file holds the build plan and the acceptance criteria; QA's Verification section is at the end and stays empty until QA runs it.

## Goal

`"$ADE_HOOK_BIN" open [--cwd DIR] [--split right|down] [--name NAME] [--focus] [-- COMMAND ...]` posts to `/open` (story 4a) and turns the answer into an exit code and a stderr message. The helper binary `ade-hook` is the CLI under its own name: the same executable, told apart by `mode(argv0, args)`. Nothing is printed on success.

## Sources (read these, not the owner's checkout)

- `.ade/context/terminal-open.md`: the CLI section (the flags, `--cwd`, output, exit codes, "Never put the token on a command line") and the answers table. This plan follows it.
- `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`: sections "Backend" and "Testing" (the CLI bullet: flags and exit codes against a local `TcpListener`, one per table row) and "The guard and `ade open`" (story 9; read only to see what not to build here).
- `.ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`: "The CLI is the helper under a second name".
- Shipped code on main: `src-tauri/ade-hook/src/main.rs` (the `#[path]` include of `hook_forward.rs`), `src-tauri/src/hook_forward.rs` (`ENV_*` names, `post`, `main`, `run`, the 2-second deadline pattern), `src-tauri/src/agent_status.rs` (`screen`, the header names).

## Acceptance criteria

Each criterion is one or more named tests. Write the test first, then the minimal code. "(was N)" is the number in the former story 4.

**C1 (was 1). Mode.** `mode(argv0, args)` is a pure function in `src-tauri/src/ade_cli.rs`:
  - the CLI when the basename of `argv0` is `ade` or `ade.exe`, whatever the arguments;
  - the CLI when `args[0]` is `open`, `help` or `--help`;
  - never the CLI for `guard`: `args[0] == "guard"` is the hook mode whatever `argv0` is (cli-guard's dispatch goes first);
  - otherwise the hook mode, as today.
  Basename handles `/`, `\`, and a full path such as `/Users/x/Library/.../bin/release/ade`.
  Tests (`ade_cli.rs`): `ade_and_ade_exe_are_the_cli`; `open_help_and_dash_help_are_the_cli`; `no_arguments_under_the_hook_name_are_the_hook`; `guard_is_never_the_cli`; `the_basename_of_argv0_decides`; `an_unknown_verb_under_ade_is_still_the_cli` (so it gets the usage error of C5).

**C2 (was 2). Exit codes.** One test per row, against a local `TcpListener` that writes a canned HTTP answer (or none), with the deadline injected so the no-answer row takes milliseconds:
  - **0**: 200 with `{"ok":true,"typed":true}`. Nothing on stdout or stderr.
  - **1** for a 400 whose body is `{}`: the message is "this ADE is too old for ade open; restart ADE".
  - **1** for any other answer than 200, 401 or 410 (400, 404, 409, 422, 429, 504), with the body's `error` as the message.
  - **1** when there is no answer before the deadline (15 seconds in the product; injected in the test): "ADE didn't answer in 15 s; nothing was opened" (the Dev may word it; the test checks exit 1 and that the message is non-empty).
  - **2** for usage errors (C5 and C3).
  - **3** when `ADE_HOOK_PORT`, `ADE_HOOK_TOKEN` or `ADE_PTY_ID` is unset, or malformed (non-numeric port or pty id; an empty token). The message names the variable.
  - **4** when the connection is refused, or the answer is 401 or 410 (this terminal has closed). The message mentions tmux and screen, as the contract says for exit 4.
  Tests: `exit_0_when_opened`, `exit_1_for_an_old_ade_that_answers_400_with_empty_object`, `exit_1_for_422_with_its_message`, `exit_1_for_504_with_its_message`, `exit_1_when_no_answer_before_the_deadline`, `exit_2_for_usage`, `exit_3_for_an_unset_or_malformed_variable` (one case per variable), `exit_4_when_connection_is_refused`, `exit_4_for_401`, `exit_4_for_410_this_terminal_has_closed`. All in `ade_cli.rs`.

**C3 (was 4). `--cwd`.** `--cwd DIR` is joined to `$PWD` when `DIR` is relative (an absolute `DIR` is used as it is), normalised lexically the way `cd` does (`.` and `..` removed without touching the disk), then checked with `stat` to be a folder. The logical path is sent, not the physical one. Without `--cwd` the body's `cwd` is `$PWD`. A missing folder is exit 2 with `ade: --cwd: no such folder`.
  Tests: `cwd_joins_pwd_and_normalises_lexically` (`PWD=/a/b`, `--cwd ../x/./y` sends `/a/x/y`, using a real temp folder for the stat); `a_missing_cwd_folder_is_usage_2`; `without_cwd_the_pwd_is_sent`.

**C4 (no former criterion; the contract's request). The request.** The body is exactly the contract's five fields, in JSON: `cwd` (string), `command` (null, or the words after `--`), `split` (null, or `"right"` or `"down"`), `name` (null or the `--name` value), `focus` (boolean). The headers are `Host: 127.0.0.1:<port>`, `X-ADE-Token` (the value of `ADE_HOOK_TOKEN`), `X-ADE-PTY` (`ADE_PTY_ID`), `Content-Type: application/json`, and `POST /open`. The token is read from the environment and never on the command line.
  Tests: `the_body_has_exactly_the_contract_fields` (the listener reads the request and compares the parsed JSON); `the_token_comes_from_the_environment_only` (the process's argv, as the test builds it, contains no token; the request's token equals the variable); `split_and_command_come_back_422_not_supported_yet_and_exit_1` (a listener that answers 422 with that text; the CLI exits 1 with it on stderr).

**C5 (no former criterion; the usage text). Usage and help.** `ade help` and `ade --help` print the usage to stdout and exit 0. The usage lists `open` with its flags. An unknown verb (`ade frob`), `ade` with no verb, or an unknown flag prints the usage to stderr and exits 2. `--name` with `--split` is refused with exit 2 and `ade: --name can't be used with --split`, before any request is sent. `--split` with a value other than `right` or `down` is exit 2. `--focus` takes no value; `--name` and `--cwd` require one (exit 2 if missing).
  Tests: `help_prints_usage_and_exits_0`; `an_unknown_verb_is_usage_2`; `name_with_split_is_usage_2_and_sends_nothing` (the listener counts connections: zero); `a_split_value_other_than_right_or_down_is_usage_2`; `a_flag_missing_its_value_is_usage_2`.

**C6 (no former criterion; the hook mode is unchanged). Hook mode.** `ade-hook` in hook mode runs `hook_forward::main()` exactly as before, and the existing `hook_forward` tests still pass unchanged.
  Tests: the existing `src-tauri/src/hook_forward.rs` tests (run under `cargo test`, not changed); `ade_cli.rs` `the_hook_mode_is_what_ade_hook_did_before` (`mode("ade-hook", &[])` is `Hook`, and `Hook` is the only path that reaches `hook_forward::main`).

## Test-first order

1. `mode()` (C1), then the usage parser (C5), both pure.
2. `--cwd` resolution (C3), pure except the stat, with a temp folder.
3. The request body builder (C4), pure.
4. The HTTP client against a `TcpListener` (C2 rows, one at a time, starting with exit 0), then C4's listener-based tests.
5. `ade-hook/src/main.rs` dispatch (C6), then `cargo check -p ade-hook`.

## Files (the only ones to touch)

- `src-tauri/src/ade_cli.rs` (new): `Mode`, `mode`, the usage parser, `resolve_cwd`, the body builder, the HTTP client (`std::net::TcpStream`, a deadline, a response parser for status and body), the exit mapping, and `pub fn main(args, env) -> i32`. It starts with `#![allow(dead_code)]` as `hook_forward.rs` does, since the main crate compiles it for its tests and `ade-hook` for the binary.
- `src-tauri/ade-hook/src/main.rs`: `#[path = "../../src/ade_cli.rs"] mod ade_cli;` and the dispatch: `mode(argv0, args)`, then `ade_cli::main` for the CLI or `hook_forward::main()` for the hook.
- `src-tauri/src/lib.rs`: `mod ade_cli;` (one line, for the main crate's tests).
- `src-tauri/src/hook_forward.rs`: no change.
- `.ade/context/agent-events.md`: nothing in this story (the `/open` rows change in 4a).
- `.ade/context/terminal-open.md`: no change (the contract, as on main).

## Merge notes

- **After story 4a.** Its exit 0 path needs the route. The tests here do not need 4a.
- **feat/cli-guard** (not on main). It changes `src-tauri/ade-hook/src/main.rs` to dispatch `guard` first and to call `cli_guard::main`. This story also changes that file. Rule: the order is `guard` (cli-guard), then `mode()` (this story), then the hook. Whichever lands second writes that order. `mode()` already returns the hook mode for `guard`, so the two dispatches agree.
- **feat/cli-guard**, `lib.rs`: both add `mod` lines. Keep both.
- The `#[path]` include list in `ade-hook/src/main.rs` grows by one line in each branch; keep all of them.

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

Plus: every test named in C1 to C6 appears by name in the output and passes. No manual check gates this story. As an optional smoke, QA may run `"$ADE_HOOK_BIN" open` from a sub-terminal of a running ADE after 4a is on main; the result is recorded but does not gate Done.

## Out of scope

The endpoint, the window, the claim, the limits (story 4a). `--split` in the window (story 8). `-- COMMAND` typed into the shell, `typed` and exit 5 (story 9). The guard's view of `ade open` (story 9). `ade` on `PATH` and the `readlink` check (story 7). Windows.

## Known uncertainty

- The exit table is the one in the contract on main (`.ade/context/terminal-open.md`, "The CLI"). A stale copy of that file sits untracked in the owner's checkout; it was not used.
- The CLI's 15-second deadline is the contract's; the endpoint's 5-second expiry (story 4a) means a 504 normally arrives first. A CLI that waits 15 seconds is still correct.
- `ade help` output wording is the Dev's; the test checks the exit code and that the usage names `open`.

## Verification (QA)

QA, 2026-11-09, on branch `st4c-open-cli` after merging `origin/main` (d34412f, story 4a) as 57db7ab, plus two comment-only edits from the reviewer's notes (a line above each of the two `#[cfg(unix)]` tests that read what `main` takes from its process, in `src-tauri/src/ade_cli.rs`; a note above the `backend-windows` job in `.github/workflows/ci.yml`). Run with a temporary `HOME`/`TMPDIR`. The merge conflicted only in `.ade/knowledge/developer.md` and `_bmad-output/deferred-work.md` (main's side empty); HEAD's text was kept. No code file conflicted.

```
npx tsc --noEmit                                  exit 0
npm test                                          run 1: exit 1, 1 file failed (BoardPanel.test.tsx, 20 tests; 173 files / 1917 tests passed)
                                                  BoardPanel.test.tsx alone: 46 passed (not touched by this story or by the merge)
                                                  run 2, full: exit 0  Test Files 174 passed (174)  Tests 1937 passed (1937)
(cd src-tauri && cargo test)                      exit 0  lib: 618 passed; 0 failed; 1 ignored (plus 12, 2 in other targets)
(cd relay && cargo test)                          exit 0  all suites ok (86 passed in the largest)
(cd mobile && npx tsc --noEmit && npx jest)       exit 0  Test Suites: 1 passed; Tests: 6 passed
(cd src-tauri && cargo check -p ade-hook)         exit 0  Finished `dev` profile
cd src-tauri && cargo test -p ade-hook --test dispatch   exit 0  test result: ok. 9 passed; 0 failed
```

The first `npm test` run had 20 timing-sensitive BoardPanel failures (1 s waitFor timeouts) that did not repeat: the file passes alone and the full suite passed on the second run. BoardPanel is unrelated to this story; recorded as a flake, not hidden.

Criteria map. All 25 tests named in C1 to C6 appear in the `cargo test` output as `ade_cli::tests::<name> ... ok`, and the assertions were read:
- C1: `ade_and_ade_exe_are_the_cli`, `open_help_and_dash_help_are_the_cli`, `no_arguments_under_the_hook_name_are_the_hook`, `guard_is_never_the_cli`, `the_basename_of_argv0_decides`, `an_unknown_verb_under_ade_is_still_the_cli`.
- C2: `exit_0_when_opened` (code 0, stdout and stderr empty), `exit_1_for_an_old_ade_that_answers_400_with_empty_object`, `exit_1_for_422_with_its_message`, `exit_1_for_504_with_its_message`, `exit_1_when_no_answer_before_the_deadline` (code 1, message, injected deadline under 5 s), `exit_2_for_usage`, `exit_3_for_an_unset_or_malformed_variable` (one case per variable, malformed port, token and pty id), `exit_4_when_connection_is_refused`, `exit_4_for_401`, `exit_4_for_410_this_terminal_has_closed` (code 4, message names tmux and screen).
- C3: `cwd_joins_pwd_and_normalises_lexically` (also the symlink case), `a_missing_cwd_folder_is_usage_2`, `without_cwd_the_pwd_is_sent`; plus `main_reads_pwd_getcwd_and_ade_variables_from_the_process` (a real process).
- C4: `the_body_has_exactly_the_contract_fields` (request line, Host, Content-Type, X-ADE-PTY, exact JSON body), `the_token_comes_from_the_environment_only`, `split_and_command_come_back_422_not_supported_yet_and_exit_1`.
- C5: `help_prints_usage_and_exits_0`, `an_unknown_verb_is_usage_2`, `name_with_split_is_usage_2_and_sends_nothing`, `a_split_value_other_than_right_or_down_is_usage_2`, `a_flag_missing_its_value_is_usage_2`.
- C6: `the_hook_mode_is_what_ade_hook_did_before` (Hook mode, and the dispatch in `ade-hook/src/main.rs` reaches `hook_forward::main()` only on the Hook arm), the unchanged `hook_forward` tests, and the 9 `ade-hook` dispatch tests above.

Not covered: Windows (the CLI is Unix-only for now; the two process-level tests are `#[cfg(unix)]`, noted in the code and in CI). The optional smoke from a running ADE was not run; it does not gate Done.

Verdict: PASS.

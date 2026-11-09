---
title: "ade open adds a sub-terminal (endpoint and window)"
ticket: 4a
status: ready-for-dev
---

# Story 4a: ade open adds a sub-terminal (endpoint and window)

Ticket 4a in `tickets.toml`, in this folder. The first half of the former story 4, split on 2026-11-09 (see "Split" below). This file holds the build plan and the acceptance criteria; QA's Verification section is at the end and stays empty until QA runs it.

## Goal

A POST to `/open` on the existing loopback endpoint adds a sub-terminal to the caller's tab, in the caller's folder or a given one, optionally named, optionally focused. The window creates the terminal at once; Rust never spawns or kills. There is no CLI here: `ade-hook` is unchanged (story 4c adds `"$ADE_HOOK_BIN" open`). `--split` and `-- COMMAND` answer 422 "not supported yet" (stories 8 and 9).

## Sources (read these, not the owner's checkout)

- `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`: sections "Backend", "Making the new terminal: created at once", "Store shape", "Testing".
- `docs/superpowers/specs/2026-11-02-sub-terminals-ux.md`: "Switching in: `--focus` (U1)", "Grandchildren: flatten", "Accessibility" (the announcer and the flash already exist from 2bi and fire on `addView`; nothing to build).
- `.ade/context/terminal-open.md`: the wire contract. The request body, the answers table, the `OpenMessage` shape, the claim rules. Every status code and body in this plan is taken from it.
- `.ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`: the decision record.
- `.ade/context/agent-events.md`: the endpoint's existing contract (ADR 0003, amended by ADR 0014).
- Shipped code on main: `src-tauri/src/agent_status.rs` (`pty_token`, `screen`, `serve`, `AgentStatus::start_with`), `src-tauri/src/pty.rs` (`create_pty`, `reattach_pty`, `reserve_id`, `PtyManager`), `src-tauri/src/hook_forward.rs` (constants only), `src/hooks/useTerminal.ts` (`createInstance`, `openTerminal`, `getTerminalDimensions`, `destroyInstance`), `src/stores/tabStore.ts` (`addView`, `closeView`, `setPtyId`, `allTabPanes`), `src/components/SubTerminalStrip.tsx` (`SubTerminalAnnouncer`, the background flash).

## Split

The former story 4 had 16 criteria and the ticket allowed a split into 4a (route, threads, claim, limits) and 4c (CLI). It is split:

- **4a** (this file) is the endpoint and the window. It is testable without any CLI: Rust tests post raw HTTP, and the window tests call the handler directly. It is mergeable on its own: the endpoint answers the contract, no existing behaviour changes, and nothing user-facing is missing (no one runs `ade open` yet).
- **4c** is the CLI: `mode()`, the flags, exit codes and `--cwd`. It is testable against a local `TcpListener` with canned answers, so it does not need 4a to run its tests. It is mergeable only after 4a, because its exit 0 path needs the route. Its files (`src-tauri/src/ade_cli.rs`, `src-tauri/ade-hook/src/main.rs`, `lib.rs`'s `mod` line) do not overlap 4a's except `lib.rs`.

The two halves share only the wire contract, which is fixed in `.ade/context/terminal-open.md`.

## Acceptance criteria

Each criterion is one or more named tests. Write the test first, watch it fail, then write the minimal code. "(was N)" gives the number of the criterion in the former story 4 in `tickets.toml`.

**A1 (was 3). Screening.** `POST /open` is screened by the same `screen()` as `/`: a wrong token, a missing `X-ADE-PTY`, an `Origin` header, a foreign `Host`, a `GET`, and a body over 16 KB are each refused with the codes `screen()` already gives (401, 403, 405, 413), with body `{}`, and change no state.
  Test: `src-tauri/src/agent_status.rs` `open_is_screened_like_hook_events` (drives `serve` over a real `tiny_http` listener with the existing `send` and `request` helpers).

**A2 (was 3). Body types.** An unknown field, or a field of the wrong type (`focus: "yes"`, `cwd: 3`, a string `command`), answers 400 `{"error":...}`. Missing `cwd` is 400.
  Test: `terminal_open.rs` `open_body_with_an_unknown_field_or_wrong_type_is_400`.

**A3 (was 3). Field rules.** Each answers 422 `{"error":...}` and opens nothing:
  - `cwd` relative, or not an existing folder (a file counts as not);
  - `name` empty, longer than 64 characters, or containing a control character;
  - `split` non-null: 422 "not supported yet" (story 8), except an invalid value ("left"), which is 422 with the contract's wording;
  - `command` non-null (even `[]`): 422 "not supported yet" (story 9);
  - on Windows, every `/open` is 422 (checked in `admit`, before a bucket token is spent).
  Tests: `terminal_open.rs` `a_bad_cwd_or_name_is_422`, `split_and_command_answer_not_supported_yet`, `every_open_is_422_on_windows` (the platform is an injected flag, so this runs on macOS and Linux).

**A4 (was 5). Routing.** `/` is hook events as today; `/open` is this story; any other path answers 404 `{}` after `screen()`. Hook events are still served, and answered, while an `/open` waits on its thread.
  Test: `agent_status.rs` `routes_by_path_and_unknown_is_404`; `hook_events_are_served_while_an_open_waits` (a fake handler that blocks until released).

**A5 (was 6). Threads and the handler.** `serve` screens, reads the body and calls `handler.admit(caller_pty)` on its own thread. A refusal from `admit` is answered there. An admitted request, with its `tiny_http::Request` and its `Admission`, goes to a new thread that calls `handler.handle(admission, body)` and answers with what it returns. `AgentStatus::set_open_handler(Arc<dyn OpenHandler>)` is called once in `.setup()`; until then `/open` answers 409 `{"error":"ADE is still starting"}`. Tests inject a fake handler.
  Tests: `agent_status.rs` `open_is_answered_on_its_own_thread` (the fake records the thread id; it differs from the serve thread); `open_before_the_handler_is_set_is_409`; `an_admit_refusal_is_answered_with_its_status`.
  Note for the Dev: `std::thread::Builder::spawn` drops its closure when it fails, so the request must not live only inside that closure. Put the request and the admission in a `Mutex<Option<(Request, Admission)>>` shared with the thread; on spawn failure the serve thread takes them back and answers 503. The spawn is a test seam (a field or fn pointer on `Inner`, default `std::thread::Builder::spawn`) so the failure can be injected.

**A6 (was 7). The in-flight slot.** `Admission` is an RAII guard whose `Drop` releases the in-flight slot. Tests: a handler that panics, and an injected spawn failure (answered 503 on the serve thread), each leave the in-flight count where it started.
  Tests: `terminal_open.rs` `a_panicking_handler_releases_its_slot` (the client sees the connection closed, the count is back to its start); `agent_status.rs` `a_failed_spawn_is_503_and_releases_its_slot`.

**A7 (was 8). Owner window.** Each window that calls `terminal_open_listen` has one listener, keyed by its label. A request whose caller's window has no listener answers 409 `{"error":...}`. A caller pane that is not live answers 410 `{"error":"the terminal you ran this from is gone"}`. The listener is dropped on that window's `WindowEvent::Destroyed` (registered inside `terminal_open_listen` with `window.on_window_event`, so `lib.rs` gets no event wiring).
  Tests: `terminal_open.rs` `no_listener_for_the_callers_window_is_409`; `a_dead_caller_is_410`; `a_listener_is_forgotten_with_its_window` (calls the same `forget_listener(label)` the event closure calls).

**A8 (was 9). Expiry and timeout.** `expiresAt` is the request's creation time plus 5 000 ms, in epoch milliseconds. On no `terminal_open_done` before the deadline, Rust answers 504 `{"error":"ADE didn't answer; no terminal was opened"}`, sends `{ expired: requestId }` to the owner's listener, and any later `terminal_open_done` for that id is ignored. The window does nothing for a request it receives after `expiresAt`, and closes what it added when `expired` arrives.
  Tests: Rust `terminal_open.rs` `no_answer_is_504_then_expired_is_sent` (deadline injected as a short `Duration`); `a_late_answer_is_ignored`. Vitest `src/lib/__tests__/terminalOpen.test.ts` `a request past expiresAt does nothing`; `expired closes the sub-terminal the request added`; `expired before the terminal exists closes it once created`.

**A9 (was 10). The PTY claim.** At the request Rust records `floor`, the next PTY id (`PtyManager::next_id`, the value `reserve_id` will hand out next). `terminal_open_done` accepts `ptyId` only if the PTY was created with this `requestId`, its id is at or above `floor`, no earlier request has claimed it, it is live, and its owner is the request's window. Otherwise the answer is 200 `{"ok":true,"typed":false,"why":...}`. The claim is a pure function.
  Tests (`terminal_open.rs`, pure function `claim_ok`): `a_pty_below_the_floor_is_not_claimed`; `a_claimed_pty_is_not_claimed_again`; `a_dead_pty_is_not_claimed`; `a_pty_of_another_window_is_not_claimed`; `a_pty_created_without_this_request_id_is_not_claimed` (the user's own terminal); `the_requests_own_pty_is_claimed`.

**A10 (was 11). One PTY per add.** `--focus` (the mount happens while `createInstance` still awaits) makes exactly one `create_pty`. A background add that is then shown at once also makes exactly one.
  Tests: vitest `terminalOpen.test.ts` `a focused add makes exactly one create_pty`; `a background add shown at once makes exactly one create_pty`. Both use the real `createInstance` with `invoke` mocked, and count calls.

**A11 (was 12). Resize after a focused mount.** Once `create_pty` returns, if the instance's `cols` and `rows` differ from the size the PTY was created with, the window sends `resize_pty` with the current size, once.
  Test: vitest `a focused mount at another size gets one resize_pty after create_pty` (the test mounts with a different size before `create_pty` resolves).

**A12 (was 13). Owner and request on the instance.** `PtyInstance` gets `owner: Option<String>` (the window label; `create_pty` sets it, `reattach_pty` replaces it), `request_id: Option<u64>` and `opened_by_open: bool` (set by the claim). The five-argument construction is unchanged here; see "Merge notes".
  Test: `pty.rs` `a_terminal_records_its_owner_and_request_id` (spawn a real child the way the existing `pty.rs` tests do, set the fields, read them back; `reattach` replaces the owner through the same setter the command uses).

**A13 (was 14). Limits.** Per caller pane: a bucket of 8 that refills 1 per second. Across the app: at most 32 running `/open` shells, counting PTYs with `opened_by_open` plus requests admitted and not yet finished. Both answer 429 `{"error":...}`. The bucket is checked after the running count, so a refused running-count request spends no token. A clock is injected.
  Tests: `terminal_open.rs` `a_pane_gets_eight_then_one_a_second` (injected clock); `the_thirty_third_open_shell_is_refused`; `in_flight_requests_count_toward_the_thirty_two`.

**A14 (was 15). Naming.** A sub-terminal's name is `--name` if given; else the first word of the command after any leading `VAR=value` words; else the folder's basename; else "Terminal". Never the full command line. The command branch is exercised here by the pure function, even though `command` is 422 in this story.
  Tests: vitest `terminalOpen.test.ts` `a name given wins`; `"npm run dev" is named npm`; `"env TOKEN=x npm run dev" is named env`; `"FOO=1 make" is named make`; `no command names it after the folder`; `no command and no folder is named Terminal`.

**A15 (was 16). Flattening and the spawner's tooltip.** A sub-terminal's own `ade open` adds a sibling to the same tab, with `spawnedBy` the caller's view id, or `"own"` when the caller is the tab's own view (owner ruling Q5). Never a nested strip. The entry's tooltip gains a second line, `Opened from <spawner>`, where the spawner is the spawning view's name, or the tab's label when it is `"own"` (the UX spec: "The spawner's name is in the tooltip"; the contract's window section says story 4 shows it). The entry's existing tooltip (`name — cwd`) stays as its first line. No such line for an entry without `spawnedBy`.
  Tests: vitest `terminalOpen.test.ts` `a sub-terminal's add is a sibling in the same tab, spawned by its view`; `SubTerminalStrip.test.tsx` `a tooltip says Opened from the spawner, and the tab's label for an own spawn`; `a sub-terminal with no spawner has no Opened from line`.

**A16 (no former criterion; the spec's "created at once" section). Creation at once.** The window creates the new pane's terminal as soon as it adds the pane, through `createInstance` with no container, at the caller's size (`getTerminalDimensions` of the caller's pane; `24x80` (rows 24, cols 80) when the caller has no instance), then `create_pty` with the `requestId`. Nothing waits for a mount. This replaces any Rust spawn.
  Test: vitest `terminalOpen.test.ts` `the pane's terminal is created before any mount, at the caller's size`; `with no caller instance it is 24 by 80`.

**A17 (was 9 and 10, in part). The answer and the add.** Given a valid request from a live caller in a window with a listener, Rust answers 200 `{"ok":true,"typed":true}` once the window's `terminal_open_done` (with `ptyId`, `line: null`, `error: null`) passes the claim. The window adds the sub-terminal to the caller's tab (`addView` with `spawnedBy` = the caller's view, `focus` = the request's `focus`). An `error` in the window's answer is 409 `{"error":<it>}`.
  Tests: Rust `terminal_open.rs` `a_valid_request_is_answered_200_typed_true_once_claimed`; `an_error_from_the_window_is_409`. Vitest `background add keeps selection and focus`; `--focus switches to it and activates its tab`.

## Test-first order

Write the failing test, then the minimal code, in this order. Each step is green before the next starts.

1. Pure Rust, no I/O: A9 (`claim_ok`), A13 (`Bucket` and the running count with the injected clock), A2 and A3 (`parse_body`, `validate`).
2. Pure TS: A14 (`defaultSubTerminalName`).
3. Routing and threads (`agent_status.rs`): A4, A1, A5, then A6 (`Admission` with its Drop and the spawn seam).
4. Owner and expiry: A7 (listener map and `forget_listener`), A8 (504, `expired`, late answer ignored), A17's Rust half.
5. PTY fields: A12 (`pty.rs`).
6. Window: A16 and A10 and A11 (`createInstance` options and the resize), then A8's vitest, A15, A17's vitest.
7. Wiring: `lib.rs` (`mod terminal_open;`, the `.setup()` line that calls `set_open_handler`, the two commands in `invoke_handler`), `App.tsx` (`startTerminalOpen()` once).
8. Context: `.ade/context/agent-events.md` rows for `/open` change from "Proposed (ADR 0014, not built)" to built, in the same commit as the code that makes them true.

## Files (the only ones to touch)

Rust:
- `src-tauri/src/terminal_open.rs` (new): `OpenService` (implements `OpenHandler`), `OpenRequest` with `#[serde(deny_unknown_fields)]`, `parse_body`, `validate`, `Bucket`, `claim_ok`, `PtyFacts`, the listener map with `forget_listener`, the `Pending` map, the Tauri commands `terminal_open_listen` and `terminal_open_done`, and `OpenMessage`.
- `src-tauri/src/agent_status.rs`: `Admission`, `OpenHandler`, `set_open_handler`, `serve` routing by path and the per-request thread, the spawn seam, the 409 before the handler is set.
- `src-tauri/src/pty.rs`: `PtyInstance` fields `owner`, `request_id`, `opened_by_open`; `create_pty` gets `window: tauri::WebviewWindow` and `request_id: Option<u64>`; `reattach_pty` gets `window`; `PtyManager::{facts, next_id, mark_opened, opened_count}` as `pub(crate)`; tests.
- `src-tauri/src/lib.rs`: `mod terminal_open;`; in `.setup()`, `app.manage(Arc::new(terminal_open::OpenService::new(app.handle().clone())))` and `agent.set_open_handler(...)`; the two commands in `invoke_handler`.

TypeScript:
- `src/lib/terminalOpen.ts` (new): `startTerminalOpen()`, `handleOpenMessage(msg, deps?)` (deps injectable: `invoke`, the store, `createSubTerminal`, `now`), `defaultSubTerminalName`.
- `src/lib/__tests__/terminalOpen.test.ts` (new).
- `src/hooks/useTerminal.ts`: `NewInstanceOptions` gains `size?: { cols: number; rows: number }` and `requestId?: number`; `createInstance` applies `size` to a headless terminal before `create_pty`, passes `requestId` (null when absent), and after `create_pty` resends the size with `resize_pty` when it differs (only when `requestId` is set); an exported wrapper `createSubTerminalInstance(paneId, setPtyId, { cwd, size, requestId })` calls it with no container.
- `src/hooks/__tests__/createAtOnce.test.ts` (new) for A10 and A11, or the same tests placed in `terminalOpen.test.ts`; the Dev picks one and says which.
- `src/App.tsx`: one `startTerminalOpen()` call in the existing mount effect, and nothing else.
- `src/components/SubTerminalStrip.tsx`: the entry's tooltip gets the `Opened from` line (A15); nothing else in the strip changes. Tests in `src/components/__tests__/SubTerminalStrip.test.tsx`.

Context and docs:
- `.ade/context/agent-events.md`: the `/open` rows (lines 73 and 138 area) move from proposed to built.
- `.ade/context/terminal-open.md`: on main; the refinement PR only changes its status line. Do not edit it in this story.

Not touched: `src-tauri/src/hook_forward.rs`, `src-tauri/ade-hook/*` (story 4c), `src/stores/tabStore.ts` (`addView`, `closeView` and `setPtyId` already exist; if a change seems needed, stop and say so).

## Merge notes

- **feat/cli-guard** (not on main; criterion 13's pair). It adds `PtyInstance::new(id, child, master, pid, sink)` and changes `create_pty`'s body and `lib.rs`. This story adds three fields and two `create_pty` parameters. Rule: this story sets the new fields after construction, not through `new`. If this story lands first, the cli-guard branch adopts the fields in `new` (defaults `None`, `None`, `false`). If cli-guard lands first, this story sets them after `new`. Either way one test (A12) covers both fields being set.
- **feat/cli-guard** `src-tauri/src/lib.rs`: both add `mod` lines and a `.setup()` line. Resolve by keeping both.
- **hermes-a-quoting** and **feat/cli-guard** are needed by story 9, not here.
- No other branch touches these files on the list above.

## Verification

The six lines of "Verification command, in force" in `docs/architecture.md`, each from the repository root, each exit 0. The sixth (`cargo check -p ade-hook`) is required here because the sub-terminals plan says "from story 4 on":

```
npx tsc --noEmit
npm test
(cd src-tauri && cargo test)
(cd relay && cargo test)
(cd mobile && npx tsc --noEmit && npx jest)
(cd src-tauri && cargo check -p ade-hook)
```

Plus: every test named in A1 to A17 appears by name in the output and passes. No manual check gates this story.

## Out of scope

`--split` (story 8); `-- COMMAND` and the typing (story 9); the CLI, `mode()` and exit codes (story 4c); `ade` on `PATH` (story 7); the hidden-terminal budget and the dev helpers (story 4b); Move to New Window (story 5); Windows support beyond the 422.

## Known uncertainty

- The 429 and 504 wording is the contract's; the 409 and 410 texts are fixed by the contract where it gives them, and the Dev chooses the rest and says which in the Verification section.
- `expiresAt` is 5 seconds; the contract says "ADE answers within 11 s" (5 s for the window, then at most 5 s for the line editor, which story 9 adds). Both hold: in this story the 504 comes at 5 s.

## Verification (QA)

_Empty until QA runs the verification command against the story's work. QA records the real output here._

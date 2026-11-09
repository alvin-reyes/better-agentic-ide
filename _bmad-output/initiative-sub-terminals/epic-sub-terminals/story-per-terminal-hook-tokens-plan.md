---
title: "Per-terminal hook tokens"
ticket: 1
status: done
---

# Story 1: Per-terminal hook tokens

Ticket 1 in `tickets.toml`. The plan is `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`. This file holds QA's Verification only.

## Verification

**QA run, 2026-11-02, at 6ed9939** (base a470b06). The verification command is the five lines the owner ruled on 2026-11-02 (`docs/superpowers/specs/2026-10-14-relay-pairing-design.md` Verification), not the three the ticket cites; `cargo check -p ade-hook` is not required before story 4. Run in sequence from the worktree root. The root `node_modules` was symlinked from the main checkout (removed afterwards); `mobile/` got its own `npm ci`, because the main checkout's symlinked `@ade/protocol` resolved outside the worktree and failed.

| Line | Result (real output tails) |
|---|---|
| `cd relay && cargo test` | exit 0. 266 tests passed in total, no `FAILED` |
| `npx tsc --noEmit` | exit 0, no output |
| `npm test` | exit 0. `Test Files 149 passed (149)`, `Tests 1682 passed (1682)` |
| `cd src-tauri && cargo test` | exit 0. `test result: ok. 460 passed; 0 failed; 1 ignored`, then 12 passed and 2 passed |
| `cd mobile && npx tsc --noEmit && npx jest` | tsc exit 0. `Test Suites: 1 passed, 1 total`, `Tests: 6 passed, 6 total` |

**Criteria to tests** (all `ok` in the `cd src-tauri && cargo test` output):
- AC1: `agent_status::tests::a_terminal_token_is_the_hmac_of_its_pty_id`. The vector `3f8ccefd...094f` was re-derived with `openssl dgst -sha256 -mac HMAC -macopt hexkey:07...07` over `pty:12`; it matches. Env tokens for 12 and 13 are compared.
- AC2: `a_pty_token_is_refused_for_another_pty`, both directions (9 as 7, 7 as 9), 401, `{}`, state empty.
- AC3: `the_endpoint_refuses_and_changes_nothing`, "no PTY" case now expects 401 (the cases carry explicit codes).
- AC4: `a_malformed_pty_header_is_401` ("", "abc", "-1", "4294967296").
- AC5: `the_master_key_is_not_a_token`.
- AC6: `the_endpoint_takes_a_right_token_and_answers_empty`.
- AC7: `the_endpoint_refuses_and_changes_nothing` (every case now asserts its exact code: 401, 401, 403, 403, 405, 413, 413) and `the_endpoint_listens_on_loopback_only` (also asserts the Ok(9) path).
- AC8: the hook_forward test asserting `X-ADE-Token: tok` and `X-ADE-PTY: 7`, unchanged (`hook_forward.rs` is not in the diff).
- AC9: `pty::hook_env_tests::the_child_sees_the_reserved_id_and_this_ades_values`, unchanged (`pty.rs` is not in the diff).
- AC10: the `input_hash` tests in `hook_forward.rs`, unchanged.
- Old accessor: `grep -n "\.token()" src-tauri/src/agent_status.rs` finds nothing.

**Definition of Done**
- Slice: `git diff --stat a470b06..6ed9939` is `agent_status.rs`, `.ade/context/agent-events.md` and `.ade/knowledge/developer.md` (one line). The knowledge file is outside the ticket's list but is the developer's own notes file; not a code or scope change.
- Context Store: the token rows and the endpoint section of `agent-events.md` now say built for the token part; the `/open` rows stay Proposed. The 400 to 401 change and the new check order (PTY, token, method, Origin, Host, length) are recorded and match `screen()`.
- No assertion weakened: the old "not 200" check became an exact-code check.

**Deviation judged: the master is raw `[u8; 32]`, not hex in memory.** Acceptable. The master only ever keys the HMAC, so hex-in-memory would have to be decoded back to bytes first; AC1 itself keys with raw `[7u8; 32]`. The spec's wording "hex-encoded in memory" is stale. The context doc does not claim hex. Nothing is logged, put on a command line or put in an environment. Suggest the spec line be reworded when next edited.

**Mutants** (scratch copy of HEAD, own target dir, `cargo test --lib agent_status`; the repo was not touched):
- M1 compare against the master instead of the PTY token: killed (4 tests).
- M2 skip the PTY match (always check against PTY 9's token): killed (`a_pty_token_is_refused_for_another_pty`).
- M3 malformed header answers 400: killed (3 tests).
- M4 lenient PTY parse (`trim_start_matches("-")`): **survived**. `a_malformed_pty_header_is_401` only tries tokens for ids 9 and 0, and "-1" leniently read is 1. The code under test (`parse::<u32>()`) rejects "-1", so this is a test gap, not a defect.
- M5 every terminal gets PTY 0's token: killed.
- M6 message without the `pty:` prefix: killed.
- M7 token check disabled: killed (3 tests).

**Minor finding (not blocking):** add `st.token_for(1)` to the token list in `a_malformed_pty_header_is_401` so "-1" is covered as its comment claims. Dev to fix; no re-verification gate needed beyond `cargo test`.

**Verdict: PASS (Done).** Every AC maps to a named test that asserts it, the five lines exit 0, the slice is clean, the Context Store is updated. Manual checks: none required for this story.

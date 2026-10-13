---
title: 'Fleet shows background sub-agents as running until they finish'
type: 'bugfix'
ticket: ''
created: '2026-10-13'
status: 'built'
baseline_revision: 'c12859184ad261080ecd27a5d15311cad39f2ebd'
route: 'oneshot'
route_source: 'pinned'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the Fleet view a sub-agent that runs in the background is marked completed about a second after it starts, so the view says "0 running" while one is running, shows no sign of it working, and drops it once that second leaves the visible range. The owner reported all three. Cause: `parse_line` in `src-tauri/src/subagent.rs` treats every tool result for the Agent call as the finish, and a background agent's tool result is only the launch acknowledgement (the transcript line carries `toolUseResult.status: "async_launched"`). The real finish is written later as a `queue-operation` / `enqueue` line whose content is a `<task-notification>` naming the same tool-use id.

**Approach:** A launch acknowledgement is not a completion. A background sub-agent completes at its task notification's enqueue line, whatever its status. Foreground sub-agents and the Task-named tool behave as before. A second notification for a resumed agent only moves the end time.

</frozen-after-approval>

## Implementation Notes

- Oneshot, built by the orchestrating session. The cause was confirmed against a live session's transcript before any change: 15 spawns, each "completed" about 1 s after it started.
- First cut: one change in `parse_line` (acknowledgement is not a finish; the `enqueue` notification is). Its two tests were seen failing first.
- After review pass 1 the change grew: a `Launched` event, `Complete` carrying the notification's task id, store matching by call or agent, and `stale_background` for sessions that end without a notification. These later tests were written with the code, not before it.
- Files: `src-tauri/src/subagent.rs`, `src/stores/fleetStore.ts`, its test, `.ade/context/fleet-subagent-events.md`.
- Checked against real data by the reviewer: 223 of 223 background launches carry `agentId`, each equal to its notifications' task id and its transcript's file name; agent and shell task ids do not overlap.
- Known limits: the quiet check runs only when a folder's watcher starts; a sub-agent silent for 30 minutes while waiting on a nested foreground agent could be ended early at that moment (not seen; a later notification corrects it).
- Verification, run by the orchestrating session after the last change: see the closing line under the triage log.

## Plan Change Log

- 2026-10-13, review pass 1: the Intent says the notification names "the same tool-use id". Real transcripts show that holds for a sub-agent's first report only; after a follow-up the notification names the follow-up call or none. The approach line already asked for a resumed agent's later report to move the end time, so the task id is carried and matched too. No frozen text was changed.

## Review Triage Log

Pass 1, quick lens, 9 findings. Pass 2, 8 findings.

| Pass | Finding | Verdict | Action |
|---|---|---|---|
| 1 | Resumed agent's later notifications dropped | medium | patched: matched by agent id; tests in Rust and the store |
| 1 | Test pinned that drop | low | patched with the above |
| 1 | No test for a repeated notification | low | patched |
| 1 | `remote_launched`, `teammate_spawned` still complete at once | maybe-false | deferred: seen only as strings in the binary; a real transcript would settle it |
| 1 | A session quit mid-agent leaves the lane running for good | medium | patched: `stale_background` |
| 1 | One shared cursor can skip lines | low | deferred: pre-existing |
| 1 | Task-named spawn with its result, and a text `toolUseResult`, untested | low | patched |
| 1 | No test ties spawn, acknowledgement and notification together | low | patched in the store test |
| 1 | Plan record empty | rejected | filled in at this step |
| 2 | Quiet check runs only at watcher start | low | rejected as a code change (needs a timer for a rare case); contract and deferred entry reworded to say so |
| 2 | `retain` sequences untested | low | patched |
| 2 | `is_agent_id` untested, comment wrong | low | patched |
| 2 | A quiet agent with no timestamp would end "now" | low | patched: nothing is concluded |
| 2 | Omitted `agent_id` guard untested | low | patched |
| 2 | Contract file inaccurate in three places | low | patched |
| 2 | Plan drift | rejected | filled in at this step |
| 2 | Nested foreground run could look quiet | maybe-false | rejected as low: not observed, self-correcting; noted above |
| PR | A follow-up never reopens a finished lane | medium | patched: `Resumed` event from `toolUseResult.resumedAgentId` (163 of 215 follow-up calls in real transcripts carry it; the rest were queued for a running agent); the store reopens the record |
| PR | Quiet check ends a live agent blocked on a long command | medium | patched: nothing concluded while the session transcript was written in the last 30 minutes |
| PR | Notification tags read from the free-text body | low | patched: ids and status read from the header only |
| PR | `last_timestamp` blind behind a last line over 256 KB | low | patched: the tail grows until a timestamp is found or the file is read |
| PR | Quiet check runs only at watcher start | low | already rejected in pass 2; unchanged |
| PR | No sub-agent transcript, no conclusion | low | deferred |
| PR | Completion relies on the `enqueue` line alone | maybe-false | deferred: unverified |

PR review (2026-10-13, `/code-review` on #54), 7 findings: rows marked PR above. Their tests were written first and seen failing (5 in Rust, 1 in the store). Verification after these fixes: `cargo test` 392 + 12 + 2 passed, 0 failed; `npx tsc --noEmit` exit 0; `npm test` 136 files, 1507 tests passed. Not tried in the running app.

Earlier closing verification (2026-10-13, after the pass 2 fixes): `cargo test` 387 + 12 + 2 passed, 0 failed; `npx tsc --noEmit` exit 0; `npm test` 136 files, 1506 tests passed. Not tried in the running app.

## Verification

**Commands:**
- `cd src-tauri && cargo test` -- expected: all pass
- `npm test` -- expected: all files pass
- `npx tsc --noEmit` -- expected: exit 0

**Manual checks (if no CLI):**
- In the running app, start a background sub-agent in a Claude Code session and open the Fleet view on that terminal: the lane shows running until the agent reports back.

---
title: 'Agent status fixes from the PR #55 review, and a current-state read for the phone'
type: 'bugfix'
ticket: ''
created: '2026-10-14'
status: 'in-progress'
baseline_revision: '651afb447393d11b778ec57fc7b76aaf0cec4cc3'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: ['{project-root}/docs/superpowers/specs/2026-10-14-agent-status-design.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The review of PR #55 found one confirmed defect in Agent status, and nine more suspected ones. In the confirmed defect, a session whose Claude Code pid first appears during a liveness check is dropped at once, along with any pending prompt. Piece 2a (`docs/superpowers/specs/2026-10-14-relay-pairing-design.md`, "Depends on" and "State") can't start until these are closed. It also needs a non-test way to read every pane's current state.

**Approach:** Fix the confirmed defect. Take each suspicion test-first: write a test that shows the bad outcome. If it fails, fix the code until it passes. If it can't be made to fail, keep the test and record "not reproducible" with the reason. Add `AgentStatus::current()`.

## Boundaries & Constraints

**Always:**
- Piece 1's spec stays the contract. A fix may tighten a transition, but must not contradict the spec's state table or answer-key rule.
- Every item ends in a passing test.

**Never:**
- New features.
- Changes to the hook entry, the helper's forwarded fields or the endpoint's refusals.
- The detached-window toast, settings key order, or the low findings already rejected in plan-agent-status's triage log.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pid appears mid-check | session gets its first pid between `tracked()` and the drop | session kept | — |
| Auto-compaction | `SessionStart` with `source: compact` while working | stays working | — |
| Lost `SubagentStop` | sub-agent set non-empty, then `UserPromptSubmit` or `idle_prompt` | set cleared; a later `Stop` shows finished | — |
| Removed prompt denied | key removes A, A gets no result, B queued | the session's next `Stop` re-arms the rule | — |
| Event for a dropped session | `PostToolUse`/`Stop` etc. after `SessionEnd` or turn-off | no session created; only `SessionStart`, `UserPromptSubmit`, `PermissionRequest` create one | — |
| PTY removed by `attach` or `kill_pty` | shell gone, removal not through the reader callback | that PTY's state dropped | — |
| Payload over 4 MB | huge `tool_response` | the event is still forwarded, with fields and the input hash; stdin drained | Silent |
| Linux, app vs dev build | different `XDG_RUNTIME_DIR` | same lock file | — |
| User's own empty settings | `{}` or `{"hooks":{}}` existed before on→off | the file and `.claude/` are left as they were | — |
| Wire format | `AgentStatusUpdate` | `{"ptyId":3,"state":"needsYou"}`, `null`, and all five state names | — |

</frozen-after-approval>

## Code Map

- `src-tauri/src/agent_status.rs`:
  - `Core::apply` l.137-211; `HookEvent` l.39 has no `source` field, so add it.
  - `Session::new` l.77 creates a session on any event.
  - `answer_key` l.216, the `KeyRule` arming.
  - `drop_dead` l.267, with `check_processes` l.460-465, where a pid missing from `starts` reads as dead.
  - `AgentStatus` l.314; `snapshot()` is test-only at l.480; `update` l.423.
- `src-tauri/src/pty.rs`: `attach` removes the instance at l.86 on exit; `kill_pty` removes it at l.245. Neither calls `agent.forget_pty`. The reader's forget callback is at l.186.
- `src-tauri/src/hook_forward.rs`: `MAX_STDIN` and `forward()` use `stdin.take(MAX_STDIN).read_to_string`, so oversize input fails the parse.
- `src-tauri/src/usage.rs`: `lock_dir` l.799 (the `XDG_RUNTIME_DIR` branch); `edit_local_settings` with `remove_if_empty` l.871-889.
- Tests are inline `#[cfg(test)]` modules in each file. Payload fixtures are in `src-tauri/src/fixtures/agent-events/`.

## Tasks & Acceptance

**Execution:**
- [ ] `src-tauri/src/agent_status.rs` -- in `drop_dead`/`check_processes`, treat a pid not looked up as alive. -- This is the confirmed defect.
- [ ] `src-tauri/src/agent_status.rs` -- add `source` to `HookEvent`; `SessionStart` with `source: compact` keeps the phase. -- The compaction suspicion.
- [ ] `src-tauri/src/agent_status.rs` -- clear `subagents` on `UserPromptSubmit` and `idle_prompt`. -- The lost-`SubagentStop` suspicion.
- [ ] `src-tauri/src/agent_status.rs` -- the session's `Stop` re-arms a disarmed key rule while prompts are still pending. Rationale: no tool result arrived, so the turn is over, and the next key belongs to the next prompt. -- The re-arm suspicion.
- [ ] `src-tauri/src/agent_status.rs` -- create sessions only on `SessionStart`, `UserPromptSubmit` and `PermissionRequest`; other events for unknown sessions are ignored. -- The resurrection suspicion.
- [ ] `src-tauri/src/agent_status.rs` -- `pub fn current(&self) -> BTreeMap<u32, AgentState>`, not test-only. The test helper uses it. -- Piece 2a needs it.
- [ ] `src-tauri/src/pty.rs` -- call `forget_pty` wherever an instance is removed (`attach` on exit, `kill_pty`), keeping exactly one `thread::spawn(` in the file. -- The stale-PTY suspicion.
- [ ] `src-tauri/src/hook_forward.rs` -- read stdin to EOF. Parse only the forwarded keys and `tool_input`, skipping other values without holding them, so a huge `tool_response` neither fails the parse nor fills memory. -- The 4 MB suspicion.
- [ ] `src-tauri/src/usage.rs` -- on Linux, `lock_dir` always uses `~/.cache/ade`. -- The lock-folder suspicion.
- [ ] `src-tauri/src/usage.rs` -- remove the file or `.claude/` only when ADE's own enable created them. When enable creates either one, it writes a record `ade-created-<same hash>` beside the lock file, naming which it created. Disable removes the file only if the record names it and the object is empty, and `.claude/` only if the record names it and the folder is empty, then deletes the record. Nothing is written into the user's settings for this. -- The "deletes the user's own empty file" suspicion.
- [ ] `src-tauri/src/agent_status.rs` tests -- a wire-format test asserting the JSON shape. -- A verification gap.
- [ ] Tests for every matrix row, inline in each touched file. Where a suspicion can't be reproduced, keep its test and add a "not reproducible: <why>" line to Implementation Notes.
- [ ] `.ade/context/agent-events.md` -- update the transitions (compaction, session creation, re-arm on `Stop`, clearing the sub-agent set) and `current()`.

**Acceptance Criteria:**
- Given a live session whose Claude Code pid is first reported while a liveness check runs, when the check finishes, then the session and its pending prompt are still there.
- Given piece 2a's bridge, when it calls `AgentStatus::current()` from non-test code, then it gets every PTY's state.
- Given the full suite, when the three checks run, then they pass.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all pass
- `cd src-tauri && cargo test` -- expected: all pass

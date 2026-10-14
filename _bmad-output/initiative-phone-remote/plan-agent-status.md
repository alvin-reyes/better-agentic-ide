---
title: 'Agent status: each tab shows when its Claude Code agent needs you'
type: 'feature'
ticket: ''
created: '2026-10-14'
status: 'built'
baseline_revision: '98993e71870fbc5bf8fd83918ea005c55788e831'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/docs/superpowers/specs/2026-10-14-agent-status-design.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ADE can't tell whether a tab's Claude Code agent is working, waiting for the next prompt, or blocked on a permission prompt, plan approval or question, so a blocked agent in a background tab goes unnoticed. Phone pieces 2 and 3 need these states too.

**Approach:** Build piece 1 of the owner-approved spec `docs/superpowers/specs/2026-10-14-agent-status-design.md`, except the two parts deferred in this initiative's `deferred-work.md` (the "not receiving events" warning with its process-tree poll and no-children backstop, and the worktree offer). The spec is the contract: where this plan and the spec disagree, the spec wins.

## Boundaries & Constraints

**Always:**
- The hook command is exactly `"${ADE_HOOK_BIN:-true}"` with `"timeout": 5`, registered for the spec's 10 events. ADE writes it only when the user turns the toggle on, and removes only its own entries when the toggle goes off.
- The helper forwards only the spec's fields, the Claude Code pid and that process's start time. It always prints `{}`, always exits 0, and takes at most 2 s.
- The endpoint listens on `127.0.0.1` only, applies all of the spec's refusals, and always answers `{}`.
- State is keyed by (PTY id, session_id), and the transitions follow the spec's table. So does the answer-key rule: real key presses only, the oldest pending prompt, re-armed only by a `PermissionRequest` into an empty pane or the matching `PostToolUse*`.
- Every ADE write to `settings.local.json`, presets included, runs under the cross-process lock and re-reads the file first.
- The owner's checks are unchanged: `npx tsc --noEmit`, `npm test`, `cargo test` in `src-tauri`. They must pass on a fresh checkout with no extra step.

**Never:**
- `http` hooks.
- Hook decisions.
- Prompt text, `tool_input` or `tool_response` reaching ADE.
- Rewriting project files at startup.
- `Elicitation`.
- A Windows toggle.
- The deferred warning or the worktree offer.
- Anything from piece 2 or later: relay, phone, sending prompts or `!` commands.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prompt in a background tab | `PermissionRequest`, pane not in view | Tab dot and Fleet card show **needs you**; one toast opens the tab | — |
| Approved in the terminal | matching `PostToolUse` | Prompt removed; working | — |
| Esc, then typed feedback | first answering key, then more keys | Only the oldest prompt is removed | — |
| Unrelated tool finishes during feedback | non-matching `PostToolUse` | Doesn't re-arm; the queued prompt stays | — |
| `claude -p` in the same pane | its own session's events | Interactive session untouched | — |
| Claude Code crashed, shell alive | pid gone, or reused with another start time | Session dropped within 5 s | — |
| Session outside ADE | `ADE_HOOK_BIN` unset | `true` runs; nothing sent, no hook error | — |
| ADE down | helper can't connect | `{}`, exit 0, within 2 s | Silent |
| Bad request | wrong token, `Origin`, foreign `Host`, non-POST, >16 KB | Refused, state unchanged | Body never logged |
| Settings malformed or unexpected shape | toggle on | Nothing written | Message in the panel |
| Endpoint won't bind, or helper missing | app start | None of the 4 vars set; the panel says why | Terminals as before |

</frozen-after-approval>

## Code Map

- `src-tauri/src/pty.rs`:
  - `create_pty` l.91-168. Env is set at l.126-138, then spawn at l.140, then the id is taken at l.148: reserve the id before spawning.
  - The forget callback (l.163-165) is the "shell exited" signal.
  - Leave `get_foreground_pid` (l.360) alone.
  - A test requires exactly one `thread::spawn(` in this file (l.579-582).
  - The macOS `proc_pidinfo` FFI is at l.266.
- `src-tauri/src/lib.rs`:
  - `run()` l.413, `.manage` l.420-422, `generate_handler!` l.423-486.
  - There is no `.setup()` yet.
  - Rust talks to the frontend through `tauri::ipc::Channel` only, as `subagent.rs` `emit_from_offset` (l.340) does.
- `src-tauri/src/usage.rs`: `local_settings_path` l.714, `load_settings` l.718, `save_settings` l.725, `apply_presets` l.755, `keep_out_of_git` l.795, `project_folder` l.618, and the commands at l.827-834. `src-tauri/src/state.rs` `atomic_write` l.65 renames over its target.
- `src-tauri/Cargo.toml`: has `sysinfo 0.33`. Add `tiny_http`, `hmac`, `sha2`, `getrandom`, `fs4`. Make it a workspace with the member `ade-hook`.
- `src-tauri/tauri.conf.json` `bundle` l.29-50 has no `externalBin`. `.github/workflows/release.yml` runs `npx tauri build` at l.147 and l.160.
- `src/hooks/useTerminal.ts`: `attachCustomKeyEventHandler` at l.270; `createInstance` l.381, `setPtyId` l.421.
- `src/stores/tabStore.ts`: `Pane.ptyId` l.8.
- `src/components/TabBar.tsx`: badges at l.218-230.
- `src/components/fleet/FleetGroups.tsx`: `onOpenTab` l.56.
- `src/App.tsx`: `showToast` l.163. `src/hooks/useContextGuard.ts` l.9-25: `ToastAction.run`.
- `src/components/TokensPanel.tsx`: the settings.local.json section, l.379-395.
- Tests: Rust uses inline `#[cfg(test)]` modules with fixtures in `src-tauri/src/fixtures/`; TS uses vitest `__tests__` folders.

## Tasks & Acceptance

**Execution:**
- [ ] `src-tauri/src/fixtures/agent-events/` -- capture trimmed real payloads with the spike method:
  - one per registered event;
  - a sub-agent's prompt and tool pair;
  - the native install's process shape.

  Also record that a call's two input hashes are equal, and whether `Elicitation` fires. -- So the tests use real shapes.
- [ ] `src-tauri/ade-hook/` (new crate) + `src-tauri/src/hook_forward.rs` (shared via `#[path]`) -- build the helper:
  - field filter;
  - keyed HMAC-SHA-256 over canonical JSON;
  - pid and start time of the first recognised Claude Code process, at most 5 parents up;
  - a 2 s POST over `TcpStream`;
  - always `{}`, exit 0.

  -- Sharing the file means the root crate's `cargo test` tests the helper.
- [ ] `src-tauri/src/agent_status.rs` (new) -- build:
  - the `tiny_http` endpoint and its refusals;
  - a `getrandom` token;
  - the per-session state, its transitions and the answer-key rule;
  - drops on PTY exit, on the pid exiting (a 5 s check of the tracked pids only), and on toggle off;
  - per-PTY state streamed over a `Channel`.

  -- The core.
- [ ] `src-tauri/src/pty.rs` -- reserve the id before spawn; remove the 4 inherited variables, then set ADE's own when the endpoint is up and the helper exists; notify `agent_status` from the forget callback. -- Tags events with their pane.
- [ ] `src-tauri/src/usage.rs` -- add:
  - the lock (in a per-user folder, no-follow, mode 0600);
  - a re-read under the lock;
  - writes through symlinks;
  - refusal of unexpected shapes.

  Then build hook enable/disable and status on it (idempotent, cleans up empty containers), and move `apply_presets` under the lock. -- Safe settings writes.
- [ ] `src-tauri/src/lib.rs` -- a `.setup()` that starts the endpoint, plus the commands: toggle, status, `agent_status_watch(Channel)`, `agent_status_key(pty_id)`. -- Wiring.
- [ ] `src-tauri/Cargo.toml`, `src-tauri/tauri.release.conf.json` (new, holds `externalBin`), `.github/workflows/release.yml` -- the workspace and dependencies; build and copy `ade-hook-<triple>` before `tauri build --config tauri.release.conf.json`. -- Ships the helper in releases only.
- [ ] `src/stores/agentStatusStore.ts` (new), `src/hooks/useTerminal.ts` -- subscribe to the channel and roll state up pane → tab, most urgent first; report answering keys from the key handler only. -- Frontend state.
- [ ] `src/components/TabBar.tsx`, `src/components/fleet/FleetGroups.tsx`, `src/App.tsx` -- dots for needs you and waiting; a toast, once per pane, for a pane that isn't in view, which opens the tab. -- What the user sees.
- [ ] `src/components/TokensPanel.tsx` -- the toggle and its status line (on, off, or the failure reason), hidden on Windows. -- The control.
- [ ] Tests -- every case in the spec's Testing section except the deferred warning, inline in Rust and in `__tests__` in TS. Plus `scripts/agent-status-check.sh`, the manual check against real Claude Code. -- Proof.
- [ ] `.ade/context/agent-events.md`, `docs/guide/` -- the contract, and an "Agent status" section in the guide.

**Acceptance Criteria:**
- Given Agent status is on and Claude Code is running in a pane of a tab not in view, when it asks for permission, plan approval or an `AskUserQuestion` answer, then the tab and its Fleet card show **needs you** within 1 s, and one toast offers to open the tab.
- Given Claude Code started in iTerm in the same project, when it runs tools, then it shows no hook error and ADE's state doesn't change.
- Given the toggle is turned on and then off, then `settings.local.json` is as it was before.
- Given a fresh checkout, when the three checks run, then they pass with no extra step.

## Implementation Notes

## Plan Change Log

## Review Triage Log

Pass 1 (quick lens), 2026-10-14. Verdicts: 0 high, 2 medium, 5 low, 0 false, 0 maybe-false.

| # | Finding | Verdict | Route | Evidence / action |
|---|---|---|---|---|
| 1 | On then off with no prior settings.local.json leaves `.claude/` and `{}`; off on a never-enabled project creates `.claude/` | medium | patch | `edit_local_settings` calls `create_dir_all` before reading; `agent_hooks_disable` writes even when the object ends empty. Fix: off on a missing file is a no-op; an object left empty removes the file and an empty `.claude/`. Test the absent-before case. |
| 1b | Rewrite changes key order and formatting | low | defer | Pre-existing: `save_settings` already reorders for presets; changing it means `preserve_order` crate-wide. |
| 2 | No toast for a pane in a detached window | low | reject | Real, but detached windows are single bare tabs the multi-window spec removes; the fix adds a toast host to `DetachedApp`. |
| 3 | Guide says one toast per prompt | low | patch | `needsYouToasts` toasts once per pane until it leaves needs you; correct the sentence. |
| 4 | PTY test bypasses `create_pty` | low | reject | Real test gap; the diff shows `reserve_id` before `spawn_command` in `create_pty`. Covering it needs the command build extracted. |
| 5 | npm-global and npx process shapes guessed | medium | patch | `processes.json` `_note` says so. Capture real shapes (npx and a temp-prefix npm global) and test against them. |
| 6 | Manual check builds the settings itself | low | patch | `scripts/agent-status-check.sh` uses Python `json.dump`; make it write through `agent_hooks_enable`. |
| 7 | No ADR for workspace, bundled helper, loopback endpoint | low | patch | `.ade/rules.md` asks for an ADR for significant lasting decisions; add one. |

## Design Notes

The spec's spike tables are the evidence for every behaviour above. Don't re-derive them; re-run the spike method only to capture fixtures. The helper's logic is one file compiled into both crates, so `cargo test` proves the helper without any change to the checks.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: exit 0
- `npm test` -- expected: all pass
- `cd src-tauri && cargo test` -- expected: all pass

**Manual checks:**
- `scripts/agent-status-check.sh` against the installed Claude Code, with the helper at a path containing a space. Expect the events to arrive, no hook error and no settings error, and ADE's `hooks` to survive a "don't ask again" answer. Record the version.
- In a dev build, raise a prompt in a background tab. Expect the dot and the toast, and clicking the toast opens the tab.

# Agent status: hook events

How ADE learns what each terminal's Claude Code agent is doing. Spec:
`docs/superpowers/specs/2026-10-14-agent-status-design.md` (piece 1). ADR:
`decisions/0003-agent-status-hooks-helper-endpoint.md`. Checked
against Claude Code **2.1.299**; fixtures in `src-tauri/src/fixtures/agent-events/`.

## The hook entry

- Written to the project's `.claude/settings.local.json` only when the user
  turns Agent status on (Tokens panel); removed, with any matcher group, event
  and `hooks` it leaves empty, when turned off. Turning on records what it
  created (`ade-created-<same hash as the lock>` beside the lock file, one
  line each: `settings.local.json`, `.claude`, `hooks`; written before the
  settings, and nothing is written into the settings for this). Turning off
  removes an empty `hooks` only if the record names it, the file only if the
  record names it and its object is empty, and `.claude/` only if the record
  names it and it is empty, then deletes the record. A user's own empty
  file, `hooks` or folder is never removed. Turning off where nothing was on writes nothing. "The project" is the folder's
  git top level (`project_root_of`), the folder itself outside git.
- Every entry: `{ "type": "command", "command": "\"${ADE_HOOK_BIN:-true}\"", "timeout": 5 }`,
  no matcher. An ADE entry is any hook whose `command` is exactly that string.
- Registered for: `SessionStart`, `UserPromptSubmit`, `PermissionRequest`,
  `PostToolUse`, `PostToolUseFailure`, `Notification`, `SubagentStart`,
  `SubagentStop`, `Stop`, `SessionEnd`. Not `Elicitation` (it fires on 2.1.299,
  but piece 1 gives it no state). Never `http` hooks; never a hook decision.
- Every ADE write to `settings.local.json` (presets and hooks) holds an
  exclusive lock (`ade-settings-<sha256 of the path, 16 hex>.lock` in `~/.cache/ade`
  on macOS and Linux, never `$TMPDIR` (macOS purges it) or `$XDG_RUNTIME_DIR`; `O_NOFOLLOW`, mode
  0600) and re-reads the file under it. A symlinked file is written through. An
  unexpected `hooks` shape is refused with a message, and nothing is written.

## Environment of every ADE terminal

Removed from the inherited environment first, then set when the endpoint is
listening and the helper exists (else none of the four is set):

| Variable | Value |
|---|---|
| `ADE_HOOK_BIN` | absolute path of `ade-hook`, beside ADE's executable |
| `ADE_HOOK_PORT` | the endpoint's port on 127.0.0.1, new each launch |
| `ADE_HOOK_TOKEN` | 64 hex chars from `getrandom`, new each launch |
| `ADE_PTY_ID` | the pane's PTY id, reserved before the shell is spawned |

## The helper (`ade-hook`, logic in `src-tauri/src/hook_forward.rs`)

- Reads the hook JSON on stdin to its end, whatever its size, keeping only the
  forwarded fields and `tool_input` (other values, such as a huge
  `tool_response`, are skipped as read, never held). Forwards only `hook_event_name`, `session_id`,
  `cwd`, `source`, `reason`, `notification_type`, `tool_name`, `agent_id`,
  `agent_type` (string values), plus:
  - `input_hash`: HMAC-SHA-256 of `tool_input`, keyed with `ADE_HOOK_TOKEN`,
    over its canonical JSON (keys sorted, no whitespace), lowercase hex;
  - `pid`, `pid_start`: the first process recognised as Claude Code walking up
    from the helper's parent, at most 5 processes, and its start time
    (seconds). Absent when none is recognised.
- Prompt text, `tool_input` and `tool_response` never leave it.
- `POST /` to `127.0.0.1:$ADE_HOOK_PORT`, headers `Host: 127.0.0.1:<port>`,
  `X-ADE-Token`, `X-ADE-PTY`; gives up after 2 s in all. Always prints `{}`,
  always exits 0, prints nothing else.

## The endpoint (`src-tauri/src/agent_status.rs`)

`tiny_http` on `127.0.0.1:0`, started in `.setup()` before any PTY. Refuses
(state unchanged): a wrong or missing token (constant-time compare, 401), any
`Origin` (403), a `Host` other than `127.0.0.1:<port>` (403), any method but
`POST` (405), a body over 16 KB (413), no PTY id (400). No CORS headers, bodies
never logged. Every answer's body is `{}`.

## States

Per (PTY id, `session_id`). Pane = most urgent of its sessions; tab = most
urgent of its panes: `needsYou` > `waiting` > `working` > `ready` > `finished`.

| Event | Effect on that session |
|---|---|
| `SessionStart` | ready; with `source: compact` a known session keeps its state (a new one starts ready) |
| `UserPromptSubmit` | working; clears pending prompts, waiting and the sub-agent set |
| `PermissionRequest` | adds a pending prompt (ADE's own id, `tool_name`, `agent_id`, `input_hash`) |
| `PostToolUse`, `PostToolUseFailure` | removes the oldest pending prompt with the same (`tool_name`, `agent_id`, `input_hash`) |
| `Notification` `idle_prompt` | waiting; clears pending prompts and the sub-agent set. Other types: nothing |
| `SubagentStart` / `SubagentStop` | adds / removes a running sub-agent (an unknown id: nothing) |
| `Stop` | finished; shows working while sub-agents run |
| `SessionEnd` | the session is dropped |

Any pending prompt makes the session `needsYou`. Only `SessionStart`,
`UserPromptSubmit` and `PermissionRequest` create a session; any other event
for a session ADE doesn't have (ended, dropped by turning off or by the
liveness check) is ignored.

**Answering keys.** A real key press (xterm's key-event handler, `keydown`, no
modifier) of Enter, Esc, a digit, `y` or `n` in a pane that is `needsYou` calls
`agent_status_key(ptyId)`. That removes the pane's oldest pending prompt, for
the first such key since the rule was armed. Armed only by a
`PermissionRequest` into a pane with no pending prompts, by the
`PostToolUse*` matching the prompt a key removed, or by the `Stop` of the
session that prompt was in, when it was the main agent's (no `agent_id`) and
the pane still has prompts pending (no result came, so the turn is over and
the next key is for the next prompt). A sub-agent's prompt never re-arms on
`Stop`: the sub-agent may still be running.

**Dropping.** A PTY's removal drops its sessions: the shell exiting, a window
attaching to a PTY whose shell had ended, or `kill_pty`. Every 5 s the
tracked `pid`s are checked; a session whose pid has gone, or now has another
start time, is dropped. A session with no `pid` is never dropped by that
check, nor one whose pid was first reported while the check ran (it wasn't
looked up).
Turning Agent status off drops the sessions whose `cwd` is in the project.

## Commands and stream

- `agent_status_get({ cwd })`, `agent_status_toggle({ cwd, on })` →
  `{ project, enabled, unavailable }` (`unavailable`: why terminals get no
  variables). Refused on Windows, which shows no toggle.
- `agent_status_watch({ onEvent: Channel })`: `{ ptyId, state }` per pane, the
  current ones first, then each change; `state` null once the pane has no live
  session.
- `agent_status_key({ ptyId })` → whether a prompt was removed.
- In Rust, `AgentStatus::current() -> BTreeMap<u32, AgentState>`: every pane
  with a live session and its state, for non-test callers (piece 2a's bridge).
- Wire format of an update: `{"ptyId":3,"state":"needsYou"}`, `state` null
  when gone; states `finished`, `ready`, `working`, `waiting`, `needsYou`.

## Known limits

- **Forgeable status.** The token is in the environment of everything started
  in an ADE terminal, so any of it can post events. Fine for a status dot.
  Piece 2 must not let a phone approve a `PermissionRequest` on this alone.
- **Stale environment.** A long-lived process started in an ADE terminal (a
  tmux server) keeps that ADE's variables after it quits; its sessions report
  to nobody. If the helper's path has gone, they show a hook error.
- **tmux, ssh**: not covered. **MCP elicitation**: no state in piece 1.
- Not yet built (deferred): the "not receiving events" warning with its
  process-tree poll and no-children backstop; the worktree "turn on here too"
  offer.

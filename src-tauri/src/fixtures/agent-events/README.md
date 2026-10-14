# Agent-event fixtures

Real Claude Code hook payloads, captured on 2026-10-14 against Claude Code
**2.1.299** (native install, Haiku, `--permission-mode default`) with the
spike method: a scratch git project whose `.claude/settings.local.json`
registered a `command` hook (`"${SPIKE_HOOK}"`, a logging script at a path with
a space, `"timeout": 5`) for the ten events ADE registers plus `Elicitation`,
driven through a pty by a script that typed prompts and answered prompts.

Trimmed: paths replaced with `/tmp/ade-spike/...`, long strings cut. Every
field Claude Code sent is otherwise kept, so the helper's tests can prove the
prompt, `tool_input` and `tool_response` never leave it.

| File | Event |
|---|---|
| `session-start.json`, `session-start-clear.json` | `SessionStart` (`startup`, `clear`) |
| `user-prompt-submit.json` | `UserPromptSubmit` |
| `permission-request.json`, `post-tool-use.json` | one approved `Bash` call (`touch`) |
| `post-tool-use-failure.json` | `PostToolUseFailure` (`ls` of a missing folder) |
| `notification-permission-prompt.json`, `notification-idle-prompt.json` | `Notification` |
| `subagent-start.json`, `subagent-stop.json` | a foreground sub-agent |
| `permission-request-subagent.json`, `post-tool-use-subagent.json` | the sub-agent's tool needing approval, then done |
| `stop.json` | `Stop` |
| `session-end-clear.json`, `session-end-exit.json` | `SessionEnd` (`clear`, `prompt_input_exit`) |
| `elicitation.json` | `Elicitation` from a stdio MCP server |
| `permission-request-ask-mcp.json`, `post-tool-use-ask-mcp.json` | the MCP tool call that elicited |
| `processes.json` | process shapes for recognising Claude Code |

Findings:

- A call's `PermissionRequest` and its `PostToolUse` carry the same
  `tool_input` (main session, sub-agent and MCP tool alike), so their input
  hashes are equal.
- `Elicitation` **does fire** on 2.1.299 (`mcp_server_name`, `mode: "form"`,
  `requested_schema`), followed by `Notification` `elicitation_response`. ADE
  does not register it in piece 1.
- A `SubagentStop` can arrive for an `agent_id` that had no `SubagentStart`
  (an internal agent with an empty `agent_type`). Removing an unknown
  sub-agent is a no-op.
- The native install's process: kernel name `2.1.299`, executable
  `~/.local/share/claude/versions/2.1.299`, `argv[0]` `claude`. The hook ran
  as its direct child.
- The npm-global and `npx` installs (2.1.299) both run a native `claude.exe`
  from the package's `bin/`, reached through a `claude` link: kernel name
  `claude.exe`, `argv[0]` ending in `claude`. Under `npx` its parent is
  `node` (`npm exec @anthropic-ai/claude-code`).
- `echo` ran without a permission prompt; `touch` needed one.

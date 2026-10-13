# Fleet sub-agent events

What `watch_subagents` (`src-tauri/src/subagent.rs`) sends to the fleet store
(`applyEvent` in `src/stores/fleetStore.ts`), read from Claude Code's transcripts.

| Event | Fields | Written when |
|---|---|---|
| `Spawn` | `id`, `agent_type`, `description`, `model`, `started_at` | an `Agent` (or older `Task`) tool call; `id` is the tool-use id |
| `Launched` | `id`, `agent_id` | the tool result of a background sub-agent (`toolUseResult.status` is `async_launched`). It is the launch acknowledgement, not a finish |
| `Complete` | `id`, `agent_id`, `finished_at` | any tool result that is not a background launch acknowledgement (`agent_id` null), whatever the tool; or a `queue-operation` / `enqueue` line whose content begins with `<task-notification>` and carries a `<status>` |

- The store keeps only what matches a sub-agent it has a `Spawn` for. Tool results of other tools, and notifications for background shell commands, Skill calls and sub-agents launched by other sub-agents, match no record and are ignored.
- A notification's `id` is the tool-use id it names, empty when it names none; `agent_id` is its `<task-id>`, null when that is not a plain id (letters, digits, `-`, `_`). After a follow-up message a sub-agent reports again, naming the follow-up call or no call, so the store matches a record by `id` or by `agent_id`. An end time only moves later.
- When the watcher for a folder starts (the first fleet view on that folder opens), a background sub-agent that was launched, never reported, and whose own transcript (`<session>/subagents/agent-<agent_id>.jsonl`) has not been written for 30 minutes is completed at that transcript's last timestamp. Without that file, or a timestamp in it, nothing is concluded. The check does not run again while a view on that folder stays open.

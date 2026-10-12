# The `token_usage` report

What the Tauri command `token_usage` (`src-tauri/src/usage.rs`) returns to the
frontend, mirrored by `UsageReport` in `src/lib/tokenUsage.ts`. Field names are
camelCase over IPC. Prices are applied in the frontend only (`costOf`).

## `UsageReport`

| Field | Type | Meaning |
|---|---|---|
| `sessions` | `SessionUsage[]` | One per main transcript with usage in the period, newest activity first |
| `filesScanned` | number | Transcript files read, main and sub-agent |

## `SessionUsage`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | The transcript's file name without `.jsonl` |
| `cwd` | string or null | Folder the session was started in |
| `title` | string or null | First thing the user typed, at most 100 characters |
| `firstAt`, `lastAt` | ISO-8601 string or null | First and last response in the period; `lastAt` includes sub-agents |
| `models` | `ModelUsage[]` | Main conversation and sub-agents together, per model |
| `subagentRequests` | number | Requests made by sub-agents |
| `contextTokens` | number | Prompt size of the latest main-conversation request, whatever the period |
| `peakContextTokens` | number | Largest prompt size of a main-conversation request in the period |
| `model` | string or null | Model of the latest main-conversation request |
| `compactions` | number | Compactions of the main conversation in the period, each counted once |
| `commandRuns` | number | Bash tool results in the period, main conversation and sub-agents |
| `commandOutputChars` | number | Their length in characters, added up |
| `largestCommandOutput` | number | The longest single one, in characters |

## `ModelUsage`

`model`, `requests`, `input`, `output`, `cacheWrite5m`, `cacheWrite1h`,
`cacheRead`: token counts for one model, one response counted once.

## How compactions are counted

Claude Code writes two lines for one compaction: a `compact_boundary` system
line and an `isCompactSummary` user line. Boundaries and summaries inside the
period are counted separately and the larger count is reported, so a
compaction counts once and a transcript with only one kind of line still
counts. The period is applied to each line's own timestamp; a line with no
timestamp is counted.

## How command output is counted

- A result counts when it is a `tool_result` block on a `user` line whose
  `tool_use_id` matches a `tool_use` block named `Bash` earlier in the same
  transcript file. Results of other tools, and results whose call is not in
  the file, are ignored.
- Its size is the number of characters in the result's `content`: the string
  itself, or the `text` of each text block when `content` is a list. Other
  block types add nothing.
- The period is applied to the timestamp of the line carrying the result. A
  line with no timestamp is counted, as responses are.
- A session's figures are the sum over its main transcript and its sub-agent
  transcripts; `largestCommandOutput` is the maximum.
- Only the counts leave the scan. The text is never stored, returned or shown.
- The frontend turns characters into tokens at four to a token
  (`tokensForBytes`).

`ContextAudit` (`context_audit`) is a separate report and has no command-output
fields.

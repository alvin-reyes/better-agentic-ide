# Fleet Visualizer — Design

**Date:** 2026-09-03
**Status:** Approved for planning

## Problem

Agent activity is scattered across three overlapping surfaces:

| Surface | Lines | Data | Shape |
|---|---|---|---|
| `AgentDashboard.tsx` | 486 | `agentTrackerStore` — one session per pane, with status, duration, token/cost estimates | Modal, Active/History tabs |
| `SubagentPanel.tsx` | 83 | `subagentStore` — sub-agents parsed from Claude transcripts | Modal, flat list |
| `OrchestratorTab.tsx` | 675 | `orchestratorStore` | Full tab |

None answers the question that actually matters when several agents are working at once: **what is running right now, what did it spawn, and how do those runs overlap in time?**

A flat list cannot express concurrency. Two agents running simultaneously and two running back-to-back look identical.

### `SubagentPanel` has never worked

`parse_line` (`src-tauri/src/subagent.rs:32`) matches tool-use blocks named `"Task"`. The sub-agent tool is named `Agent`.

Measured across every transcript in `~/.claude/projects/`:

```
content block types: text 45235, thinking 40688, tool_result 20755, tool_use 20640
tool_use names:      Bash 8762, Edit 3179, Read 1526, Agent 1140, Write 1068, ...
Task tool_use blocks: 0   (with timestamp: 0)
```

Zero matches in 20,640 tool-use blocks. `SubagentPanel` has never displayed a single sub-agent, and its empty state ("They appear when Claude Code runs a Task") documents the same wrong assumption. Fixing this is a precondition for the timeline, not a side quest.

## Goals

- One surface showing every agent across panes and tabs, with sub-agents nested under their parent.
- Show **concurrency over time** — overlaps, gaps, and what ran when.
- Open with real history rather than an empty view.
- Delete `AgentDashboard` and `SubagentPanel`, preserving the features worth keeping.

## Non-goals

- Reworking `OrchestratorTab` or `orchestratorStore`. Out of scope.
- Lane virtualization. A few dozen lanes render fine; revisit if it bites.
- Zoom/pan beyond fixed range presets.
- Correlating transcript `sessionId` to a specific pane (see [Sub-agent parentage](#sub-agent-parentage)).

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Layout | Swimlane timeline | Only form that shows concurrency. Absorbs history natively instead of as a separate mode. |
| Container | Modal peek + expandable tab | Modal for the glance, tab for reading. Both wrap one shared timeline component. |
| History source | Backfill from transcripts on open | Already implemented — `emit_from_offset(path, 0, …)` replays the file before tailing. Real timestamps, survives restarts, no new persistence. |
| Model ownership | Unified `fleetStore` in TypeScript | The merge is view logic. Rust stays a dumb event source; pane/provider/cost state already lives in the frontend. |

Approaches rejected: Rust-side aggregation (would require teaching Rust about panes and tabs, and is far harder to test); a thin derived selector over both existing stores (smallest diff, but leaves three overlapping stores — fails the consolidation goal).

## Data layer

### Rust changes (`src-tauri/src/subagent.rs`)

1. **Tool name.** Match `"Agent"`; keep `"Task"` as a fallback for older transcripts.
2. **Timestamps.** `parse_line` already receives the whole line, so it reads the top-level `timestamp` (ISO 8601). `Spawn` gains `started_at`, `Complete` gains `finished_at`. Also capture `model` from the tool input.
3. **History depth.** `newest_transcript` returns only the newest JSONL, capping history at the current session. Widen to the 3 most recent transcripts by mtime, replayed oldest-first so events arrive in chronological order.

Verified available in the transcript data:

```
Agent tool_use blocks: 1140
input keys: description 1140, prompt 1140, subagent_type 1137, run_in_background 1092, model 997
block id fields: id 1140
tool_result blocks: 81 (with timestamp: 81)
```

Lines lacking a `timestamp` are session metadata, not message lines; they produce no events, exactly as today.

### Fleet model

```ts
interface FleetLane {
  id: string;
  kind: "agent" | "subagent";
  parentId: string | null;        // subagent → owning agent lane
  tabId: string | null;
  paneId: string | null;
  label: string;                  // "claude" | "Explore"
  detail: string;                 // subagent description
  provider: string | null;        // claude | codex | gemini | ollama
  model: string | null;
  startTime: number;              // epoch ms
  endTime: number | null;         // null = still running
  status: "running" | "completed" | "cancelled";
  costCents: number | null;       // agents only
  tokens: { input: number; output: number } | null;
}
```

`fleetStore` merges `agentTrackerStore.sessions` (top-level lanes, cost/tokens) with sub-agent events (child lanes). `subagentStore` is deleted; `agentTrackerStore` remains and keeps owning cost estimation.

### Sub-agent parentage

Sub-agents arrive from a transcript watched **per-cwd**; top-level sessions are tracked **per-pane**. When two panes share a working directory, nothing in the available data identifies which pane spawned a given sub-agent — the transcript does not record it and neither does the pane.

**Resolution:** group the timeline **project (cwd) → pane → sub-agents**. A sub-agent nests under a pane's agent when exactly one agent session is running in that cwd; otherwise it renders under the project group, unattached.

This is truthful about what is known and degrades gracefully rather than guessing. Threading transcript session IDs through PTY spawn would resolve it properly and is deliberately deferred.

## Components

| File | Role |
|---|---|
| `stores/fleetStore.ts` | Merge + selectors. No React, no IPC. |
| `hooks/useFleetData.ts` | Owns the sub-agent `Channel` watch; feeds the store. One watcher regardless of open views. |
| `components/fleet/FleetTimeline.tsx` | Presentational only: props in (`lanes`, `range`, `now`, `onSelect`), DOM out. No store access, no `invoke`. |
| `components/fleet/FleetPanel.tsx` | Modal wrapper: overlay, Esc, summary strip, "Expand ↗". |
| `components/fleet/FleetTab.tsx` | Tab wrapper: range control, detail pane on bar click. |

Keeping `FleetTimeline` purely presentational is what prevents the two containers from becoming two timeline implementations, and keeps each file small enough to test independently. The largest new file should land well under 200 lines, against the 486-line `AgentDashboard` it replaces.

### Container behaviour

- **Range presets:** `5m`, `15m`, `1h`, `all`. `all` fits the earliest lane start to now.
- **Modal** is fixed at `15m` with no range control — it is a glance surface. Its "Expand ↗" opens the fleet tab (creating it if absent, focusing it if present) and closes the modal, so only one view is ever live.
- **Tab** owns the range control and the detail pane.
- **Live edge:** the `now` boundary advances on a 1s interval while any lane is running, and stops when none are. Running bars extend to `now`.

## Migration

**Deleted:** `AgentDashboard.tsx` (486), `SubagentPanel.tsx` (83), `subagentStore.ts` (40), `subagentStore.test.ts`. Net line removal even after the new code lands.

**Wiring:**

- `tabStore.ts:29` — add `"fleet"` to the tab-type union; add `addFleetTab()`
- `App.tsx` — collapse `dashboardOpen` and `subagentsOpen` into one `fleetOpen`; add the `fleet` case to the tab renderer
- `useKeybindings.ts:102` — `Cmd+.` opens the fleet panel, preserving existing muscle memory
- `CommandPalette.tsx:72-73` — the two entries become "Fleet: Toggle panel" and "Fleet: Open tab"

**Features carried over from `AgentDashboard`:**

1. **Click a session → jump to that pane** (`AgentDashboard.tsx:79-80`) becomes click-an-agent-lane.
2. **Cost/token totals** move to the summary strip, present in both containers.
3. **Active/History tabs** collapse into the range control — history is simply further left on the axis. `clearHistory` moves to the tab view.

**Ordering constraint:** build the summary strip *before* deleting `AgentDashboard`. It is currently the only place cost is displayed, so deleting it first would leave a window with no cost visibility at all.

## Testing

TDD — failing tests first.

- **`fleetStore.test.ts`** — merge behaviour: agent + sub-agent produce correct lanes; running vs completed; cwd grouping; the ambiguous-parent case falls back to unattached.
- **`subagent.rs`** — extend the existing test module (`subagent.rs:244`) with a real `Agent` block fixture, timestamp extraction, and a `Task` back-compat case. The fixture is the regression test for the bug that left this feature dead.
- **`FleetTimeline.test.tsx`** — pure geometry: a lane spanning half the range renders at 50% width; a running lane extends to `now`.

## Risks

| Risk | Mitigation |
|---|---|
| Cost visibility lost when `AgentDashboard` is deleted | Build the summary strip first; verify before deletion. |
| Sub-agent parentage ambiguous with shared cwd | Render unattached under the project group; documented above. |
| Backfill cost on open | Parse is linear over the file and already runs today; widening to 3 transcripts keeps it bounded. |
| Timestamp missing on some lines | Those lines are metadata and already produce no events. |

# Fleet Visualizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `AgentDashboard` and `SubagentPanel` with a single swimlane-timeline fleet view showing every agent and sub-agent across panes over time.

**Architecture:** Rust stays a dumb event source — it parses Claude transcripts and emits sub-agent spawn/complete events with real timestamps. A new `fleetStore` merges those with `agentTrackerStore` sessions into a flat `FleetLane[]`. One presentational `FleetTimeline` renders lanes; thin `FleetPanel` (modal) and `FleetTab` (tab) wrappers supply container chrome only.

**Tech Stack:** Rust (Tauri v2, `notify`, `serde_json`), TypeScript, React 19, Zustand, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-03-fleet-visualizer-design.md`

## Global Constraints

- Test runner: `npm test` (vitest, `include: ["src/**/*.test.{ts,tsx}"]`). Rust: `cd src-tauri && cargo test`.
- All timestamps in the TypeScript model are **epoch milliseconds** (`number`). Rust emits **ISO 8601 strings**; conversion happens once, at the store boundary.
- `FleetTimeline.tsx` must not import `@tauri-apps/api` or any store. Props in, DOM out.
- Do not modify `OrchestratorTab.tsx` or `orchestratorStore.ts`.
- Existing style: inline `style={{}}` objects with `var(--*)` CSS custom properties. Follow it; do not introduce a CSS framework.
- Commit after every task.

---

### Task 1: Rust — parse `Agent` tool name and capture timestamps

The sub-agent tool is named `Agent`, but `parse_line` matches `"Task"`. Measured across all transcripts: 1140 `Agent` blocks, 0 `Task` blocks. This is why `SubagentPanel` has never shown anything.

**Files:**
- Modify: `src-tauri/src/subagent.rs:12-17` (enum), `src-tauri/src/subagent.rs:19-58` (`parse_line`)
- Test: `src-tauri/src/subagent.rs` (existing `#[cfg(test)] mod tests`)

**Interfaces:**
- Consumes: nothing
- Produces: `SubagentEvent::Spawn { id: String, agent_type: String, description: String, model: Option<String>, started_at: Option<String> }` and `SubagentEvent::Complete { id: String, finished_at: Option<String> }`. Serialized to JS as `{kind:"Spawn", id, agent_type, description, model, started_at}` / `{kind:"Complete", id, finished_at}`.

- [ ] **Step 1: Write the failing tests**

Replace the existing `parses_task_spawn` test and add three new ones:

```rust
    #[test]
    fn parses_agent_spawn_with_timestamp() {
        let line = r#"{"timestamp":"2026-08-07T05:29:32.936Z","message":{"role":"assistant","content":[
          {"type":"text","text":"ok"},
          {"type":"tool_use","id":"toolu_1","name":"Agent",
           "input":{"description":"Find footer","prompt":"...","subagent_type":"Explore","model":"sonnet"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_1".into(),
                agent_type: "Explore".into(),
                description: "Find footer".into(),
                model: Some("sonnet".into()),
                started_at: Some("2026-08-07T05:29:32.936Z".into()),
            }]
        );
    }

    #[test]
    fn parses_legacy_task_spawn() {
        let line = r#"{"timestamp":"2026-08-07T05:29:32.936Z","message":{"content":[
          {"type":"tool_use","id":"toolu_2","name":"Task",
           "input":{"description":"Old","subagent_type":"Explore"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_2".into(),
                agent_type: "Explore".into(),
                description: "Old".into(),
                model: None,
                started_at: Some("2026-08-07T05:29:32.936Z".into()),
            }]
        );
    }

    #[test]
    fn spawn_without_timestamp_yields_none() {
        let line = r#"{"message":{"content":[
          {"type":"tool_use","id":"toolu_3","name":"Agent",
           "input":{"description":"d","subagent_type":"t"}}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Spawn {
                id: "toolu_3".into(),
                agent_type: "t".into(),
                description: "d".into(),
                model: None,
                started_at: None,
            }]
        );
    }
```

And update the existing `parses_tool_result_complete` test:

```rust
    #[test]
    fn parses_tool_result_complete() {
        let line = r#"{"timestamp":"2026-08-07T05:31:00.000Z","message":{"role":"user","content":[
          {"type":"tool_result","tool_use_id":"toolu_1","content":"done"}
        ]}}"#;
        assert_eq!(
            parse_line(line),
            vec![SubagentEvent::Complete {
                id: "toolu_1".into(),
                finished_at: Some("2026-08-07T05:31:00.000Z".into()),
            }]
        );
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test subagent`
Expected: FAIL — compile errors, `SubagentEvent::Spawn` has no field `model` / `started_at`.

- [ ] **Step 3: Update the enum**

Replace `src-tauri/src/subagent.rs:12-17`:

```rust
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind")]
pub enum SubagentEvent {
    Spawn {
        id: String,
        agent_type: String,
        description: String,
        model: Option<String>,
        started_at: Option<String>,
    },
    Complete {
        id: String,
        finished_at: Option<String>,
    },
}
```

- [ ] **Step 4: Update `parse_line`**

Replace the whole function body (`src-tauri/src/subagent.rs:19-58`):

```rust
pub fn parse_line(line: &str) -> Vec<SubagentEvent> {
    let mut out = Vec::new();
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return out,
    };
    // Transcript lines carry a top-level ISO-8601 timestamp. Metadata lines do not.
    let ts = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());
    let content = match v.get("message").and_then(|m| m.get("content")).and_then(|c| c.as_array()) {
        Some(c) => c,
        None => return out,
    };
    for block in content {
        let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        match btype {
            "tool_use" => {
                // The sub-agent tool is named "Agent"; "Task" is the pre-2026 name.
                let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name != "Agent" && name != "Task" {
                    continue;
                }
                let id = block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                let input = block.get("input");
                let agent_type = input
                    .and_then(|i| i.get("subagent_type"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let description = input
                    .and_then(|i| i.get("description"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();
                let model = input
                    .and_then(|i| i.get("model"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                if !id.is_empty() {
                    out.push(SubagentEvent::Spawn {
                        id,
                        agent_type,
                        description,
                        model,
                        started_at: ts.clone(),
                    });
                }
            }
            "tool_result" => {
                if let Some(id) = block.get("tool_use_id").and_then(|i| i.as_str()) {
                    out.push(SubagentEvent::Complete {
                        id: id.to_string(),
                        finished_at: ts.clone(),
                    });
                }
            }
            _ => {}
        }
    }
    out
}
```

- [ ] **Step 5: Fix the remaining compile error in the existing test**

`ignores_non_task_tool_use` still passes as written (a `Bash` block yields nothing). Rename it for accuracy:

```rust
    #[test]
    fn ignores_unrelated_tool_use() {
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo test subagent`
Expected: PASS, all tests including the three new ones.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/subagent.rs
git commit -m "fix: parse Agent tool name and capture sub-agent timestamps

parse_line matched tool-use blocks named \"Task\", but the sub-agent tool
is named \"Agent\" — 0 matches across 20,640 tool_use blocks, so no
sub-agent has ever been reported. Match \"Agent\" with \"Task\" retained
for older transcripts, and carry the line timestamp plus model."
```

---

### Task 2: Rust — backfill from the 3 most recent transcripts

`emit_from_offset(path, 0, …)` already replays a whole file on open, but `newest_transcript` returns only one file, capping history at the current session.

**Files:**
- Modify: `src-tauri/src/subagent.rs:72-85` (add `recent_transcripts`), `src-tauri/src/subagent.rs:136-150` (`watch_subagents` backfill)
- Test: `src-tauri/src/subagent.rs` tests module

**Interfaces:**
- Consumes: Task 1's `SubagentEvent`
- Produces: `pub fn recent_transcripts(project_dir: &Path, n: usize) -> Vec<PathBuf>` — oldest-first, at most `n`, `.jsonl` only.

- [ ] **Step 1: Write the failing test**

Add to the tests module:

```rust
    #[test]
    fn recent_transcripts_returns_oldest_first_capped() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("fleet-rt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Create four .jsonl files plus one non-transcript, each newer than the last.
        for name in ["a.jsonl", "b.jsonl", "c.jsonl", "d.jsonl", "notes.txt"] {
            let mut f = std::fs::File::create(dir.join(name)).unwrap();
            writeln!(f, "{{}}").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        let got = recent_transcripts(&dir, 3);
        let names: Vec<String> = got
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["b.jsonl", "c.jsonl", "d.jsonl"]);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn recent_transcripts_missing_dir_is_empty() {
        let got = recent_transcripts(Path::new("/nonexistent/fleet/dir"), 3);
        assert!(got.is_empty());
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test recent_transcripts`
Expected: FAIL — `cannot find function 'recent_transcripts'`.

- [ ] **Step 3: Implement `recent_transcripts`**

Add directly below `newest_transcript` (keep `newest_transcript` — the tailer still uses it):

```rust
/// The `n` most recently modified `.jsonl` transcripts, oldest first so
/// replayed events arrive in chronological order.
pub fn recent_transcripts(project_dir: &Path, n: usize) -> Vec<PathBuf> {
    let Ok(rd) = std::fs::read_dir(project_dir) else {
        return Vec::new();
    };
    let mut entries: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for entry in rd.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(mtime) = entry.metadata().and_then(|m| m.modified()) else { continue; };
        entries.push((mtime, path));
    }
    entries.sort_by_key(|(t, _)| *t);
    let start = entries.len().saturating_sub(n);
    entries[start..].iter().map(|(_, p)| p.clone()).collect()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd src-tauri && cargo test recent_transcripts`
Expected: PASS (2 tests).

- [ ] **Step 5: Use it for backfill in `watch_subagents`**

In `watch_subagents`, replace the backfill block (currently `let mut offset: u64 = 0; if let Some(path) = newest_transcript(&project_dir) { offset = emit_from_offset(&path, 0, &on_event); }`) with:

```rust
    // Replay the 3 most recent transcripts oldest-first, then tail the newest.
    // Only the newest file gets a live cursor; older ones are history.
    let mut offset: u64 = 0;
    let history = recent_transcripts(&project_dir, 3);
    let newest = history.last().cloned();
    for path in &history {
        let consumed = emit_from_offset(path, 0, &on_event);
        if Some(path) == newest.as_ref() {
            offset = consumed;
        }
    }
```

- [ ] **Step 6: Verify the whole suite still passes**

Run: `cd src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/subagent.rs
git commit -m "feat: backfill sub-agent history from 3 most recent transcripts"
```

---

### Task 3: `fleetStore` — model and merge

The merge is pure view logic and the highest-value thing to test. `buildLanes` is exported separately from the store so it can be tested without React or Zustand.

**Files:**
- Create: `src/stores/fleetStore.ts`
- Test: `src/stores/__tests__/fleetStore.test.ts`

**Interfaces:**
- Consumes: `AgentSession` from `src/stores/agentTrackerStore.ts`; Task 1's event shape.
- Produces:
  - `interface FleetLane` (fields below)
  - `interface SubagentRecord { id, agentType, description, model, startTime, endTime, cwd }`
  - `interface PaneMeta { tabId: string; tabName: string; cwd: string | null }`
  - `export function buildLanes(sessions: AgentSession[], subagents: SubagentRecord[], paneMeta: Record<string, PaneMeta>): FleetLane[]`
  - `useFleetStore` with `{ subagents, applyEvent(ev, cwd), reset() }`

- [ ] **Step 1: Write the failing test**

Create `src/stores/__tests__/fleetStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { buildLanes, useFleetStore, type SubagentRecord, type PaneMeta } from "../fleetStore";
import type { AgentSession } from "../agentTrackerStore";

function session(over: Partial<AgentSession> = {}): AgentSession {
  return {
    paneId: "p1", agentName: "claude", agentIcon: "🤖", provider: "claude",
    startTime: 1000, endTime: null, status: "running",
    estimatedInputTokens: 0, estimatedOutputTokens: 0, ...over,
  };
}
function sub(over: Partial<SubagentRecord> = {}): SubagentRecord {
  return { id: "s1", agentType: "Explore", description: "find x", model: null,
           startTime: 1500, endTime: null, cwd: "/proj", ...over };
}
const meta: Record<string, PaneMeta> = { p1: { tabId: "t1", tabName: "ide", cwd: "/proj" } };

describe("buildLanes", () => {
  it("maps an agent session to an agent lane", () => {
    const lanes = buildLanes([session()], [], meta);
    expect(lanes).toHaveLength(1);
    expect(lanes[0]).toMatchObject({
      kind: "agent", paneId: "p1", tabId: "t1", label: "claude",
      provider: "claude", startTime: 1000, endTime: null, status: "running",
    });
  });

  it("nests a sub-agent under the sole running agent in the same cwd", () => {
    const lanes = buildLanes([session()], [sub()], meta);
    const agent = lanes.find((l) => l.kind === "agent")!;
    const child = lanes.find((l) => l.kind === "subagent")!;
    expect(child.parentId).toBe(agent.id);
    expect(child.label).toBe("Explore");
    expect(child.detail).toBe("find x");
  });

  it("leaves a sub-agent unattached when two agents share a cwd", () => {
    const sessions = [session({ paneId: "p1" }), session({ paneId: "p2" })];
    const twoPanes: Record<string, PaneMeta> = {
      p1: { tabId: "t1", tabName: "ide", cwd: "/proj" },
      p2: { tabId: "t1", tabName: "ide", cwd: "/proj" },
    };
    const lanes = buildLanes(sessions, [sub()], twoPanes);
    expect(lanes.find((l) => l.kind === "subagent")!.parentId).toBeNull();
  });

  it("does not attach a sub-agent to an agent in a different cwd", () => {
    const lanes = buildLanes([session()], [sub({ cwd: "/other" })], meta);
    expect(lanes.find((l) => l.kind === "subagent")!.parentId).toBeNull();
  });

  it("carries cost and tokens on agent lanes only", () => {
    const s = session({ status: "completed", endTime: 5000,
                        estimatedInputTokens: 1_000_000, estimatedOutputTokens: 1_000_000 });
    const lanes = buildLanes([s], [sub()], meta);
    const agent = lanes.find((l) => l.kind === "agent")!;
    const child = lanes.find((l) => l.kind === "subagent")!;
    expect(agent.tokens).toEqual({ input: 1_000_000, output: 1_000_000 });
    expect(agent.costCents).toBeCloseTo(1800, 0); // 300 in + 1500 out per 1M
    expect(child.costCents).toBeNull();
    expect(child.tokens).toBeNull();
  });

  it("sorts lanes by start time", () => {
    const lanes = buildLanes(
      [session({ paneId: "p1", startTime: 3000 })],
      [sub({ startTime: 1000 })],
      meta,
    );
    expect(lanes.map((l) => l.startTime)).toEqual([1000, 3000]);
  });
});

describe("useFleetStore", () => {
  beforeEach(() => useFleetStore.getState().reset());

  it("records a spawn then completes it", () => {
    useFleetStore.getState().applyEvent(
      { kind: "Spawn", id: "s1", agent_type: "Explore", description: "d",
        model: "sonnet", started_at: "2026-08-07T05:29:32.936Z" }, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(1);
    expect(useFleetStore.getState().subagents[0].startTime)
      .toBe(Date.parse("2026-08-07T05:29:32.936Z"));

    useFleetStore.getState().applyEvent(
      { kind: "Complete", id: "s1", finished_at: "2026-08-07T05:31:00.000Z" }, "/proj");
    expect(useFleetStore.getState().subagents[0].endTime)
      .toBe(Date.parse("2026-08-07T05:31:00.000Z"));
  });

  it("ignores a duplicate spawn for the same id", () => {
    const ev = { kind: "Spawn" as const, id: "s1", agent_type: "E", description: "d",
                 model: null, started_at: "2026-08-07T05:29:32.936Z" };
    useFleetStore.getState().applyEvent(ev, "/proj");
    useFleetStore.getState().applyEvent(ev, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(1);
  });

  it("ignores a complete for an unknown id", () => {
    useFleetStore.getState().applyEvent(
      { kind: "Complete", id: "nope", finished_at: "2026-08-07T05:31:00.000Z" }, "/proj");
    expect(useFleetStore.getState().subagents).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- fleetStore`
Expected: FAIL — cannot resolve `../fleetStore`.

- [ ] **Step 3: Implement `fleetStore.ts`**

Create `src/stores/fleetStore.ts`:

```ts
import { create } from "zustand";
import { estimateCost, type AgentSession } from "./agentTrackerStore";

export type SubagentEvent =
  | { kind: "Spawn"; id: string; agent_type: string; description: string;
      model: string | null; started_at: string | null }
  | { kind: "Complete"; id: string; finished_at: string | null };

export interface SubagentRecord {
  id: string;
  agentType: string;
  description: string;
  model: string | null;
  startTime: number;
  endTime: number | null;
  cwd: string;
}

export interface PaneMeta {
  tabId: string;
  tabName: string;
  cwd: string | null;
}

export interface FleetLane {
  id: string;
  kind: "agent" | "subagent";
  parentId: string | null;
  tabId: string | null;
  tabName: string | null;
  paneId: string | null;
  cwd: string | null;
  label: string;
  detail: string;
  provider: string | null;
  model: string | null;
  startTime: number;
  endTime: number | null;
  status: "running" | "completed" | "cancelled";
  costCents: number | null;
  tokens: { input: number; output: number } | null;
}

function agentLaneId(s: AgentSession): string {
  return `agent:${s.paneId}:${s.startTime}`;
}

/**
 * Merge agent sessions and sub-agent records into a flat, time-sorted lane list.
 *
 * A sub-agent attaches to an agent lane only when exactly one agent is running
 * in the same cwd. The transcript records no pane, so with two panes sharing a
 * directory the parent is genuinely unknown — we leave it unattached rather
 * than guess.
 */
export function buildLanes(
  sessions: AgentSession[],
  subagents: SubagentRecord[],
  paneMeta: Record<string, PaneMeta>,
): FleetLane[] {
  const agentLanes: FleetLane[] = sessions.map((s) => {
    const meta = paneMeta[s.paneId];
    return {
      id: agentLaneId(s),
      kind: "agent",
      parentId: null,
      tabId: meta?.tabId ?? null,
      tabName: meta?.tabName ?? null,
      paneId: s.paneId,
      cwd: meta?.cwd ?? null,
      label: s.agentName,
      detail: "",
      provider: s.provider,
      model: null,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      costCents: estimateCost(s),
      tokens: { input: s.estimatedInputTokens, output: s.estimatedOutputTokens },
    };
  });

  const runningByCwd = new Map<string, FleetLane[]>();
  for (const lane of agentLanes) {
    if (lane.status !== "running" || !lane.cwd) continue;
    const list = runningByCwd.get(lane.cwd) ?? [];
    list.push(lane);
    runningByCwd.set(lane.cwd, list);
  }

  const subLanes: FleetLane[] = subagents.map((s) => {
    const candidates = runningByCwd.get(s.cwd) ?? [];
    const parent = candidates.length === 1 ? candidates[0] : null;
    return {
      id: `sub:${s.id}`,
      kind: "subagent",
      parentId: parent ? parent.id : null,
      tabId: parent?.tabId ?? null,
      tabName: parent?.tabName ?? null,
      paneId: parent?.paneId ?? null,
      cwd: s.cwd,
      label: s.agentType || "agent",
      detail: s.description,
      provider: null,
      model: s.model,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.endTime === null ? "running" : "completed",
      costCents: null,
      tokens: null,
    };
  });

  return [...agentLanes, ...subLanes].sort((a, b) => a.startTime - b.startTime);
}

interface FleetStore {
  subagents: SubagentRecord[];
  applyEvent: (ev: SubagentEvent, cwd: string) => void;
  reset: () => void;
}

export const useFleetStore = create<FleetStore>((set) => ({
  subagents: [],
  applyEvent: (ev, cwd) =>
    set((state) => {
      if (ev.kind === "Spawn") {
        if (state.subagents.some((s) => s.id === ev.id)) return state;
        const startTime = ev.started_at ? Date.parse(ev.started_at) : Date.now();
        return {
          subagents: [
            ...state.subagents,
            {
              id: ev.id,
              agentType: ev.agent_type,
              description: ev.description,
              model: ev.model ?? null,
              startTime,
              endTime: null,
              cwd,
            },
          ],
        };
      }
      if (!state.subagents.some((s) => s.id === ev.id)) return state;
      const endTime = ev.finished_at ? Date.parse(ev.finished_at) : Date.now();
      return {
        subagents: state.subagents.map((s) =>
          s.id === ev.id ? { ...s, endTime } : s,
        ),
      };
    }),
  reset: () => set({ subagents: [] }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- fleetStore`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/fleetStore.ts src/stores/__tests__/fleetStore.test.ts
git commit -m "feat: fleetStore merging agent sessions and sub-agents into lanes"
```

---

### Task 4: `FleetTimeline` presentational component

Pure rendering. No stores, no IPC — this is what lets the modal and the tab share one timeline.

**Files:**
- Create: `src/components/fleet/FleetTimeline.tsx`
- Test: `src/components/fleet/__tests__/FleetTimeline.test.tsx`

**Interfaces:**
- Consumes: `FleetLane` from `src/stores/fleetStore.ts`
- Produces: `export default function FleetTimeline(props: { lanes: FleetLane[]; from: number; to: number; onSelect?: (lane: FleetLane) => void })`. Each bar carries `data-testid="lane-bar"`, `data-lane-id`, and inline `left`/`width` as percentages.

- [ ] **Step 1: Write the failing test**

Create `src/components/fleet/__tests__/FleetTimeline.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FleetTimeline from "../FleetTimeline";
import type { FleetLane } from "../../../stores/fleetStore";

function lane(over: Partial<FleetLane> = {}): FleetLane {
  return {
    id: "agent:p1:1000", kind: "agent", parentId: null, tabId: "t1", tabName: "ide",
    paneId: "p1", cwd: "/proj", label: "claude", detail: "", provider: "claude",
    model: null, startTime: 1000, endTime: 2000, status: "completed",
    costCents: 10, tokens: { input: 1, output: 1 }, ...over,
  };
}

describe("FleetTimeline", () => {
  it("renders a completed lane spanning half the range at 50% width", () => {
    render(<FleetTimeline lanes={[lane({ startTime: 0, endTime: 500 })]} from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("0%");
    expect(bar.style.width).toBe("50%");
  });

  it("offsets a lane that starts midway", () => {
    render(<FleetTimeline lanes={[lane({ startTime: 500, endTime: 1000 })]} from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("50%");
    expect(bar.style.width).toBe("50%");
  });

  it("extends a running lane to the end of the range", () => {
    render(<FleetTimeline lanes={[lane({ startTime: 500, endTime: null, status: "running" })]}
                          from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("50%");
    expect(bar.style.width).toBe("50%");
  });

  it("clamps a lane starting before the range", () => {
    render(<FleetTimeline lanes={[lane({ startTime: -1000, endTime: 500 })]} from={0} to={1000} />);
    const bar = screen.getByTestId("lane-bar");
    expect(bar.style.left).toBe("0%");
    expect(bar.style.width).toBe("50%");
  });

  it("shows an empty state when there are no lanes", () => {
    render(<FleetTimeline lanes={[]} from={0} to={1000} />);
    expect(screen.getByText(/No agent activity/i)).toBeTruthy();
  });

  it("calls onSelect with the lane when a bar is clicked", () => {
    const onSelect = vi.fn();
    const l = lane();
    render(<FleetTimeline lanes={[l]} from={0} to={2000} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("lane-bar"));
    expect(onSelect).toHaveBeenCalledWith(l);
  });

  it("indents sub-agent lanes under their parent", () => {
    const parent = lane();
    const child = lane({ id: "sub:s1", kind: "subagent", parentId: parent.id, label: "Explore" });
    render(<FleetTimeline lanes={[parent, child]} from={0} to={2000} />);
    const rows = screen.getAllByTestId("lane-row");
    expect(rows).toHaveLength(2);
    expect(rows[1].getAttribute("data-kind")).toBe("subagent");
  });

  it("shows no project header when every lane shares one cwd", () => {
    render(<FleetTimeline lanes={[lane(), lane({ id: "a2", paneId: "p2" })]} from={0} to={2000} />);
    expect(screen.queryAllByTestId("project-header")).toHaveLength(0);
  });

  it("groups lanes under a project header when cwds differ", () => {
    const a = lane({ id: "a1", cwd: "/proj-a" });
    const b = lane({ id: "a2", cwd: "/proj-b", paneId: "p2" });
    render(<FleetTimeline lanes={[a, b]} from={0} to={2000} />);
    const headers = screen.getAllByTestId("project-header");
    expect(headers.map((h) => h.textContent)).toEqual(["proj-a", "proj-b"]);
  });

  it("puts unattached sub-agents under their own cwd group", () => {
    const a = lane({ id: "a1", cwd: "/proj-a" });
    const orphan = lane({ id: "sub:s9", kind: "subagent", parentId: null, cwd: "/proj-b", label: "Explore" });
    render(<FleetTimeline lanes={[a, orphan]} from={0} to={2000} />);
    expect(screen.getAllByTestId("project-header").map((h) => h.textContent))
      .toEqual(["proj-a", "proj-b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- FleetTimeline`
Expected: FAIL — cannot resolve `../FleetTimeline`.

- [ ] **Step 3: Implement `FleetTimeline.tsx`**

Create `src/components/fleet/FleetTimeline.tsx`:

```tsx
import type { FleetLane } from "../../stores/fleetStore";

interface FleetTimelineProps {
  lanes: FleetLane[];
  from: number;
  to: number;
  onSelect?: (lane: FleetLane) => void;
}

const STATUS_COLOR: Record<FleetLane["status"], string> = {
  running: "#22c55e",
  completed: "#4a4a4a",
  cancelled: "#ef4444",
};

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/** Clamp a lane to the visible range and express it as left/width percentages. */
function geometry(lane: FleetLane, from: number, to: number) {
  const span = Math.max(1, to - from);
  const start = Math.max(lane.startTime, from);
  const end = Math.min(lane.endTime ?? to, to);
  const left = (start - from) / span;
  const width = Math.max(0, (end - start) / span);
  return { left: pct(left), width: pct(width) };
}

/** Order lanes so each sub-agent follows its parent. */
function ordered(lanes: FleetLane[]): FleetLane[] {
  const parents = lanes.filter((l) => l.kind === "agent");
  const orphans = lanes.filter((l) => l.kind === "subagent" && l.parentId === null);
  const out: FleetLane[] = [];
  for (const p of parents) {
    out.push(p);
    out.push(...lanes.filter((l) => l.parentId === p.id));
  }
  return [...out, ...orphans];
}

/**
 * Group ordered lanes by project (cwd). Headers are only worth the vertical
 * space when more than one project is in view.
 */
function grouped(lanes: FleetLane[]): { cwd: string | null; lanes: FleetLane[] }[] {
  const rows = ordered(lanes);
  const byCwd = new Map<string | null, FleetLane[]>();
  for (const lane of rows) {
    const list = byCwd.get(lane.cwd) ?? [];
    list.push(lane);
    byCwd.set(lane.cwd, list);
  }
  return [...byCwd.entries()].map(([cwd, ls]) => ({ cwd, lanes: ls }));
}

function projectName(cwd: string | null): string {
  if (!cwd) return "unknown";
  return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

export default function FleetTimeline({ lanes, from, to, onSelect }: FleetTimelineProps) {
  if (lanes.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", minHeight: "120px", color: "var(--text-muted)", fontSize: "12px",
      }}>
        No agent activity in this range.
      </div>
    );
  }

  const groups = grouped(lanes);
  const showHeaders = groups.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 0" }}>
      {groups.map((group) => (
        <div key={group.cwd ?? "unknown"} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {showHeaders && (
            <div
              data-testid="project-header"
              style={{
                fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--text-muted)", opacity: 0.6, marginTop: "6px",
              }}
            >
              {projectName(group.cwd)}
            </div>
          )}
          {group.lanes.map((lane) => {
        const { left, width } = geometry(lane, from, to);
        const isSub = lane.kind === "subagent";
        return (
          <div
            key={lane.id}
            data-testid="lane-row"
            data-kind={lane.kind}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <div style={{
              width: "120px", flexShrink: 0, paddingLeft: isSub ? "14px" : 0,
              fontSize: isSub ? "10px" : "11px",
              color: isSub ? "var(--text-muted)" : "var(--text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={lane.detail || lane.label}>
              {isSub ? `↳ ${lane.label}` : lane.label}
            </div>
            <div style={{
              flex: 1, height: isSub ? "9px" : "14px",
              backgroundColor: "var(--bg-primary)", borderRadius: "3px", position: "relative",
            }}>
              <div
                data-testid="lane-bar"
                data-lane-id={lane.id}
                onClick={() => onSelect?.(lane)}
                title={`${lane.label}${lane.detail ? ` — ${lane.detail}` : ""}`}
                style={{
                  position: "absolute", top: 0, bottom: 0, left, width,
                  backgroundColor: isSub ? "#a855f7" : STATUS_COLOR[lane.status],
                  opacity: lane.status === "completed" ? 0.55 : 0.85,
                  borderRadius: "3px", cursor: onSelect ? "pointer" : "default",
                }}
              />
            </div>
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- FleetTimeline`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/fleet/FleetTimeline.tsx src/components/fleet/__tests__/FleetTimeline.test.tsx
git commit -m "feat: presentational FleetTimeline swimlane renderer"
```

---

### Task 5: `useFleetData` hook — one watcher, resolved pane metadata

**Files:**
- Create: `src/hooks/useFleetData.ts`

**Interfaces:**
- Consumes: `useFleetStore`, `useAgentTrackerStore`, `useTabStore`, `buildLanes`
- Produces: `export function useFleetData(activeCwd: string | null): { lanes: FleetLane[]; totalCostCents: number; runningCount: number }`

- [ ] **Step 1: Implement the hook**

There is no unit test for this step — it is thin glue over IPC and stores, both already covered. Its behaviour is verified in Task 8's manual check.

Create `src/hooks/useFleetData.ts`:

```ts
import { useEffect, useMemo } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useFleetStore, buildLanes, type SubagentEvent, type PaneMeta, type FleetLane } from "../stores/fleetStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { useTabStore, findAllPanes } from "../stores/tabStore";

export function useFleetData(activeCwd: string | null): {
  lanes: FleetLane[];
  totalCostCents: number;
  runningCount: number;
} {
  const subagents = useFleetStore((s) => s.subagents);
  const applyEvent = useFleetStore((s) => s.applyEvent);
  const reset = useFleetStore((s) => s.reset);
  const sessions = useAgentTrackerStore((s) => s.sessions);
  const tabs = useTabStore((s) => s.tabs);

  // One transcript watcher for the active project, shared by every fleet view.
  useEffect(() => {
    if (!activeCwd) return;
    let watchId: number | null = null;
    let cancelled = false;
    reset();
    const channel = new Channel<SubagentEvent>();
    channel.onmessage = (ev) => applyEvent(ev, activeCwd);
    invoke<number>("watch_subagents", { cwd: activeCwd, onEvent: channel })
      .then((id) => {
        if (cancelled) invoke("unwatch_subagents", { id }).catch(() => {});
        else watchId = id;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watchId !== null) invoke("unwatch_subagents", { id: watchId }).catch(() => {});
    };
  }, [activeCwd, applyEvent, reset]);

  const paneMeta = useMemo(() => {
    const map: Record<string, PaneMeta> = {};
    for (const tab of tabs) {
      // findAllPanes is already exported from tabStore — do not reimplement it.
      for (const pane of findAllPanes(tab.root)) {
        map[pane.id] = {
          tabId: tab.id,
          tabName: tab.name,
          cwd: pane.savedCwd ?? pane.initialCwd ?? null,
        };
      }
    }
    return map;
  }, [tabs]);

  const lanes = useMemo(
    () => buildLanes(sessions, subagents, paneMeta),
    [sessions, subagents, paneMeta],
  );

  const totalCostCents = useMemo(
    () => lanes.reduce((sum, l) => sum + (l.costCents ?? 0), 0),
    [lanes],
  );
  const runningCount = useMemo(
    () => lanes.filter((l) => l.status === "running").length,
    [lanes],
  );

  return { lanes, totalCostCents, runningCount };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFleetData.ts
git commit -m "feat: useFleetData hook owning the sub-agent watcher"
```

---

### Task 6: `FleetPanel` modal with the summary strip

Built **before** `AgentDashboard` is deleted — the dashboard is currently the only place cost is shown, so the strip must exist and be verified first.

**Files:**
- Create: `src/components/fleet/FleetSummary.tsx`, `src/components/fleet/FleetPanel.tsx`
- Test: `src/components/fleet/__tests__/FleetSummary.test.tsx`

**Interfaces:**
- Consumes: `useFleetData`, `FleetTimeline`
- Produces:
  - `export default function FleetSummary(props: { runningCount: number; doneCount: number; totalCostCents: number })`
  - `export default function FleetPanel(props: { activeCwd: string | null; onClose: () => void; onExpand: () => void })`
  - Modal range is fixed at 15 minutes; `onExpand` opens the tab and closes the modal.

- [ ] **Step 1: Write the failing test for the summary strip**

Create `src/components/fleet/__tests__/FleetSummary.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FleetSummary from "../FleetSummary";

describe("FleetSummary", () => {
  it("shows running and done counts", () => {
    render(<FleetSummary runningCount={3} doneCount={2} totalCostCents={0} />);
    expect(screen.getByText(/3 running/)).toBeTruthy();
    expect(screen.getByText(/2 done/)).toBeTruthy();
  });

  it("formats sub-dollar cost in cents", () => {
    render(<FleetSummary runningCount={0} doneCount={0} totalCostCents={42} />);
    expect(screen.getByText("$0.42")).toBeTruthy();
  });

  it("formats dollar amounts", () => {
    render(<FleetSummary runningCount={0} doneCount={0} totalCostCents={1234} />);
    expect(screen.getByText("$12.34")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- FleetSummary`
Expected: FAIL — cannot resolve `../FleetSummary`.

- [ ] **Step 3: Implement `FleetSummary.tsx`**

```tsx
interface FleetSummaryProps {
  runningCount: number;
  doneCount: number;
  totalCostCents: number;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function FleetSummary({ runningCount, doneCount, totalCostCents }: FleetSummaryProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      fontSize: "11px", color: "var(--text-secondary)",
    }}>
      <span style={{ color: "#22c55e" }}>● {runningCount} running</span>
      <span style={{ opacity: 0.6 }}>{doneCount} done</span>
      <span style={{ marginLeft: "auto", opacity: 0.75 }}>{formatCost(totalCostCents)}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- FleetSummary`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `FleetPanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import FleetTimeline from "./FleetTimeline";
import FleetSummary from "./FleetSummary";
import { useFleetData } from "../../hooks/useFleetData";

const MODAL_RANGE_MS = 15 * 60 * 1000;

interface FleetPanelProps {
  activeCwd: string | null;
  onClose: () => void;
  onExpand: () => void;
}

export default function FleetPanel({ activeCwd, onClose, onExpand }: FleetPanelProps) {
  const { lanes, totalCostCents, runningCount } = useFleetData(activeCwd);
  const [now, setNow] = useState(() => Date.now());

  // Advance the live edge only while something is running.
  useEffect(() => {
    if (runningCount === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const from = now - MODAL_RANGE_MS;
  const visible = lanes.filter((l) => (l.endTime ?? now) >= from);
  const doneCount = visible.filter((l) => l.status !== "running").length;

  return (
    <div
      className="subagent-panel-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="subagent-panel" role="dialog" aria-modal="true" aria-labelledby="fleet-panel-title">
        <div className="subagent-panel__header">
          <span id="fleet-panel-title">Fleet{activeCwd ? "" : " (no active terminal)"}</span>
          <button onClick={onExpand} aria-label="Expand fleet to tab" className="subagent-panel__close">
            ↗
          </button>
          <button onClick={onClose} aria-label="Close fleet panel" className="subagent-panel__close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div style={{ padding: "8px 12px" }}>
          <FleetSummary runningCount={runningCount} doneCount={doneCount} totalCostCents={totalCostCents} />
          <FleetTimeline lanes={visible} from={from} to={now} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify compile and full suite**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/fleet/FleetSummary.tsx src/components/fleet/FleetPanel.tsx src/components/fleet/__tests__/FleetSummary.test.tsx
git commit -m "feat: FleetPanel modal with summary strip"
```

---

### Task 7: `FleetTab` and the `fleet` tab type

**Files:**
- Modify: `src/stores/tabStore.ts:29` (type union), `src/stores/tabStore.ts:44` (interface), and add `addFleetTab` beside `addBrowserTab`
- Create: `src/components/fleet/FleetTab.tsx`

**Interfaces:**
- Consumes: `useFleetData`, `FleetTimeline`, `FleetSummary`
- Produces: `addFleetTab(): string` on `useTabStore` (focuses the existing fleet tab if one exists); `export default function FleetTab(props: { activeCwd: string | null })`

- [ ] **Step 1: Add the tab type**

In `src/stores/tabStore.ts`, change line 29:

```ts
  type?: "terminal" | "orchestrator" | "browser" | "editor" | "fleet";
```

Add to the `TabStore` interface, below `addBrowserTab`:

```ts
  addFleetTab: () => string;
```

Add the implementation beside `addBrowserTab`:

```ts
    addFleetTab: () => {
      // Only ever one fleet tab; focus it if it already exists.
      const existing = get().tabs.find((t) => t.type === "fleet");
      if (existing) {
        set({ activeTabId: existing.id });
        return existing.id;
      }
      const id = newTabId();
      const pane = createDefaultPane();
      const tab: Tab = {
        id,
        name: "Fleet",
        type: "fleet",
        root: { type: "pane", pane },
        activePaneId: pane.id,
      };
      set((s) => ({ tabs: [...s.tabs, tab], activeTabId: id }));
      return id;
    },
```

- [ ] **Step 2: Implement `FleetTab.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import FleetTimeline from "./FleetTimeline";
import FleetSummary from "./FleetSummary";
import { useFleetData } from "../../hooks/useFleetData";
import { useTabStore } from "../../stores/tabStore";
import { useAgentTrackerStore } from "../../stores/agentTrackerStore";
import type { FleetLane } from "../../stores/fleetStore";

const RANGES: { label: string; ms: number | null }[] = [
  { label: "5m", ms: 5 * 60 * 1000 },
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "all", ms: null },
];

interface FleetTabProps {
  activeCwd: string | null;
}

export default function FleetTab({ activeCwd }: FleetTabProps) {
  const { lanes, totalCostCents, runningCount } = useFleetData(activeCwd);
  const clearHistory = useAgentTrackerStore((s) => s.clearHistory);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const setActivePaneInTab = useTabStore((s) => s.setActivePaneInTab);
  const [rangeIdx, setRangeIdx] = useState(1);
  const [selected, setSelected] = useState<FleetLane | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (runningCount === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningCount]);

  const from = useMemo(() => {
    const ms = RANGES[rangeIdx].ms;
    if (ms !== null) return now - ms;
    const earliest = lanes.reduce((min, l) => Math.min(min, l.startTime), now);
    return Math.min(earliest, now - 60_000);
  }, [rangeIdx, now, lanes]);

  const visible = lanes.filter((l) => (l.endTime ?? now) >= from);
  const doneCount = visible.filter((l) => l.status !== "running").length;

  // Clicking an agent lane jumps to the pane that owns it.
  const jumpToPane = (lane: FleetLane) => {
    setSelected(lane);
    if (lane.kind === "agent" && lane.tabId && lane.paneId) {
      setActiveTab(lane.tabId);
      setActivePaneInTab(lane.tabId, lane.paneId);
    }
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      backgroundColor: "var(--bg-primary)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <b style={{ fontSize: "13px", color: "var(--text-primary)" }}>Fleet</b>
        <div style={{ flex: 1 }}>
          <FleetSummary runningCount={runningCount} doneCount={doneCount} totalCostCents={totalCostCents} />
        </div>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            style={{
              background: "none", cursor: "pointer", fontSize: "10px",
              padding: "2px 7px", borderRadius: "var(--radius-sm)",
              border: `1px solid ${i === rangeIdx ? "var(--accent)" : "var(--border)"}`,
              color: i === rangeIdx ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={clearHistory}
          style={{
            background: "none", border: "1px solid var(--border)", cursor: "pointer",
            fontSize: "10px", padding: "2px 7px", borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
          }}
        >
          Clear history
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", minHeight: 0 }}>
        <FleetTimeline lanes={visible} from={from} to={now} onSelect={jumpToPane} />
      </div>

      {selected && (
        <div style={{
          borderTop: "1px solid var(--border)", padding: "8px 14px",
          fontSize: "11px", color: "var(--text-secondary)", flexShrink: 0,
          display: "flex", gap: "14px", flexWrap: "wrap",
        }}>
          <span><b>{selected.label}</b></span>
          {selected.detail && <span style={{ opacity: 0.7 }}>{selected.detail}</span>}
          {selected.model && <span style={{ opacity: 0.7 }}>model: {selected.model}</span>}
          {selected.tabName && <span style={{ opacity: 0.7 }}>{selected.tabName}</span>}
          <span style={{ opacity: 0.7 }}>
            {new Date(selected.startTime).toLocaleTimeString()}
            {selected.endTime ? ` → ${new Date(selected.endTime).toLocaleTimeString()}` : " → running"}
          </span>
          <button
            onClick={() => setSelected(null)}
            style={{ marginLeft: "auto", background: "none", border: "none",
                     color: "var(--text-muted)", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/stores/tabStore.ts src/components/fleet/FleetTab.tsx
git commit -m "feat: FleetTab with range control and detail pane"
```

---

### Task 8: Wire up and delete the old surfaces

**Files:**
- Modify: `src/App.tsx` (imports, state, handlers, render), `src/hooks/useKeybindings.ts:100-105`, `src/components/CommandPalette.tsx:72-73`
- Delete: `src/components/AgentDashboard.tsx`, `src/components/SubagentPanel.tsx`, `src/stores/subagentStore.ts`, `src/stores/__tests__/subagentStore.test.ts`

**Interfaces:**
- Consumes: `FleetPanel`, `FleetTab`, `addFleetTab`
- Produces: nothing downstream

- [ ] **Step 1: Swap the lazy imports in `App.tsx`**

Remove the `AgentDashboard` and `SubagentPanel` lazy imports (`src/App.tsx:16` and `:21`) and add:

```tsx
const FleetPanel = lazy(() => import("./components/fleet/FleetPanel"));
const FleetTab = lazy(() => import("./components/fleet/FleetTab"));
```

- [ ] **Step 2: Collapse the two state flags into one**

Replace `dashboardOpen` (`src/App.tsx:38`) and `subagentsOpen` (`:39`) with:

```tsx
  const [fleetOpen, setFleetOpen] = useState(false);
```

Replace the `toggle-dashboard` and `toggle-subagents` listener effects with a single one:

```tsx
  // Listen for fleet panel toggle
  useEffect(() => {
    const handler = () => setFleetOpen((prev) => !prev);
    window.addEventListener("toggle-fleet", handler);
    return () => window.removeEventListener("toggle-fleet", handler);
  }, []);
```

Replace `toggleDashboard` (`src/App.tsx:210-212`) with:

```tsx
  const toggleFleet = useCallback(() => {
    setFleetOpen((prev) => !prev);
  }, []);
```

Update the keybindings actions object (`src/App.tsx:333`): `toggleDashboard,` becomes `toggleFleet,`.

- [ ] **Step 3: Render the panel and the tab**

Replace the `dashboardOpen` / `subagentsOpen` render blocks (`src/App.tsx:403-410`) with:

```tsx
        {fleetOpen && (
          <Suspense fallback={null}>
            <FleetPanel
              activeCwd={activeCwd}
              onClose={() => setFleetOpen(false)}
              onExpand={() => {
                setFleetOpen(false);
                useTabStore.getState().addFleetTab();
              }}
            />
          </Suspense>
        )}
```

`activeCwd` is the same value previously passed to `SubagentPanel`; reuse that existing expression verbatim.

In the tab renderer, add a `fleet` branch alongside the `orchestrator` / `editor` / `browser` branches:

```tsx
            : activeTab.type === "fleet"
              ? <Suspense fallback={null}>
                  <FleetTab activeCwd={activeCwd} />
                </Suspense>
```

- [ ] **Step 4: Update the keybinding**

In `src/hooks/useKeybindings.ts`, rename the action on line 16 (`toggleDashboard: () => void;` → `toggleFleet: () => void;`) and update the `Cmd+.` handler (`:99-105`):

```ts
      // Cmd+.: Toggle fleet panel
      if (meta && !shift && !alt && e.key === ".") {
        e.preventDefault();
        actions.toggleFleet();
        return;
      }
```

- [ ] **Step 5: Update the command palette**

Replace both entries at `src/components/CommandPalette.tsx:72-73`:

```ts
      { id: "fleet", label: "Fleet: Toggle panel", shortcut: "Cmd+.", category: "Panels", action: () => { window.dispatchEvent(new CustomEvent("toggle-fleet")); onClose(); } },
      { id: "fleet-tab", label: "Fleet: Open tab", category: "Panels", action: () => { useTabStore.getState().addFleetTab(); onClose(); } },
```

`useTabStore` is already imported in this file.

- [ ] **Step 6: Delete the replaced surfaces**

```bash
git rm src/components/AgentDashboard.tsx src/components/SubagentPanel.tsx \
       src/stores/subagentStore.ts src/stores/__tests__/subagentStore.test.ts
```

- [ ] **Step 7: Verify nothing still references them**

Run: `grep -rn "AgentDashboard\|SubagentPanel\|subagentStore\|toggleDashboard\|toggle-dashboard\|toggle-subagents" src/`
Expected: no output. Fix any stragglers before continuing.

- [ ] **Step 8: Verify compile and full suite**

Run: `npx tsc --noEmit && npm test && cd src-tauri && cargo test`
Expected: no type errors; all TS and Rust tests pass.

- [ ] **Step 9: Manual verification in the real app**

Run: `npm run tauri dev`

Confirm each of these:
1. `Cmd+.` opens the fleet panel.
2. Running an agent in a pane produces a green running lane.
3. Asking that agent to spawn a sub-agent produces an indented purple lane beneath it. **This is the regression check for the Task 1 bug — before that fix, no sub-agent ever appeared.**
4. "↗" opens the Fleet tab and closes the modal.
5. In the tab, range buttons change the visible window and clicking an agent lane jumps to its pane.
6. Cost in the summary strip is non-zero once a session completes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: replace AgentDashboard and SubagentPanel with fleet view

Cmd+. now opens the fleet panel; the command palette gains a Fleet tab
entry. Removes 609 lines across three replaced modules."
```

---

## Definition of Done

- `npm test` and `cargo test` both pass.
- `grep -rn "AgentDashboard\|SubagentPanel\|subagentStore" src/` returns nothing.
- A sub-agent spawned by a running Claude agent appears as an indented lane — the behaviour that has never worked.
- Cost totals visible in both the modal and the tab.
- `FleetTimeline.tsx` imports neither `@tauri-apps/api` nor any store.

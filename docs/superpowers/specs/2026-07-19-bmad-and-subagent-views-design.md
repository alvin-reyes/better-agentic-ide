# BMAD Integration + Claude Code Sub-Agent Views — Design

**Date:** 2026-07-19
**Status:** Approved (design), pending implementation plan
**App:** ADE — Agentic Development Environment (Tauri v2 + React 19 + xterm.js + Zustand)

## Summary

Two independent-but-related features, delivered in one combined spec:

1. **BMAD baked into new terminal projects** — when a terminal opens in a project
   folder, ADE offers to scaffold the [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD)
   framework into that folder, exposes an in-app panel to drive the BMAD workflow,
   and injects BMAD persona prompts/slash-commands into the active terminal.
2. **Claude Code sub-agent views** — surface the sub-agents Claude Code spawns via
   its `Task` tool inside a running terminal, as a live tree/list, by tailing the
   Claude Code session transcript.

Both features key off a terminal pane's working directory (`cwd`).

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Framework(s) | **BMAD only** (WATED dropped) |
| "Baked in" means | Scaffold files into folder **+** in-app UI panel **+** injected prompts/slash-commands |
| Scaffolding trigger | **Prompt on new folder** — non-blocking banner when a pane opens in a folder with no `.bmad-core`; never writes silently. Also invokable from Command Palette. |
| BMAD source | **Bundle a pinned copy** of BMAD assets inside the app (offline, deterministic). No `npx`, no network. |
| Sub-agent source | **Claude Code `Task` sub-agents**, detected by **tailing the session transcript JSONL** (no hooks, no PTY scraping). |
| Sequencing | **One combined spec / plan**. |

## Existing code this builds on

- `src/stores/tabStore.ts` — panes/tabs carry `initialCwd`; scaffolding + sub-agent
  views key off this. `addTab(name, initialCwd)`, `splitPane(..., initialCwd)`.
- `src-tauri/src/pty.rs` — `create_pty(cwd)`, `write_pty(id, data)`, `get_pty_cwd(id)`.
- `src/hooks/useTerminal.ts` — frontend PTY bridge; `invoke("write_pty", { id, data })`
  is the injection path (also used by `Scratchpad.tsx`).
- `src-tauri/src/watcher.rs` — `notify`-based directory watcher streaming `WatchEvent`
  over a Tauri `Channel`. Reused/extended for transcript tailing. **Note:** current
  impl re-reads the entire file on every `Modify`; transcript tailing must add
  incremental (byte-offset) reads to avoid re-parsing large JSONL files.
- `src/components/AgentDashboard.tsx` + `src/stores/agentTrackerStore.ts` — style and
  patterns for the new panels; agent session/cost model to mirror.
- `src/components/CommandPalette.tsx` — entry point for the manual "Initialize BMAD" action.

## Verified assumptions

- `write_pty` is the exact injection mechanism (`Scratchpad.tsx:454`, `useTerminal.ts:471`).
- Claude Code writes each session to `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`.
  Encoding observed: path separators `/` and dots `.` become `-`
  (`/Users/alvin-reyes/Project/caiden-web` → `-Users-alvin-reyes-Project-caiden-web`;
  `/Users/alvin-reyes/.claude-mem/...` → `-Users-alvin-reyes--claude-mem-...`).
- Transcript entries carry `cwd`, `sessionId`, `parentUuid`, `isSidechain`, and
  `message.content[]` blocks including `Task` `tool_use` and `tool_result` blocks.
  Sub-agent turns are marked **`isSidechain: true`** — the key signal for tree building.

---

## Feature A — BMAD

### A1. Bundled assets

- Vendor a pinned BMAD asset set under `src-tauri/resources/bmad/` and register it as a
  Tauri resource (`tauri.conf.json` `bundle.resources`). Record the pinned BMAD version
  in a `VERSION` file alongside the assets.
- Contents mirror a BMAD install: agent persona files, templates, tasks, checklists,
  workflows, and the Claude Code command files (`.claude/commands/BMad/*`).

### A2. Rust commands

- `bmad_status(path: String) -> BmadStatus` — reports whether `<path>/.bmad-core` exists
  and, if so, the installed version (from a marker file). Cheap; safe to call on pane open.
- `scaffold_bmad(path: String) -> Result<ScaffoldReport, String>` — idempotent copy of
  bundled assets into the folder: `.bmad-core/`, `.claude/commands/BMad/*`, and doc stubs
  (`docs/prd.md`, `docs/architecture.md`, `docs/stories/`). Never overwrites user-modified
  files without reporting; returns a list of created vs skipped paths.

### A3. Detection + prompt (frontend)

- On pane creation with an `initialCwd`, call `bmad_status`. If `.bmad-core` is absent,
  show a **non-blocking, dismissible banner**: "Initialize BMAD in this project?"
  with `Initialize` / `Dismiss`. Dismissals are remembered per-path (localStorage) so the
  banner isn't nagging.
- The same action is available from the Command Palette ("BMAD: Initialize in current project").
- Guard: only offer for real folders; never for the home directory or when no `initialCwd`.

### A4. BMAD panel (frontend)

- New component `BmadPanel.tsx` + `bmadStore.ts`, styled after `AgentDashboard`.
- Shows: phase tracker (**Planning** → **Dev cycle**), persona cards
  (Analyst, PM, Architect, SM/Scrum Master, Dev, QA), and artifact links
  (PRD / architecture / stories) that open in the editor.
- Each persona card has a **Launch** button that `write_pty`s the persona's BMAD
  slash-command / activation prompt into the active pane.

### A5. Injected prompts

- Persona activation reuses `invoke("write_pty", { id: ptyId, data })`. Data is the
  BMAD command string (e.g. the agent's slash command) terminated with a newline so it
  runs in the active Claude Code session.

---

## Feature B — Claude Code sub-agent views

### B1. Transcript resolution (Rust)

- Given a pane `cwd`, encode it (`/` and `.` → `-`) to locate
  `~/.claude/projects/<encoded-cwd>/`. Select the most-recently-modified `.jsonl`
  (the active session). Validate by reading the `cwd` field inside the file to guard
  against encoding edge cases.

### B2. Transcript tailing (Rust)

- New module `subagent_watcher.rs` (or an extended mode in `watcher.rs`) that tails the
  chosen transcript **incrementally by byte offset** — on each change, read only the
  appended bytes, split into complete JSON lines, and parse.
- Parse per line and emit `SubagentEvent` over a Tauri `Channel`:
  - `Task` `tool_use` in the main thread → **spawn** (id = `tool_use.id`,
    `agentType` = input `subagent_type`, `description` = input `description`).
  - `isSidechain: true` entries linked via `parentUuid` → **activity** (optional,
    for live status / token accounting).
  - matching `tool_result` for the `Task` `tool_use.id` → **completed** (with end time).
- Malformed / partial trailing lines are skipped (buffer until the next append), never fatal.

### B3. Store + panel (frontend)

- `subagentStore.ts` (Zustand): a tree keyed by pane/session of
  `{ id, agentType, description, status: "running" | "completed", startTime, endTime, tokens? }`.
- `SubagentPanel.tsx`: live tree/list for the active terminal — session → sub-agents with
  type, description, running/done status, and duration. Updates as the transcript grows.
  Empty state until Claude Code writes its first entry.

---

## Data flow

```
pane cwd ──▶ Rust: resolve project + transcript ──▶ watcher Channel ──▶ subagentStore ──▶ SubagentPanel
pane cwd ──▶ Rust: bmad_status / scaffold_bmad ──▶ bmadStore ──▶ BmadPanel / banner
BmadPanel persona button ──▶ invoke("write_pty", {id, data}) ──▶ active PTY (Claude Code)
```

## Error handling

- BMAD already present / re-scaffold: no-op, report skipped files via toast.
- No transcript dir yet: empty sub-agent state; populates once Claude Code writes.
- Malformed JSONL line: skipped; partial trailing line buffered until complete.
- Watcher / IO errors: surfaced non-fatally (toast / panel error row), watcher keeps running.
- Scaffold never overwrites user-modified files without reporting.

## Testing

- **Rust unit tests:** cwd→project-path encoding (incl. dotted paths); JSONL parsing with a
  fixture transcript containing a `Task` spawn → `isSidechain` activity → `tool_result`
  completion sequence; `scaffold_bmad` idempotency (second run creates nothing new).
- **Frontend tests:** `subagentStore` reducer (event stream → correct tree); `bmadStore`
  status transitions; banner dismissal persistence.
- **Manual verification:** open a terminal in a fresh folder → accept BMAD init → confirm
  files scaffolded and panel populated; run a real Claude Code session that spawns a `Task`
  sub-agent → confirm it appears live in the sub-agent panel and marks complete.

## Scope guard (YAGNI)

- No Claude Code hook installation — transcript tailing only.
- No multi-provider sub-agent tracking — Claude Code only.
- BMAD version pinned — no auto-update / `npx` path.
- No editing of BMAD assets from within ADE (launch + view only).

## Open items for the plan

- Exact pinned BMAD version + which asset subset to vendor.
- Whether `subagent_watcher` is a new module or a mode flag on `watcher.rs`
  (leaning: new module, since tailing semantics differ from the extension-filtered watcher).
- Panel placement/toggle (new tab type vs overlay like `AgentDashboard`) and keybinding.

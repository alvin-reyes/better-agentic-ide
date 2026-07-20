# Per-Project Agentic Dashboard — Design

**Date:** 2026-07-19
**Status:** Approved (design). Implementation sequenced AFTER Features A/B (BMAD + sub-agent views) and the multi-model feature.
**App:** ADE — Agentic Development Environment (Tauri v2 + React 19 + xterm.js + Zustand)

## Summary

One project-scoped view that composes ADE's agentic surfaces for the git repository the active
terminal is in: terminals + their models, live Claude Code sub-agents, BMAD status/phase, shared
context, and cost. The dashboard is a **shell that embeds existing panels**, not a reimplementation.

## Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| What it is | **Unified project dashboard** composing the other agentic views |
| Project boundary | **Git root of the active terminal's cwd** (fallback: cwd if not a repo) |
| Composition | Embed/reuse existing panels as sections; degrade gracefully when a feature is absent |
| Persistence | None — project is always derived from the focused terminal |

## Dependencies

- **Feature B (sub-agent views)** — `SubagentPanel`, cwd-scoped. Current plan.
- **Feature A (BMAD)** — `BmadPanel` / `bmad_status`. Current plan.
- **Multi-model** — model badges per pane. Separate approved spec.
- Existing: `AgentDashboard`/`agentTrackerStore` (cost), `tabStore` (panes + cwd).

## Existing code this builds on

- `src/stores/tabStore.ts` — panes carry cwd; `findAllPanes`, active-pane accessors.
- `src/components/AgentDashboard.tsx` — style/toggle pattern for the shell.
- `src/stores/agentTrackerStore.ts` — cost/session totals to filter by project panes.
- `src-tauri/src/` — add a `git_root` helper command.

## Components

### 1. Project identity
- Rust command `git_root(cwd: String) -> Option<String>` — returns the repo root for a cwd
  (`git rev-parse --show-toplevel` semantics), or `None` if not in a repo.
- `useProjectStore` (Zustand) — derives `currentProject { path, label }` from the active pane's cwd:
  `git_root(cwd)` if present, else the cwd. `label` = basename of `path`. Re-derives when terminal
  focus changes.

### 2. Dashboard shell
`ProjectDashboard.tsx` — toggle + command-palette entry, styled like `AgentDashboard`. Renders the
current project's label and these sections, each passed `currentProject.path`:

- **Terminals & models** — panes whose cwd is under the project path; each row shows the pane name
  and its model badge (from the multi-model feature; omitted gracefully if that feature isn't built).
- **Sub-agents** — embeds `SubagentPanel` for the project cwd (Feature B).
- **BMAD** — embeds `BmadPanel` / `bmad_status` for the project (Feature A); if no `.bmad-core`,
  shows the "Initialize BMAD" call-to-action.
- **Shared context** — `.ade/context.md` presence, last-modified, and an open action.
- **Cost & activity** — `agentTrackerStore` totals filtered to this project's panes.

### 3. Composition, not duplication
The dashboard imports and mounts the existing panels as embedded sections with a project-path prop.
It adds no new agent-tracking logic. Each section renders its own empty/CTA state independently.

## Data flow

```
active pane cwd ──▶ git_root(cwd) ──▶ useProjectStore.currentProject{path,label}
currentProject.path ──▶ each section filters panes / loads status / totals by that path
terminal focus change ──▶ re-derive currentProject ──▶ sections re-scope
```

## Error handling

- Not a git repo → project = cwd; dashboard fully functional.
- No active terminal → empty state ("Open a terminal to see its project").
- `git_root` failure → fall back to cwd; never crash.
- A dependent feature not yet built → that section shows a graceful placeholder/CTA.

## Testing

- **Rust:** `git_root` — repo root from repo root, from a subdir, and `None` for a non-repo
  (tempdir with `git init`).
- **Frontend:** `useProjectStore` derives project from active pane and re-derives on focus change;
  section filtering selects only panes under the project path (path-prefix match).

## Scope guard (YAGNI)

- No project persistence, no project switcher UI — always derived from focus.
- No cross-project aggregation.
- Composes existing panels; no duplicated agent logic.
- Model badges depend on the multi-model feature; render only when available.

## Open items for the plan

- Path-under-project matching: normalize and prefix-match cwd against project path (handle symlinks/
  trailing slashes).
- Whether sections are collapsible cards or tabs within the shell (lean: collapsible cards).
- Placement of the toggle (command palette + a header button).

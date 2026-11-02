---
type: epic
title: "Open terminals from a terminal: sub-terminals and ade open"
parent: initiative-sub-terminals
covers: []
after: []
assignee: ""
risk: high
---

# Open terminals from a terminal: sub-terminals and ade open

## Description

Ten stories, in build order, from the spec's "Suggested stories" as revised after the final review: per-terminal hook tokens (1, Done), the views refactor with no behaviour change (2a), sub-terminals by hand (2b), marks per view (3), `ade open` adding a sub-terminal (4), the hidden-terminal budget and its manual check (4b), moving sub-terminals and Move to New Window (5), the finding surfaces (6), `ade` on PATH (7), `--split` (8), and `-- COMMAND` (9). The spec owns every rule: `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`. The entries in `tickets.toml` carry the acceptance criteria inline, because a build reads only its entry.

## Outcome

`ade open` from any pane of an ADE terminal adds a sub-terminal to that tab, optionally in a folder, optionally running a command, without switching the user away, and `--split` splits the caller's pane.

## Done when

1. Each story's verification command passes and its real output is in its story file.
2. Manual check V3 gates story 4b only, and the owner records it.
3. The approved verification command passes at the end: the five approved lines (R4), plus `cd src-tauri && cargo check -p ade-hook` from story 4 on.

## Boundaries

Local to the Mac (macOS and Linux). Not Windows, not an escape-sequence route, not exit codes, not renaming.

## Notes

- Waiting on outside work, held in each entry's `unknown` so that `next` keeps it blocked:
  - story 2b needs `hermes-b-busy-panes` on main (the busy check, R1; branch on origin);
  - story 9 needs story 4, `hermes-a-quoting` (ADR 0008, D9) and `feat/cli-guard` (ADR 0011, the line-editor check) on main.
- Gate: story 4b's Done needs manual check V3, per ADR 0009 (on the unmerged branch `docs/claude-md-paths`). Story 4 has no manual gate.
- Decision: stories 2b, 3, 4, 4b, 5, 6, 7, 8 and 9 carry `refine = true`. Each is sharded at summary level and gets its full acceptance criteria when it is pulled, after the story before it is Done.
- Story 1 is Done, marked from the repo's `mark`. Story 2a is in progress, with review fixes on its branch (`sub-terminals-s2a`).

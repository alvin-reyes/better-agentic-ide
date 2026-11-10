---
type: epic
title: "F3 S1: per-view viewer state, main window"
parent: initiative-per-view-viewer
covers: ["VV-1", "VV-2", "VV-3", "VV-4", "VV-6", "VV-7", "VV-8", "VV-9", "VV-11", "VV-12", "VV-14"]
after: []
assignee: ""
risk: high
---

# F3 S1: per-view viewer state, main window

## Description

Seven stories, built in order s1a, s1b1, s1b2, s1b3, s1c, s1d, s1e (s1b was split on the adversarial review of PR #118). Design: `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md` (sections 4 to 12, and section 15 for the split). PRD: `docs/prd.md` F3.7 and F3.8. Contracts: `.ade/context/viewer-state.md`. Decisions: ADR 0031, ADR 0032. Merges second: `.ade/context/f3-merges-second.md`.

Story s1a is held by its `unknown` field until code-viewer stories cv3 and cv5 are merged to main (owner's OQ-9 (a)), PRs #112, #116 and #118 are merged to main, and the design 12.3 mapping has been re-run on main and delta-reviewed.

## Outcome

Each terminal view has its own root, expanded folders, open file with code position, and layout. Non-terminal tabs list their own folder or their opener's. Viewer state is saved only on this machine, never to ADE sync, the phone or saved workspaces.

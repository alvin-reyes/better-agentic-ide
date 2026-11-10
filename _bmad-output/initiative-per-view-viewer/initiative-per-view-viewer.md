---
type: initiative
title: "F3: each view has its own file browser and preview panel (slice S1)"
---

# F3: each view has its own file browser and preview panel

## Description

Each terminal view in a tab (the own view, and each sub-terminal) keeps its own file browser root, expanded folders, open file with its code position, and panel layout. Non-terminal tabs list their own folder or their opener's. This initiative is slice S1 only: the main window. Later slices (S2 positions in the other viewers, S3 detached windows, S4 the orchestrator's project folder, S5 copies and reopened tabs) are not sharded.

Spec: `docs/prd.md` section F3 (revision 6, with the opener-folder change, PR #112; criteria tagged [S1]); design `docs/superpowers/specs/2026-11-10-per-view-viewer-design.md`; decisions ADR 0031 (viewer state in its own local key, matched by a stable viewer key) and ADR 0032 (open file per view, partly supersedes ADR 0009); contract `.ade/context/viewer-state.md`.

## Blockers and order

- Owner's OQ-9 (a): code-viewer stories 3 and 5 (`_bmad-output/plan-code-viewer-panel.md`, sharded in `_bmad-output/initiative-code-viewer/`) land first. Story s1a is held by its `unknown` field until both are Done on main.
- Five stories, one after another: s1a, s1b, s1c, s1d, s1e.
- Conditional criteria (merge order, not sharding order): VV-2 AC3 (s1a), VV-12 AC3 and VV-12 AC4 [Second] (s1b), VV-13 (s1b, its F1 side not yet sharded), F4 WS-5 AC2 (s1c).

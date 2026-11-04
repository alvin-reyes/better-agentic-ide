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

Eleven stories, in build order, from the spec's "Suggested stories" as revised after the final review: per-terminal hook tokens (1, Done), the views refactor with no behaviour change (2a), sub-terminals by hand, split on 2026-11-04 into part 1 (2bi, open, switch and see) and part 2 (2bii, close and keep) (2b), marks per view (3), `ade open` adding a sub-terminal (4), the hidden-terminal budget and its manual check (4b), moving sub-terminals and Move to New Window (5), the finding surfaces (6), `ade` on PATH (7), `--split` (8), and `-- COMMAND` (9). The spec owns every rule: `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`. The entries in `tickets.toml` carry the acceptance criteria inline, because a build reads only its entry.

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
  - Story 2b needs no outside work now: `hermes-b-busy-panes` (the busy check, R1) and story 2a are on main (PR #75 and PR #76). Its open questions are settled (owner rulings, 2026-11-04).
  - story 9 needs story 4, `hermes-a-quoting` (ADR 0008, D9) and `feat/cli-guard` (ADR 0011, the line-editor check) on main.
- Gate: story 4b's Done needs manual check V3, per ADR 0009 (on the unmerged branch `docs/claude-md-paths`). Story 4 has no manual gate.
- Split, 2026-11-04 (owner): story 2b becomes `2bi` ("Sub-terminals by hand, part 1: open, switch and see", after 2a: the strip, switching, New Sub-terminal, the two shortcuts, the announcement, Move to New Window hidden, App's folder choice in a hook) and `2bii` ("Sub-terminals by hand, part 2: close and keep", after 2bi: closing through the busy check, the count badge, the session). Story 3, 4, 5 and 6 now wait on `2bii`. Ids are letters and digits only, as the ticket tool requires. Owner rulings Q1 to Q11 are applied in both entries.
- Decision: stories 3, 4, 4b, 5, 6, 7, 8 and 9 carry `refine = true`. Each is sharded at summary level and gets its full acceptance criteria when it is pulled, after the story before it is Done.
- Story 1 is Done, marked from the repo's `mark`. Story 2a is Done (QA 819171f on `sub-terminals-s2a`, merged).

## Story 2a verification (QA, 2026-11-02, on 120672e)

Verdict on 120672e: not Done (code review blocked). Superseded by the re-verify at 68c8864 below.

The five approved lines (relay-pairing-design.md, Verification), run in sequence, all exit 0:
- `npx tsc --noEmit`: exit 0.
- `npm test`: 152 files, 1706 tests passed.
- `cd src-tauri && cargo test`: lib 456 passed, 1 ignored; others ok.
- `cd relay && cargo test`: all 15 result lines ok (12 passed in the end-to-end crate).
- `cd mobile && npx tsc --noEmit && npx jest`: tsc exit 0; 1 suite, 6 tests passed.

Found so far: golden session file regenerated from the base commit a470b06 and matches byte for byte (AC5, AC6 sound). No expect( line was removed or changed in existing tests (minus-only check prints nothing). Slice is the story's. terminal-open.md updated. Mutants that survived the suite: getActivePane and focusPaneBy using the own view instead of the shown view; detachTabToWindow sending the first view instead of the own view (needs a second view); tabLabel reading all panes. Cause: the hidden-view tests keep shownView "own" (the review's Major), so shown-versus-own swaps are not caught.

## Story 2a verification, re-verify (QA, 2026-11-02, on 68c8864)

Verdict: Done. Judged against the corrected ticket (07e37b4 on `sub-terminals`, with AC 9 and AC 10). The code re-review at 68c8864 passed with minors.

The five approved lines, run in sequence, all exit 0:
- `npx tsc --noEmit`: exit 0.
- `npm test`: 152 files, 1716 tests passed.
- `cd src-tauri && cargo test`: lib 456 passed, 0 failed, 1 ignored.
- `cd relay && cargo test`: 15 result lines ok.
- `cd mobile && npx tsc --noEmit && npx jest`: tsc exit 0; jest 6 passed.

Evidence:
- No existing assertion changed: a minus-only check of the test diff a470b06..68c8864 finds 0 removed `expect(` lines. The golden session file, regenerated from a470b06, matches byte for byte (AC5, AC6).
- AC1 to AC10 each have a named test in tabViews.test.ts, tabDisplay.test.ts, session.test.ts and detachWindow.test.ts; AC10 is the "with a hidden view in sight" group.
- Mutants (22, in a scratch copy of 68c8864): 19 killed, including shown/own swaps in getActivePane, getTabActivePane, focusPaneBy, the closed-tab record, the terminal path of saveSession, the detach payload root and activePaneId, tabFolderPaneId and tabFolderPtyId, and closePane's store-ptyId kill. Survivors: setActivePaneInTab's fallback for an unknown pane id (own versus shown); saveSession's non-terminal-tab path reading shownView (those tabs never have views); detach payload via `Object.values(views)[0]` (equivalent while own is first). All three are unreachable in production until 2b.
- Coverage note (reviewer N3): the tests for CommandPalette and App cover the helpers `tabFolderPaneId` and `tabFolderPtyId`, not the components. Call sites that read `shownView` directly (CommandPalette :66/:127, App :291, FileBrowser :161) are not guarded; this moves to 2b as component-level acceptance criteria.
- BoardPanel flake: the "does not refresh on the done event while its own switch is still registered" test failed 1 of 5 full runs on the base a470b06 and 0 of 5 on 68c8864 (plus the passing runs above). It exists without 2a and is not introduced by it.
- Not zero behaviour change, by design: `destroyInstance` kills a pane that has no instance by the store's ptyId (AC3 requires it for closeTab, and closePane).

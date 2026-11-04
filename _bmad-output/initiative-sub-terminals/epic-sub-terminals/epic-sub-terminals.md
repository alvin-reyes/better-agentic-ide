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

## Story 2bi: Verification (QA, 2026-11-05, on cdf3d49)

Verdict: Done. Judged against the 2bi entry in `tickets.toml` (B1 to B7, B14, B17 to B21), with the owner's two slice additions (`src/hooks/useTerminal.ts` for the B7 focus fix, `src/components/ShortcutsOverlay.tsx` for B5). The code review blocked 7909b6e on split-view focus; the re-review of 1717356 passed with minors, and cdf3d49 closes its two test gaps.

The five approved lines, run in sequence on cdf3d49, all exit 0:
- `npx tsc --noEmit`: exit 0.
- `npm test`: 160 files, 1774 tests passed (three full runs, all identical and green).
- `cd src-tauri && cargo test`: lib 466 passed, 0 failed, 1 ignored; other targets ok.
- `cd relay && cargo test`: 15 result lines ok, none failed.
- `cd mobile && npx tsc --noEmit && npx jest`: tsc exit 0; jest 1 suite, 6 tests passed.
- `cd src-tauri && cargo check -p ade-hook` (not required here, R4): exit 0.

Criteria to tests (each test exists and passes; the seven files run together: 7 files, 42 tests passed):
- B1: SubTerminalStrip.test.tsx "the strip shows only while the tab has a sub-terminal".
- B2: SubTerminalStrip.test.tsx "the own entry is pinned, shows the tab label and has no close button"; "a sub-terminal entry shows its name and tooltip, never a command".
- B3: subViews.test.ts "addView in the background keeps the selection"; "addView with focus shows the sub-terminal and activates its tab"; "addView stores spawnedBy and defaults it to null".
- B4: TabBar.subTerminal.test.tsx "New Sub-terminal adds a Terminal in the own folder and shows it"; "New Sub-terminal activates its tab"; "New Sub-terminal is only in terminal tabs' menus"; "the strip has no add control".
- B5: shortcuts.test.ts "prevSubTerminal and nextSubTerminal are ⌘[ and ⌘] and map to Ctrl+Shift+[ and ] on Linux"; "isAppShortcut keeps Ctrl+Shift+[ and ] from the shell"; "the overlay carries the Linux note"; "lists every shortcut, with no combo used twice".
- B6: useKeybindings.subTerminal.test.tsx "⌘] and ⌘[ step through the views and stop at the ends"; "without sub-terminals the two keys neither prevent default nor change the view".
- B7: subViews.test.ts "a tab remembers the view it last showed"; "each view keeps its own active pane"; SubTerminalStrip.test.tsx "showing a view focuses its active pane".
- B14: TabBar.subTerminal.test.tsx "Move to New Window is hidden for a tab with sub-terminals"; "Move to New Window is present for a tab without".
- B17: SubTerminalStrip.test.tsx "the strip is a tablist with a roving tabindex".
- B18: SubTerminalStrip.test.tsx "arrow, Home and End keys move focus without wrapping"; "Enter and Space show the focused entry" (plus the added "Enter on the selected entry moves focus into its terminal").
- B19: SubTerminalStrip.test.tsx "a background add is announced"; "adds within one second are merged"; "an add with focus is not announced" (plus the added "the same announcement twice is made twice").
- B20: useOwnFolderCwd.test.tsx "the folder poll reads the own view's folder with a sub-terminal in sight"; subTerminalCallSites.test.tsx "Set up project and the BMAD switch use the own folder"; "FileBrowser shows the own folder".
- B21: SubTerminalStrip.test.tsx "a background add flashes once, and not under reduced motion".
No criterion is without a test.

B20 mutant check (scratch edits to a clean tree, restored after each): reading the shown view instead of the own view at (1) the useOwnFolderCwd folder pane, (2) CommandPalette's BMAD switch (about line 66), (3) CommandPalette's Set up project (about line 133), (4) FileBrowser's root (about line 161). All four were killed: (1) 2 tests failed, (2) to (4) 1 each, in the named tests.

Slice: `git diff 8d302c0 cdf3d49` touches the story's files, the two owner-approved additions, and these non-code files: `.ade/context/terminal-open.md`, the spec (`docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`, restored and activePaneId wording, from the architect's c033e37), `tickets.toml` and this epic file (sharding), `.ade/session.md`, and `.ade/knowledge/developer.md` and `scrum-master.md`. No source file outside the slice. The shared contract is recorded in `.ade/context/terminal-open.md`: addView, showView, the two shortcuts and `shortcutNotes`, spawnedBy (a view id, "own" for the own view), restored, useOwnFolderCwd, SubTerminalStrip and the announcer.

BoardPanel flake: not reproduced. Three full `npm test` runs on cdf3d49 and three on origin/main 8d302c0 (scratch worktree, removed) all passed with no failing file (1774 and 1741 tests), and BoardPanel.test.tsx alone passed 8 of 8 on main. The developer's earlier 21-failure run could not be confirmed or attributed to a file; the flake recorded in the 2a verification (one BoardPanel test, 1 of 5 runs on the base) is the same known one. It is not worse than that here.

Not run (needs the real app; for the owner to check by eye against the UX spec and mockup):
- A tab without sub-terminals looks unchanged after the App layout wrapper.
- The strip looks right (sizes, colours, focus ring, the new flash).
- The ⌘[ and ⌘] keys work in the real app.

## Story 2bii: Verification (QA, 2026-11-05, on aa6a4be)

Verdict: Done. Judged against the 2bii entry in `tickets.toml` (B1b, B8 to B13, B15, B16), with the owner's rulings: the sync surrogate-leak fix added to the story (`value_for_repo` returns `Option` and skips an unparseable `ade-session`; the truncation uses `tail()`), the palette's Close Tab left as it is, and one deliberate 2a assertion change. The code review blocked f7108cf on B11 (K counted views, but the test could not tell views from panes); the re-review of 54088d2 passed with minors, and aa6a4be closes those. A further short re-review of aa6a4be was running in parallel and is not part of this record.

The five approved lines, run in sequence on aa6a4be, all exit 0:
- `npx tsc --noEmit`: exit 0.
- `npm test`: 162 files, 1815 tests passed. Three full runs, all identical and green; no failing file, so no flake to attribute.
- `cd src-tauri && cargo test`: exit 0; lib 468 passed, 0 failed, 1 ignored; other targets ok.
- `cd relay && cargo test`: exit 0; every result line ok, none failed.
- `cd mobile && npx tsc --noEmit && npx jest`: tsc exit 0; jest 1 suite, 6 tests passed.

Criteria to tests (each name was looked up in a full vitest JSON report: present, status passed; the Rust test run by name):
- B1b: subViews.test.ts "closing the last sub-terminal returns the view to own".
- B8: TabBar.subTerminal.test.tsx "the badge shows the count after the label and is hidden at zero"; "the badge title and aria-label carry the running count"; "the badge is absent on non-terminal tabs".
- B9: useGuardedClose.test.tsx "requestCloseView asks when a pane of the view is running"; "requestCloseView closes an idle view at once"; "closing the shown sub-terminal shows the entry on its left"; useKeybindings.subTerminal.test.tsx "⌘W in a sub-terminal calls requestCloseView, and in the own view requestCloseTab"; SubTerminalStrip.test.tsx "a sub-terminal's × is labelled Close <name> and is out of the tab order"; "Delete on an entry calls requestCloseView".
- B10: useGuardedClose.test.tsx "requestClosePane on a sub-terminal's last pane closes the view"; "requestClosePane on the own view's last pane does nothing"; CommandPalette.test.tsx "Close Pane on a sub-terminal's last pane closes the view".
- B11: useGuardedClose.test.tsx "a tab without sub-terminals keeps today's dialog"; "closing a tab asks when any of its sub-terminals is running, with the UX copy"; "closing a tab whose sub-terminals are idle asks nothing"; "Close Others counts a running sub-terminal in one confirmation".
- B12: useGuardedClose.test.tsx "a session restored with a sub-terminal that is never shown, then the tab closed, asks nothing"; "a pane with neither instance nor ptyId is not sampled".
- B13: subViews.test.ts "closeView kills a pane with no instance through its ptyId"; destroyInstance.test.ts "destroyInstance kills by the stored ptyId when no instance exists".
- B15: subViewSession.test.ts "a tab with sub-terminals round-trips its subViews and shownView"; "a restored sub-terminal has no ptyId, is marked restored and is not counted as running"; "saved sub-terminals carry no spawnedBy, status or command"; "a session over 5 MB whose bulk is in a sub-terminal is truncated"; session.test.ts "a single-view tab saves the same JSON as before the refactor" and "an old session loads as one own view" (both pass, and session.test.ts is not in the diff). Added beyond the criteria: the surrogate and emoji truncation cases, the broken-sub-view skip cases, the storage-full fallback.
- B16: sync.rs `value_for_repo_strips_scrollback_in_sub_views` (ok), plus the owner's addition `a_session_that_does_not_parse_is_never_exported`.
No criterion is without a test.

Slice: `git diff ddee841 aa6a4be` touches 24 files. In the slice: tabStore.ts, useGuardedClose.ts, SubTerminalStrip.tsx, TabBar.tsx, useKeybindings.ts, App.tsx (passes `confirmLabel`, and `requestCloseView` to the keybindings), sync.rs, and the named tests. Outside it, only: `restored: false` on View fixtures (subTerminalCallSites, useOwnFolderCwd, detachWindow, tabDisplay, tabViews) and the `getTerminalDimensions` export added to the useTerminal mock in closeConfirm.test.tsx; plus `.ade/context/pane-busy.md`, `.ade/context/terminal-open.md` and `.ade/knowledge/developer.md`. The 2a assertion change is limited to what the owner ruled: in tabViews.test.ts, "saveSession and loadSession with a pane in a hidden view" now expects the hidden view in `subViews` (and not in `root`) and two views after load, replacing "hidden views are not saved" (B15); the other tabViews edits are fixtures only.

Contracts recorded: `.ade/context/terminal-open.md` has `closeView`, `requestCloseView`, the `request-close-view` event, `confirmLabel`, `viewRunning`/`runningSubTerminals` and the badge, the saved session shape (`subViews`, `shownView`, written only for a tab with sub-terminals), the load rules (new ids, `restored: true`, no ptyId, `shownView` remapped), the skipping of a broken `subViews` entry, the truncation walking every tree, the `tail()` rule (last 10,000 UTF-16 code units, one fewer when the cut would split a surrogate pair), and the sync leaving out an unparseable `ade-session`. `.ade/context/pane-busy.md` has the `request-close-view` and `close-view-cancelled` events and the restored-pane skip.

Not run (needs the real app; for the owner to check by eye against the UX spec):
- The close dialogs' copy as rendered (single close, tab with sub-terminals, "Close" and "Close all" buttons).
- The count badge: look, position after the label, never changing colour.
- A restart that restores sub-terminals (names, folders, scrollback, shell starting when first shown).
- A sync export with sub-terminals present (no scrollback in the repo copy).

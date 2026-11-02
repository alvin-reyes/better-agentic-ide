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

Nine stories, in build order, from the spec's "Suggested stories": per-PTY hook tokens (1), the views refactor with no behaviour change (2a), sub-terminals by hand (2b), marks per view (3), `ade open` adding a sub-terminal (4), moving sub-terminals (5), the finding surfaces (6), `ade` on PATH (7), `--split` (8), and `-- COMMAND` (9). The spec owns every rule: `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`. The entries in `tickets.toml` carry the acceptance criteria inline, because a build reads only its entry.

## Outcome

`ade open` from any pane of an ADE terminal adds a sub-terminal to that tab, optionally in a folder, optionally running a command, without switching the user away, and `--split` splits the caller's pane.

## Done when

1. Each story's verification command passes and its real output is in its story file.
2. Manual check V3 (story 4) is recorded by the owner.
3. The approved verification command passes at the end: `npm test`, `npx tsc --noEmit`, `cargo test` in `src-tauri`.

## Boundaries

Local to the Mac (macOS and Linux). Not Windows, not an escape-sequence route, not exit codes, not renaming.

## Notes

- Waiting on outside work: story 9 needs `shellQuote` from ADR 0008 (branch `hermes-a-quoting`, not on main) and the CLI-library guard's runner entry from ADR 0011 (branch `feat/cli-guard`, not on main). Entry 9 holds in `unknown` until both are on main or the owner rules otherwise.
- Gate: story 4's Done needs manual check V3, per ADR 0009 (on the unmerged branch `docs/claude-md-paths`).
- Decision: stories 2b, 3, 4, 5, 6, 7, 8 and 9 carry `refine = true`. Each is sharded at summary level now and gets its full acceptance criteria when it is pulled, after the story before it is Done.

## Story 2a verification (QA, 2026-11-02, on 120672e)

Verdict: not Done. Code review blocked 120672e; awaiting the fix commit, then re-verify.

The five approved lines (relay-pairing-design.md, Verification), run in sequence, all exit 0:
- `npx tsc --noEmit`: exit 0.
- `npm test`: 152 files, 1706 tests passed.
- `cd src-tauri && cargo test`: lib 456 passed, 1 ignored; others ok.
- `cd relay && cargo test`: all 15 result lines ok (12 passed in the end-to-end crate).
- `cd mobile && npx tsc --noEmit && npx jest`: tsc exit 0; 1 suite, 6 tests passed.

Found so far: golden session file regenerated from the base commit a470b06 and matches byte for byte (AC5, AC6 sound). No expect( line was removed or changed in existing tests (minus-only check prints nothing). Slice is the story's. terminal-open.md updated. Mutants that survived the suite: getActivePane and focusPaneBy using the own view instead of the shown view; detachTabToWindow sending the first view instead of the own view (needs a second view); tabLabel reading all panes. Cause: the hidden-view tests keep shownView "own" (the review's Major), so shown-versus-own swaps are not caught.

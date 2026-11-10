---
title: "Follow the file live"
ticket: cv3
status: ready-for-dev
---

# Story cv3: Follow the file live

Ticket cv3 in `tickets.toml`, in this folder. The criteria are the plan's Story 3 (`_bmad-output/plan-code-viewer-panel.md`) plus its two Implementation Notes obligations, items 11 and 12 of the entry. Results: QA records them in this file's Verification section, and only there. The plan file holds the plan text and the review triage, not Results.

## Verification


QA, 2026-11-10, branch `cv3-follow-live` at 78efa77 (PR #121). Verification command: the seven In-force lines of `docs/architecture.md` (the ticket's `verify` names them). `node_modules` in this worktree was already populated (259 entries); `mobile/node_modules` and `relay/target` also present; nothing installed or symlinked. Each line run from the worktree root (the `cd` lines in their own subshell).

| # | Line | Result |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0 |
| 2 | `npm test` | exit 0; 182 test files passed, 2017 tests passed, 0 failed |
| 3 | `cd src-tauri && cargo test` | exit 0; 682 passed, 0 failed (sum of all `test result` lines; `cli_guard::tests::classify_is_fast ... ok`) |
| 4 | `cd relay && cargo test` | exit 0; 266 passed, 0 failed |
| 5 | `cd mobile && npx tsc --noEmit && npx jest` | exit 0; 1 suite, 6 tests passed |
| 6 | `cd src-tauri && cargo check -p ade-hook` | exit 0 |
| 7 | `cd src-tauri && cargo test -p ade-hook` | exit 0; 100 + 9 passed, 0 failed |

Named tests, run by name (`npx vitest run` on the three files, verbose): 54 passed, 0 failed. Each criterion and the test that proves it:

| Item | Test (file) | Passes |
|---|---|---|
| 1 | "watches only its file" (PreviewPanelCode) | yes |
| 2 | "debounces bursts" | yes |
| 3 | "continuous appends still refresh" | yes |
| 4 | "removed then created", "created then removed" | yes |
| 4b | "a folder replaced before the re-read is watched again" (includes the removed inside a 1 s max-wait burst) | yes |
| 5 | "a deleted folder that comes back is followed again" (2, 4, 8, 16, 30, 30 s) | yes |
| 6 | "a failed watch is per file and never flips the toggle" (includes error event and STATIC) | yes |
| 7 | "a tab switch mid-reload", "closing the panel stops the re-check" | yes |
| 8 | "a late watch is unwatched" (path switch and unmount) | yes |
| 8b | "re-arms never leak a watcher" | yes |
| 8c | "a watch that keeps failing backs off" (2, 4, 8, 16, 30, 30 s, then reset) | yes |
| 8d | "a write before the watch registers is not missed" | yes |
| 8e | "the badge does not flicker during a re-arm" | yes |
| 9 | "a reload does not jump back to the target line" (MonacoWrapper.test.tsx) | yes |
| 10 | "a reload keeps the current view" (BinaryView.test.tsx) | yes |
| 11 | "a failed read says Can't open <name> in a role=status message" (BinaryView.test.tsx) | yes |
| 12 | "re-clicking a line past the stale text re-reads the file first", "the reveal waits for the re-read, then lands on the line" | yes |

Slice: the diff against main is 8 files (PreviewPanel.tsx, its test, MonacoWrapper test, BinaryView.tsx and its test, `docs/guide/files.md`, `.ade/context/side-panel-files.md` with a "Live follow (Story 3)" section, and a `.ade/knowledge/developer.md` line); no Rust, relay, mobile or packages change; no new dependency. The shared contract is recorded in `.ade/context/side-panel-files.md`.

Not verified (manual checks, not gating, pending the owner): scroll stays put during an agent edit; a log appended to updates about once a second; vim rename-write; delete banner; `rm -rf dist && npm run build` on Linux and macOS. Not run: CI. The PR's red `Backend (cargo test)` check was `cli_guard::tests::classify_is_fast` (537 ms against 500 ms); locally it passed (a timing flake on the CI runner; this PR changes no Rust).

Verdict: pass.

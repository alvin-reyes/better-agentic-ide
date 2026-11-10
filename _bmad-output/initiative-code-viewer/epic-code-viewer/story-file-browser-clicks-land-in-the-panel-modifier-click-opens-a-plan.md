---
title: "File browser clicks land in the panel; modifier-click opens a tab"
ticket: cv5
status: ready-for-dev
---

# Story cv5: File browser clicks land in the panel; modifier-click opens a tab

Ticket cv5 in `tickets.toml`, in this folder. The criteria are copied from the plan's Story 5 (`_bmad-output/plan-code-viewer-panel.md`). Results: QA records them in this file's Verification section, and only there. The plan file holds the plan text and the review triage, not Results.

## Verification


QA, 2026-11-10, branch `cv5-file-browser-clicks` from main at 346031f, the developer's work uncommitted in the worktree. Verification command: the seven In-force lines of `docs/architecture.md` (the ticket's `verify` names them). Clean install: `npm ci` at the root; the worktree's `mobile/node_modules` (a real directory of symlinks into the main checkout) was removed and `npm ci` run in `mobile/`, as ci.yml does. Both succeeded; no lockfile changed (`git status` shows none). Each line run from the worktree root (the `cd` lines in their own subshell).

| # | Line | Result |
|---|---|---|
| 1 | `npx tsc --noEmit` | exit 0 |
| 2 | `npm test` | exit 0; 183 test files passed, 2021 tests passed, 0 failed |
| 3 | `cd src-tauri && cargo test` | exit 0; 682 passed, 0 failed, 1 ignored (668 + 12 + 2; `cli_guard::tests::classify_is_fast ... ok`, no flake this run) |
| 4 | `cd relay && cargo test` | exit 0; 266 passed, 0 failed |
| 5 | `cd mobile && npx tsc --noEmit && npx jest` | exit 0; 1 suite, 6 tests passed |
| 6 | `cd src-tauri && cargo check -p ade-hook` | exit 0 |
| 7 | `cd src-tauri && cargo test -p ade-hook` | exit 0; 100 + 9 passed, 0 failed |

Named tests, run by name (`npx vitest run ... -t`): the four pass (openFile.test.ts "which click opens a tab" and "a modifier-click opens a tab, also from a detached window"; terminalFileLinks.test.ts "a modifier-click link opens a tab"; FileBrowserOpen.test.tsx "a file opens in the panel, modifier-click in a tab").

| Item | Test | Judgement |
|---|---|---|
| 1 | "which click opens a tab" | All six cases asserted: meta true on mac, ctrl true on Linux, plain false on both, Ctrl on mac false, meta on Linux false. Proven. |
| 2 | "a modifier-click opens a tab, also from a detached window" | `inTab: true` adds an editor tab, no `open-preview` (details empty), same file again adds no second tab; `inTab: false` dispatches `{ path }` with no `inTab` key; detached window emits `{ ..., inTab: true }` to `main` and opens nothing itself; `listenForFileOpens` handler given `inTab: true` adds the tab and dispatches nothing. Every clause proven. |
| 3 | "a modifier-click link opens a tab" | Platform modifier gives `inTab: true` (with line and col kept), the other modifier and a plain click give no `inTab` key. The test picks the modifier from the real `IS_MAC` (jsdom: Ctrl), so the macOS branch of the link is not run here; the per-platform rule is proven by item 1 and the link calls the same `opensInTab`. Proven. |
| 4 | "a file opens in the panel, modifier-click in a tab" | Plain click: `open-preview` `{ path }`, panel opened, tab count and active tab unchanged, terminal tab's `previewPath` set. Ctrl on mac: still panel. Folder click (plain and with ⌘): `expandNode` called, no preview, no tab. ⌘-click: editor tab for the path, no new preview. With that editor tab active, a plain click sets its `previewPath` and adds no tab. Every clause proven. |

Slice: the diff against main is `FileBrowser.tsx`, `openFile.ts`, `terminalFileLinks.ts`, the three test files (two edited, `FileBrowserOpen.test.tsx` new), `docs/guide/files.md`, `docs/guide/terminal.md`, `.ade/context/side-panel-files.md` (a "Modifier-click opens a tab (Story 5)" section; the modifier rule is recorded) and one `.ade/knowledge/developer.md` line. No Rust, relay, mobile or packages change.

Choices the ticket does not spell out: (a) a modifier-click on a `path:line` link opens the tab without the line: in scope (the ticket's rule is "addEditorTab for path", and `.ade/context/side-panel-files.md` records that line and col are not applied to the tab). (b) `inTab` left out of payloads when false: in scope (matches the line/col convention; asserted by the tests). (c) terminal.md "⌘-click those (Ctrl-click on Linux)": in scope, the old "open those from the file browser" would now be wrong. (d) files.md still says "The terminal keeps focus" for a file-browser click as well; the plan says focus stays in the file browser. The code never moves focus (nothing in the click path focuses), so only that sentence is imprecise. A docs wording gap, not a criterion; not gating, recommended fix: "The terminal or file browser keeps focus."

Not verified (manual checks, not gating, pending the owner): file-browser click and ⌘-click in the running app; Ctrl-click on Linux; ⌘-click in the terminal does not also select text; ⌘-click from a detached window. Not run: CI.

Verdict: pass.

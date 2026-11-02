# Terminal open: `ade open`, `POST /open`, sub-terminals

How a process in an ADE terminal opens a sub-terminal of its tab, or splits
its pane.

- Spec: `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`.
- UX: `docs/superpowers/specs/2026-11-02-sub-terminals-ux.md`.
- ADR: `decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`
  (number provisional). Builds on `agent-events.md` (ADR 0003), which it amends.

Status: proposed, not yet approved or built. macOS and Linux only.

## The CLI

```
ade open [--cwd DIR] [--split right|down] [--name NAME] [--focus] [-- COMMAND [ARG...]]
```

- **Mode.** The `ade-hook` binary decides with `mode(argv0, args)` in
  `src-tauri/src/ade_cli.rs`:
  - it is the CLI when argv0's basename is `ade` or `ade.exe`, or when
    `args[0]` is in `CLI_VERBS` (`open`, `help`, `--help`);
  - `guard` is never the CLI; the CLI-library plan (its ADR 0011) dispatches
    it;
  - everything else is today's hook mode, which always exits 0.
- **On `PATH`:** `<app data dir>/bin/release/ade`, or
  `bin/debug-<sha256(helper path), 16 hex>/ade`, a symlink to the helper.
  - The folder must be the user's, mode 0700, not a symlink, and hold only
    `ade`. This is checked at launch and in every `create_pty`.
  - `create_pty` always strips inherited entries for these folders. It
    prepends its own only when it sets the `ADE_*` variables.
  - Agents and scripts use `"$ADE_HOOK_BIN" open`.
- **`--cwd`:** joined to `$PWD` (when that names the working folder),
  normalised lexically, checked with `stat`. The logical path is sent; the
  default is `$PWD`. `--name` is refused with `--split`.
- **Output:** nothing on success. Errors go to stderr as `ade: <message>`.
- **Exit codes:**
  - `0`: opened; the command, if any, was typed.
  - `1`: refused or failed, with the message from the body. A 400 with `{}`
    means "this ADE is too old for ade open; restart ADE". Also when there
    is no answer in 15 s.
  - `2`: usage.
  - `3`: `ADE_HOOK_PORT`, `ADE_HOOK_TOKEN` or `ADE_PTY_ID` is unset or
    malformed.
  - `4`: connection refused, or 401. Mention tmux and screen in the message.
  - `5`: opened, but the command was not typed (`typed:false`).
- Never put the token on a command line: `ps` shows it.

## Tokens (amends ADR 0003)

- `ADE_HOOK_TOKEN` is the lowercase hex of `HMAC-SHA-256(master, "pty:<id>")`.
  The master is 32 random bytes per launch and stays in ADE's memory.
- `screen()` parses `X-ADE-PTY` first: a missing or malformed id is 401 (it
  was 400). It then compares the token for that id in constant time; a
  mismatch is 401.
- The same check applies to `/` and `/open`.
- PTY ids are never reused: `reserve_id` is monotonic.

## The request

- **Route:** `POST /open` to `127.0.0.1:$ADE_HOOK_PORT`.
- **Headers:** `Host: 127.0.0.1:<port>`, `X-ADE-Token`, `X-ADE-PTY`,
  `Content-Type: application/json`.
- **Screening:** as for hook events (405, 403, 401, 413 over 16 KB).
- **Routes:** `/` is hook events, `/open` is this, anything else is 404 `{}`.

```json
{ "cwd": "/Users/me/src/api", "command": ["npm", "run", "dev"],
  "split": null, "name": null, "focus": false }
```

| Field | Type | Rule (checked in Rust; 422 when broken) |
|---|---|---|
| `cwd` | string, required | absolute, an existing folder |
| `command` | string[] or null | 1–64 words, each non-empty, bytes `0x20`–`0x7e`; typed line at most 1000 bytes; shell basename one of `sh`, `bash`, `zsh`, `fish`, `dash`, `ksh` |
| `split` | `"right"`, `"down"` or null | null = a new sub-terminal of the caller's tab |
| `name` | string or null | 1–64 characters, no control characters; null when `split` is set |
| `focus` | bool, default false | true = show the new sub-terminal (or pane), focus it, activate its tab |

- Unknown fields or wrong types are 400 `{"error":...}`.
- On Windows, every `/open` is 422.
- A story that doesn't support a field yet answers 422 "not supported yet".

## The answer

| Code | Body | When |
|---|---|---|
| 200 | `{"ok":true,"typed":true}` | added; command typed, or none given |
| 200 | `{"ok":true,"typed":false,"why":"..."}` | added; command not typed (shell busy, printed nothing in 5 s, exited first, or the acknowledged PTY failed the claim check) |
| 400 | `{"error":"..."}` | not JSON, unknown field, wrong type |
| 409 | `{"error":"..."}` | no listener for the caller's window; the window refused (caller pane not found, split from a non-terminal tab, split limit) |
| 410 | `{"error":"the terminal you ran this from is gone"}` | caller PTY not live |
| 422 | `{"error":"..."}` | a field rule |
| 429 | `{"error":"..."}` | caller pane's bucket empty (8, refills 1/s) or 32 running `/open` shells, counting requests in flight |
| 504 | `{"error":"ADE didn't answer; no terminal was opened"}` | no `terminal_open_done` before `expiresAt` |
| from `screen()`, 404 | `{}` | as for hook events |

ADE answers within 12 s. Rust never spawns or kills a terminal for `/open`.
The window makes and removes them.

## ADE inside

- `PtyInstance` records its owner window label. `create_pty` sets it and
  `reattach_pty` replaces it.
- `terminal_open_listen({ onEvent: Channel<OpenMessage> })` keeps one
  listener per window label. It is dropped on that window's
  `WindowEvent::Destroyed`, because a send to a closed window doesn't fail.
- `terminal_open_done({ requestId, error: string | null, ptyId: number | null, line: string | null })`:
  - Unknown or late ids are ignored.
  - **The claim check.** At the request, Rust records `floor`, the next PTY
    id (`reserve_id`'s counter). The window passes `requestId` into
    `create_pty`, and Rust stores it on the new `PtyInstance`. Rust accepts
    `ptyId` only if:
    - it was created with this `requestId`;
    - it is at least `floor`;
    - no other request has claimed it;
    - it is live;
    - it is owned by that window.
    Otherwise the result is `typed:false`.
  - An accepted PTY is marked as made by `/open`, for the cap.
  - It re-checks `line`: printable ASCII, at most 1000 bytes.
- **Typing:**
  - Wait for the first output, then 300 ms of quiet, at most 5 s. At 5 s,
    with some output, go on; with none, `typed:false`.
  - Type only if `master.process_group_leader()` (`tcgetpgrp`) equals the
    shell's pid. Never use `pgrep -P`.
  - Write `line + "\r"`.
- `pty_shell_idle({ id }) -> bool` is true when `tcgetpgrp` equals the
  shell's pid.
- **"Running"** means `pty_shell_idle` is false for any pane of a
  sub-terminal. That one definition is used by the tab-close confirm (U4),
  the × confirm and "Insert command" (disabled while not idle, checked again
  on click, written without Enter).
- No exit code in v1: `PtyEvent::Exit` is unchanged.

```ts
type OpenMessage =
  | { request: {
      requestId: number;          // ADE's own, increasing
      expiresAt: number;          // ms since the epoch; do nothing after it
      callerPtyId: number;
      cwd: string;
      command: string[] | null;
      split: "right" | "down" | null;   // right = "horizontal", down = "vertical"
      name: string | null;
      focus: boolean;
    } }
  | { expired: number }                                  // requestId
  | { typed: number; ok: boolean; why: string | null };  // requestId
```

## The window (`src/lib/terminalOpen.ts`)

- **Before acting:** after `expiresAt` it does nothing. It finds the caller
  through `allTabPanes` over its tabs.
- **Default:** it appends a sub-terminal to the caller's tab. It never nests
  (`spawnedBy` = the caller's view name). With `focus` it shows the
  sub-terminal and activates the tab.
- **Split:** `splitPane` within the caller's view (hidden or not), which
  returns the new pane id or null (the limit).
- **The new pane's terminal is created at once, headless:**
  `openTerminal(paneId, { cols, rows })` at the caller's size (24×80 if the
  caller has no instance), then `create_pty`.
  - Until first show it has scrollback `min(setting, 1000)`, no GPU renderer
    and no image addon. Hidden panes reattached headless in a detached window
    get the same.
  - On first show it gets all three.
- **The answer:** `terminal_open_done` once it has the `ptyId`, with
  `line = words.map(w => /^[\w./-]+$/.test(w) ? w : shellQuote(w)).join(" ")`.
  `shellQuote` is from `src/lib/shellQuote.ts` (ADR 0008).
- `expired` closes what it added for that request.
- `typed` sets the entry's status.
- The line is held in memory only.

## Store shape (`src/stores/tabStore.ts`)

```ts
interface View { id: string; name: string | null; spawnedBy: string | null; root: PaneNode; activePaneId: string }
interface Tab { /* other fields unchanged */ views: Record<string, View>; viewOrder: string[]; shownView: string }
```

- **The fields.** `Tab.root` and `Tab.activePaneId` no longer exist.
  `views.own` is always present and is always `viewOrder[0]`.
- **The accessors:**
  - `shownView(tab)`;
  - `ownView(tab)`: used by the label, cwd, project, sorting, the closed-tab
    record and workspaces;
  - `allTabPanes(tab)`: used by kill, save, detach, the agent roll-up,
    activity, Fleet, ⌘K, toasts and the close confirms;
  - `viewOfPane(tab, paneId)`: used by `setPtyId`, `setActivePaneInTab`,
    `closePane` and `splitPane`.
- **Attention** is keyed by `tabId/viewId`.
- **Names.**
  - `--name`, if given.
  - Else the command's first word, skipping leading `VAR=value` words.
  - Else the folder's basename, else "Terminal".
  - A name is never the full command line, because names are saved and
    synced.
- **The session.** `SavedTab.root` stays the own view, so old sessions load
  as one view. New fields: `subViews` (name, tree, folders, scrollback) and
  `shownView`.
  - Restored sub-terminals start when first shown.
  - Commands, status and `spawnedBy` are never saved. The line for Insert
    command lives in memory only.
  - `sync.rs` strips `serializedBuffer` before pushing to the sync repo.
- **Detaching** sends `views`, `viewOrder` and `shownView`.
  - The detached window reattaches hidden panes at once, headless.
  - Its destroy handler kills `allTabPanes`.

## Environment of a new terminal

Exactly what `create_pty` gives any terminal:

- its own `ADE_PTY_ID` and token;
- `ADE_HOOK_BIN` and `ADE_HOOK_PORT`;
- the `ade` folder on `PATH`;
- the vault's variables.

Nothing comes from the caller's environment.

# Terminal open: `ade open`, `POST /open`, sub-terminals

How a process in an ADE terminal opens a sub-terminal of its tab, or splits
its pane.

- Spec: `docs/superpowers/specs/2026-11-02-open-terminals-from-a-terminal-design.md`.
- UX: `docs/superpowers/specs/2026-11-02-sub-terminals-ux.md`.
- ADR: `decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`
  (number provisional). Builds on `agent-events.md` (ADR 0003), which it amends.
- Uses, from other branches (not yet on main): the busy check of
  `pane-busy.md` (`origin/hermes-b-busy-panes`), the PTY writer thread and
  `pty_line_editor_ready` of `feat/cli-guard` (ADR 0011), and `shellQuote`
  (`0008-one-shell-quoter-safe-in-posix-shells-and-fish`, `origin/hermes-a-quoting`).

Status: approved by the owner 2026-11-02 (revised the same day after the final review and its re-review, rulings R1 to R7); approved for build on 2026-11-09 as stories 4a (endpoint and window) and 4c (CLI). Not yet built. macOS and Linux only.

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
    `ade`, a symlink whose `readlink` target is exactly this launch's helper
    path. This is checked at launch and in every `create_pty`.
  - An inherited `PATH` entry is an ADE bin folder (from any build or app
    data dir) when it ends in `bin/release` or `bin/debug-<16 hex>` and holds
    an `ade` symlink whose target's file name is `ade-hook` (or
    `ade-hook.exe`), checked by `lstat` and `readlink` only. Such entries are
    always stripped; others are kept.
  - `create_pty` always strips inherited entries for these folders. It
    prepends its own only when it sets the `ADE_*` variables.
  - Agents and scripts use `"$ADE_HOOK_BIN" open`.
- **The working folder:** `$PWD` when it is absolute and it and `getcwd`
  canonicalise to the same existing folder; else `getcwd`.
- **`--cwd`:** joined to the working folder,
  normalised lexically, checked with `stat`. The logical path is sent; the
  default is the working folder. `--name` is refused with `--split`.
- **Output:** nothing on success. Errors go to stderr as `ade: <message>`.
- **Exit codes** (the same table as the spec):
  - `0`: opened; the command, if any, was typed.
  - `1`: any answer other than 200, 401 or 410 (400, 404, 409, 422, 429,
    504), with the message from the body; or no answer within 15 s ("a
    terminal may or may not have opened"). A 400 with `{}` means "this ADE is
    too old for ade open; restart ADE". A 200 without `"ok":true`, or bytes
    that aren't an HTTP answer, is "unexpected answer from ADE". Any other
    connection error gives the system's text.
  - `2`: usage, a flag given twice, an argument that isn't UTF-8 (the body is
    JSON), or a current folder that is gone or isn't UTF-8.
  - `3`: `ADE_HOOK_PORT`, `ADE_HOOK_TOKEN` or `ADE_PTY_ID` is unset or
    malformed (port 0; a token that isn't lowercase hex).
  - `4`: connection refused, 401, or 410 (this terminal has closed), or the
    connection closed before any answer. Mention tmux and screen in the
    message, and a sandboxed Bash for the close.
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
- Not a boundary between same-user processes: one can read another
  terminal's environment, token included.

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
| `command` | string[] or null | 1–64 words, each non-empty, bytes `0x20`–`0x7e`; typed line at most 4096 bytes; shell basename one of `sh`, `bash`, `zsh`, `fish`, `dash`, `ksh` |
| `split` | `"right"`, `"down"` or null | null = a new sub-terminal of the caller's tab |
| `name` | string or null | 1–64 characters, none of them control (Cc), format (Cf: bidi overrides, zero-width characters, tags) or line/paragraph separators (Zl, Zp); null when `split` is set |
| `focus` | bool, default false | true = show the new sub-terminal (or pane) and focus it, **only when the caller's tab is the active tab in its window**; otherwise it is added in the background and the answer says `focused:false` |

- Unknown fields or wrong types are 400 `{"error":...}`.
- On Windows, every `/open` is 422.
- A story that doesn't support a field yet answers 422 "not supported yet".

## The answer

| Code | Body | When |
|---|---|---|
| 200 | `{"ok":true,"typed":true}` | added; command typed, or none given. With `focus` asked, the body also has `"focused":true` or `"focused":false` (see below) |
| 200 | `{"ok":true,"typed":false,"why":"..."}` | added; command not typed (the shell's line editor wasn't ready within 5 s of the window's answer, the shell exited first, or the acknowledged PTY failed the claim check) |
| 400 | `{"error":"..."}` | not JSON, unknown field, wrong type |
| 409 | `{"error":"..."}` | no open handler yet ("ADE is still starting"); no listener for the caller's window; the window refused (caller pane not found, split from a non-terminal tab, split limit) |
| 410 | `{"error":"the terminal you ran this from is gone"}` | caller PTY not live |
| 422 | `{"error":"..."}` | a field rule |
| 429 | `{"error":"..."}` | caller pane's bucket empty (8, refills 1/s) or 32 running `/open` shells, counting requests in flight |
| 504 | `{"error":"ADE didn't answer; no terminal was opened"}` | no `terminal_open_done` before `expiresAt` |
| from `screen()`, 404 | `{}` | as for hook events |

**Focus (owner decision delegated to the developer, 2026-11-09, review
finding m7; conservative).** A command in a background tab must not take the
window over. The window honours `--focus` only when the caller's tab is its
`activeTabId`; otherwise it adds the sub-terminal in the background. It tells
Rust in `terminal_open_done`'s `focused`, and a request that asked for focus
gets `"focused": <bool>` in its 200 body (absent when focus wasn't asked). The
CLI still exits 0 either way.

ADE answers within 11 s (5 s for the window, then at most 5 s for the line
editor); the CLI gives up at 15 s. Rust never spawns or kills a terminal for
`/open`. The window makes and removes them.

## ADE inside

- **Threads.** `serve` stays one loop. For `/open` it runs `screen()`, reads
  the body and calls the injected handler's `admit` (the limits) on its own
  thread, then hands the admitted request to a new thread that calls
  `handle` and answers. `admit` returns an `Admission` whose `Drop` releases
  the in-flight slot, so a panic in `handle` or a failed thread spawn (503)
  can't leak it. `admit` reads the running count under its limits lock (a
  finishing request claims its PTY before releasing its slot, so it is
  counted once), and drops buckets that have refilled. Hook events are
  served meanwhile. The handler is
  set by `AgentStatus::set_open_handler(Arc<dyn OpenHandler>)` in `.setup()`,
  since `AgentStatus::start` has no `AppHandle` or `PtyManager`.

- `PtyInstance` records its owner window label. `create_pty` sets it and
  `reattach_pty` replaces it.
- `terminal_open_listen({ onEvent: Channel<OpenMessage> })` keeps one
  listener per window label. It is dropped on that window's
  `WindowEvent::Destroyed`, because a send to a closed window doesn't fail;
  the destroy hook is added on a label's first listen only (a reload's listen
  just replaces the listener). A send that fails forgets the listener (409).
  A request's pending entry is removed however `handle` ends, a panic
  included.
- Both App and DetachedApp call `startTerminalOpen()` on mount; it returns a
  stop function (DetachedApp's effect cleanup).
- `terminal_open_done({ requestId, error: string | null, ptyId: number | null, line: string | null, focused: boolean })`:
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
  - It re-checks `line`: printable ASCII, at most 4096 bytes.
- **Typing** (`feat/cli-guard`'s PTY layer):
  - Poll `line_editor_ready(master, shell pid)` (the check behind
    `pty_line_editor_ready`: out of canonical mode, and `tcgetpgrp` is the
    shell) every 50 ms; type after two ready answers in a row. Not ready
    within 5 s of the window's answer: `typed:false`. Never use `pgrep -P`.
  - Write `line + "\r"` through the PTY's `input` channel (its writer
    thread), never a blocking write.
- **"Running"** is `pane-busy.md`'s check: a view is running when
  `paneBusy(paneId)` is non-null for any of its panes; a tab when any view
  is. Panes with neither an instance nor a `ptyId` (a restored sub-terminal
  not yet shown) are skipped. `useGuardedClose` applies it to the tab-close
  confirm (U4), `requestCloseView` (×, ⌘W, Delete) and Close Others.
- **Insert command** is enabled only when `paneBusy` is null **and**
  `pty_line_editor_ready` is true for the pane's PTY; both are checked again
  on click, and it writes the line without Enter. A shell without a line
  editor (`dash`, `ksh` without emacs or vi mode) or a `read -s` prompt keeps
  it disabled, with a title saying why. No other busy check exists, and nothing else calls
  `hasActiveProcess`.
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
  (`spawnedBy` = the caller's view **id**, or `"own"` for the tab's own
  view; story 4 shows the spawner's name, or the tab label for `"own"`;
  owner ruling Q5). With `focus` it shows the
  sub-terminal and activates the tab.
- **Split:** `splitPane` within the caller's view (hidden or not), which
  returns the new pane id or null (the limit).
- **The new pane's terminal is created at once:** `createInstance` with no
  container, at the caller's size (24×80 if the caller has no instance),
  then `create_pty` with the `requestId`. A later mount finds the instance:
  exactly one `create_pty` per pane. When `create_pty` returns, if the
  instance's size differs from the one the PTY was made with (a `--focus`
  mount fitted it meanwhile), the window sends `resize_pty`.
  - **Hidden-terminal budget** (story 4b), for any instance created without a
    container: scrollback `min(setting, 1000)`, kept by
    `refreshAllTerminals`, and no `ImageAddon`, until the first
    `seatTerminal`. That seat lifts the scrollback and loads the
    `ImageAddon` before `loadGpu`. WebGL needs nothing: only a seat takes a
    slot.
- **The answer:** `terminal_open_done` once it has the `ptyId`, with
  `line = words.map(w => /^[\w./-]+$/.test(w) ? w : shellQuote(w)).join(" ")`.
  `shellQuote` is from `src/lib/shellQuote.ts` (`0008-one-shell-quoter-safe-in-posix-shells-and-fish`).
- `expired` closes what it added for that request.
- A shell that fails to start (or a terminal replaced meanwhile) after the
  add: the window closes the view it added (`closeView`) and answers the
  error, so no dead "Failed to start shell" sub-terminal is left.
- `typed` sets the entry's status.
- The line is held in memory only.

## Store shape (`src/stores/tabStore.ts`)

```ts
interface View { id: string; name: string | null; spawnedBy: string | null; root: PaneNode; activePaneId: string; restored: boolean }
interface Tab { /* other fields unchanged */ views: Record<string, View>; viewOrder: string[]; shownView: string }
```

- **The fields.** `Tab.root` and `Tab.activePaneId` no longer exist.
  `views.own` is always present and is always `viewOrder[0]`.
- **`restored`** (owner ruling Q3, 2026-11-04; story 2b-ii, ADR 0014):
  - `loadSession` sets it to true on each sub-terminal it restores. Every
    other view, the own view included, has false.
  - It is never saved, and stays true for the view's life. Story 3 shows the
    "restored" label on the strip entry from it.
  - It does not drive the close guard. `useGuardedClose` still skips a pane
    with neither an instance nor a `ptyId`, by that rule alone (see
    "Running"); a restored view's panes match it until first shown.
- **The accessors:**
  - `shownView(tab)`;
  - `ownView(tab)`: used by the label, cwd, project, sorting, the closed-tab
    record and workspaces;
  - `allTabPanes(tab)`: used by kill, save, detach, the agent roll-up,
    activity, Fleet, ⌘K, toasts and the close confirms;
  - `viewOfPane(tab, paneId)`: used by `setPtyId`, `setActivePaneInTab`,
    `closePane` and `splitPane`.
- **Helpers (story 2a).** `OWN_VIEW` (`"own"`) and `ownViewOnly(root, activePaneId)`,
  which gives the `views`/`viewOrder`/`shownView` fields of a one-view tab
  (new tabs, loaded sessions, detached windows, test fixtures).
  `tabFolderPaneId(tab)` in `src/lib/tabDisplay.ts` is the pane whose folder
  is the tab's folder (App's `activeCwd`, so project setup, the board, Fleet's
  "This terminal", the context guard): always the own view's active pane.
  `tabFolderPtyId(tab)` is that pane's PTY id; App's `folderPtyId` uses it to
  re-run the folder poll when the PTY lands. Only `getActivePtyId` reads the
  view in sight.
  The file browser and the palette's BMAD switch and "Set up project" follow
  the own view too; the palette's pane actions act on the view in sight.
- **Adding and showing (story 2b-i).**
  - `addView(tabId, { name, cwd, focus?, spawnedBy? }): string | null` appends
    a view with one pane in `cwd` (no PTY yet) and returns its id
    (`view-<n>`); null for an unknown or non-terminal tab. Without `focus` the
    selection is untouched; with it the view is `shownView` and its tab
    `activeTabId`. `spawnedBy` defaults to null and holds the spawning
    **view's id** (`"own"` for the own view), per the 2b-i ticket; New
    Sub-terminal passes null.
  - `showView(tabId, viewId)` sets `shownView` only (an unknown id is ignored).
    Callers that show a view also call `focusActiveTerminal()`.
  - `useOwnFolderCwd(activeTab, folderPtyId)` (`src/hooks/useOwnFolderCwd.ts`)
    is App's `activeCwd`; `CWD_POLL_MS` lives there.
  - `SubTerminalStrip` (`src/components/SubTerminalStrip.tsx`) is mounted by App
    above the shown view for the active tab and renders only with a
    sub-terminal; its entries' `aria-controls` is `SUB_TERMINAL_CONTENT_ID`
    (`"tab-content"`), the id App gives the content area.
    `SubTerminalAnnouncer`, from the same file, is the window's one
    `aria-live="polite"` region: it watches the store for views added while not
    shown.
  - Shortcuts `prevSubTerminal` ⌘[ and `nextSubTerminal` ⌘] (Ctrl+Shift+[ / ]);
    `shortcutNotes(mac)` in `shortcutList.ts` holds the overlay's Linux note.
- **Closing a sub-terminal (story 2b-ii).**
  - `closeView(tabId, viewId)` (store) kills each pane of the view through
    `destroyInstance(pane.id, pane.ptyId)`, removes the view, and, when it was
    in sight, shows the entry on its left (`own` when it was first). It ignores
    `own` and unknown ids. Only `useGuardedClose` calls it for a user's close.
  - `requestCloseView(tabId, viewId)` (`useGuardedClose`) confirms over the
    view's panes, then calls `closeView`. The strip's × and Delete reach it by
    the window event `request-close-view` `{ tabId, viewId }`; ⌘W in a
    sub-terminal through `useKeybindings`' `requestCloseView` action;
    `requestClosePane` on a sub-terminal's only pane (⌘⇧W, the palette's Close
    Pane) calls it too.
  - `CloseConfirm.confirmLabel` is the confirm button (App passes it to
    `ConfirmDialog`; absent = "Close Anyway"). "Close" for a sub-terminal,
    "Close all" for a tab with sub-terminals.
  - `viewRunning(view)` and `runningSubTerminals(tab)` (exported from
    `useGuardedClose.ts`) are the one "running" rule, reused by the tab bar's
    count badge (`[data-subterm-badge]`, title "N sub-terminals: x running",
    recounted on add, close and menu open).
- **Killing.** `destroyInstance(paneId, storePtyId?)` kills by the store's
  `ptyId` when the pane has no instance; `closeTab` passes it for every pane
  of every view, `closeView` for every pane of its view, and `closePane` for
  the pane it closes.
- **Attention** is keyed by `tabId/viewId`.
- **Names.**
  - `--name`, if given.
  - Else the command's first word, skipping leading `VAR=value` words.
  - Else the folder's basename, else "Terminal".
  - A derived name (command word or folder) has its Cc, Cf, Zl and Zp
    characters removed; one left empty falls through to the next rule.
    `--name` is checked by Rust (422), not cleaned.
  - A name is never the full command line, because names are saved and
    synced.
- **The session.** `SavedTab.root` stays the own view, so old sessions load
  as one view. New fields (story 2b-ii), written only for a tab with
  sub-terminals, after the old keys:
  - `subViews: { id, name, root, activePaneId }[]` in `viewOrder` (`id` is the
    view id at save time, only to remap `shownView`; `activePaneId` is a saved
    pane id of that tree);
  - `shownView`: the saved id of the view in sight.
  A tab with one view writes neither key (the golden session test). On load,
  sub-terminals get new view and pane ids, `restored: true`, no `ptyId`;
  `shownView` is remapped, `own` if unknown. A `subViews` entry that won't
  load (no tree, an empty split, not a list) is skipped; the rest of the
  session loads. The 5 MB truncation and the
  storage-full fallback walk `root` and every `subViews` tree.
  - Restored sub-terminals start when first shown.
  - Commands, status, `spawnedBy` and `restored` are never saved. The line for Insert
    command lives in memory only.
  - `sync.rs` strips `serializedBuffer` before pushing to the sync repo. An
    `ade-session` it can't parse is left out of the export (never written
    raw), so its scrollback can't reach the repo.
  - The truncation keeps each pane's last 10,000 UTF-16 code units, one fewer
    when the cut would split a surrogate pair (a lone surrogate makes the
    JSON unparseable for serde_json).
- **Detaching** (story 5) sends `views`, `viewOrder` and `shownView`. Until
  story 5, Move to New Window is hidden for a tab with sub-terminals.
  - The detached window reattaches hidden panes at once, headless.
  - Its destroy handler kills `allTabPanes`.

## Environment of a new terminal

Exactly what `create_pty` gives any terminal:

- its own `ADE_PTY_ID` and token;
- `ADE_HOOK_BIN` and `ADE_HOOK_PORT`;
- the `ade` folder on `PATH`;
- the vault's variables.

Nothing comes from the caller's environment.

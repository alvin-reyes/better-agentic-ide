# Opening terminals from inside a terminal

A command run in an ADE terminal opens another terminal as a **sub-terminal**
of the caller's tab, listed in a strip inside that tab, or splits the
caller's pane. It can start in a given folder and type a command there.
People use it to start a dev server beside their shell; agents use it to fan
work out into terminals the user can see.

- UX (the source of truth for what the user sees): `2026-11-02-sub-terminals-ux.md`.
- ADR: `.ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`,
  number provisional per ADR 0012 (`0012-ade-is-an-ide-plus-a-harness-principles-p1-p6`).
- Contract: `.ade/context/terminal-open.md`.
- **ADRs are cited by slug.** Two branches each hold an 0008 and an 0009:
  - `0008-one-shell-quoter-safe-in-posix-shells-and-fish` (branch
    `hermes-a-quoting`, local only) is the one this plan uses, not
    `0008-file-previews-are-bounded-and-inert`;
  - `0009-manual-checks-do-not-gate-done` (branch `docs/claude-md-paths`) is
    the one this plan uses, not `0009-one-side-panel-shows-clicked-files-read-only`.
- Revised 2026-11-02 after the final adversarial review, under the owner's
  rulings R1 to R4 (see "Owner decisions").

## Settled

- **The owner, at the start:**
  - `--split right|down` splits the caller's pane.
  - `--cwd` sets the folder; the default is the caller's.
  - A command can follow `--`.
  - The transport is the token-gated loopback endpoint of ADR 0003, never a
    terminal escape sequence, since any output can print one.
  - The owner's later sub-terminal change replaced "a new tab by default".
- **The owner, on the UX:**
  - **U1:** a new sub-terminal does not switch into view; `--focus` switches to it.
  - **U2:** the tab's own entry in the strip shows the tab's label.
  - **U3:** no pass or fail per command.
  - **U4:** closing a tab confirms if any sub-terminal is running a program;
    closing one sub-terminal follows the same rule. "Running" is the one rule
    under "Busy check".
  - **U5:** "New Sub-terminal" goes in the tab menu; the strip has no `+`.
- **The owner, on this plan:** D1–D10, R1–R4 and the later rulings are listed
  under "Owner decisions".

## What you see

```
ade open [--cwd DIR] [--split right|down] [--name NAME] [--focus] [-- COMMAND [ARG...]]
```

- **No flags:** adds a sub-terminal to the caller's tab, in the current
  folder, without switching to it. This works from any pane, in any view. A
  sub-terminal's own `ade open` adds a sibling ("Opened from X").
- `--split right|down`: splits the caller's pane, in the caller's view. It
  makes no sub-terminal.
- `--cwd DIR`: relative to the current folder, resolved logically like `cd`.
  It must be a folder.
- `--name NAME`: names the sub-terminal, and is refused together with
  `--split`. Without it, the name is the command's first word, skipping any
  leading `VAR=value` words (`npm`, or `env` for an `env`-prefixed command).
  With no command, it is the folder's basename, or else "Terminal". The full
  command line is never a name, because names are saved in the session, and
  the session is synced.
- `--focus`: shows the new sub-terminal or pane, focuses it, and activates
  its tab.
- `-- COMMAND [ARG...]`: typed into the new shell with Enter, best effort.
  - Each argument is one word.
  - For shell syntax, run it through a shell: `ade open -- sh -c 'npm i && npm run dev'`.
- On success it prints nothing. Errors go to stderr as `ade: <why>`.

**Exit codes** (the contract holds the same table):

| Exit | When |
|---|---|
| 0 | Opened. The command, if any, was typed; that doesn't mean it ran. |
| 1 | ADE refused or failed: any answer other than 200, 401 or 410 (400, 409, 422, 429, 504, 404), with ADE's message; or no answer within 15 s. A 400 with `{}` gives "this ADE is too old for ade open; restart ADE". |
| 2 | Usage error, e.g. `--cwd: no such folder`. |
| 3 | Not in an ADE terminal: `ADE_HOOK_PORT`, `ADE_HOOK_TOKEN` or `ADE_PTY_ID` is unset or malformed. |
| 4 | The ADE is gone (connection refused), the token is refused (401), or this terminal has closed (410). The message mentions tmux and screen, which keep old variables. |
| 5 | Opened, but the command was not typed (`typed:false`). The shell is left running. |

Agents and scripts should run `"$ADE_HOOK_BIN" open ...`. Another tool named
`ade` can't shadow it, and an rc file that rewrites `PATH` can't lose it.

## Backend

```mermaid
sequenceDiagram
  participant C as ade open (PTY 7)
  participant E as endpoint (serve loop)
  participant T as /open thread
  participant O as open handler (terminal_open.rs)
  participant W as owner window
  C->>E: POST /open, X-ADE-PTY 7, X-ADE-Token HMAC(master,7)
  E->>O: screen(), read body, admit (bucket, cap incl. in flight)
  E->>T: spawn thread with the admitted request
  T->>O: handle(admission, body)
  O->>O: validate, caller live, window listening, floor = next PTY id
  O->>W: {request, expiresAt, ...}
  W->>W: before expiresAt: add view or pane, create its terminal at once
  W->>O: terminal_open_done(requestId, ptyId 12, line)
  O->>O: claim: 12 created with requestId, >= floor, unclaimed, live, this window's
  O->>O: line editor ready twice, 50 ms apart (at most 5 s); write through PTY 12's writer thread
  O->>W: {typed: requestId, ok, why}
  T-->>C: 200 {"ok":true,"typed":true|false}
```

- **The CLI.** `ade-hook` acts as the CLI only when its file name is `ade` or
  `ade.exe`, or its first argument is `open`, `help` or `--help`. Everything
  else stays in today's hook mode, which always exits 0.
  - `guard` is never the CLI: the CLI-library plan (ADR 0011,
    `0011-cli-library-guarded-by-a-command-hook`) dispatches it.
    `feat/cli-guard` rewrites `ade-hook/src/main.rs` for that dispatch;
    whichever of story 4 and `feat/cli-guard` lands second rebases onto the
    other, keeping `guard` ahead of `mode()`.
  - The rule is a pure function, `mode(argv0, args)`, in a new
    `src-tauri/src/ade_cli.rs`. The main crate compiles it for its tests; the
    helper includes it by `#[path]`. `cargo test` in `src-tauri` does not
    compile the `ade-hook` package (it is a workspace member, not a default
    one, and only `release.yml` builds it), so the verification command gains
    `cargo check -p ade-hook` from story 4 on (R4).
  - The CLI has its own small HTTP client, because `hook_forward::post`
    discards the status and body. It gives up after 15 s.
- **`ade` on `PATH`** (macOS and Linux).
  - It is a symlink to the helper, in `<app data dir>/bin/release`
    (re-pointed each launch) or `bin/debug-<16-hex sha256 of the helper path>`.
    A `debug-*` folder whose target has gone is deleted at launch.
  - ADE uses the folder only if it is the user's, mode 0700, not a symlink,
    holds only `ade` (checked with `readdir` and `lstat`), and `ade` is a
    symlink whose target (`readlink`) is exactly this launch's helper path.
    It checks this at launch and in every `create_pty`.
  - `create_pty` always strips inherited ADE bin folders from `PATH`. It
    prepends its own only when it sets the `ADE_*` variables.
  - `--cwd` is joined to `$PWD`, normalised lexically, and checked with
    `stat`. The logical path is what gets sent.
  - Windows is out of scope; `/open` answers 422 there.
- **Wire.**
  - `POST /open`, screened by the same `screen()`.
  - `serve` routes by path: `/` is unchanged, `/open` is new, anything else
    is 404.
  - The body is `cwd`, `command` (a list of words), `split`, `name` and
    `focus`. Unknown fields are refused. ADE never parses a shell string.
  - Rust validates everything; the CLI only pre-checks.
- **Threads and the handler.** `serve` is one blocking loop over
  `incoming_requests()`, and `/open` waits up to about 10 s, so:
  - `AgentStatus::start` has no `AppHandle` and no `PtyManager`, so the open
    logic is injected: `AgentStatus::set_open_handler(Arc<dyn OpenHandler>)`,
    called once in `.setup()` after both exist. The trait has two methods:
    `admit(caller_pty) -> Result<Admission, OpenAnswer>`, which is quick and
    applies the limits, and `handle(admission, body) -> OpenAnswer`, which
    may wait. Until a handler is set, `/open` answers 409 "ADE is still
    starting". Tests inject a fake handler.
  - On the `serve` thread: `screen()`, read the body, `admit`. A refusal is
    answered there. An admitted request and its `tiny_http::Request` (which
    is `Send`) go to a new thread, which calls `handle` and answers. Hook
    events keep being served meanwhile; a test pins that.
  - The cap of 32 counts admitted requests in flight, so it also bounds
    these threads.
- **Per-PTY tokens (amends ADR 0003).** Each terminal's `ADE_HOOK_TOKEN` is
  `HMAC-SHA-256(master, "pty:<id>")`.
  - `screen()` parses `X-ADE-PTY` first. A missing or malformed id is 401 (it
    was 400), then the token is checked.
  - This relies on PTY ids never being reused; a test pins `reserve_id`.
  - It is not a boundary between processes run by the same user: such a
    process can read another terminal's environment, and its token with it.
- **Claiming the new PTY.**
  - The window passes the `requestId` into `create_pty`. Rust records it on
    the new `PtyInstance` at creation, so the claim is tied to the request
    from the start.
  - Rust accepts the window's `ptyId` only if:
    - it was created with that `requestId`;
    - it is at or above the floor (the next PTY id at request time);
    - it is unclaimed;
    - it is live;
    - it is owned by that window.
  - A terminal the user opens within the same 5 s carries no `requestId`, so
    it can never be claimed.
  - Anything else gives `typed:false`, so a frontend bug can never route a
    command into the user's or the agent's own pane.
- **Typing** (story 9, R2). It happens only after a timely answer from the
  window, and it reuses `feat/cli-guard`'s PTY layer (ADR 0011's branch),
  which story 9 waits for:
  - **Ready** is `feat/cli-guard`'s `line_editor_ready(master, shell pid)`,
    the function behind `pty_line_editor_ready`: the terminal is out of
    canonical mode and the shell is the foreground process group
    (`tcgetpgrp`). Rust polls it every 50 ms and types after two ready
    answers in a row, as `whenLineEditorReady` does, for at most 5 s after
    the window's answer. Not ready by then: nothing is typed, `typed:false`,
    why "the shell's line editor didn't start".
  - **Writing** goes through the new terminal's `PtyInstance.input` channel to
    its writer thread (`feat/cli-guard`), so a terminal that doesn't read
    never blocks Rust, and the line arrives in order with any keys.
  - Typing after the line editor is up avoids the canonical buffer (1024
    bytes on macOS, 4096 on Linux) that cuts a longer line and runs the
    rest; `feat/cli-guard` tests a 5,000-byte line arriving whole.
  - The command is typed, not run with `shell -c`: the shell stays open, the
    command is in history, and the rc files have run.
  - A command that can't be typed leaves the shell alone and reports
    `typed:false`: CLI exit 5, and a `{typed}` message to the window.
- **Quoting.** The window quotes each word with `shellQuote`
  (`0008-one-shell-quoter-safe-in-posix-shells-and-fish`); bare words
  matching `^[\w./-]+$` are left as they are.
  - Rust refuses a command unless the shell is `sh`, `bash`, `zsh`, `fish`,
    `dash` or `ksh`.
  - Words must be printable ASCII (D6).
  - A typed line may be at most 4096 bytes. This is no longer about the
    canonical buffer (the line editor takes any length); it keeps a line
    short enough to review in the not-typed notice and well inside the 16 KB
    body.
- **Known typing failures** (manual check V2, which does not gate):
  - A shell with no line editor never becomes ready: `dash` (and `sh` where
    it is dash, as on Debian), and `ksh` without `set -o emacs` or `vi`. The
    result is `typed:false`; Insert command still works.
  - `exec tmux` (or an rc file that `exec`s any raw-mode program) takes the
    line: the process keeps the shell's pid and leaves canonical mode.
- **Deadline.** Each request carries `expiresAt`, 5 s after it is sent.
  - A window past it does nothing.
  - On timeout Rust answers 504, types nothing, and sends `{expired}`. The
    window then closes whatever it added late, so a retry can't run a
    command twice.
  - With `--focus`, a terminal whose `create_pty` returns just after the
    deadline can appear and then vanish. That is accepted.
  - **Worst case:** 5 s for the window, then 5 s for the line editor: about
    10 s from the request to the answer and to the window's `typed` message,
    which clears the strip's spinner. ADE answers within 11 s; the CLI gives
    up at 15 s.
- **Refusals.**
  - Before anything is made: the caller is gone (410), or no listener
    (409). Listeners are dropped on `WindowEvent::Destroyed`.
  - By the window (409): the caller pane isn't found, `--split` from a
    non-terminal tab, or the split limit is reached.
- **Limits** (D7).
  - Each caller pane has a bucket of 8, refilling 1 per second.
  - At most 32 shells made by `/open` may be running, counting requests in
    flight.
  - Both answer 429. A chain `ade open -- ade open ...` gets a fresh bucket
    per pane, so only the cap bounds it.

## Busy check (R1)

This plan adds no busy check of its own. Every sub-terminal confirm, and
Insert command, uses the one approved in the Hermes plan's Story B (branch
`hermes-b-busy-panes`, built at df90180, contract `.ade/context/pane-busy.md`
on that branch): the Rust command `pty_foreground_job`, decided by
`paneBusy(paneId)` / `decideBusy`, and applied by `useGuardedClose`. As that
contract says, nothing else calls `hasActiveProcess`; this plan doesn't.

- **The rule.** A view is **running** when `paneBusy` is non-null for any of
  its panes. A tab is running when any of its views is, its own view
  included.
- **The one addition.** Panes of a restored sub-terminal not yet shown since
  the restart are skipped: they have no instance and no shell, and the agent
  tracker's sessions are saved in `localStorage`, so a stale "running" session
  for one of their pane ids could otherwise count. `useGuardedClose` skips a
  pane that has neither an instance nor a `ptyId`. A test pins it.
- **Where it applies.**
  - **Closing a tab (U4):** `requestCloseTab` asks over `allTabPanes(tab)`,
    with the UX's wording ("2 are running a program (dev server, claude:
    auth)", the names from `paneBusy`).
  - **× on a sub-terminal, ⌘W in it, Delete on its strip entry:** a new
    `requestCloseView(tabId, viewId)` in `useGuardedClose` asks over that
    view's panes.
  - **⌘⇧W on a sub-terminal's last pane:** the existing `requestClosePane`,
    which then closes the view.
  - **Close Others / to the Right:** the existing one confirmation, over
    `allTabPanes` of each tab.
  - **Insert command:** enabled when `paneBusy` is null for the pane, and
    checked again on click. It writes the line without Enter.
  - An idle prompt, an exited shell and a not-yet-shown restored sub-terminal
    are not running.
- **Windows** (story 2b ships there). `pty_foreground_job` is an error off
  Unix, so `paneBusy` falls back to `hasActiveProcess`, the text heuristic
  that only recognises Claude. On Windows a sub-terminal or tab running
  something else closes without a confirm, as a tab does today. Documented in
  the guide; `/open` itself answers 422 there.
- **Merge order.** `hermes-b-busy-panes` merges to main before story 2b.
  Preferred order: 2a (being built) merges first; `hermes-b-busy-panes` then
  rebases onto main (over #73's `useTerminal.ts` too) and its
  `findAllPanes(tab.root)` reads in `useGuardedClose.ts`, which `tsc` lists
  once `Tab.root` is gone, become `allTabPanes(tab)`; then 2b. If
  `hermes-b-busy-panes` is ready first it may merge first and 2a rebases onto
  it, with the same `tsc` errors to fix. Either way the change to it is
  mechanical and belongs to whoever rebases.
- `hermes-b-busy-panes` and `hermes-a-quoting` exist only in the main
  checkout; neither is on `origin`. The owner should push both.

## The store: views stored explicitly

**Choice.** `Tab.root` and `Tab.activePaneId` are removed from the type, and
every tab holds its views explicitly:

```ts
interface View { id: string; name: string | null; spawnedBy: string | null; root: PaneNode; activePaneId: string }
interface Tab { /* ...unchanged fields... */ views: Record<string, View>; viewOrder: string[]; shownView: string }
// "own" is always views.own and viewOrder[0]. A tab without sub-terminals has only "own".
```

**Why not swap the view in sight into `tab.root`, as the last draft did?**
Every function that read `tab.root` would silently see only the view in
sight. The review found about 15 such sites, most of them in `tabStore.ts`
itself. Among them, `setPtyId` drops the id of a pane in a hidden view: no
agent dot, a 409 for its own `ade open`, and no id to kill it by. A regex
scan can't catch these reliably (`t.root.type`, `Pick<Tab, "root">`,
`findPane(tab.root …)`). Removing the field makes `npx tsc --noEmit` (already
in the verification command) list every site that has to change, in
`tabStore.ts` too. The cost is more files changed in one story (2a), each
small.

**Accessors** (in `tabStore.ts`):

- `shownView(tab)`
- `ownView(tab)`
- `allTabPanes(tab)`
- `viewOfPane(tab, paneId)`

**Every reader, by what it needs.** Line numbers are on `origin/main` at
9447767.

| Needs | Readers |
|---|---|
| **View in sight** | `getActivePane`, `getActivePtyId`, `getTabActivePane` (and so `AgentPicker`, `Scratchpad.tsx:672`, `OrchestratorTab.tsx:268,275`), `focusNextPane`/`focusPrevPane` (`focusPaneBy`), `App.tsx:96` (active PTY), `App.tsx:481` and `DetachedApp.tsx:97` (rendering), `TerminalPane.tsx:40,44`, `useKeybindings.ts:103` (close pane) and `:126-127` (splits), `CommandPalette.tsx:77-78` (split), `:93` (close pane), `:200,208` (recording), `focusActiveTerminal` (`useTerminal.ts:743`), `terminalCommands.ts:32` (`runInNewTabPane`'s new tab) |
| **Own view** | `tabCwd`, `tabLabel`, `tabProject` (`tabDisplay.ts:19-20`), and so tab titles, project grouping, `sortTabsBy` and the strip's own entry (U2); **`activeCwd`** (`App.tsx:290`, the active tab's own view's active pane) and everything it feeds: `useProjectSetup`, `useContextGuard`, `BoardPanel`, `ContractsPanel`, `TokensPanel`, `IntegrationsPanel`, Fleet's "This terminal" (`FleetTab`, `FleetPanel`, `useFleetData`'s `activeCwd`) and the contract actions (`App.tsx:250,257`); `CommandPalette.tsx:65` (the BMAD project) and `:125` (Set Up Project), which are the same project actions as `useProjectSetup`; `FileBrowser.tsx:160,179`; the closed-tab record (`closeTab`) and `reopenClosedTab`; `SettingsPanel.tsx:201` (workspace layout); the phone remote's `remote_tabs_set` `project` (approved in `2026-10-14-relay-pairing-design.md`, not yet built) |
| **The view holding a given pane** | `setPtyId`, `setActivePaneInTab`, `closePane`, `splitPane` (by pane id, in whatever view holds it, so `--split` works in a hidden view) |
| **All views** | `closeTab` kill loop, `detachTab`, `saveSession` (including its 5 MB truncation) / `loadSession`, `tabAgentState` (`agentStatusStore.ts:38`), `useAgentStatusToasts.ts:8`, `TabBar.tsx:60`, `TabSwitcher.tsx:31`, `useFleetData.ts:136,201`, `useTerminal.ts:74,610`, `bmadSwitch.ts:166`, `terminalCommands.ts:38`, the close confirms (`App.tsx:355,400` on main; `useGuardedClose.ts` once `hermes-b-busy-panes` merges), `detachWindow.ts:6,27,43`, `remote_tabs_set` `pty_ids` (phone remote, not yet built) |

- **`activeCwd` follows the tab, not the view in sight** (M4, ruled
  2026-11-02, per the UX): showing "dev server" in another folder doesn't
  re-point the project banner, the board, Fleet's "This terminal" or the
  contract actions. The 2a developer has this ruling.
- **What enforces it.** The field removal, plus one vitest per `tabStore`
  function in the table, each run with a pane in a hidden view, plus a test
  that `activeCwd` is the own view's while a sub-terminal in another folder
  is in sight.
- **The `setPtyId` test.** It sets an id on a hidden pane, checks it is
  stored, and checks the agent dot and the kill path both see it.
- **Switching** changes only `shownView`. Pane ids never change, so terminal
  instances (keyed by pane id) survive, as they do when switching tabs.
  Unmounting never kills a terminal.
- **Selecting a sub-terminal from outside the strip.** An agent-status toast
  and ⌘K both find the tab and the view through `allTabPanes` /
  `viewOfPane`, then set `shownView` as well as the active tab.
- **Marks per view.** `markAttention` is keyed by `tabId/viewId`, and the
  tab's mark rolls up all its views. Activity reads `isPaneActive` per view.
- **Shortcuts.** `prevSubTerminal` is ⌘[ (Ctrl+Shift+[ on Linux) and
  `nextSubTerminal` is ⌘] (Ctrl+Shift+]).
  - In a tab without sub-terminals the handler doesn't `preventDefault`.
  - On Linux, `isAppShortcut` keeps Ctrl+Shift+[ and ] from reaching the
    shell in every tab. Some terminals send those keys as Esc; documented.
- **Saving the session.** `SavedTab` keeps `root` as the own view's tree, so
  old readers and old sessions work. It gains `subViews` (name, tree, folders,
  scrollback) and `shownView`. Old sessions load as one "own" view.
  - Over 5 MB, `saveSession` keeps the tail of each pane's scrollback. That
    walk covers `root` and every `subViews` tree (today it walks only
    `tab.root`). A test saves a session over 5 MB whose bulk is in a
    sub-terminal and checks it is truncated.
  - Restored sub-terminals start lazily, when first shown, and don't count as
    running (see "Busy check").
  - Commands, status, `spawnedBy` and the typed line are never saved.
  - The command line for Insert command lives in memory only.
  - `sync.rs` `value_for_repo` strips `serializedBuffer` before pushing.
    With command-derived names limited to one word, no command line reaches
    the sync repo.

## Making the new terminal: created at once

Only the view in sight of the active tab is mounted, and a pane makes its
PTY on mount. A sub-terminal is usually never shown, so the window creates
the new pane's terminal as soon as it adds the pane (story 4).

- It calls today's `createInstance` with no container: an xterm in a
  detached wrapper, at the caller's size (24×80 if the caller has no
  instance), then `create_pty` with the `requestId`. `createInstance` already
  supports a null container.
- On first show, the existing mount path (`useTerminal`) finds the instance
  and seats it (`seatTerminal`).
- **Exactly one `create_pty`.** With `--focus`, the pane mounts while
  `createInstance` may still be awaiting. `createInstance` puts the instance
  in the map before its first `await`, so the mount finds it and doesn't
  create a second. A test opens with `--focus` and counts exactly one
  `create_pty`; another does the same for a background add shown at once.
- This replaces a Rust spawn. Rust never spawns or kills, nothing exists
  until the window agrees, and activity, attention and exit status work
  before the pane is first shown.
- WebGL is already right on main: since #73 (68b0d50) a terminal takes a WebGL
  slot only when `seatTerminal` seats it (8 slots, least recently seated
  evicted first), so a never-shown terminal never holds one.

## The hidden-terminal budget (story 4b, R3)

Rewritten against `origin/main` after #73. It applies to every terminal
created **without a container**: `createInstance` with a null container
(story 4's opens) and `createReattachedInstance` for a hidden pane (story 5's
detached windows). A terminal created with a container (every normal mount,
and a restored session's panes, whose saved scrollback is written before the
seat) is unchanged.

- **Until its first `seatTerminal`:**
  - scrollback is `min(setting, 1000)`. `refreshAllTerminals` (which today
    resets `scrollback` on every instance, hidden or not) keeps the cap on a
    not-yet-seated instance;
  - no `ImageAddon`. Sixel and inline images printed before then are not
    drawn.
- **At its first `seatTerminal`,** before the renderer is decided: the
  scrollback becomes the setting, and the `ImageAddon` is loaded. It must load
  before `loadGpu` (D3 of #73, `_bmad-output/plan-webgl-for-visible-terminals.md`:
  the image addon wraps `setRenderer`), and also on the paths where WebGL is
  off or unavailable. An instance is marked seated so this happens once.
- **Tests:** a hidden instance has the capped scrollback and no image addon;
  `refreshAllTerminals` keeps the cap; the first seat loads the image addon
  before the WebGL addon (order of `loadAddon` calls) and lifts the cap; a
  normal mount is unchanged; a restored pane keeps more than 1000 lines of
  saved scrollback.
- **Dev helpers** (dev builds only, `import.meta.env.DEV`):
  - `window.__adeEchoProbe(200)`: writes 200 single characters to the
    visible pane's PTY, 50 ms apart, and for each records the time from the
    `write_pty` call to the moment xterm's `onWriteParsed` sees it echoed.
    Prints p50, p95 and the maximum.
  - `window.__adeTypeInHidden(command)`: types `command` and Enter into every
    sub-terminal of the active tab that has not been shown.
- **Manual check V3 gates story 4b's Done,** per
  `0009-manual-checks-do-not-gate-done` (unmerged, `docs/claude-md-paths`),
  which lets a plan name a manual check that gates.
  - Agents have no GUI, so the owner runs V3 on a Mac. Until then, QA
    records it as "not run, pending the owner".
  - **Load:** run plain `ade open --name load1` … `load8` from the visible
    pane (no `-- COMMAND`, so story 9 isn't needed), then
    `window.__adeTypeInHidden('yes "$(printf %0100d 0)" | head -c 10000000 | pv -qL 1m')`
    (1 MB/s for 10 s each; `pv` from Homebrew). Starting it by hand instead
    means showing each sub-terminal, which lifts its budget; record which
    way was used.
  - **Measure:** `window.__adeEchoProbe(200)` in the visible pane while the
    load runs.
  - **Passes** when p95 is under 50 ms. The machine, macOS version and the
    three numbers go in the story's Verification section.
- Story 4 no longer waits for V3, or for this story (R3).

## Closing and detaching

- **Closing kills every pane's shell.** It uses the instance if there is one,
  otherwise the store's `ptyId` (`kill_pty`). Today `destroyInstance` kills
  only when an instance exists.
  - A tab closes all its views.
  - A sub-terminal (× or ⌘W in it, or ⌘⇧W on its last pane) closes its own
    panes.
  - An unattached shell that exited stays in `PtyInstances` until then.
- **Confirms** are the one rule under "Busy check", through
  `useGuardedClose`. A sub-terminal at an idle prompt asks nothing.
- **Move to New Window, before story 5** (M9). On main, `detachTabToWindow`
  serialises only one tree, so a tab's hidden views' shells would leak. Story
  2b hides "Move to New Window" in the tab menu for a tab with
  sub-terminals, with a test; story 5 brings it back.
- **Move to New Window** (story 5, S2) carries every view.
  - `detachTabToWindow` sends `views`, `viewOrder` and `shownView`.
  - `detachTab` detaches every view's instances.
  - The detached window reattaches the shown view on mount, and every
    hidden pane at once, headless (`createReattachedInstance` without a
    container), on the hidden-terminal budget once story 4b is in. That also
    moves each PTY's owner label.
  - The destroy handler kills `allTabPanes`.
  - `DetachedApp` gets the strip, the two sub-terminal shortcuts and the
    strip menu. Move to New Tab is hidden there, since it has no tab bar.
- **Move to New Tab** (strip menu) moves a sub-terminal's view into a new
  tab with its panes and shells, and makes that tab active.

## The guard and `ade open` (story 9, amends ADR 0011)

The CLI-library guard (ADR 0011, `feat/cli-guard`) asks on computed command
names, so as built it would ask on every `"$ADE_HOOK_BIN" open`, and it
doesn't look inside `ade open -- …`. Story 9 changes its resolution, recorded
as an amendment to ADR 0011 when story 9 lands:

- `"$ADE_HOOK_BIN"` (also `$ADE_HOOK_BIN`, `${ADE_HOOK_BIN}`) as a command
  name resolves to ADE's helper, not to a computed name, when the line
  doesn't assign `ADE_HOOK_BIN` (an assignment keeps it computed, so it asks).
- The helper, or a literal `ade`, with the verb `open` is the `ade` CLI. Its
  flags are skipped, and the words after `--` are classified as the command,
  as the guard treats a runner (`env`, `xargs`): `ade open -- gh repo delete
  o/r` asks as `gh repo delete o/r` does. `ade open` with no `--` is not a
  guarded command.
- Other helper verbs (`guard`, hook mode) are unchanged.
- **Known gap, documented (not asked).** ADE types the command into an
  interactive shell, which expands the user's aliases and functions; a Bash
  call doesn't. `ade open -- g repo delete o/r`, with `g` the user's alias
  for `gh`, is not seen as gh. Asking on every first word the guard doesn't
  know would ask on every `ade open -- npm run dev`, which D1 rules out. It
  is within ADR 0011's threat model (deliberate obfuscation is out) and goes
  in the guide.
- The `ade` verbs are one constant, and the guard's test enumerates it (P6(b)).

## Principles check (ADR 0012)

- **P1: met.** The job is Parallel. Agents' work runs in terminals listed
  beside the agent, a click away, instead of in hidden processes. A person no
  longer opens a tab, `cd`s and types to start a server beside their shell.
- **P2: met, under D1, D2 and the hidden-by-default ruling.**
  - `ade open -- <cmd>` runs a command with no ADE prompt, which is no more
    than the Bash call that ran it.
  - The CLI-library guard classifies `ade open` and `"$ADE_HOOK_BIN" open` as
    a runner and judges the command after `--` (D1, see "The guard and
    `ade open`"). Story 9 waits for that guard.
  - A new sub-terminal is hidden by default, but announced: its strip entry
    flashes and is named after the command, the badge counts it, and an
    `aria-live="polite"` region says "Opened sub-terminal: <name>".
  - "Insert command" uses the busy check (S7).
  - The sandbox reaching loopback (manual check V1) is a documented known
    exception (D2).
- **P3: met, with known exception D3.**
  - The token lives only in terminals' environment; the master key lives
    only in ADE's memory. The token never goes on a command line.
  - Any process in an ADE terminal can read it, as with the vault's export.
  - Secrets the caller's shell expanded land in the new shell's history and
    in its scrollback. Scrollback is saved locally but stripped from synced
    state. The docs say to expand secrets inside the new terminal instead:
    `sh -c '…"$TOKEN"…'`.
  - Names never carry a command line (see `--name`), so synced state (the
    session in the sync repo) never holds one. A sync test pins this.
- **P4: N/A.**
- **P5: met (D4).**
- **P6: met.**
  - (a) Offline tests pin everything ADE writes or decides. Manual checks:
    V1 (sandbox and loopback) and V2 (typing across shells) don't gate Done;
    V3 (the hidden-terminal budget) gates story 4b.
  - (b) The `ade` verbs are one constant, and the guard's test enumerates it.
  - (c) N/A.

## Owner decisions (recorded 2026-11-02)

- **D1:** commands are allowed in Continuous mode once the guard classifies
  `ade open` as a runner. No ask rule.
- **D2:** the sandbox reaching loopback is a documented known exception.
- **D3:** expanded secrets landing in the new shell's history and its local
  scrollback are a known exception, with docs. They are kept out of synced
  state: scrollback is stripped there, and names are at most one word of the
  command.
- **D4:** P5 is the owner's own agent fan-out while building ADE.
- **D5:** no off switch.
- **D6:** non-ASCII words are refused, never altered.
- **D7:** 8 per pane, refilling 1/s; 32 live `/open` terminals.
- **D8:** keep the name `ade`, prepended from the checked folder; agents use
  `$ADE_HOOK_BIN`.
- **D9:** wait for `hermes-a-quoting`, or cherry-pick its quoter and tests
  unchanged.
- **D10:** keep `--name`.
- **Cut from v1:**
  - exit codes: entries show only "exited";
  - renaming sub-terminals.
- **Kept in v1:** Move to New Tab, ⌘K sub-rows, Fleet labels.
- **× on a running sub-terminal confirms.**
- **Accepted:**
  - hidden by default, under P2 as above;
  - no Move to New Window for a single sub-terminal;
  - restored sub-terminals start lazily and don't count as running for U4.
- **After the final adversarial review:**
  - **M4:** `activeCwd`, and everything it feeds, reads the tab's own view,
    per the UX.
  - **R1 (M1, M5):** every sub-terminal confirm reuses `hermes-b-busy-panes`'
    busy check (`pty_foreground_job`, `paneBusy`, `useGuardedClose`), plus
    one rule: restored sub-terminals not yet shown don't count.
    `pty_shell_idle` is dropped. `hermes-b-busy-panes` merges before 2b.
  - **R2 (M2):** story 9 types through `feat/cli-guard`'s
    `pty_line_editor_ready` check and writer thread, after `feat/cli-guard`
    merges. "300 ms of quiet" and the 1000-byte canonical-buffer cap are
    dropped.
  - **R3 (M3):** headless creation's budget, the dev echo probe and V3 are
    their own story (4b). V3's load is started by a dev helper (or by hand)
    in 8 sub-terminals opened with plain `ade open`. The endpoint, claim,
    limits and CLI story (4) no longer waits on V3.
  - **R4 (M8):** the verification command is the five approved lines plus
    `cargo check -p ade-hook` from story 4 on (see "Verification command").
  - **M6:** story 9's acceptance criteria include the guard's resolution
    change, as an amendment to ADR 0011.
  - **M9:** story 2b hides Move to New Window for tabs with sub-terminals
    until story 5, with a test.

D2 and D3 join the product doc's exceptions list on approval.

## Testing

- **Rust**
  - `mode()`: each case.
  - CLI flags and exit codes (each row of the table), against a local
    `TcpListener`.
  - `/open` body rules, shell allowlist and Windows.
  - Limits, with an injected clock and requests in flight.
  - Owner lookup, and a listener dropped on `Destroyed`.
  - Ack, refusal and timeout (`expired`; a late ack types nothing).
  - **PTY claim:** each of these gives `typed:false`: below the floor,
    already claimed, dead, foreign, or created without this `requestId`
    (the user's own terminal).
  - Typing (story 9): types only after two ready answers; not ready in 5 s
    gives `typed:false`; the line goes through the writer thread (a terminal
    that doesn't read doesn't block the answer); against an injected
    readiness probe, and one real PTY case on Unix reusing `feat/cli-guard`'s
    test helpers.
  - Per-PTY tokens: the wrong PTY's token is 401; a missing `X-ADE-PTY` is
    401 (the existing 400 tests change).
  - Routing; the open handler injected, and 409 before it is set; hook
    events still served while an `/open` waits on its thread; `reserve_id`
    never repeats.
  - The bin folder and `PATH`, including a symlink whose target is not this
    launch's helper.
  - The guard (story 9): `"$ADE_HOOK_BIN" open -- gh repo delete o/r` asks as
    the bare `gh` line does; `"$ADE_HOOK_BIN" open --name x` doesn't ask; a
    line that assigns `ADE_HOOK_BIN` asks.
- **Vitest**
  - One test per `tabStore` function in the table, with a hidden view.
    Explicitly: `setPtyId` on a hidden pane; `closeTab` kills hidden panes,
    including ones with no instance; `saveSession`/`loadSession` round-trip
    views and load an old session; the 5 MB truncation reaches `subViews`.
  - `tabLabel`, `tabProject`, sort grouping and `activeCwd` while a
    sub-terminal in another folder is in sight: they don't change.
  - Toast and ⌘K switch to the view.
  - `useGuardedClose`: closing a tab whose only sub-terminal is at an idle
    prompt asks nothing; with one where `paneBusy` names a program, it asks;
    a restored sub-terminal not yet shown is skipped even with a stale
    "running" tracker session; × and ⌘W on a sub-terminal use
    `requestCloseView`.
  - Move to New Window is absent from the menu of a tab with sub-terminals
    (2b) and present again in story 5.
  - Default names: `npm run dev` gives "npm"; `env TOKEN=x npm run dev` gives
    "env"; `FOO=1 make` gives "make"; no command gives the folder name or
    "Terminal".
  - **Sync (Rust, `sync.rs`):** for an `ade-session` with `subViews`,
    `value_for_repo` strips `serializedBuffer`, and no command line appears
    in the output.
  - Detaching carries views, reattaches hidden panes headless, and the
    destroy handler kills them all.
  - `terminalOpen.ts`:
    - add keeps selection and focus; `--focus` switches;
    - siblings for sub-terminals, `--split` in a hidden view;
    - `expiresAt` and `expired`;
    - the refusals;
    - creation at once: instance and `create_pty` before any mount, at the
      caller's size; exactly one `create_pty` with `--focus`.
  - The hidden-terminal budget (story 4b), as listed in its section.
  - Shortcuts don't `preventDefault` without sub-terminals.

## Verification command

Approved by the owner on 2026-11-02 (R4). It is the five lines approved on
2026-10-14 (`2026-10-14-relay-pairing-design.md`, "Verification"), plus one
from story 4 on. Each must exit 0:

```
npx tsc --noEmit
npm test
cd src-tauri && cargo test
cd relay && cargo test
cd mobile && npx tsc --noEmit && npx jest
cd src-tauri && cargo check -p ade-hook        # from story 4 on
```

Green means: the TypeScript of the app and of `packages/protocol` type-checks
(and, with `Tab.root` gone, no reader is missed); every vitest, Rust, relay
and mobile test passes; and the `ade-hook` package, which includes
`ade_cli.rs` by `#[path]` and which no other line compiles, builds. Install
steps as in the relay spec (`npm ci` at the root and in `mobile/`). Story 4b
also needs manual check V3, recorded by the owner.

## Suggested stories (for the scrum-master)

1. **Per-PTY tokens.** Standalone. (In build.)
2. **Views in the store, by hand.**
   - 2a: Views refactor, no behaviour change. (In build.)
     - `root` and `activePaneId` leave `Tab`; `views`/`viewOrder`/`shownView`
       come in, with the accessors.
     - Every reader moves to its group from the table, `activeCwd` to the
       own view.
     - The session saves the own view as `root`, so old sessions still load.
     - Done when the verification command is green, plus the per-function
       tests with a hidden view built by the test.
     - Parallel with 1.
   - 2b: Sub-terminals by hand.
     - The strip, switching, the badge, ⌘[ / ⌘].
     - "New Sub-terminal" (U5).
     - Closing a sub-terminal and a tab, with the busy check through
       `useGuardedClose` (`requestCloseView`), and the restored-not-shown
       skip.
     - Move to New Window hidden for tabs with sub-terminals, with a test.
     - The aria-live announcement.
     - Saving and restoring `subViews` and `shownView`, with the 5 MB
       truncation over `subViews`.
     - After 2a and `hermes-b-busy-panes` on main.
3. **Marks per view.** Attention, activity, the agent roll-up, "exited", the
   exited notice. After 2b.
4. **`ade open` adds a sub-terminal.**
   - Route and validation (`cwd`, `name`, `focus`); `split` and `command`
     answer 422 for now.
   - `serve`'s thread per `/open` and the injected open handler.
   - Owner label, listener, `expiresAt`/`expired`, the PTY claim.
   - Creation at once through `createInstance` with no container, and the
     exactly-one-`create_pty` test.
   - Flattening and the limits.
   - The CLI's `mode()`, flags and exit codes; `cargo check -p ade-hook`
     joins the verification command here.
   - After 1 and 2b. No manual check gates it.
   - 4b. **The hidden-terminal budget** (new, split from 4 by R3).
     - Capped scrollback kept through `refreshAllTerminals`; `ImageAddon`
       deferred to the first seat, loaded before `loadGpu`.
     - The dev helpers `__adeEchoProbe` and `__adeTypeInHidden`.
     - Manual check V3 gates its Done.
     - After 4.
5. **Moving.**
   - Move to New Tab.
   - Move to New Window carrying views (and shown again for tabs with
     sub-terminals), headless reattach in the detached window, and kill on
     destroy.
   - `DetachedApp`'s strip and shortcuts.
   - After 2b. The hidden-terminal budget covers its headless reattach once
     4b is in, whichever lands first.
6. **Finding.** ⌘K sub-rows, Fleet labels, toasts and ⌘K switching to the
   view. After 2b.
7. **`ade` on `PATH`**, with the `readlink` check. After 4.
8. **`--split`**, in any view. After 4.
9. **`-- COMMAND`.**
   - Typing through the line-editor check and the writer thread, `typed` to
     the window, the notice and Insert command (with the busy check),
     exit 5.
   - The guard change, as an amendment to ADR 0011 (M6).
   - After 4, D9 (`hermes-a-quoting`), and `feat/cli-guard` on main.

The limits land in story 4, before the command in story 9.

## Not in this spec

- Exit codes and pass or fail per command; renaming sub-terminals.
- Reading output back, closing from the CLI, other verbs.
- Moving a single sub-terminal to a new window; moving it back in.
- Windows; any escape-sequence route.

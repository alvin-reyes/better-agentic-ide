# Opening terminals from inside a terminal

A command run in an ADE terminal opens another terminal as a **sub-terminal**
of the caller's tab, listed in a strip inside that tab, or splits the
caller's pane. It can start in a given folder and type a command there.
People use it to start a dev server beside their shell; agents use it to fan
work out into terminals the user can see.

- UX (the source of truth for what the user sees): `2026-11-02-sub-terminals-ux.md`.
- ADR: `.ade/context/decisions/0014-terminals-open-terminals-through-the-hook-endpoint.md`,
  number provisional per ADR 0012.
- Contract: `.ade/context/terminal-open.md`.

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
  - **U4:** closing a tab confirms whenever any sub-terminal's shell is running.
  - **U5:** "New Sub-terminal" goes in the tab menu; the strip has no `+`.
- **The owner, on this plan:** D1–D10 and the later rulings are listed under
  "Owner decisions".

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

| Exit | When |
|---|---|
| 0 | Opened. The command, if any, was typed; that doesn't mean it ran. |
| 1 | ADE refused or failed, with ADE's message. A 400 with `{}` gives "this ADE is too old for ade open; restart ADE". |
| 2 | Usage error, e.g. `--cwd: no such folder`. |
| 3 | Not in an ADE terminal: an `ADE_*` variable is missing. |
| 4 | The ADE is gone, or this terminal has closed. The message mentions tmux and screen, which keep old variables. |
| 5 | Opened, but the command was not typed. The shell is left running. |

Agents and scripts should run `"$ADE_HOOK_BIN" open ...`. Another tool named
`ade` can't shadow it, and an rc file that rewrites `PATH` can't lose it.

## Backend

```mermaid
sequenceDiagram
  participant C as ade open (PTY 7)
  participant E as endpoint
  participant O as terminal_open.rs
  participant W as owner window
  C->>E: POST /open, X-ADE-PTY 7, X-ADE-Token HMAC(master,7)
  E->>O: screen() passed
  O->>O: validate, limits, caller live, window listening, floor = next PTY id
  O->>W: {request, expiresAt, ...}
  W->>W: before expiresAt: add view or pane, create its terminal headless
  W->>O: terminal_open_done(requestId, ptyId 12, line)
  O->>O: 12 >= floor, unclaimed, live, this window's; quiet; foreground is shell; type
  O->>W: {typed: requestId, ok, why}
  O-->>C: 200 {"ok":true,"typed":true|false}
```

- **The CLI.** `ade-hook` acts as the CLI only when its file name is `ade` or
  `ade.exe`, or its first argument is `open`, `help` or `--help`. Everything
  else stays in today's hook mode, which always exits 0.
  - `guard` is never the CLI: the CLI-library plan (ADR 0011) dispatches it.
  - The rule is a pure function, `mode(argv0, args)`, in a new
    `src-tauri/src/ade_cli.rs`. The main crate compiles it for its tests; the
    helper includes it by `#[path]`.
  - The CLI has its own small HTTP client, because `hook_forward::post`
    discards the status and body.
- **`ade` on `PATH`** (macOS and Linux).
  - It is a symlink to the helper, in `<app data dir>/bin/release`
    (re-pointed each launch) or `bin/debug-<16-hex sha256 of the helper path>`.
    A `debug-*` folder whose target has gone is deleted at launch.
  - ADE uses the folder only if it is the user's, mode 0700, not a symlink,
    and holds only `ade` (checked with `readdir` and `lstat`). It checks this
    at launch and in every `create_pty`.
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
- **Per-PTY tokens (amends ADR 0003).** Each terminal's `ADE_HOOK_TOKEN` is
  `HMAC-SHA-256(master, "pty:<id>")`.
  - `screen()` parses `X-ADE-PTY` first. A missing or malformed id is 401 (it
    was 400), then the token is checked.
  - This relies on PTY ids never being reused; a test pins `reserve_id`.
  - It is not a boundary between processes run by the same user.
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
- **Typing.** It happens only after a timely answer from the window.
  - Rust waits for the shell's first output, then 300 ms of quiet, at most
    5 s. At 5 s it goes on if there was any output; if there was none,
    nothing is typed.
  - It types only if the terminal's foreground process group is the shell
    (`master.process_group_leader()`, i.e. `tcgetpgrp`).
  - The command is typed, not run with `shell -c`: the shell stays open, the
    command is in history, and the rc files have run.
  - A command that can't be typed leaves the shell alone and reports
    `typed:false`: CLI exit 5, and a `{typed}` message to the window.
- **Quoting.** The window quotes each word with `shellQuote` (ADR 0008);
  bare words matching `^[\w./-]+$` are left as they are.
  - Rust refuses a command unless the shell is `sh`, `bash`, `zsh`, `fish`,
    `dash` or `ksh`.
  - Words must be printable ASCII (D6).
  - A line may be at most 1000 bytes, because typeahead sits in macOS's
    1024-byte canonical buffer.
- **Known typing failures** (manual check V2):
  - A builtin `read` in an rc file eats the line.
  - An rc child started before job control is on looks idle.
  - `exec tmux` takes the line.
- **Deadline.** Each request carries `expiresAt`, 5 s after it is sent.
  - A window past it does nothing.
  - On timeout Rust answers 504, types nothing, and sends `{expired}`. The
    window then closes whatever it added late, so a retry can't run a
    command twice.
  - With `--focus`, a terminal whose `create_pty` returns just after the
    deadline can appear and then vanish. That is accepted.
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
- **Shell idle check** (Rust command `pty_shell_idle(id) -> bool`).
  - It is true when `tcgetpgrp` equals the shell's pid.
  - **"Running" means exactly this: the check is false for at least one of
    the view's panes.** An idle prompt is not running. The tab-close confirm
    (U4) and the × confirm both use this one definition.
  - The "not typed" notice uses it: Insert command is disabled while the
    shell is busy, and checked again on click. It writes the line without
    Enter.
  - × on a sub-terminal uses it too (see Closing). The wording is shared with
    the UX spec, which masks long lines.

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

**Every reader, by what it needs:**

| Needs | Readers |
|---|---|
| **View in sight** | `getActivePane`, `getActivePtyId`, `getTabActivePane`, `focusNextPane`/`focusPrevPane` (`focusPaneBy`), keybinding splits, `App.tsx:96` (active PTY), `App.tsx:482` and `DetachedApp.tsx:97` (rendering), `TerminalPane.tsx:44`, `activeCwd` (and so `useProjectSetup`) |
| **Own view** | `tabCwd`, `tabLabel`, `tabProject` (`tabDisplay.ts`), and so tab titles, project grouping, `sortTabsBy` and the strip's own entry (U2); the closed-tab record (`closeTab`) and `reopenClosedTab`; `SettingsPanel.tsx:201` (workspace layout); the phone remote's `remote_tabs_set` `project` (approved in `2026-10-14-relay-pairing-design.md`, not yet built) |
| **The view holding a given pane** | `setPtyId`, `setActivePaneInTab`, `closePane`, `splitPane` (by pane id, in whatever view holds it, so `--split` works in a hidden view) |
| **All views** | `closeTab` kill loop, `detachTab`, `saveSession`/`loadSession`, `tabAgentState` (`agentStatusStore.ts:38`), `useAgentStatusToasts.ts:8`, `TabBar.tsx:60`, `TabSwitcher.tsx:31`, `useFleetData.ts:136,201`, `useTerminal.ts:74,473`, `bmadSwitch.ts:166`, `terminalCommands.ts:38`, `App.tsx:355,400` (close confirms), `detachWindow.ts:26,43`, `remote_tabs_set` `pty_ids` (phone remote, not yet built) |

- **What enforces it.** The field removal, plus one vitest per `tabStore`
  function in the table, each run with a pane in a hidden view.
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
  - Restored sub-terminals start lazily, when first shown, and don't count as
    running for U4.
  - Commands, status, `spawnedBy` and the typed line are never saved.
  - The command line for Insert command lives in memory only.
  - `sync.rs` `value_for_repo` strips `serializedBuffer` before pushing.
    With command-derived names limited to one word, no command line reaches
    the sync repo.

## Making the new terminal: created at once, headless

Only the view in sight of the active tab is mounted, and a pane makes its
PTY on mount. A sub-terminal is usually never shown, so the window creates
the new pane's terminal as soon as it adds the pane.

- It calls `openTerminal(paneId, { cols, rows })` at the caller's size
  (24×80 if the caller has no instance). This is an xterm in a detached
  element. It then calls `create_pty`.
- On first show, the existing mount path finds the instance and seats it.
- This replaces a Rust spawn. Rust never spawns or kills, nothing exists
  until the window agrees, and activity, attention and exit status work
  before the pane is first shown.
- **Cost budget** (S5).
  - A never-shown terminal is created with scrollback `min(setting, 1000)`,
    no GPU renderer and no image addon. It gets the user's scrollback, the
    renderer and the addon on first show. Sixel output before then is not
    drawn.
  - The deferral changes the shared `enableGpuRenderer` path, so tests cover
    both a normal mount and first show after headless creation.
  - Manual check **V3 gates story 4's Done.** ADR 0009, on the unmerged
    `docs/claude-md-paths` branch, lets a plan say a manual check gates.
    - Agents have no GUI, so the owner runs V3 on a Mac. Until then, QA
      records it as "not run, pending the owner".
    - **Load:** 8 hidden sub-terminals, each running
      `ade open -- sh -c 'yes "$(printf %0100d 0)" | pv -qL 1m'` (1 MB/s for
      10 s; `pv` from Homebrew).
    - **Measure:** in the visible pane, run the dev-build helper
      `window.__adeEchoProbe(200)`, added in story 4 and gated to dev builds.
      It writes 200 single characters to the PTY, 50 ms apart. For each it
      records the time from the `write_pty` call to the moment xterm's
      `onWriteParsed` sees that character echoed. It prints p50, p95 and the
      maximum.
    - **Passes** when p95 is under 50 ms. The machine, macOS version and the
      three numbers go in the story's Verification section.
  - Hidden panes that a detached window reattaches headless get the same
    budget: scrollback 1000, no GPU renderer, no image addon until first shown.

## Closing and detaching

- **Closing kills every pane's shell.** It uses the instance if there is one,
  otherwise the store's `ptyId` (`kill_pty`). Today `destroyInstance` kills
  only when an instance exists.
  - A tab closes all its views.
  - A sub-terminal (× or ⌘W in it, or ⌘⇧W on its last pane) closes its own
    panes.
  - An unattached shell that exited stays in `PtyInstances` until then.
- **Confirms.**
  - **Closing a tab (U4)** asks when any sub-terminal is running, in the
    one sense defined under "Shell idle check", or when any pane matches
    `hasActiveProcess`.
  - **× on a sub-terminal** asks when it is running, in the same sense, or
    when any of its panes matches `hasActiveProcess`.
  - A sub-terminal sitting at an idle prompt asks nothing.
- **Move to New Window** (S2) carries every view.
  - `detachTabToWindow` sends `views`, `viewOrder` and `shownView`.
  - `detachTab` detaches every view's instances.
  - The detached window reattaches the shown view on mount, and every
    hidden pane at once, headless (`createReattachedInstance` without a
    container), on the headless budget. That also moves each PTY's owner
    label.
  - The destroy handler kills `allTabPanes`.
  - `DetachedApp` gets the strip, the two sub-terminal shortcuts and the
    strip menu. Move to New Tab is hidden there, since it has no tab bar.
- **Move to New Tab** (strip menu) moves a sub-terminal's view into a new
  tab with its panes and shells, and makes that tab active.

## Principles check (ADR 0012)

- **P1: met.** The job is Parallel. Agents' work runs in terminals listed
  beside the agent, a click away, instead of in hidden processes. A person no
  longer opens a tab, `cd`s and types to start a server beside their shell.
- **P2: met, under D1, D2 and the hidden-by-default ruling.**
  - `ade open -- <cmd>` runs a command with no ADE prompt, which is no more
    than the Bash call that ran it.
  - The CLI-library guard classifies `ade open` and `"$ADE_HOOK_BIN" open` as
    a runner (D1). Story 7 waits for that guard.
  - A new sub-terminal is hidden by default, but announced: its strip entry
    flashes and is named after the command, the badge counts it, and an
    `aria-live="polite"` region says "Opened sub-terminal: <name>".
  - "Insert command" checks that the shell is idle (S7).
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
    V3 (cost budget) gates story 4.
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

D2 and D3 join the product doc's exceptions list on approval.

## Testing

- **Rust**
  - `mode()`: each case.
  - CLI flags and exit codes, against a local `TcpListener`.
  - `/open` body rules, shell allowlist and Windows.
  - Limits, with an injected clock and requests in flight.
  - Owner lookup, and a listener dropped on `Destroyed`.
  - Ack, refusal and timeout (`expired`; a late ack types nothing).
  - **PTY claim:** each of these gives `typed:false`: below the floor,
    already claimed, dead, foreign, or created without this `requestId`
    (the user's own terminal).
  - Typing, against scripted output and an injected foreground probe.
  - `pty_shell_idle`.
  - Per-PTY tokens: the wrong PTY's token is 401; a missing `X-ADE-PTY` is
    401 (the existing 400 tests change).
  - Routing; hook events still served while an `/open` waits; `reserve_id`
    never repeats.
  - The bin folder and `PATH`.
- **Vitest**
  - One test per `tabStore` function in the table, with a hidden view.
    Explicitly: `setPtyId` on a hidden pane; `closeTab` kills hidden panes,
    including ones with no instance; `saveSession`/`loadSession` round-trip
    views and load an old session.
  - `tabLabel`, `tabProject` and sort grouping while a sub-terminal in
    another folder is in sight: they don't change.
  - Toast and ⌘K switch to the view.
  - Closing a tab whose only sub-terminal is at an idle prompt asks nothing;
    with one running a program, it asks.
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
    - **headless creation**: instance and `create_pty` before any mount,
      at the caller's size, with the capped scrollback and no GPU or image
      addon until first show.
  - Shortcuts don't `preventDefault` without sub-terminals; the U4 and ×
    confirms.
- **Verification command:** `npm test`, `npx tsc --noEmit`, `cargo test`
  (in `src-tauri`), all green. Story 4 also needs V3.

## Suggested stories (for the scrum-master)

1. **Per-PTY tokens.** Standalone.
2. **Views in the store, by hand.**
   - 2a: Views refactor, no behaviour change.
     - `root` and `activePaneId` leave `Tab`; `views`/`viewOrder`/`shownView`
       come in, with the accessors.
     - Every reader moves to its group from the table.
     - The session saves the own view as `root`, so old sessions still load.
     - Done when the existing suite and `tsc` are green, plus the per-function
       tests with a hidden view built by the test.
     - Parallel with 1.
   - 2b: Sub-terminals by hand.
     - The strip, switching, the badge, ⌘[ / ⌘].
     - "New Sub-terminal" (U5).
     - Closing a sub-terminal and a tab, with both confirms and
       `pty_shell_idle`.
     - The aria-live announcement.
     - Saving and restoring `subViews` and `shownView`.
     - After 2a.
3. **Marks per view.** Attention, activity, the agent roll-up, "exited", the
   exited notice. After 2b.
4. **`ade open` adds a sub-terminal.**
   - Route and validation (`cwd`, `name`, `focus`); `split` and `command`
     answer 422 for now.
   - Owner label, listener, `expiresAt`/`expired`, the PTY claim.
   - Headless creation with its cost budget, and V3.
   - Flattening and the limits.
   - The CLI's `mode()`, flags and exit codes.
   - After 1 and 2b.
5. **Moving.**
   - Move to New Tab.
   - Move to New Window carrying views, headless reattach in the detached
     window, and kill on destroy.
   - `DetachedApp`'s strip and shortcuts.
   - After 2b.
6. **Finding.** ⌘K sub-rows, Fleet labels, toasts and ⌘K switching to the
   view. After 2b.
7. **`ade` on `PATH`.** After 4.
8. **`--split`**, in any view. After 4.
9. **`-- COMMAND`.**
   - Typing, `typed` to the window, the notice and Insert command (with the
     idle check), exit 5.
   - The guard runner entry (D1).
   - After 4, D9, and the CLI-library guard on main.

The limits land in story 4, before the command in story 9.

## Not in this spec

- Exit codes and pass or fail per command; renaming sub-terminals.
- Reading output back, closing from the CLI, other verbs.
- Moving a single sub-terminal to a new window; moving it back in.
- Windows; any escape-sequence route.

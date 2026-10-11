# Several full ADE windows

ADE has one full window. "Move to New Window" on a tab makes a bare one
(`src/DetachedApp.tsx`): a single tab with a title strip and the scratchpad,
no tab bar, file browser, board or palette. It is not saved, and closing it
ends its shells. A file link clicked in it opens in the window labelled
`main` (`src/lib/openFile.ts`).

Starting the app a second time (`open -n`) starts a second process. Both
processes read and write the same files under `<app data>/state/kv`, so each
overwrites the other's tabs (`ade-session`) and settings.

This spec makes every window a full ADE window, in one process, saved and
restored like browser windows.

## Decisions

- **One app process, many full windows.** New Window opens a complete ADE
  window with one fresh tab.
- **Restored on launch.** Quitting, or closing the last window, saves every
  window (tabs, position, size). All of them come back next launch.
- **Closing one window of several ends it for good.** Its shells end and its
  tabs are forgotten. If that would end an agent or lose an edit, ADE asks
  first. Closing the last window quits, as today.
- **A tab can move between windows with its shell still running** and its
  scrollback: into a new full window, or into another open window. Moving a
  window's last tab closes that window.
- **The bare window goes away:** `src/DetachedApp.tsx`,
  `src/lib/detachWindow.ts` and the `?detached=` mode.
- **File links open in the window they were clicked in.**
- **A second launch opens a new window in the running app** instead of a
  second process (`tauri-plugin-single-instance`).
- **Shared data stays shared.** Settings, workspaces, notes, prompt history,
  the agent tracker, the orchestrator, recordings, recent projects and the
  project-setup lists are one copy for every window. Rust puts every change
  in one order and every window applies it.
- **Windows and their tabs stay on this machine.** They are not written to
  the sync repo at all.
- **A debug build has its own state folder,** so `tauri dev` and the
  installed app never share windows, tabs or settings.

Rejected:

- **One process per window** (what `open -n` does today). Two processes
  can't share the kv files, the PTY table or the sync lock.
- **Keeping the bare window beside full ones.** Two kinds of window, two
  boot paths, and the bare one still can't be saved.
- **`tauri-plugin-window-state` for position and size.** It keeps state per
  label forever, closed windows included, and the registry has to list the
  open windows anyway.
- **The DOM `storage` event, or a notice sent window to window,** for shared
  changes. Neither gives two windows that write the same key at once a
  common order, so their stores can end up different.
- **Stopping a PTY's reader thread and starting another on a move.** The
  reader blocks in `read()` and `portable-pty` offers no way to interrupt it.
- **Checking which window may write to, resize or kill a PTY.** Every
  window is the same trusted app; the owner is recorded only so a closed
  window's shells can be found.
- **A native menu bar on Windows and Linux,** hiding the last window
  instead of quitting, and exporting window sessions to the sync repo
  (nothing ever read them back).

## Work split

Six plans, in this order. Each ships on its own. The BMAD switch (plan B of
`2026-10-11-bmad-version-choice-design.md`) lands before all of them.

- **P1. One reader per PTY.** The reader with a swappable output, and
  `reattach_pty` on top of it. It fixes a bug users have today (a tab moved
  to a bare window loses part of its output to the old reader) and touches
  nothing else. Everything works as before.
- **P2. Shared state between windows.** `shared_put`, the announced keys,
  each store's reload, the re-read before a list is written, the tracker
  fix, and the Rust guard on project setup. The hazard exists today (a bare
  window has the scratchpad and the settings store), and full windows
  without P2 would overwrite each other's settings on the day they ship.
- **P3. Single instance and the debug state folder.** A second launch
  focuses the running app. It goes before any registry exists: two
  processes sharing a registry would hand out the same window ids, overwrite
  each other's sessions and delete each other's files as orphans.
- **P4. The registry, with one window.** The registry, a Rust-built `w1`,
  the migration from `ade-session`, sessions written straight to disk with
  the draft inside, window-scoped ids, the sync change, the quit sequence,
  and the Quit item and command. Nothing new is visible except that ⌘Q and
  Ctrl+Q now save. It isolates the one step that can lose data. The bare
  window still works; its file links go to `w1`.
- **P5. Full windows.** New Window, restoring many, closing one of several,
  the lead window and its hand-over, the launch gate, cleanup of a closed
  window's PTYs and watchers, native titles. A second launch now also opens
  a window. "Move to New Window" still makes a bare window, whose file links
  go to the lead window.
- **P6. Tab moves.** The protocol, "Move to Window ▸", file links in their
  own window, and removing `DetachedApp`, `detachWindow.ts` and
  `?detached=`.

## What the code does today

Facts the sections below build on and don't repeat.

- **One window,** declared in `src-tauri/tauri.conf.json` with no label, so
  its label is `main`. `src-tauri/src/lib.rs` creates no windows and has no
  `setup`, window-event handler or menu code. The only uses of a label are
  in `src/lib/openFile.ts`.
- **macOS gets Tauri's default menu.** Its Quit item calls `terminate:`,
  which ends the process without a close request to any window. So ⌘Q never
  runs `App.tsx`'s close handler (save the session, flush, sync for at most
  4 seconds, destroy): what comes back after ⌘Q is the last auto-save, up to
  20 seconds old. Windows and Linux have no menu.
- **Only the main window** runs `syncBeforeLaunch`, `hydrateFromDisk`,
  `startPeriodicSync` and the 10-minute snapshots (`src/main.tsx`). The
  bare window never hydrates: it reads the theme, notes and history from
  localStorage, so on macOS localStorage is one store for both webviews.
  That has not been checked on WebView2 or WebKitGTK.
- **`src/lib/persistence.ts`** patches `Storage.prototype` in each window and
  writes changed keys to disk 800 ms later, each window from its own batch.
  A failed write puts the batch back and retries.
- **Stores that read localStorage once and write back from memory:**
  `settingsStore`, `orchestratorStore`, `agentTrackerStore`,
  `fileBrowserStore`, and in `Scratchpad` the draft, history and notes. The
  project-setup lists, recent projects and the recordings index are read on
  every call instead.
- **Pane and tab ids** come from per-window counters (`pane-1`, `tab-1`).
  The agent tracker and orchestrator tasks are keyed by pane id, in shared
  keys.
- **PTY output and watch events** go through a Tauri `Channel`, to the
  window that asked. Watchers live until `unwatch_*` is called; today a
  window only goes away when the app exits. The board store and
  `paneMetaStore` are per window and save nothing.
- **The app reads no command-line arguments.**

## What you see

### New Window (P5)

- **macOS menu:** File → **New Window**, ⌘⇧N.
- **Shortcut:** `newWindow: { key: "n", shift: true }` in `SHORTCUTS`: ⌘⇧N
  on macOS, Ctrl+Alt+Shift+N elsewhere. Listed under "Tabs & panes" as "New
  window".
- **Palette:** "Window: New Window".
- **Tab menu** (right-click a tab): **New Window**, after "Reopen Closed
  Tab".

The new window has one tab, "Terminal", in the home folder, with the banner.
It shows neither the New Tab dialog nor the launch splash. It takes the
normal (not maximized, not full-screen) size of the window it was opened
from, 28 points down and to the right, and is never maximized itself. When
that window has no normal size yet, the new one is 1200×800 where the system
puts it.

### Closing a window (P5)

Closing a window while another is open ends its shells and forgets its tabs.
ADE asks first when that would end an agent or lose an edit:

> **Close this window?**
> 2 agents are running. Closing the window ends them.

- One agent: "1 agent is running. Closing the window ends it."
- Unsaved editor tabs only: "1 file has unsaved changes that will be lost."
  (or "2 files have…")
- Both: "2 agents are running and 1 file has unsaved changes. Closing the
  window ends the agents and loses the changes."

Buttons: **Close Window** and **Cancel**. With nothing to lose the window
closes without a question. If the close fails: toast "Couldn't close the
window."

An agent is counted once per pane: a pane with a running session in the
agent tracker, or one where `hasActiveProcess(pane.id)` is not null.

Closing the last window quits. It asks nothing, as today.

### Quitting (P4)

- **macOS:** ⌘Q, or the app menu's **Quit ADE**.
- **Windows and Linux:** Ctrl+Q.
- **Every platform:** palette "Window: Quit ADE".

Quit saves every window and all of them come back next launch. It asks
nothing about agents or unsaved files, as today. On Windows and Linux,
closing windows with the X one at a time forgets each one's tabs; the last X
quits and restores only that window.

Ctrl+Q is the one app shortcut on plain Ctrl. `useKeybindings` handles it
outside `SHORTCUTS`, and `isAppShortcut` lets it through the terminal.

### Moving a tab (P6)

In the tab menu:

- **Move to New Window**: disabled when the window has one tab.
- **Move to Window ▸**: lists the other open windows; picking one moves the
  tab there and brings that window forward. Not shown when no other window
  is open. Moving a window's last tab closes that window.

A window is named by its active tab's label (`tabLabel`). Two windows with
the same name are numbered in the order they were opened: "shop",
"shop (2)".

Toasts, title "Move tab":

- The target closed first: "That window was closed. The tab is still here."
- Any other failure: "Couldn't move the tab. It's still here."
- An editor tab with unsaved changes isn't moved: "Save the file before
  moving this tab."

A file clicked in a terminal opens in that window: documents and images in
its preview panel, the rest in an editor tab there.

## One reader per PTY (P1)

Each PTY gets one reader thread for its whole life, started by `create_pty`.
It sends to whatever the PTY's sink holds:

```rust
struct Sink { channel: Option<Channel<PtyEvent>>, backlog: Vec<u8>, exited: bool }
// PtyInstance gains: sink: Arc<Mutex<Sink>>
```

For each read the thread locks the sink. With a channel, it sends `Output`.
Without one, it appends to `backlog`, which keeps the newest 1 MiB; after a
drop the backlog starts on the next line, when one begins within 64 KiB,
and the next window is told how many bytes were dropped.

**A closed window is not detected by sending.** `Channel::send` posts a
script to the event loop and fails only when the event can't be serialised
or the app is shutting down; a script for a destroyed window is dropped
without an error. The sink does let go of an output whose send fails, but in
P1 nothing clears it otherwise, so the backlog, the kept exit and the
dropped notice are exercised only by tests until P6 adds `detach_pty`.
Until then, output printed between a tab's detach and its `reattach_pty`
is lost in the old window's webview, a shell's last output included.

`reattach_pty(id, on_event)` locks the sink, puts the new channel in, sends
the backlog as one `Output` and clears it. It starts no thread. Any window
may call it, as today.

When the shell exits with no channel attached, the thread sets `exited` and
leaves the instance in the table. The next `reattach_pty` sends the backlog,
then `Exit`, and removes it, so a shell that ends mid-move still shows its
last output.

The loop is a function over `impl Read` and a sink whose output is a
closure, so it is tested without a window.

## Shared state between windows (P2)

### `shared_put`

Rust is the one place that orders changes. `state.rs` gains:

```
shared_put(key: String, value: Option<String>) -> u64      // the sequence number
event  shared-changed { key, value: string | null, seq: number, from: string }
```

Under one lock Rust takes the next sequence number, keeps `value` as the
newest for `key`, and emits `shared-changed` to every window, the writer
included. It writes the newest value of each changed key to disk 800 ms
later and, if that fails, again after 5 seconds: Rust holds the value, so a
failed write can't bring back one that has since been removed.
`state_read_all` and `state_snapshot` see values not yet on disk. A key
outside the announced set is refused.

**The announced keys** are an explicit list, `ANNOUNCED_KEYS`, in
`persistence.ts` and in `state.rs` (a test compares the two): the eleven
keys in the table below. Not "every persisted key": `ade-session` and the
scratchpad draft are persisted and must never be broadcast.

**In the webview,** `startAutoSave()`'s wrapper calls `shared_put` for an
announced key instead of queueing it. Other persisted keys (recordings, and
until P4 the session and draft) keep the per-window batch. Each window
listens for `shared-changed` and:

1. ignores an event whose `seq` is not above the last it applied for that
   key;
2. while one of its own `shared_put` calls for that key has not come back
   as an event, holds events for the key, then applies only the newest;
3. to apply: writes `value` into localStorage with the *unwrapped*
   functions when it differs, then calls the key's reloader, if any.

Every window, and the disk, ends on the value with the highest sequence
number. Two windows that change one list within the same few milliseconds
still lose one of the changes; they no longer disagree about which.

No loops: the unwrapped functions queue and emit nothing, and a reloader
(`registerSharedReload(key, fn)`) sets store state without persisting.

### Each key

| Key | Reload in other windows | Before writing |
|---|---|---|
| `better-terminal-settings` | `setState` with the parsed value over `defaults` (through `migrate`), then `applyThemeToDOM`; terminals follow through the subscription in `useKeybindings` | nothing |
| `better-terminal-workspaces` | set `workspaces` | re-read the list |
| `better-terminal-prompt-history` | `Scratchpad` sets `history` | re-read the list |
| `better-terminal-saved-notes` | `Scratchpad` sets `notes` | re-read the list |
| `better-terminal-orchestrator` | set `sessions`, keeping each one's in-memory `dispatchError` | re-read the list |
| `better-terminal-agent-tracker` | set `sessions` | re-read the list |
| `better-terminal-tour-done` | `Tour` hides if showing | nothing |
| `ade-recordings-index` | `loadRecordings()` if the player is open | already re-reads |
| `ade-recent-projects` | none: read on every use | already re-reads |
| `ade-project-setup-done`, `ade-project-setup-declined`, `ade-project-agents-removed` | none: read on every use | already re-read |
| `ade-file-browser` | none | nothing |

"Re-read the list" means the write takes the list from localStorage, applies
its change, writes it, and sets the store's state to the result. That covers
`saveWorkspace` and `deleteWorkspace`; the scratchpad's history and note
writes; `createSession` and `updateSession`; `startSession`, `endSession`
and `clearHistory`. `deleteHistoryItem` removes by value, not by index: the
index is from a list another window may have changed.

`ade-file-browser` (open, width, show hidden) is ordered and saved like the
rest, but a window doesn't follow another's: opening the file browser in one
must not open it in all.

Recordings (`ade-rec-<id>`) are written once, are not announced, and are
read from localStorage when the player opens.

### Stale agent sessions

`loadSessions()` stops turning `running` into `cancelled`. A new
`cancelRunning()` does it and persists. `main.tsx` calls it once per launch,
in the window that hydrates: the main window today, the lead window from P5.

### Project setup

Two full windows in the same new project will both ask "Set up shop with
BMAD?" (not possible today: the bare window runs neither the `cd` hook nor
the palette). Answering v6 in one and v4 in the other while the first setup
runs would start a second setup, and `APPLY` would run it after the first,
installing v4 beside v6.

The guard is in Rust, building on what the BMAD switch leaves in
`projectsetup.rs`:

- **One busy map,** `BUSY: Mutex<HashMap<PathBuf, Busy>>` with
  `Busy::SettingUp` and `Busy::Switching`, in `projectsetup.rs`. The
  `project_setup_apply` command and `bmad_switch_apply` each enter their
  project before taking `APPLY` and leave when they return. It is the one
  record of "this project is busy", shared by setup and the switch and true
  for every window. The webview's `inFlight` map and the switch's
  `switching` set stay as what they are: one window's way to share a
  running promise.
- **The `project_setup_apply` command refuses,** before taking `APPLY`, a
  project that is busy ("shop is being set up in another window." or "A
  BMAD switch is running in shop."), and, when `full`, a project that is on
  the other version ("shop is already on BMAD v6."). The refusal is in the
  command only. `apply` and `install_source` are unchanged, and the switch
  keeps calling `apply` after it has archived the old version.

Taking the question down in the other window when one window answers is
left for later, on this map. Until then the second window's toast stays up;
answering it does nothing (`wasSetUp` and `versionToSetUp` already see the
first answer).

## Single instance and the debug folder (P3)

**The debug folder.** `state.rs` gains `data_dir(app)`: `app_data_dir()` in
a release build, `app_data_dir()/dev` when `cfg!(debug_assertions)`.
`state_dir` and `sync.rs`'s `app_paths` (the sync repo, config and state)
use it. The vault index stays where it is: the keychain it lists is one per
machine. A debug build's localStorage is already separate (its origin is the
dev server), so its first run seeds the new folder from it.

**The plugin.** `tauri-plugin-single-instance`, registered first in `run()`,
in release builds only: debug and release share the identifier
`com.betterterminal.dev`, and a debug build must start beside the installed
app. When a second process starts, the plugin hands over and the second
process exits. Arguments are ignored; ADE takes none.

- **P3:** the running app brings its last focused window forward,
  un-minimizing it.
- **From P5:** it also opens a new window, as New Window does. While
  quitting it does nothing.
- **macOS:** a Dock click or opening the app again from Finder starts no
  process; Tauri reports `RunEvent::Reopen`, and ADE only brings its last
  focused window forward. `open -n`, or running the binary, does start one.
- **Windows and Linux:** every start from a launcher or a terminal is a
  second process.

## Windows and the registry (P4)

### Ids and labels

A window's id is `w<n>`. `n` comes from the registry's `nextId` and is never
used twice. The Tauri label is the id; no window is labelled `main`.

`tauri.conf.json`'s `app.windows` becomes `[]`. Windows are built in Rust
(`src-tauri/src/windows.rs`) with what the config says today: title bar
style Overlay, decorations, resizable, 1200×800.

Pane and tab ids carry the window id: `pane-w2-7`, `tab-w2-3`.
`AgentSession` gains `windowId?: string`, set by `startSession`. Nothing
parses these ids.

### The registry

`<state>/kv/ade-windows.json`, written by Rust only.

```json
{
  "version": 1,
  "nextId": 4,
  "focused": "w3",
  "windows": [
    { "id": "w1", "x": 120, "y": 80, "width": 2880, "height": 1800, "maximized": false, "fullscreen": false },
    { "id": "w3", "x": 176, "y": 136, "width": 2880, "height": 1800, "maximized": true, "fullscreen": false }
  ]
}
```

- `windows` is in the order the windows were opened. They are reopened in
  that order and `focused` is brought forward last.
- `x`, `y` are the outer position and `width`, `height` the inner size, in
  physical pixels. While a window is maximized or full screen they keep the
  last normal values. A window with no `x` is placed by the system.
- A position is used only if a point 50 pixels inside the top-left corner is
  on a connected monitor; otherwise the size is kept and the system places
  the window.

The registry is always current. Rust writes it (`state::atomic_write`) at
once when a window opens or closes and at most 500 ms after a move or
resize. A focus change is kept in memory and goes out with the next write.
So quit has nothing to "keep" and a crash needs no recovery: what the file
lists is what comes back.

### Sessions

`ade-session-<id>`: today's `SavedSession` plus `draft?: string`, the
window's unsent scratchpad text. It is a kv file written straight to disk.

- A session can be 5 MB (`MAX_SESSION_SIZE`), localStorage's quota is shared
  by every window, and when a write doesn't fit `saveSession` drops the
  scrollback and then the session. So `saveSession()` calls `state_write`
  with `{ "ade-session-<id>": json }`. The 5 MB tail-truncation stays; the
  quota fallbacks go. A failed write leaves the previous file and the next
  save tries again.
- New command `state_read(keys: Vec<String>) -> HashMap<String, String>`.
  `loadSession()` becomes async, reads through it, and runs in `main.tsx`
  before the first render.
- The draft lives in a small module (`src/lib/windowDraft.ts`). `Scratchpad`
  starts from it and sets it on every change, which schedules a session
  save 2 seconds later, as a tab change does. `loadSession` takes the draft
  from a session even when it has no tabs.
- `PERSISTED_KEYS` loses `ade-session` and `ade-scratchpad-draft`. The
  constant in `tabStore.ts` becomes `SESSION_KEY_PREFIX = "ade-session-"`
  and goes in the existing `LOCAL_ONLY` list in
  `src/lib/__tests__/persistedKeys.test.ts`, with this reason. (That test
  scans `lib/` and `stores/` only.)

**Snapshots** copy every kv file, so they now hold every window's session.
Their size is bounded by 20 snapshots × the open windows × 5 MB.

**Sync.** `DEVICE_KEYS`, the device half of `export_state`, and the
`ade-session` branch of `value_for_repo` are removed. Nothing per-window is
written to the repo; the old `devices/<device>/ade-session.json` stops
being updated. `export_state` creates an empty
`devices/<device>/device.json` when it is missing, so the status line still
lists the device.

### Migration

In Rust, at launch, when the registry is missing or doesn't parse:

1. If `ade-session-w1.json` doesn't exist: write it from `ade-session.json`
   with `draft` set from `ade-scratchpad-draft.json`, when either exists.
2. Write the registry: one window `w1`, maximized, no position, and `nextId`
   one above the highest `ade-session-w<n>.json` present.

The copy comes before the registry, so a crash between them repeats the
migration. The two old files are left where they are and never written
again; the launch window removes both keys from localStorage, to give the
quota back.

A registry that parses but lists no usable window gets one new window.
After the registry is loaded, an `ade-session-<id>.json` for an id it
doesn't list is deleted.

### Launch

**Rust, in `setup`:** load the registry, create every listed window in
order, set the macOS menu. The first window is the **lead window**.

**Each window, in `boot()`:**

1. `boot = await invoke("window_boot")`, an async command:

   ```
   BootInfo {
     id: String,               // "w2"
     lead: bool,               // runs the once-per-app jobs
     atLaunch: bool,           // run the launch duties
     launchToken: String,      // new for each process
     incoming: Option<String>, // a tab move to take (P6)
   }
   ```

   Outside Tauri the call fails and the window behaves as
   `{ id: "w1", lead: true, atLaunch: true }`.
2. **Launch duties,** when `lead && atLaunch`: `syncBeforeLaunch()`,
   `hydrateFromDisk()`, `startAutoSave()`, remove the two old keys from
   localStorage, write `launchToken` to the localStorage key
   `ade-launch-token`, `cancelRunning()`, `invoke("launch_ready")`.
3. Every other window: `startAutoSave()`. Then, if `ade-launch-token` in
   its localStorage isn't `boot.launchToken`, it hydrates from disk itself:
   this webview doesn't share localStorage with the lead's.
4. If `boot.lead`: `startLeadJobs()`.
5. Paint the theme. `await initTabs(boot)`: an incoming move, else the saved
   session, else the store's default tab. It runs before React renders, so
   the placeholder tab never starts a shell.
6. Render `App`. A window that isn't `atLaunch` hides the splash at once.

`atLaunch` is true once per window per process. A webview that reloads (dev
HMR, the error screen's Reload) gets `false`, and the launch duties run once
per process. On a repeat `window_boot` Rust kills the PTYs and drops the
watchers the old page had.

### Quit

Triggers: the macOS menu's **Quit ADE** (a custom item with ⌘Q in place of
the predefined one, so this sequence runs), Ctrl+Q, the palette command, and
a close request for the only registered window. The Dock's Quit, a log-out
and a kill end the process without asking; they are covered as a crash is.

Rust runs it (`app_quit`):

1. Set `quitting`. New Window, tab moves, `window_close` and second launches
   are refused from here; an open tab move is failed.
2. Read every window's position and size into the registry and write it.
3. Emit `app-quit` to every window. Each, in parallel: `stopIdlePolling()`,
   `await saveSession()`, `await flushNow()`, `invoke("quit_ready")`.
4. Wait for every registered window, at most 3 seconds. Write any shared
   values still pending.
5. Run one sync from Rust (what `sync_now(false)` runs), at most 4 seconds.
6. `app.exit(0)`.

A crash or kill at any point leaves the registry as of its last change, each
session as of its last save (at most 20 seconds old), and shared keys as of
800 ms before. Every file is written with a temp file and a rename. Nothing
in quit deletes anything, so no step can lose a window.

**Snapshot restore.** `state_restore_snapshot` sets a process-wide flag.
Until the app restarts, `state_write`, `shared_put`'s disk writer, the
registry writer and the quit sequence write nothing.

### The macOS menu

Tauri's default menu, rebuilt in `windows.rs`, with **Quit ADE** (id `quit`,
⌘Q) as a custom item and, from P5, **New Window** (id `new-window`, ⌘⇧N)
above Close Window in File.

## Full windows (P5)

### The lead window

The lead window is the oldest open window. Rust tracks it. It runs
`syncBeforeLaunch()` (launch only), `startPeriodicSync()` (every 3 minutes
and when that window is hidden), and the snapshot (once at launch, then
every 10 minutes: `startSnapshots()`, split out of `startAutoSave`).
`startLeadJobs()` starts the last two and is safe to call twice.

When the lead closes, Rust picks the next oldest and sends it `lead-window`;
every window listens and calls `startLeadJobs()`. Any window can still run
**Sync now**; `SYNC_LOCK` keeps two syncs apart.

Only the lead asks for notification permission at mount. (`sendNotification`
in `useTerminal.ts` also asks, in whichever window first has something to
notify, when the answer is still open. That stays.)

### The launch gate

Windows restored together must not load their stores before the lead has
synced and hydrated.

- A window that is not the lead doesn't get its `BootInfo` until the lead
  has called `launch_ready`.
- If the lead hasn't called `window_boot` 8 seconds after it was created,
  Rust makes the next window in order the lead and answers it.
- Once a lead has booted, the others wait at most 15 seconds: longer than
  the 6-second pre-launch sync plus the read of every kv file. After that
  they go ahead, and the token check in step 3 makes them hydrate
  themselves.
- A window opened later is answered at once and never hydrates: for it
  localStorage is newer than the disk.

**What depends on shared localStorage.** With the token check, settings and
every announced key are right either way. Recordings (`ade-rec-<id>`, not
announced) and the single quota still assume one localStorage for all
webviews. The by-hand check below covers WKWebView, WebView2 and WebKitGTK.

### Titles

Each window sets its native title to its name (`window_set_title`, when the
active tab's label changes). macOS windows get `hidden_title(true)` so the
title isn't drawn over the tab bar, and are listed in the Window menu. On
Windows and Linux the title bar shows the tab's name where it is blank
today; that is intended.

### New Window

`window_new()` is an async command (a window can't be created from a sync
one on Windows). It adds a registry entry and builds the window. A second
call within 300 ms of the last is ignored: on macOS the webview should get
⌘⇧N before the menu does (as ⌘W closes a tab today although the default
menu's Close Window carries ⌘W), `useKeybindings` calls `preventDefault`
for it, and the guard covers the case where both fire.

### Close

Each window's `onCloseRequested` prevents the default and then:

1. Counts agents and unsaved editor tabs; if either is above zero, shows the
   dialog. **Cancel** stops here.
2. Marks the window closing: `saveSession()` becomes a no-op and a save
   already running is awaited.
3. `await flushNow()`.
4. `invoke("window_close")`.

"Close or quit" is decided in step 4, not before the dialog. Under the
registry lock, `window_close`:

- returns `"quit"` and closes nothing when `quitting` is set;
- returns `"quit"` and starts the quit sequence when this is the only
  registered window (another may have closed while the dialog was up);
- otherwise removes the registry entry and writes the registry, deletes
  `ade-session-<id>.json`, picks a new lead if needed, and destroys the
  window.

On `"quit"` or an error the window clears its closing mark and carries on;
an error also shows the toast. The registry is written before the session is
deleted, so a crash between them leaves an orphan for the next launch.

**When a window is destroyed,** however it happened, Rust's handler kills
the PTYs it owns, drops its watchers, fails any tab move it is part of, and
emits `window-gone { id }` to the others. This handler, on Tauri's
window-destroyed event, is the only way a closed window is noticed; a
failed send never is (see P1).

Killing a PTY has to end its shell. `kill_pty` today only drops the table
entry: the reader thread holds its own handle on the PTY, so the shell and
a foreground job keep running and the thread keeps reading. The cleanup
here, and `kill_pty` itself, kill the child process. The lead, on `window-gone`,
cancels that window's `running` tracker sessions. A window destroyed
without `window_close` (its webview crashed) keeps its registry entry and
session and comes back next launch.

**Ownership.** `PtyInstance` gains `owner: String`: the label that called
`create_pty`, or last called `reattach_pty`. `WatcherManager` and
`SubagentWatcherManager` record the owner beside each watcher;
`watch_directory` takes it from the injected window, next to the `exclude`
parameter the BMAD switch adds. The owner is used for this cleanup and for
moves, and for nothing else.

`default.json` loses `core:window:allow-destroy` here, and
`core:window:allow-create` and `core:webview:allow-create-webview-window`
in P6.

### The fleet

A window's fleet view can hold running sessions from other windows. A
running lane whose `windowId` isn't this window's goes under **Other
windows** instead of "Closed terminals".

## Two windows on the same project

- **BMAD question and setup:** see "Project setup" (P2).
- **The board panel and every watcher** (board, file browser, preview,
  sub-agents): safe. The board store is per window and saves nothing; each
  window rebuilds from disk on its own `Channel`. An approval or a stage
  change in one is a file write the other's watcher sees.
- **The terminal focus guard:** safe, unchanged. It listens to its own
  window's `focus`.
- **Notifications:** safe. Only the window that owns a pane polls it, so one
  finished agent makes one notification and one toast. This needs the
  window-scoped pane ids (P4).
- **The context guard:** unchanged. Two windows in one folder each warn
  once about the same Claude session.
- **The orchestrator:** tasks point at panes and tabs of the window that
  dispatched them. After its tab moves, "go to tab" on an old task does
  nothing.

## Moving a tab (P6)

`pty.rs` gains `detach_pty(id)`: it locks the sink, takes the channel out
and sends `PtyEvent::Detached` (`"detached"`) on it. Sends happen under the
lock, so `Detached` is the last thing the old window receives for that PTY.
This explicit detach is what first puts a sink in its unattached state in
the running app.

Once a sink can be unattached, a killed PTY whose shell lives on would keep
filling a backlog of up to 1 MiB that nobody will read. So from P6 a killed
PTY's sink is also marked closed, and `push` on a closed sink discards.

S is the source window, T the target.

1. **S → `tab_move_begin({ target, ptyIds })`.** `target` is a window id, or
   null for a new window. Rust refuses when quitting, when `target` isn't
   open ("window-gone"), or when it is S. It detaches each PTY, records the
   move and returns its id. A move not finished 10 seconds later fails.
2. **S** waits for `detached` on each pane's channel and then for xterm's
   write callback (`term.write("", cb)`), so everything sent is in the
   buffer. It builds the tab: name, type, color, the type's own fields, the
   active pane, and the split tree with each pane's old id, PTY id, folder
   and serialized scrollback. A recording running on a pane is stopped and
   saved first.
3. **S → `tab_move_send({ moveId, tab })`.** For a new window Rust builds
   one now, with no registry entry, whose `BootInfo.incoming` is the move
   id. For an open one it emits `tab-incoming { moveId }` to T.
4. **T → `tab_move_take({ moveId })`.** T adds the tab with ids from its own
   counters and makes it active. Each terminal is created with the
   scrollback written in, then `reattach_pty`, which makes T the owner. T
   renames the pane in the agent tracker (`paneId`, `windowId`) and in
   orchestrator tasks. A fleet tab, an editor tab for a file, or a contracts
   tab for a root that T already has focuses the existing one.
5. **T → `tab_move_done({ moveId })`.** Rust adds a new window's registry
   entry now, focuses T, and emits `tab-moved { moveId }` to S.
6. **S** removes the tab (`detachInstance`, which never kills the PTY). If
   it was S's last tab, S closes through `window_close`, with no question.

S keeps the tab until step 6; until then its terminal is on screen and
shows no new output.

**Failure.** On the timeout, on S or T closing or T failing to load, or on
quit, Rust gives the move's PTYs back to S and detaches them, destroys a
window made for the move, emits `tab-move-failed { moveId, why }` to S and
T, and forgets the move. S reattaches each pane to the terminal it still
has and shows the toast; T removes the tab if it had added it, killing
nothing. Output that reached T before the failure is not replayed in S; the
rest arrives from the backlog.

**If S is gone** when T calls `tab_move_done`, the move stands: the tab is
T's.

**Removed with P6:**

- `src/DetachedApp.tsx` and `src/lib/detachWindow.ts`.
- In `src/main.tsx`: `detachedTab()` and the `?detached=` branches.
- In `tabStore.ts`: `detachTab`. `detachInstance` stays, and
  `createReattachedInstance` gains the scrollback.
- In `src/lib/openFile.ts`: everything but `openFileHere`, which
  `openFileFromTerminal` becomes. `App`'s `open-file` listener goes.
- The two window-creating permissions.

## Docs

- `docs/guide/terminal.md`: "Move to a new window" becomes a section on
  windows. The description drops "detached windows".
- `docs/guide/shortcuts.md`: New window, Quit.
- `docs/guide/sync.md`: the per-device row becomes "Windows, their tabs and
  scratchpad drafts: stay on this machine, not in the sync repo". "When the
  window is hidden" becomes "when the oldest window is hidden"; "On close"
  becomes "On quit".

## Testing

What each plan must show; the test design is the plan's.

- **P1.** Bytes read with no sink arrive first on the next one, once and in
  order, capped at 1 MiB. With a real PTY and a steady writer (Unix), three
  sinks in turn receive exactly what was written, also under a free-running
  writer. A cut backlog starts on a line. On the sink alone (not reachable
  in the app before P6): an output that fails falls back to the backlog,
  and a shell that exits unattached delivers its last output and `Exit` on
  the next attach.
- **P2.** Rust: the disk gets the newest value, also after a failed write;
  an unannounced key is refused; the two `ANNOUNCED_KEYS` lists match; setup
  is refused for a busy project and for the other version, and `apply`
  still installs after an archive. Frontend, with two copies of each store
  over one localStorage and events passed by hand: two windows writing one
  key before hearing each other end equal; a reload writes nothing; each
  list store keeps both windows' additions; the orchestrator keeps
  `dispatchError`; the file browser doesn't follow; history deletes by
  value; `cancelRunning` runs only where the window hydrates.
- **P3.** The hand-off handler focuses the last focused window (a function
  over the window state, tested without the plugin). `data_dir` ends in
  `dev` only in a debug build. By hand: `open -n` on macOS, a second start
  on Windows and Linux, `tauri dev` beside the installed app.
- **P4.** Migration copies session and draft before the registry is
  written, changes nothing on a second run and leaves the old files. A
  missing, unparseable or empty registry opens one window; `nextId` never
  goes back; orphans are deleted. The off-monitor check, as a pure
  function. Sessions go through the commands and never touch localStorage;
  the draft round-trips. Ids carry the window id. The sync export writes
  nothing per-window and still lists the device. Quit's order and its
  3-second wait; nothing is written after a snapshot restore. By hand: ⌘Q
  and Ctrl+Q then relaunch; kill then relaunch.
- **P5.** `window_close` decides under the lock, also when a second window
  closed while the dialog was up; the registry is written before the
  session is deleted; the lead moves to the next oldest. `atLaunch` is true
  once per window per process. The gate: a lead that never boots is
  replaced, the others wait, a window without the token hydrates. A
  destroyed window's PTYs and watchers go and `window-gone` is emitted. Two
  `window_new` calls within 300 ms open one window. The dialog's wordings.
  By hand, on macOS, Windows and Linux: quit with three windows and
  relaunch; a note saved in one window shows in another; a recording made
  in one plays in another.
- **P6.** `Detached` is the last message. A missing target is refused. A
  timeout, and S or T closing, give the PTYs back and remove a window made
  for the move; a new window is registered only at done. S keeps the tab
  until `tab-moved` and removes it without `kill_pty`; the last tab closes
  the window. T writes the scrollback before reattaching and renames the
  pane in the tracker and orchestrator. An unsaved editor tab is refused.
  Nothing in `src/` mentions `detached` or the label `main`.

## Non-goals

- A window per project, or windows that know which project they are for.
- Reopening a closed window.
- Dragging a tab from one window to another.
- Settings that differ by window.
- Asking about agents or unsaved files at quit.
- A folder argument on the command line.
- Recovering tabs after a downgrade and re-upgrade: an older ADE writes
  `ade-session`, which this version reads only once, at migration.
- Showing another window's sync result in *Settings → Sync*.
- Taking the BMAD question down in every window when one answers.
- Merging two windows' simultaneous changes to one list.

## Decisions made while writing

| Limit | Value |
|---|---|
| PTY backlog while no window is attached | newest 1 MiB |
| A tab move, from begin to done | 10 seconds |
| Quit: waiting for windows, then for sync | 3 seconds, then 4 |
| Launch gate: lead not booted, then `launch_ready` | 8 seconds, then 15 |

New in this revision:

- `shared_put` echoes to the writer too, and a window holds events for a key
  while its own put is in flight. Skipping its own echoes would leave two
  simultaneous writers on each other's value.
- Every shared exact key is announced, the read-on-use ones included.
- The debug folder is `<app data>/dev`; the vault index is not moved.
- The sentinel is the localStorage key `ade-launch-token`.
- The draft is saved by the session timers, so a crash can lose up to 20
  seconds of it, where today it loses about one.
- The sync export keeps an empty `devices/<device>/device.json`.
- A shell that exits while detached keeps its last output for the next
  attach.
- A busy project is refused before `APPLY`, so a second window's setup
  fails at once instead of queueing.
- A repeat `window_boot` cleans up the old page's PTYs and watchers.
- Ctrl+Q is handled outside `SHORTCUTS`.

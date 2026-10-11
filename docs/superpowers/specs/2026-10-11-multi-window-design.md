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
  tabs are forgotten. If agents are running in it, ADE asks first. Closing
  the last window quits, as today.
- **A tab can move between windows with its shell still running:** into a
  new full window, or into another open window. Moving a window's last tab
  closes that window.
- **The bare window goes away:** `src/DetachedApp.tsx`,
  `src/lib/detachWindow.ts` and the `?detached=` mode.
- **File links open in the window they were clicked in.**
- **A second launch opens a new window in the running app** instead of a
  second process (`tauri-plugin-single-instance`).
- **Shared data stays shared.** Settings, workspaces, notes, prompt history,
  the agent tracker, the orchestrator, recordings, recent projects and the
  project-setup lists are one copy for every window. A window that changes
  one tells the others, and they reload it.
- **Windows and their tabs stay per machine** in cross-machine sync, as
  `ade-session` is today.

Rejected:

- **One process per window** (what `open -n` does today). Two processes
  can't share the kv files, the PTY table or the sync lock.
- **Keeping the bare window beside full ones.** Two kinds of window, two
  boot paths, and the bare one still can't be saved.
- **Hiding the last window instead of quitting** (the usual macOS pattern).
  The agreed behaviour is that closing the last window quits, as today.
- **`tauri-plugin-window-state` for position and size.** It keeps state per
  label forever, including closed windows, and the registry below has to
  list the open windows anyway. One file is simpler than two.
- **The DOM `storage` event to tell windows about shared changes.** It would
  need no code, but whether one webview hears another's writes differs by
  engine (WKWebView, WebView2, WebKitGTK) and can't be driven from a test.
- **Stopping a PTY's reader thread and starting another on a move.** The
  reader blocks in `read()` on the PTY and `portable-pty` offers no way to
  interrupt it. See "The reader" below.
- **A native menu bar on Windows and Linux.** It would add a bar inside the
  window that ADE doesn't have today.

## Work split

Four plans, built in this order. Each ships on its own.

- **A. Shared state between windows.** The change notice, each store's
  reload, the re-read before a list is written, the cross-window project-setup
  guard, and "only the launch window cancels stale agent sessions". Nothing
  in A makes a new kind of window. It goes first because the hazard exists
  today (a bare window has the scratchpad and the settings store, so a note
  saved there and one saved in the main window overwrite each other), and
  because B without A would let two full windows overwrite each other's
  settings on the day it ships.
- **B. Full windows.** Window ids and the registry, per-window sessions and
  drafts, the migration, launch and restore, New Window, the macOS menu,
  quit and close, the once-per-app job owner, PTY and watcher ownership,
  unique pane and tab ids, and the sync key changes. After B the bare window
  still exists and "Move to New Window" still makes one.
- **C. Tab moves.** The move protocol, the reader change in `pty.rs`,
  "Move to Window ▸", file links, and removing `DetachedApp`,
  `detachWindow.ts` and `?detached=`. It needs B's windows to move a tab
  into.
- **D. Single instance.** The plugin and what a second launch does. It goes
  last because "open a new window" needs B, and until then a second process
  is no worse than today.

## What the code does today

- **One window,** declared in `src-tauri/tauri.conf.json` with no label, so
  its label is `main`. `src-tauri/src/lib.rs` creates no windows, has no
  `setup`, no window-event handler and no menu code.
- **macOS gets Tauri's default menu** (Tauri adds it when the app sets
  none). Its Quit item calls `terminate:`, which ends the process without a
  close request to any window. So ⌘Q never runs `App.tsx`'s close handler
  today: what is restored after ⌘Q is the last auto-save, up to 20 seconds
  old. Windows and Linux have no menu.
- **`App.tsx`'s close handler** (`onCloseRequested`) saves the session,
  flushes auto-save, runs `syncNow(false)` for at most 4 seconds, then
  destroys the window. Only `App` has it.
- **`src/main.tsx`** picks the mode from `?detached=`. Only the main window
  runs `syncBeforeLaunch`, `hydrateFromDisk`, `startPeriodicSync` and the
  10-minute snapshots. A bare window runs `startAutoSave({ snapshots:
  false })` only.
- **localStorage is one store for every window** (same origin, same webview
  data store). The bare window depends on this today: it never hydrates, and
  reads the theme, notes and history the main window put there.
- **`src/lib/persistence.ts`** patches `Storage.prototype` in each window and
  writes changed keys to disk 800 ms later. The last window to flush a key
  wins.
- **Stores that read localStorage once, when their module loads:**
  `settingsStore` (settings and workspaces), `orchestratorStore`,
  `agentTrackerStore`, `fileBrowserStore`. `Scratchpad` reads its draft,
  history and notes once when it mounts, and `Tour` reads its done flag
  once. All of them write back from the copy in memory.
- **Code that reads localStorage on every call,** and so is already safe to
  share: the project-setup lists (`readList`, `readRemoved` in
  `src/lib/projectSetup.ts`), recent projects (`src/lib/newTab.ts`), and the
  recordings index (`readIndex` in `src/hooks/useTerminalRecording.ts`).
- **`agentTrackerStore.loadSessions`** marks every `running` session
  `cancelled` when the module loads, on the grounds that the app has just
  started. A second window loading the module would do that to sessions
  that are running in the first.
- **Pane and tab ids** come from per-window counters (`pane-1`, `tab-1`).
  The agent tracker and orchestrator tasks are keyed by pane id, in shared
  keys. Two full windows would both have a `pane-1`.
- **`src-tauri/src/pty.rs`** has one `PtyManager` for the process.
  `create_pty` starts a reader thread. `reattach_pty` clones the reader and
  starts a second thread without stopping the first, so after a tab moves
  two threads read the same PTY and each gets part of the output. `kill_pty`,
  `write_pty` and `resize_pty` take an id and check nothing about who asks.
- **`WatcherManager` and `SubagentWatcherManager`** keep a watcher until
  `unwatch_*` is called. A window that goes away without calling it leaves
  the watcher running. Today that only happens when the app exits.
- **PTY output and watch events** go through a Tauri `Channel`, so only the
  window that asked receives them. The board store
  (`createBoardPanelStore`) and `paneMetaStore` hold nothing saved and are
  per window.
- **The only uses of a window label** are in `src/lib/openFile.ts`
  (`MAIN_WINDOW = "main"`, `emitTo("main", "open-file")`). The capability
  file grants every window (`"windows": ["*"]`).
- **The app reads no command-line arguments** and declares no document
  types, so there is no folder argument to carry over.
- **`src-tauri/src/sync.rs`** exports `DEVICE_KEYS` (`ade-session`,
  `ade-scratchpad-draft`) to `devices/<device>/` and imports only
  `SHARED_KEYS`. It strips `serializedBuffer` from the key named
  `ade-session`.
- **Restoring a snapshot** (`SyncSettings.tsx`) calls `suspendAutoSave()` in
  the window that asked, so the restored files aren't overwritten before the
  restart. Other windows would keep writing.

## What you see (plans B and C)

### New Window

- **macOS menu:** File → **New Window**, ⌘⇧N.
- **Shortcut:** `newWindow: { key: "n", shift: true }` in `SHORTCUTS`
  (`src/lib/shortcuts.ts`): ⌘⇧N on macOS, Ctrl+Alt+Shift+N elsewhere, by
  the file's own mapping. It is listed under "Tabs & panes" in
  `src/lib/shortcutList.ts` as "New window".
- **Palette:** "Window: New Window", category "Window".
- **Tab menu** (right-click a tab): **New Window**, after "Reopen Closed
  Tab".

The new window has one tab, "Terminal", in the home folder, with the banner,
as a first launch has. It is the size of the window it was opened from, 28
points down and to the right. It does not show the New Tab dialog or the
launch splash.

### Closing a window

Closing a window while another is open ends its shells and forgets its tabs.
ADE asks first when it would end an agent or lose an edit:

> **Close this window?**
> 2 agents are running. Closing the window ends them.

- One agent: "1 agent is running. Closing the window ends it."
- Unsaved editor tabs only: "1 file has unsaved changes that will be lost."
  (or "2 files have…")
- Both: "2 agents are running and 1 file has unsaved changes. Closing the
  window ends the agents and loses the changes."

Buttons: **Close Window** and **Cancel**. With no agent and no unsaved file
the window closes without a question.

An agent is counted once per pane: a pane with a running session in the
agent tracker, or one where `hasActiveProcess(pane.id)` is not null (the
check a tab close uses today).

Closing the last window quits. It asks nothing, as today.

### Quitting

- **macOS:** ⌘Q, or the app menu's **Quit ADE**.
- **Every platform:** palette "Window: Quit ADE".

Quit saves every window and all of them come back next launch. It asks
nothing about agents or unsaved files, as today.

On Windows and Linux there is no menu, so the palette command (or closing
the last window) is how to quit. Closing windows one at a time leaves only
the last one to restore, as a browser does.

### Moving a tab (plan C)

In the tab menu:

- **Move to New Window**: the tab moves into a new full window with its
  shell still running. Disabled when the window has one tab.
- **Move to Window ▸**: lists the other open windows. Picking one moves the
  tab there and brings that window forward. Not shown when no other window
  is open. Moving a window's last tab closes that window.

A window is named by its active tab's label (`tabLabel`, as the tab bar
shows it). Two windows with the same name are numbered in the order they
were opened: "shop", "shop (2)".

Toasts, title "Move tab":

- The target closed first: "That window was closed. The tab is still here."
- Any other failure: "Couldn't move the tab. It's still here."
- An editor tab with unsaved changes isn't moved: "Save the file before
  moving this tab."

### File links (plan C)

A file clicked in a terminal opens in that window: documents and images in
its preview panel, the rest in an editor tab there.

## Windows and the registry (plan B)

### Ids and labels

A window's id is `w<n>`: `w1`, `w2`, … `n` comes from the registry's
`nextId` and is never used twice, so a closed window's keys can't be picked
up by a later one. The Tauri label is the id. No window is labelled `main`.

`tauri.conf.json`'s `app.windows` becomes `[]`. Windows are built in Rust
(`src-tauri/src/windows.rs`) with what the config says today: title bar
style Overlay, decorations, resizable, 1200×800. On macOS they also get
`hidden_title(true)`, so the native title isn't drawn over the tab bar.

Each window sets its native title to its name (`window_set_title`, called
when the active tab's label changes). macOS lists them in the Window menu,
and "Move to Window ▸" reads them.

### The registry

`<app data>/state/kv/ade-windows.json`, written by Rust only.

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

- `windows` is in the order the windows were opened, oldest first. They are
  reopened in that order, and `focused` is brought forward last.
- `x`, `y` are the outer position and `width`, `height` the inner size, in
  physical pixels as Tauri reports them. While a window is maximized or full
  screen they keep the last normal values.
- A window with no `x` is placed by the system.

The registry is always current while the app runs. Rust updates it when a
window opens, closes, gains focus, moves or resizes, and writes the file
(`state::atomic_write`) at once for open and close and at most 500 ms after
a move or resize. Because of that, quit has nothing to "keep" and a crash
needs no recovery: whatever the file lists is what comes back.

On restore, a position is used only if a point 50 pixels inside the window's
top-left corner is on a connected monitor. Otherwise the window is placed by
the system at its saved size.

### Keys

| Key | Holds | Where it lives |
|---|---|---|
| `ade-windows` | the registry | kv file, written by Rust |
| `ade-session-<id>` | a window's tabs, splits, folders, scrollback | kv file, written straight to disk |
| `ade-scratchpad-draft-<id>` | a window's unsent scratchpad text | localStorage, mirrored by auto-save |

The format of `ade-session-<id>` is today's `SavedSession`, unchanged.

**Sessions don't go through localStorage any more.** A session can be 5 MB
(`MAX_SESSION_SIZE`), localStorage's quota is shared by the whole app, and
when a write doesn't fit `saveSession` first drops scrollback and then drops
the session. With several windows that would lose a window's tabs.

- `saveSession()` builds the JSON as today and calls `state_write` with
  `{ "ade-session-<id>": json }`. The 5 MB tail-truncation stays; the
  quota fallbacks go. A failed write leaves the previous file in place and
  the next save tries again.
- New command `state_read(keys: Vec<String>) -> HashMap<String, String>` in
  `state.rs`. `loadSession()` becomes async and reads through it.
- The session is loaded in `main.tsx` before the first render (see Launch),
  not in `App`'s effect.

**`src/lib/persistence.ts`:**

- `PERSISTED_KEYS` loses `ade-session` and `ade-scratchpad-draft`.
- `PERSISTED_PREFIXES` gains `ade-scratchpad-draft-`.
- `startAutoSave()` no longer takes `snapshots`; the snapshot timer moves to
  the job owner (below).

**`src-tauri/src/sync.rs`:**

- `DEVICE_KEYS` becomes `["ade-windows"]`.
- New `DEVICE_PREFIXES = ["ade-session-", "ade-scratchpad-draft-"]`.
  `export_state` lists the kv folder for keys with these prefixes and
  exports each to `devices/<device>/`, and removes a file there whose key
  has one of these prefixes and no local file (a closed window).
- `value_for_repo` strips `serializedBuffer` from every key that starts
  with `ade-session-`.
- `SHARED_KEYS` and `import_state` are unchanged: nothing per-window is ever
  applied from another machine.

`src/lib/__tests__/persistedKeys.test.ts` also collects `…PREFIX… = "ade-…"`
constants and requires each to be in `PERSISTED_PREFIXES` or in a
`DIRECT_TO_DISK` list in the test, which names `ade-session-` with the
reason above.

### Migration

In Rust, at launch, when `ade-windows.json` is missing:

1. If `kv/ade-session.json` exists and `kv/ade-session-w1.json` doesn't,
   copy it. The same for `ade-scratchpad-draft.json` →
   `ade-scratchpad-draft-w1.json`.
2. Then write the registry: `nextId: 2`, one window `w1`, maximized, no
   position (today's config).

The copy comes before the registry, so a crash between them repeats the
migration. The old two files are left where they are and never written
again: an older ADE started on the same profile still finds its session.
The launch window removes `ade-session` and `ade-scratchpad-draft` from
localStorage, to give the quota back.

When the registry exists but doesn't parse, it is rebuilt from the
`ade-session-w<n>.json` files present, in number order, with no positions,
and `nextId` one past the highest.

After the registry is loaded, kv files named `ade-session-<id>.json` or
`ade-scratchpad-draft-<id>.json` for an id the registry doesn't list are
deleted.

### Unique pane and tab ids

`newPaneId` and `newTabId` in `tabStore.ts` put the window id in:
`pane-w2-7`, `tab-w2-3`. `AgentSession` gains `windowId?: string`, set by
`startSession`. Nothing parses these ids.

## Launch (plan B)

**Rust, in `setup`:**

1. Load the registry, migrating or rebuilding it as above. Delete orphans.
2. Create every listed window, in order. The first is the **job owner**.
3. On macOS, set the menu.

**Each window, in `main.tsx`'s `boot()`:**

1. `installLinkGuard()`.
2. `boot = await invoke("window_boot")`:

   ```
   BootInfo {
     id: String,               // "w2"
     owner: bool,              // runs the once-per-app jobs
     atLaunch: bool,           // created while restoring, not by New Window
     incoming: Option<String>, // a tab move to take (plan C)
     windows: Vec<String>,     // every id in the registry
   }
   ```

   For a window that is `atLaunch` and not the owner, the call doesn't
   return until the owner has called `launch_ready`, or 8 seconds have
   passed. Outside Tauri (tests) the call fails and the window behaves as
   `{ id: "w1", owner: true, atLaunch: true }`.
3. **The owner, at launch, only:** `syncBeforeLaunch()`, then
   `hydrateFromDisk()`, then `startAutoSave()`, then remove from
   localStorage the two old keys and any `ade-scratchpad-draft-<id>` whose
   id isn't in `boot.windows`, then `cancelRunning()` on the agent tracker
   (plan A), then `invoke("launch_ready")`.
4. Every other window: `startAutoSave()`. It never hydrates. localStorage is
   already what the owner put there, and for a window opened later it is
   newer than the disk (writes reach the disk 800 ms late), so hydrating
   would put old values back.
5. If `boot.owner`: `startOwnerJobs()`. Every window also listens for
   `job-owner` and calls it then.
6. Paint the theme, as today.
7. `await initTabs(boot)`, before React renders, so the store's placeholder
   tab never starts a shell:
   - `boot.incoming`: take the moved tab (plan C). It is the window's only
     tab.
   - else a saved `ade-session-<id>`: restore it, as `loadSession` does
     today.
   - else: the store's default tab (a new terminal with the banner).
8. Render `App`. A window that isn't `atLaunch` calls `hideSplash(true)`
   first.

The gate in step 2 is what keeps a pre-launch sync import, and the
hydration that follows it, ahead of every window's stores, as it is ahead
of the one window's stores today.

`App` asks for notification permission at mount today. Only the owner does
that now, so restoring four windows doesn't ask four times.

## Once-per-app jobs (plan B)

The job owner is the oldest open window: the first in the registry's order.
Rust tracks it. It runs:

- `syncBeforeLaunch()`, at launch only
- `startPeriodicSync()`: every 3 minutes, and when that window is hidden
- the snapshot: once at launch, then every 10 minutes
  (`startSnapshots()`, split out of `startAutoSave`)

`startOwnerJobs()` starts the last two and is safe to call twice. When the
owner closes, Rust picks the next oldest and sends it `job-owner`. A
hand-over doesn't take a snapshot of its own; the next is 10 minutes later.

Any window can still run **Sync now**. `SYNC_LOCK` in `sync.rs` already
keeps two syncs from overlapping. After each sync, the window that ran it
emits `sync-result` with the report or the error, and `src/lib/sync.ts` in
every window updates what *Settings → Sync* shows.

**Snapshot restore.** `state_restore_snapshot` sets a process-wide flag in
Rust. From then until the app restarts, `state_write`, the registry writer
and the quit sequence write nothing. That covers the windows the restore
wasn't started from. The frontend's `suspendAutoSave()` stays.

## Quit and close (plan B)

### Telling them apart

- **Quit:** the macOS menu's Quit ADE (a custom item with ⌘Q, replacing the
  predefined one, so the sequence below runs), the palette's "Window: Quit
  ADE", or a close request for the only open window.
- **Close:** a close request while another window is open.

Each window's `onCloseRequested` handler prevents the default and calls
`window_close_request()`, which returns `"quit"` or `"close"`. On `"quit"`
Rust has already started the quit sequence and the window does nothing more.

The Dock's Quit, a log-out and a kill end the process without asking. They
are covered the same way a crash is (below).

### Quit

Rust runs it (`app_quit`):

1. Set `quitting`. From here New Window, tab moves, close requests and
   second launches are ignored, and any tab move still open is failed.
2. Read every window's position and size into the registry and write it.
3. Emit `app-quit` to every window. Each window, in parallel:
   `stopIdlePolling()`, dispatch `ade-flush-draft` (the scratchpad writes
   its draft now instead of after its 400 ms debounce),
   `await saveSession()`, `await flushNow()`, then `invoke("quit_ready")`.
4. Wait until every window has answered, at most 3 seconds.
5. Run one sync from Rust (what `sync_now(false)` runs), at most 4 seconds,
   as the close handler does today.
6. `app.exit(0)`.

**A crash or kill at any point** leaves: the registry as of the last
change (step 2 at the latest), each session as of its last save (at most 20
seconds old, by the existing 2-second and 20-second timers), and shared keys
as of 800 ms before. Every file is written with a temp file and a rename, so
none is torn. A window that doesn't answer in step 4 comes back from its
last auto-save. Nothing in quit deletes anything, so no step can lose a
window.

### Close

In the window being closed, after `window_close_request()` returned
`"close"`:

1. Count agents and unsaved editor tabs. If either is above zero, show the
   dialog. **Cancel** stops here.
2. Mark the window closing: `saveSession()` becomes a no-op, and a save
   already running is awaited.
3. `stopIdlePolling()`. Remove `ade-scratchpad-draft-<id>` from
   localStorage. In the agent tracker, mark this window's `running`
   sessions `cancelled` (`windowId`).
4. `await flushNow()`, then `suspendAutoSave()`.
5. `invoke("window_close")`. Rust, in order: kills the PTYs this window
   owns; drops its file and sub-agent watchers; removes its registry entry
   and writes the registry; deletes `ade-session-<id>.json` and
   `ade-scratchpad-draft-<id>.json`; hands the jobs on if it was the owner;
   emits `window-closed { id }` to the other windows; destroys the window.

The registry is written before the session file is deleted. A crash between
the two leaves an orphan session, which the next launch deletes.

**A window that goes away without step 5** (its webview crashed, or its
script never loaded) is treated as a crash: Rust still kills its PTYs and
drops its watchers when it sees the window destroyed, but its registry entry
and session stay, and it comes back next launch. The owner, on
`window-closed`, cancels that window's `running` tracker sessions.

**Ownership.** `PtyInstance` gains `owner: String`, the label of the window
that called `create_pty` (or last called `reattach_pty`). `kill_pty`,
`write_pty` and `resize_pty` return an error for a PTY the calling window
doesn't own. `get_pty_cwd` stays open to any window. `WatcherManager` and
`SubagentWatcherManager` record the owner label beside each watcher.

The webview no longer destroys or creates windows, so `default.json` loses
`core:window:allow-destroy` in B, and `core:window:allow-create` and
`core:webview:allow-create-webview-window` in C.

### The bare window until plan C

B leaves "Move to New Window" making a bare window (label
`detached-<tabId>-<ts>`), and has to keep it working without a `main`:

- It is not in the registry, is not counted as an open window, is not
  waited for at quit, and has no close question.
- `reattach_pty` sets `owner` to the caller already in B, with no
  restriction on who may call it, so the bare window can write to and
  resize the shell it took. When the bare window is destroyed Rust kills
  the PTYs it owns, which replaces the `tauri://destroyed` handler in
  `detachWindow.ts`.
- File links: `openFileFromTerminal` opens in the current window unless
  its label starts with `detached-`. A bare window emits `open-file` to
  every window, and the job owner opens it.

### The macOS menu

Tauri's default menu, rebuilt in `windows.rs` with two changes:

- **File** gains **New Window** (id `new-window`, ⌘⇧N) above Close Window.
- The app menu's Quit is a custom item, **Quit ADE** (id `quit`, ⌘Q).

The webview sees a key before the menu does and ADE's key handler prevents
the default, which is why ⌘W closes a tab today although the default menu's
Close Window also carries ⌘W. So ⌘⇧N is handled by `useKeybindings` in the
focused window, and the menu item covers a click and the case where no
webview has focus. Both end in the same Rust function.

## Shared state between windows (plan A)

### The notice

`startAutoSave()`'s wrapper already sees every write to a persisted key.
For an exact key in `PERSISTED_KEYS` (not a prefix) it also emits a Tauri
event:

```
shared-key-changed { key: string, value: string | null, from: string }
```

`value` is the new string, or `null` for a removal. `from` is the writing
window's label.

Every window listens (`listenForSharedChanges()` in `persistence.ts`,
started by `startAutoSave`). On an event from another window it:

1. writes `value` into localStorage with the *unwrapped* `setItem` or
   `removeItem`, when it differs from what is there;
2. removes `key` from its own pending batch;
3. calls the reloader registered for `key`, if any, with `value`.

**No loops.** A window ignores its own events. Step 1 uses the unwrapped
functions, so it queues nothing and emits nothing. A reloader sets store
state directly and never calls the store's persist function.

**Step 2 is what keeps the disk right.** Without it: window A writes a key,
window B writes it 100 ms later, A writes some other key and its 800 ms
timer restarts, and A's batch, still holding the older value, reaches the
disk after B's.

Recordings (`ade-rec-<id>`) and scratchpad drafts are prefix keys and are
not announced. A recording is written once and read when the player opens.

`registerSharedReload(key, fn)` in `persistence.ts` is how a store signs up.

### Each key

| Key | Reload in other windows | Before writing |
|---|---|---|
| `better-terminal-settings` | `useSettingsStore.setState` with the parsed value over `defaults` (through `migrate`), then `applyThemeToDOM`. Open terminals follow through the existing subscription in `useKeybindings`. | nothing: the copy in memory is current |
| `better-terminal-workspaces` | set `workspaces` | re-read the list |
| `better-terminal-prompt-history` | `Scratchpad` sets `history` | re-read the list |
| `better-terminal-saved-notes` | `Scratchpad` sets `notes` | re-read the list |
| `better-terminal-orchestrator` | set `sessions`, keeping each session's in-memory `dispatchError` | re-read the list |
| `better-terminal-agent-tracker` | set `sessions` | re-read the list |
| `better-terminal-tour-done` | `Tour` hides if it is showing | nothing |
| `ade-recordings-index` | `loadRecordings()` if the player is open | already re-reads |
| `ade-recent-projects` | none: read on every use | already re-reads |
| `ade-project-setup-done`, `ade-project-setup-declined`, `ade-project-agents-removed` | none: read on every use | already re-read |
| `ade-file-browser` | none (see below) | nothing |

**"Re-read the list"** means the store's write takes the list from
localStorage, applies its change to that, writes it, and sets its state to
the result. It no longer writes the list it had in memory. For
`settingsStore` that is `saveWorkspace` and `deleteWorkspace`; for
`Scratchpad`, the two history writes and the note add, edit and delete; for
`orchestratorStore`, `createSession` and `updateSession`; for
`agentTrackerStore`, `startSession`, `endSession` and `clearHistory`.

**`ade-file-browser`** (open, width, show hidden) stays one saved value, and
a window doesn't follow another's: opening the file browser in one window
must not open it in all. The last window to change it decides what a new
window starts with.

### The agent tracker's stale sessions

`loadSessions()` stops turning `running` into `cancelled`. A new
`cancelRunning()` on the store does it and persists. `main.tsx` calls it
once per launch, in the window that hydrates (today: the main window, never
a bare one; after B: the owner at launch).

After B, a window's fleet view can hold running sessions from other
windows. They have no tab in this window, so today they would fall under
"Closed terminals". A running lane whose `windowId` isn't this window's
goes under **Other windows** instead.

## Two windows on the same project

How each part behaves, and what changes.

- **The BMAD question and setup: unsafe today, fixed in A.** The open
  question (`asking` in `useProjectSetup.ts`, `waiting` in
  `methodologyPrompt.ts`) and the running-setup map (`inFlight` in
  `projectSetup.ts`) are per window. Two windows in the same new project
  both show "Set up shop with BMAD?". Answering v6 in one and v4 in the
  other while the first setup is still running starts a second setup: Rust's
  `APPLY` lock runs them one after the other, and the second installs v4
  into a project that is now v6. Answering the second later is harmless
  (`wasSetUp` reads the shared list, and `versionToSetUp` checks the disk),
  but its toast stays up. Two changes:
  - `setUpProject` emits `project-setup { root, phase: "started" | "done" |
    "failed", methodology, result, from }`. `result` is the `SetupResult`
    with `files` emptied. Other windows count the project as setting up from
    `started` until `done`, `failed`, or two minutes pass, so
    `isSettingUp(root)` is true in every window. On `done` they run their
    `onProjectSetUp` listeners, which is what closes the dialog, ends the
    toast's question and withdraws the toast. Undo is offered only in the
    window that ran the setup.
  - `project_setup_apply`, when `full`, under `APPLY`, refuses a project
    that already has the other version on disk: "shop is already on BMAD
    v6." This is the guard that holds whatever the windows do.
- **The board panel: safe.** The store is per window and holds nothing
  saved; each window rebuilds from disk and has its own watchers. An
  approval or a stage change in one window is a file write that the other's
  watcher sees.
- **The board watchers, the file browser and preview watchers, the
  sub-agent watcher: safe while open.** Each has its own `Channel`. B makes
  Rust drop a closed window's watchers.
- **The terminal focus guard: safe, unchanged.** It listens to its own
  window's `focus` and focuses that window's active terminal.
- **Notifications: safe, unchanged.** Only the window that owns a pane polls
  it, so one finished agent makes one system notification and one toast,
  in that window. This relies on unique pane ids (B): with two `pane-1`s,
  one window would end the other's tracker session.
- **The context guard: unchanged.** Two windows in the same folder each
  warn once about the same Claude session. Each warning is that window's
  own toast.
- **The scratchpad:** the draft is per window (B); history and notes are
  shared and live (A).
- **The orchestrator:** a session's tasks point at panes and tabs of the
  window that dispatched them. Status changes reach every window (A). After
  its tab moves to another window, "go to tab" on an old task does nothing.

## Moving a tab (plan C)

### The reader

Each PTY gets **one reader thread for its whole life**, started by
`create_pty`. It doesn't own the output channel; it sends to whatever the
PTY's sink holds:

```rust
struct Sink { channel: Option<Channel<PtyEvent>>, backlog: Vec<u8> }
// PtyInstance gains: sink: Arc<Mutex<Sink>>
```

For each read, the thread locks the sink. With a channel, it sends
`Output`. Without one, it appends to `backlog`, which keeps the newest
1 MiB.

- **`detach_pty(id)`** (owner only): locks the sink, takes the channel out,
  and sends `PtyEvent::Detached` (`"detached"`) on it. Because sends happen
  under the lock, `Detached` is the last thing the old window receives for
  that PTY.
- **`reattach_pty(id, on_event)`**: locks the sink, detaches any channel as
  above, puts the new one in, sends the backlog as one `Output`, and clears
  it. Sets `owner` to the calling window. Allowed for the owner, and for the
  target of an open move that includes this PTY. It starts no thread.

So there is never a second reader, which is the bug, and no output is lost
or repeated across a move. When the shell exits while detached, the thread
ends and removes the instance as today; a later `reattach_pty` fails with
"PTY not found", and the pane shows `[Process exited]`.

The loop is a function over `impl Read` and a sink whose output is a
closure, so it is tested without a window.

### The protocol

S is the source window, T the target.

1. **S → `tab_move_begin({ target, ptyIds })`.** `target` is a window id, or
   null for a new window. Rust refuses when quitting, when `target` isn't
   open ("window-gone"), or when it is S. It detaches each PTY, records the
   move (`{ id, from, to, ptyIds }`) and returns its id. A move not finished
   10 seconds after this fails.
2. **S** waits for `detached` on each pane's channel, so every byte sent
   before the detach is in its terminal, then builds the tab: name, type,
   color and the type's own fields (`editorFilePath`, `browserUrl`,
   `previewPath`, `orchestratorSessionId`, `contractsRoot`), the active
   pane, and the split tree with, per pane, its old id, PTY id, folder and
   serialized scrollback. A recording running on one of the panes is stopped
   and saved first.
3. **S → `tab_move_send({ moveId, tab })`.** Rust keeps the tab. For a new
   window it creates one now (a registry entry, S's size, 28 points down
   and right) whose `BootInfo.incoming` is the move id. For an open one it
   emits `tab-incoming { moveId }` to T.
4. **T → `tab_move_take({ moveId })`** returns the tab. T adds it with new
   tab and pane ids from its own counters and makes it active. Each terminal
   is created with the scrollback written in, then `reattach_pty`. T renames
   the pane in the agent tracker (`paneId`, `windowId`) and in orchestrator
   tasks. A fleet tab, an editor tab for a file, or a contracts tab for a
   root that T already has focuses the existing one instead.
5. **T → `tab_move_done({ moveId })`.** Rust focuses T and emits
   `tab-moved { moveId }` to S.
6. **S** removes the tab (`detachInstance` for each pane, which never kills
   the PTY). If it was S's last tab, S closes through the close sequence
   from step 2, with no question.

S keeps the tab until step 6. Between steps 1 and 6 its terminal is still on
screen and shows no new output.

### Failure

On a timeout, on T closing or failing to load, or on quit, Rust:

- sets the owner of the move's PTYs back to S and detaches them;
- for a new window that was created for the move, removes its registry
  entry and destroys it;
- emits `tab-move-failed { moveId, why }` to S and T, and forgets the move.

S reattaches each pane to the terminal it still has (`reattach_pty` with a
new channel; the backlog brings what was missed) and shows the toast. T
removes the tab if it had added it, without killing anything.

T closing normally while a move to it is open fails the move first, so
`window_close` never kills a PTY that belongs to a tab still shown in S.

### What is removed

- `src/DetachedApp.tsx` and `src/lib/detachWindow.ts`.
- In `src/main.tsx`: `detachedTab()`, the `?detached=` branch of `Root` and
  of `boot()`.
- In `tabStore.ts`: `detachTab`. `detachInstance` in `useTerminal.ts` stays
  (step 6 uses it), and `createReattachedInstance` gains the scrollback.
- In `src/lib/openFile.ts`: the `detached-` case, the `open-file` event and
  `listenForFileOpens`; `openFileFromTerminal` is `openFileHere`. `App`'s
  effect that listened for `open-file` goes.
- `reattach_pty`'s open access: from C only the owner or a move's target may
  call it.
- The two window-creating permissions in `default.json`.

## A second launch (plan D)

`tauri-plugin-single-instance`, registered first in `run()`, in release
builds only. A debug build doesn't register it, so `tauri dev` still starts
beside an installed ADE (both use the identifier `com.betterterminal.dev`).

When a second process starts, the plugin hands its arguments to the running
app and the second process exits. The running app then opens a new window
(as New Window does, placed from the last focused window) and focuses it.
The arguments are ignored: ADE takes none today. While quitting, the
hand-off is ignored.

- **macOS.** Clicking the Dock icon or opening the app again from Finder
  doesn't start a process; macOS activates the running app and Tauri reports
  `RunEvent::Reopen`. ADE then only brings its last focused window forward,
  un-minimizing it if every window is minimized. It opens no window: a Dock
  click is not a second launch. `open -n`, or running the binary directly,
  does start a process, and the plugin's hand-off opens a new window.
- **Windows and Linux.** Starting ADE again from the Start menu, a launcher
  or a terminal always starts a process, so each such launch opens a new
  window in the running app.

## Docs

- `docs/guide/terminal.md`: "Move to a new window" becomes a section on
  windows: New Window, moving a tab to a new or an open window, what closing
  a window does, and that windows come back after a quit. The page
  description drops "detached windows".
- `docs/guide/shortcuts.md`: New window.
- `docs/guide/sync.md`: the per-device row reads "Windows, their tabs and
  scratchpad drafts". "When the window is hidden" becomes "when the oldest
  window is hidden", and "On close" becomes "On quit".

## Testing

### Plan A

Frontend:

- a write to an exact persisted key emits `shared-key-changed` with the
  value and the window's label; a prefix key and an unpersisted key emit
  nothing
- a received event writes localStorage, queues nothing and emits nothing; a
  window ignores its own event
- a received event drops that key from the pending batch: A writes, B's
  event arrives, A flushes another key, and `state_write` doesn't carry the
  first
- two-window store tests, each with two copies of the store over one
  localStorage and events passed between them by hand:
  - settings: a theme change in one reaches the other's state and DOM, and
    doesn't write again
  - workspaces, history, notes, orchestrator sessions, tracker sessions:
    both windows add an item without a reload in between, and both items
    are in the list
  - orchestrator: a reload keeps a session's `dispatchError`
  - the tour hides when the other window finishes it
  - the file browser doesn't follow the other window
- `loadSessions` leaves `running` alone; `cancelRunning` cancels and
  persists; `main.tsx` calls it only where it hydrates
- project setup: `started` from another window makes `isSettingUp` true;
  `done` runs the listeners (the dialog closes, the toast is withdrawn) and
  offers no Undo; the entry expires after two minutes
- `sync-result` updates what `onSyncResult` listeners in another window see

Rust:

- `project_setup_apply` with `full` refuses the other version and leaves
  the project untouched; the same version, and a project with neither,
  still set up

### Plan B

Rust, on temporary folders:

- migration: the session and the draft are copied to `w1` before the
  registry is written; a second run changes nothing; the old files stay
- an unparseable registry is rebuilt from the session files; orphan session
  and draft files are deleted; a listed window with no session file stays
- ids are never reused after a close
- a position off every monitor is dropped and the size kept (the check is a
  pure function over monitor rectangles)
- closing: the registry is written before the session file is deleted;
  the owner moves to the next oldest
- `kill_pty`, `write_pty` and `resize_pty` refuse another window's PTY
- watchers are dropped by owner
- `state_read` returns only the keys asked for
- after `state_restore_snapshot`, `state_write` and the registry writer
  write nothing
- sync: prefix keys are exported to the device folder; a closed window's
  file is removed there; scrollback is stripped from every `ade-session-*`;
  nothing per-window is imported

Frontend:

- `saveSession` writes `ade-session-<id>` through `state_write` and nothing
  to localStorage; `loadSession` reads through `state_read`; the existing
  session tests pass against the mocked commands
- `initTabs`: an incoming move, a saved session and neither
- boot order, with the commands mocked: the owner syncs, hydrates, sweeps
  and calls `launch_ready`; a non-owner at launch does none of them; a
  later window never hydrates
- `startOwnerJobs` runs once however often `job-owner` arrives
- pane and tab ids carry the window id; `startSession` records it
- the close dialog's five wordings; no dialog with nothing to lose; Cancel
  leaves the window as it was
- close: `saveSession` is a no-op once closing; the draft key is removed;
  this window's running sessions are cancelled; `window_close` is called
  last
- on `app-quit`: the draft is flushed, the session saved, auto-save flushed,
  then `quit_ready`
- the scratchpad draft uses its window's key
- the fleet puts another window's running lane under "Other windows"
- `persistedKeys.test.ts` fails for a prefix that is in neither list
- the palette has "Window: New Window" and "Window: Quit ADE"; the tab menu
  has "New Window"
- a file link opens in a full window whatever its label; a bare window's
  link is opened by the job owner only

By hand, on each platform: quit with three windows and relaunch; kill the
process and relaunch; close the oldest window and see a sync and a snapshot
still happen; a note saved in one window shows in another.

### Plan C

Rust:

- the reader loop: output goes to the attached sink; after `detach_pty` the
  old sink's last message is `Detached`; bytes written while detached arrive
  first on the next sink, once and in order; the backlog keeps the newest
  1 MiB
- with a real PTY running a steady writer (Unix), attach, move to a second
  sink, then a third: the three outputs joined are exactly what was written
- `reattach_pty` is refused for a window that is neither the owner nor the
  move's target, and sets the owner
- a move: begin, send, take, done; a missing target is refused; a timeout,
  and the target closing, give the PTYs back to the source and remove a
  window created for the move

Frontend:

- the tab menu: "Move to New Window" is disabled with one tab; "Move to
  Window ▸" lists the other windows with duplicate names numbered, and is
  absent with none
- the source keeps the tab until `tab-moved`, then removes it without
  `kill_pty`; moving the last tab closes the window
- on `tab-move-failed` the source reattaches and shows the toast; the
  target removes a tab it had added
- the target gives the tab new ids, writes the scrollback before
  reattaching, and renames the pane in the tracker and orchestrator
- an unsaved editor tab is refused; a fleet tab moved into a window that has
  one focuses it
- `openFileFromTerminal` opens in the current window whatever its label
- nothing in `src/` mentions `detached` or the label `main`

### Plan D

Rust:

- the hand-off handler opens a window and focuses it; it does nothing while
  quitting (the handler is a function over the window state, tested without
  the plugin)
- `Reopen` focuses the last focused window and opens none

By hand: `open -n` on macOS, a second start on Windows and on Linux, and a
Dock click on macOS.

## Non-goals

- A window per project, or windows that know which project they are for.
- Reopening a closed window.
- Dragging a tab from one window to another.
- Settings that differ by window.
- Asking about agents or unsaved files at quit.
- A folder argument on the command line.
- A menu bar on Windows or Linux.

## Decisions made while writing

- **Build order: shared state first.** The agreed list put full windows
  first. Shared state goes first here because the overwrite hazard is live
  today with the bare window, and full windows without it would make it
  common.
- **Sessions are written straight to disk,** not through localStorage,
  because the quota is shared and `saveSession`'s last fallback drops the
  session. The key names and the format are as agreed.
- **`ade-session` is copied to `ade-session-w1`, not used in place,** and
  the old file is left for an older ADE. A profile with no kv files at all
  (from before disk state) starts with one fresh tab.
- **The scratchpad draft becomes per window.** One shared draft would have
  each window overwrite the other's unsent text.
- **`ade-file-browser` is shared but not live.**
- **One reader per PTY with a swappable output,** in place of stopping the
  old reader. It gives the agreed result (never two readers) and is the only
  portable way to get it.
- **A move keeps the tab in the source until the target has it,** so a
  failure needs no undo beyond reattaching.
- **The moved tab carries its scrollback.** Today a moved tab's terminal
  starts blank.
- **PTYs and watchers have an owner window,** and Rust cleans them up when a
  window is destroyed.
- **Pane and tab ids carry the window id,** and tracker sessions record it.
- **The registry is kept current all the time,** so quit and crash restore
  the same way and only an explicit close removes anything.
- **Quit is a custom menu item on macOS,** because the predefined one ends
  the process without telling any window. The Dock's Quit and a log-out
  still do; they restore from the last auto-save.
- **"Window: Quit ADE" in the palette,** because Windows and Linux have no
  menu and no other way to quit with more than one window open.
- **The close question also counts unsaved editor tabs.**
- **"Move to New Window" is disabled for a window's only tab.**
- **An editor tab with unsaved changes isn't moved.**
- **A Dock click on macOS opens no window;** only a real second process
  does.
- **Single instance is release-only.**
- **`project_setup_apply` refuses the other BMAD version.**
- **Snapshot restore suspends writes in Rust,** for every window.
- **Only the owner asks for notification permission at mount.**
- **Limits:** the move backlog is 1 MiB, a move times out after 10 seconds,
  quit waits 3 seconds for windows and 4 for sync, the launch gate opens
  after 8 seconds, and a remote setup is forgotten after two minutes.

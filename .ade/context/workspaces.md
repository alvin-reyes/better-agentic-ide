# Workspaces: the record, the mark, discovery, the bounds and the path rule

- **Decided in:** ADR `0037-the-workspace-record-is-one-rust-owned-local-file`, ADR `0038-a-workspace-is-the-folders-of-one-hub`, ADR `0039-a-finished-hub-is-read-from-the-repository-files-without-git`, ADR `0041-workspace-file-system-calls-run-in-one-bounded-pool-guarded-by-mount`.
- **Design:** `docs/superpowers/specs/2026-11-15-workspaces-design.md`.
- **PRD:** F4, revision 3.10 (approved with 3.4 to 3.9).
- **Status:** proposed 2026-11-15, design revision 4 (answers the delta review of revision 3: no blockers, five majors); not approved, not built. PRD F4 revisions 3.4 to 3.10 approved by the owner 2026-11-15. Where a rule below is a default awaiting an answer, it says so and names the design's question.

## The word

A **workspace** is the folders of one finished hub, shown together, and the tabs opened on them. It is identified by the hub folder's path, compared by the path rule. Today's *Saved Workspaces* are **tab sets**. An instance's live set of terminals is "the instance's tabs". New UI text and new documents use "workspace" only in the first sense.

## The platform gate

- F4 is offered on macOS only. Rust: `workspace::supported()` (`platform::IS_MACOS`); off macOS `workspace_resolve` answers `plain` with `unsupported_platform` and every other F4 command answers `unsupported`. Webview: `WORKSPACES_SUPPORTED` (`IS_MAC`); when false no code sets or restores the mark and no F4 command is called.
- The modules compile on every platform. Their logic is tested on Linux CI.

## The path rule

- One function for every feature: `src-tauri/src/pathkey.rs`, `key(path, home) -> Result<PathKey, NotAnswering>`, `same(a, b)`, `inside(a, b)`.
- A key is: `~` and `~/` expanded; lexically normalised; resolved one component at a time from a descriptor of the folder resolved so far (`fstatat` without following, `readlinkat`, `openat` with `O_NOFOLLOW`, at most 40 links), with the missing tail appended as written; NFC; and, on macOS on a case-insensitive volume, case-folded with `CFStringFold` and NFC again.
- Each call of the resolver is charged to the file system it enters (see Bounded file-system calls).
- `inside` compares whole components and makes no file-system call.
- F2's folder registry key (F2 design 4.10.1) is this function. Whichever of F4 story w2 and F2's OB-13 story lands first creates `pathkey.rs`; the other uses it.
- **The webview never compares two paths.** It compares only strings Rust returned, for equality, and asks `workspace_locate` for the rest.

## Bounded file-system calls

- Every file-system call F4 makes on a hub, a checkout, an added folder or a watched folder is made by a job of `workspace::bounded::Bounded`, through the job's context (`stat_at`, `open_at`, `readlink_at`, `read`, `read_dir_batch`, `fstat`). Reading and writing the record file is not.
- **`Bounded` is a value** in Tauri managed state, passed to every function that touches those paths. No process-wide state in `workspace/` or `pathkey.rs`. Tests build their own, with a fake file system and a fake mount table; hang seams are guards that release on drop.
- 8 workers, 8 spares, **4 slots per mount: calls in flight plus calls parked there**. Identical calls in flight are coalesced. Queues per mount, round-robin by submitter, no refusing cap; an open job keeps at most 16 jobs queued.
- **The bound is per system call: 2 seconds from when the call is issued.** Only a call blocked past it marks anything. Each job has a deadline for its answer (2 seconds for a root, an `ACCESS.md`, a listing, the finished-hub check, `workspace_resolve`, `workspace_locate`); past it the answer is "not answering" and nothing is marked. A job queued again under another mount keeps its deadline.
- **Every call is made through a descriptor of the folder already resolved, and follows no link.** It is charged to the child's own mount when the child is a mount point in the mount table (on macOS matched as listed and without `/System/Volumes/Data`), else to the device (`st_dev`) of the folder it is made in. Never by the longest mount-point prefix of the text (firmlinks defeat it).
- **A blocked call marks its path** and keeps its slot; calls at or below the path answer at once. The **mount** is marked when the blocked path is its mount point, or all 4 of its slots are parked. A mount parks at most 4 threads; four dead mounts at once park all 16.
- **Descriptors:** none held while a job is queued (it carries text, device and inode, and re-opens and checks on resume); a running job holds at most 2; a watch tick opens and closes each parent inside its read; F4 holds at most 33 in all, enforced by a semaphore. `EMFILE` answers "not answering" and marks nothing.
- **Threads:** an open job's coordinator is its own thread and never takes a worker; the mark-lift listener is told through a channel with no `Bounded` lock held; a late return frees its slot once.
- **Static rules** (a token checker in `static_rules.rs`, with planted violations): outside `fs_unix.rs`, `fs_windows.rs`, `mounts.rs` (and `std::fs` in `record.rs`), no `std::fs` in any spelling, no `std::os::*::fs`, no `libc`, no `Path` method that touches the disk, no `std::process`, `notify` or `walkdir`; no `static` item, `OnceLock`, `LazyLock`, `OnceCell`, `Once`, `once_cell`, `lazy_static`, `thread_local`, `Box::leak`; no log output.
- A mark lifts when a parked call under it returns or its mount leaves the table. Then the registry re-checks every open hub's state, roots and files shown "not answering" under it and publishes a new view; watch sets re-add their folders.
- The mount table is a snapshot (`getfsstat` with `MNT_NOWAIT` on macOS, `/proc/self/mountinfo` on Linux), refreshed by its own thread.
- Every F4 command is `async` and works inside `tauri::async_runtime::spawn_blocking`.
- New code that reads a hub or a checkout uses this pool through its context. It does not start its own threads and does not call `std::fs` on those paths.

## The record

- **File:** `<app data>/state/workspaces.json`, resolved from `state::state_dir`. Per profile.
- **Owner:** Rust only, one mutex, `state::atomic_write`. The webview never reads or writes it. No `localStorage` key holds any of it.
- **Never** in `state/kv/`, in `PERSISTED_KEYS`, in `SHARED_KEYS` or `DEVICE_KEYS`, in a snapshot, in a tab set, in a relay payload or in a log. Sync does not read it.

```ts
type RecordFile = {
  v: 1;
  workspaces: {
    hub: string;        // the hub folder, as first opened
    added: string[];    // added folders, in add order
    hidden: string[];   // discovered checkouts the engineer hid, as the hub's file spelled them after ~ expansion
    order: string[];    // roots other than the hub, in the engineer's order; empty until a root is moved
    lastOpened: number; // ms since 1970
  }[];
  droppedNotice: string[]; // hub folders dropped by the 200 cap, until a view has carried the notice
};
```

- Paths are stored as text and compared by key at use. Keys are never stored.
- No name read from `hub.conf` or `ACCESS.md` is stored. Discovered checkouts are not stored, except the ones in `hidden` and `order`.
- "Hand changes": `added`, `hidden` or `order` is not empty.
- **Reading:**
  - does not parse, or `v` is not a positive integer → moved aside, start empty, notice `record_unreadable`;
  - `v` above the reader's, or the file cannot be read → **read-only for this run**: nothing read from it, nothing written; workspaces open from discovery alone; the hand-change commands refuse with `record_read_only`; notice `record_newer` or `record_unreadable`;
  - a path that is not an absolute string without U+0000 is dropped; over 200 records keep the 200 most recently opened.
- **Retention**, after each open or restore: drop a record with no hand changes, no open workspace tab, and not among the 10 most recently opened; then, past 200, drop the least recently opened without an open tab and list them in `droppedNotice`. A hub's state never drops a record.
- **Matching** a record entry to a discovered row: by key when both have one, else by text.
- **Cleaning:** a `hidden` or `order` entry that nothing matches is removed only when the discovery is `complete`, every discovered checkout has a key and the entry's own key could be computed.
- The 10 most recently opened records are S2's recent list. There is no second store.

## The workspace mark on a tab

- `Tab.workspace?: string`: the hub folder's path as the record holds it. Absent on a plain tab.
- Set when a tab is made: `addWorkspaceTab`, Duplicate, `reopenClosedTab`, `tabFromDetached`, `loadSession`, loading a tab set's hub entry. One writer marks an existing tab: `markRunTab` (F2's run tab at its `hub.conf` commit). Never by a folder change, a poll or an effect.
- Cleared in one case: when F2 makes the tab a "Hub removed" tab.
- Separate from F2's `Tab.hub`. F4 never writes `hub`. Each tab operation copies each mark on its own.
- Duplicate and Reopen Closed Tab open in the folder they use today, with the mark (default; design question P-4).
- Carried as `ClosedTab.workspace`, `SerializedTab.workspace` and `SavedTab.workspace`. `SavedTab.workspace` is written only when set, after `color`; F3's `viewerKey` stays the last field. A plain tab's saved record is unchanged.
- On load the value must be an absolute path with no U+0000, on macOS; otherwise the tab is plain.
- **Never put it in a payload that leaves the machine.** Build payloads by picking fields; never spread a `Tab`. Sync's export leaves it out (`sync-local-fields.md`).
- Sub-terminals belong to their tab's workspace but show their own single root.

## The registry (Rust, memory only)

- `workspaceTabs.ts` runs in **every** window (the main one and each detached one). It reports the window's tabs with `workspace_tabs_set(tabs: { tabId, hub, marked }[], active, showsRoots)` and calls `workspace_open` for each hub it reports.
- An entry is reported for every tab with the mark and, once F2 exists, for every tab with F2's hub-tab flag (`marked: false`), with its hub folder.
- A hub is open while some window holds an entry for its key. It closes 3 seconds after the last entry goes.
- `workspace_resolve(path, reserve)` answers, in this order: `plain: unsupported_platform`; `plain: too_broad`; **`open`** when the registry holds any entry for the key (before the finished-hub check); `opening` when the key is reserved; then the check: `workspace` (with a reservation `token` when asked) or `plain`.
- A reservation lasts at most 10 seconds and ends when a window reports the hub, when its holder calls `workspace_release(token)` (always in a `finally`), or when the holder's window is destroyed.
- Every route that opens a hub calls `workspace_resolve` first. On `open` it calls `workspace_focus` and starts nothing. On `opening` it waits for `ade://workspaces-open-changed` and resolves once more.
- `open` carries `tab` (most recently used) and `tabWithRoots` (most recently used in a window that shows a file browser). The default focuses `tab` (design question P-3).

## Discovery output

```rust
pub struct Discovery {
    pub checkouts: Vec<Checkout>,     // in order; duplicates and too-broad rows removed; hidden ones included; not capped at 50
    pub unread_rows: Vec<FileCount>,  // ~user rows and rows holding U+0000, per hub-relative file
    pub too_broad: Vec<FileCount>,    // per hub-relative file
    pub unreadable: Vec<FileProblem>, // { file, why }
    pub work_folders_skipped: usize,
    pub rows_over_limit: usize,
    pub cut_short: bool,
    pub complete: bool,
}
pub struct Checkout { pub path: String, pub key: Option<PathKey>, pub status: Status /* Ok | Missing | NotAnswering */, pub file: String, pub line: usize }
```

- Files, in order: `<hub>/ACCESS.md`; `<hub>/projects/<name>/ACCESS.md`; `<hub>/ops/<name>/ACCESS.md`; each group in code-point order of the NFC name; never recursive.
- Caps: 200 work folders; 500 candidate rows per hub; discovery is cut 10 seconds after the finished-hub check.
- A row is a line whose first character is `|`. `\|` is a literal `|`. The cell is the second cell, trimmed. It is a checkout row when the cell starts with `/` or `~`. Which sections count is `RowRule`: `Anywhere` by default (the PRD's text); `CodeSection` is design question P-6.
- `~` and `~/…` expand to the home folder; any other `~…` is unread; nothing else is expanded.
- A file is read only if its folder resolves, its name is a regular file (a link is resolved like any other), it opens with `O_NOFOLLOW | O_NONBLOCK` as a regular file, is at most 1 MiB and is valid UTF-8.
- Too broad: `/`, the home folder, a mount point, a folder containing ADE's data folders.
- `complete`: both listings succeeded or answered "does not exist", every `ACCESS.md` that exists was read, no work folder was skipped, no row was over the limit, and the run was not cut short. A hub that is missing or not finished has no discovery.
- Discovery starts no process and writes nothing.
- The frozen fixture is `src-tauri/src/fixtures/workspaces/hub-rules/`, written by hand. No test runs the hub template.
- The marker-fixture builder is `src-tauri/src/workspace/testhub.rs` (`cfg(test)`), created by story w3. Later stories add their own tests that call it and do not edit it.

## What the webview gets

```ts
interface WorkspaceView {
  hub: string;
  gen: number;
  final: boolean;
  state:
    | { kind: "checking" }
    | { kind: "ok" }
    | { kind: "hub_missing"; why: "missing" | "not_answering" }
    | { kind: "not_finished"; reason: "not_a_folder" | "no_hub_conf" | "no_repository" | "no_commit" | "not_committed" | "not_a_file" }
    | { kind: "check_failed"; reason: "git_file" | "git_link" | "link_in_git" | "reftable" | "pack_index_v1" | "too_many_packs" | "delta_too_deep" | "packed_refs_too_large" | "object_too_large" | "object_missing" | "damaged" };
  recordState: "ok" | "read_only";
  roots: { path: string; kind: "hub" | "checkout" | "added"; status: "checking" | "ok" | "missing" | "not_answering"; source?: string }[]; // hub first, at most 50
  hidden: string[];
  notices: Notice[];
}
```

- `workspace_open(hub, reason)` answers the current view at once and then publishes better ones: each has a higher `gen` and is announced by `ade://workspace-changed { hub, gen }`. A view with a lower `gen` than the one held is dropped.
- Roots, in order: the hub folder; discovered checkouts that are not hidden; added folders that are not hidden; the 50 limit; then `order` applied.
- The 50 limit leaves out discovered checkouts only, from the end of the discovery order. The hub and added folders are never left out. The paths left out are in the notice `not_shown`.
- Hidden wins: removing a folder that is both discovered and added hides it and takes it out of `added`; adding a hidden checkout is refused (`hidden_checkout`).
- The extra root of WS-5 AC3 is not in a view. It comes from `workspace_locate`.
- While `state` is not `ok`, or `recordState` is `read_only`, only Refresh is offered and the record is not changed.
- Commands and events: the design's section 13.4. Errors are a closed set of codes and never contain a path.
- The workspace tree keeps its own listings (`workspaceListings.ts`), made through `workspace_list(path)`: the same entries as `list_directory`, made by one bounded job from `readdir` (`d_type`) and `fstatat` on the folder's descriptor, a mount-point child charged to its own mount, failing with a code (`permission`, `not_found`, `not_a_folder`, `not_answering`, `other`). It never passes a workspace's roots to F3's `fileBrowserStore.show`; with F3 S1 it calls `show(key, [])`.

## The finished-hub check

- `repohead::finished_hub(path) -> Finished | Missing | NotHub | NotFinished | Failed`, one job whose answer has a 2-second deadline; each call has its own bound.
- Nothing inside `.git` is followed: every file below the hub folder is opened from its parent's descriptor with `O_NOFOLLOW`; a link inside `.git` is `Failed(Unsupported("link_in_git"))`.
- Finished means: `path` holds a regular file `hub.conf` (`lstat`); `path/.git` is a folder (the folder's own repository, never a parent's); and the root tree of the commit `HEAD` resolves to has `hub.conf` as a regular file.
- It reads files only. It opens no config file and starts no process.
- `Missing` is only "does not exist". A folder that does not answer is `Failed(NotAnswering)`, shown as `hub_missing` with why `not_answering`.
- Not read, each `Failed` with its reason: reftable refs; objects reached only through alternates or a partial clone; pack index version 1; `.git` as a file; `.git` as a link; a link inside `.git`; more than 200 packs; a delta chain deeper than 64; a `packed-refs` over 16 MiB; an object over its cap.
- On `ObjectMissing` or `Damaged` the check reads once more inside the same deadline (a repack under it).
- A `Failed` check is never treated as finished.

## Folder watches

- A workspace view sets no operating-system watch. `folder_watch_set(paths, onEvent)` keeps one poll set per window, at most 500 folders, read every 2 seconds while the window is visible, one job per mount.
- Each read in a tick is a call with its own bound; a tick has no deadline and marks nothing by being slow.
- An event is `{ folder, kind: "changed" | "gone" }`, with `folder` as the webview gave it. A folder's modification time changes when an entry is created, removed or renamed in it, and not for anything deeper.
- No `notify`, no `RecursiveMode`, no `std::process` in `src-tauri/src/workspace/` or `pathkey.rs` (a static test).

## Automatic project setup

- `workspace_setup_covered(folder, ptyId) -> "covered" | "not_covered" | "unknown"` is asked before any automatic setup, on macOS.
- **`unknown` until the main window's first `workspace_tabs_set` of this launch** (`workspaceTabs.ts` reports right after `loadSession`), and **while any open hub's discovery is not final** (its last view has `final: false`). A covered set is partial until then.
- The terminal's folder is read from its PTY's process (`pty::quick_cwd`: ids under the PTY lock, `cwd_of` outside it, no `lsof`), compared with the covered keys with no file-system call. Only when the process table gives none is the `folder` argument resolved.
- Covered: inside a discovered checkout (hidden ones included, too-broad rows excluded) of any hub open in this instance; or the terminal is **touched**.
- A touched terminal is one whose folder was inside a covered checkout while its workspace was open. It stays covered in every folder until its PTY ends (the PRD's text; design question P-1 would narrow it to that checkout). Terminals are sampled every 3 seconds while a hub is open, and once more when a hub closes.
- On `unknown` the hook does nothing in that run and runs again on `ade://workspace-cover-changed`, which is sent at the first report, when a hub's discovery becomes final, when a covered set changes, when a mark lifts, and at the 15-second lapse.
- A rejected call, or a failed discovery, never switches automatic setup off for other projects (design question P-2).
- Setup the engineer asks for is not affected.

## Logs

- F4's commands answer errors as codes. F4's Rust modules write nothing to the log (a static test).
- `list_directory`'s error carries the path. F4 does not call it: the tree lists through `workspace_list`, and `workspaceListings.ts`'s queue catches every rejection besides.

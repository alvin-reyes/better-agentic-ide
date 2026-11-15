# Workspaces: the record, the mark, discovery and the path rule

- **Decided in:** ADR `0037-the-workspace-record-is-one-rust-owned-local-file`, ADR `0038-a-workspace-is-the-folders-of-one-hub`, ADR `0039-a-finished-hub-is-read-from-the-repository-files-without-git`.
- **Design:** `docs/superpowers/specs/2026-11-15-workspaces-design.md`.
- **PRD:** F4, revision 3.3.
- **Status:** proposed 2026-11-15, design revision 1; not reviewed, not approved, not built. Version 1 below is what F4 S1 writes.

## The word

A **workspace** is the folders of one finished hub, shown together, and the tabs opened on them. It is identified by the hub folder's path, compared by the path rule. Today's *Saved Workspaces* are **tab sets**. An instance's live set of terminals is "the instance's tabs". New UI text and new documents use "workspace" only in the first sense.

## The path rule

- One function for every feature: `src-tauri/src/pathkey.rs`, `key(path, home) -> PathKey`, `same(a, b)`, `inside(a, b)`.
- A key is: `~` and `~/` expanded; lexically normalised; the nearest existing ancestor resolved with `realpath` and the missing components appended; NFC; and, on macOS on a case-insensitive volume, case-folded with `CFStringFold` and NFC again.
- `inside` compares whole components: `/x/ab` is not inside `/x/a`.
- F2's folder registry key (F2 design 4.10.1) is this function. Whichever of F4 story w1 and F2's OB-13 story lands first creates `pathkey.rs`; the other uses it.
- **The webview never compares two paths.** It compares only strings Rust returned, for equality, and asks `workspace_locate` for the rest.

## The record

- **File:** `<app data>/state/workspaces.json`, resolved from `state::state_dir`. Per profile.
- **Owner:** Rust only, one mutex, `state::atomic_write`. The webview never reads or writes it. No `localStorage` key holds any of it.
- **Never** in `state/kv/`, in `PERSISTED_KEYS`, in `SHARED_KEYS` or `DEVICE_KEYS`, in a snapshot, in a tab set, in a relay payload or in a log.

```ts
type RecordFile = {
  v: 1;
  workspaces: {
    hub: string;        // the hub folder, as first opened
    added: string[];    // added folders, in add order
    hidden: string[];   // discovered checkouts the engineer hid
    order: string[];    // roots other than the hub, in the engineer's order; empty until a root is moved
    lastOpened: number; // ms since 1970
  }[];
  droppedNotice: string[]; // hub folders dropped by the 200 cap, until the notice is shown
};
```

- Paths are stored as text and compared by key at use. Keys are never stored.
- No name read from `hub.conf` or `ACCESS.md` is stored. Discovered checkouts are not stored, except the ones in `hidden` and `order`.
- "Hand changes": `added`, `hidden` or `order` is not empty.
- **Reading:** unparsable → moved aside, start empty, one notice. `v` above the reader's → empty in memory and **never written** in that run. A path that is not an absolute string without U+0000 is dropped. Over 200 records keep the 200 most recently opened.
- **Retention**, after each open or restore: drop a record with no hand changes, no open workspace tab, and not among the 10 most recently opened; then, past 200, drop the least recently opened without an open tab and list them in `droppedNotice`. A hub's state (missing, not finished) never drops a record.
- **Cleaning:** a `hidden` or `order` entry that no discovered checkout or added folder matches is removed only by a discovery that read every file (`complete`).
- The 10 most recently opened records are S2's recent list. There is no second store.

## The workspace mark on a tab

- `Tab.workspace?: string`: the hub folder's path as the record holds it. Absent on a plain tab.
- Set **only** by code that makes a tab: `addWorkspaceTab`, Duplicate, `reopenClosedTab`, `tabFromDetached`, `loadSession`, loading a tab set's hub entry, and `markRunTab` (F2's run tab at its `hub.conf` commit). Never by a folder change, a poll or an effect.
- Cleared in one case: when F2 makes the tab a "Hub removed" tab.
- Separate from F2's `Tab.hub`. F4 never writes `hub`. Each tab operation copies each mark on its own.
- Carried as `ClosedTab.workspace`, `SerializedTab.workspace` and `SavedTab.workspace`. `SavedTab.workspace` is written only when set, after `color`; F3's `viewerKey` stays the last field. A plain tab's saved record is unchanged.
- On load the value must be an absolute path with no U+0000; otherwise the tab is plain.
- **Never put it in a payload that leaves the machine.** Build payloads by picking fields; never spread a `Tab`. Sync's export removes it (`sync-local-fields.md`).
- Sub-terminals belong to their tab's workspace but show their own single root.

## The open registry (Rust, memory only)

- Each window reports its workspace tabs with `workspace_tabs_set(tabs: { tabId, hub }[], active)` whenever the set, the active tab or the window's focus changes. A destroyed window's entries are removed.
- "A workspace is open" means some window holds a tab with its mark.
- `workspace_resolve(path, reserve)` answers whether `path` is a finished hub and, if its workspace is open, the most recently used tab `{ window, tabId }`. With `reserve` it holds the hub for 10 seconds so a second open answers `opening`.
- Every route that opens a hub calls `workspace_resolve` first and, when `open` is set, calls `workspace_focus` and starts nothing.

## Discovery output

```rust
pub struct Discovery {
    pub checkouts: Vec<Checkout>,     // in order; duplicates and too-broad rows removed; hidden ones included; not capped
    pub unread_rows: Vec<FileCount>,  // ~user rows and rows holding U+0000
    pub too_broad: usize,
    pub unreadable: Vec<FileProblem>, // { file, why }
    pub work_folders_skipped: usize,
    pub complete: bool,               // every file that exists was read and none was skipped
}
pub struct Checkout { pub path: String, pub key: PathKey, pub status: Status /* Ok | Missing | NotAnswering */, pub file: String, pub line: usize }
```

- Files, in order: `<hub>/ACCESS.md`; `<hub>/projects/<name>/ACCESS.md`; `<hub>/ops/<name>/ACCESS.md`; each group in code-point order of the NFC name; at most 200 work folders; never recursive.
- A row is a line whose first character is `|`. `\|` is a literal `|`. The Checkout cell is the second cell, trimmed. It is a checkout row when the cell starts with `/` or `~`.
- `~` and `~/…` expand to the home folder; any other `~…` is unread; nothing else is expanded.
- A file is read only if it opens as a regular file without blocking, is at most 1 MiB and is valid UTF-8.
- Too broad: `/`, the home folder, a volume root, a folder containing ADE's data folders.
- Every file-system call is bounded at 2 seconds and off the UI thread.
- Discovery starts no process and writes nothing.
- The frozen fixture is `src-tauri/src/fixtures/workspaces/hub-rules/`, written by hand. No test runs the hub template.

## What the webview gets

```ts
interface WorkspaceView {
  hub: string;
  gen: number;
  state:
    | { kind: "ok" }
    | { kind: "hub_missing" }
    | { kind: "not_finished"; reason: "no_repository" | "git_file" | "no_commit" | "not_committed" | "not_a_file" | "no_hub_conf" }
    | { kind: "check_failed"; reason: "unsupported" | "object_missing" | "damaged" | "not_answering" };
  roots: { path: string; kind: "hub" | "checkout" | "added"; status: "ok" | "missing" | "not_answering" }[]; // hub first, at most 50
  hidden: string[];
  notices: Notice[];
}
```

- Roots, in order: the hub folder; discovered checkouts that are not hidden; added folders; then `order` applied; then the 50 cap.
- A view with a lower `gen` than the one held is dropped.
- While `state` is not `ok`, only Refresh is offered and the record is not changed.
- Commands and events: the design's section 13.4. Errors are codes and never contain a path.

## The finished-hub check

- `repohead::finished_hub(path) -> Finished | Missing | NotHub | NotFinished | Failed`.
- Finished means: `path` holds `hub.conf`; `path/.git` is a folder (the folder's own repository, never a parent's); and the root tree of the commit `HEAD` resolves to has `hub.conf` as a regular file.
- It reads files only: `HEAD`, loose refs, `packed-refs`, loose objects, pack indexes (version 2) and packs. It opens no config file and starts no process.
- Not read, reported as `Failed`: reftable refs, alternates and partial clones, pack index version 1. `.git` as a file is `NotFinished`.
- A `Failed` check is never treated as finished.

## Automatic project setup

- `workspace_setup_covered(folder, ptyId) -> bool` is asked before any automatic setup. True means: do nothing and ask nothing.
- Covered: inside a discovered checkout (hidden ones included, too-broad rows excluded) of any workspace open in this instance; or inside a checkout this terminal was in while that workspace was open, for the rest of the terminal's life.
- A failed or late answer counts as covered.
- Setup the engineer asks for is not affected.

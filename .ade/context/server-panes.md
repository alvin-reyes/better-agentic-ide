# Server panes: the remote record, the mark, the states, the events

Status: **proposed** with the F7 S1 design
(`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, revision 2, not
approved, awaiting a delta review). PRD: `docs/prd.md` F7, SV-2 to SV-6. Companion: `saved-servers.md`.
ADRs (provisional numbers): 0044, 0045, 0046. F3, F4 and the phone relay read tab
state: read this before adding a reader of a tab's name, folder or panes.

## On a pane and on a tab (`src/stores/tabStore.ts`)

```ts
interface RemoteRecord {
  serverId: string;
  destination: { host: string; port?: number; user?: string; identityFile?: string };
  summary: string;                               // Rust's, for that destination
  state: "connecting" | "live" | "ended";
  notice?: "not-handed-over-yet" | "not-handed-over-another-program"; // not saved
  end?: { status: number | null; kind: string | null; by: "process" | "ended" }; // not saved
  refusal?: { kind: string };                    // a refused Reconnect; not saved
}
Pane.remote?: RemoteRecord     // present from creation; a pane never changes side
Tab.serverNamed?: true         // ADE named the tab after a saved server
```

- **Remote pane:** a pane with `remote`. **Server tab:** `serverNamed === true` or
  any of its panes is remote. Read both from the tab's own record, never from the
  server list (`src/lib/serverTabs.ts`: `paneKind`, `remotePane`, `isServerTab`).
- In S1 a tab has at most one remote pane, the first pane of its own view.
- `serverNamed` is cleared by a rename (a commit whose text differs from the
  current name; an equal one changes nothing) and by the close of the remote
  pane, which in the same store update renames a server-named tab "Terminal".
- A remote pane has no folder: `getPtyCwd` and `tabCwd` give null for it, it is
  saved without `savedCwd`, and file-path links are off in it.
- A remote pane never calls `create_pty`. Its terminal is started only by
  `server_connect` (Connect, Reconnect).

## The invariant, and how a remote terminal is ended

**A remote terminal exists in Rust's table only while a pane holds its id.** The
two bounded exceptions: while its `server_connect` has not been answered, and
while the ending routine is running on it (at most 5 s).

It is ended by one routine, `saved_servers::ending::end`, reached by:

| Who | How |
|---|---|
| End; a confirmed close of the pane; a close of the tab | the webview's `server_terminal_end`. `closePane` and `closeTab` read "remote" from the pane's record before their store update and pass it to `destroyInstance(paneId, ptyId, remote)` |
| a connect that resolves when its pane is gone or no longer an ended remote pane | the webview's `server_terminal_end`, at once, in the step that would have set the id |
| any other `kill_pty` for a remote terminal's id | Rust's `kill` starts the routine on a thread and returns at once; a local terminal's `kill` is unchanged |
| the main window destroyed | `ending::main_closed`: closes the gate, `end_all(Wait::No)` |
| the main webview loads a page (a reload) | `ending::main_page_loaded` (Tauri's `on_page_load`, `Started`, webview `main`): `end_all(Wait::No)` and a new page count |
| ADE exits | `ending::app_exiting`: closes the gate, `end_all(Wait::Yes)` |
| a start that completes after the gate closed or the page changed | inserted already ending; the command rejects |

`end_all(Wait::Yes)` returns when no remote terminal is left in the table and no
client start is in progress, or 5 s have passed, whatever was already ending.
A second `end` on a terminal returns at once. The webview makes one connect
request per pane at a time.

## Saved in `ade-session`

A remote pane: `{ id, serializedBuffer?, remote: { serverId, destination, summary,
state } }`. A tab: `serverNamed: true` when set. Restored: `state` becomes
`"ended"`, no PTY, nothing started. A closed tab's in-memory record keeps
`{ serverNamed, serverId, destination, summary }` and no state.

## Events on a remote terminal's channel (`PtyEvent`)

| `type` | Other members | Meaning |
|---|---|---|
| `output` | `data` | unchanged |
| `live` | none | the hand-over was confirmed; clears a notice |
| `notice` | `kind`: `not-handed-over-yet` or `not-handed-over-another-program` | shown on a connecting pane, with End |
| `exit` | `status`: integer or null; `kind`: null, `no-ssh-client` or `ended-before-ssh`; `by`: `process` or `ended` | the pane's process ended |
| `error` | `message` | unchanged |

**The exit event carries `status`, `kind` and `by` for every terminal.** A local
terminal sends `status: null, kind: null, by: "process"` (its exit comes from its
reader, which has no status). **This amends `terminal-open.md`** ("No exit code
in v1: `PtyEvent::Exit` is unchanged") and ADR
`0014-terminals-open-terminals-through-the-hook-endpoint` (exit codes out of
v1): the shape changes for every terminal; a local terminal still reports no
code. Recorded in ADR 0046; the story that builds it edits both files.

For a remote terminal `status` is the process's exit status, null when a signal
ended it or when the ending routine gave up on a process it could not end. One
thread per remote terminal sends `live`, `notice` and `exit`, so their order is:
zero or one `notice` of each kind, at most one `live`, exactly one `exit`. The
`exit` is the last event on the channel: the terminal's reader has ended or
been stopped before it is sent (at most 1 s after the process ended).

States: `connecting` from a resolved `server_connect`; `live` on `live`; `ended`
on `exit`. A pane is never shown live without a `live` event. `live`, `notice`
and `exit` update the pane's record when they arrive, mounted or not; one that
arrives before the connect resolves is applied in the resolve's store update.
Only output is buffered, until the xterm is created at the resolve.

## Who may write into a remote pane

- The terminal's own input (`writePtyInput` from `wireInput`).
- The named user sends, which pass `{ userSend: true }` to `writePty`: the
  scratchpad's send and chain steps, and the two Send Enter actions.
- Nobody else: `writePty` refuses with the server-session message. Every call
  site is classified in `src/lib/ptyWriters.sites.json`; a new one fails a test.
- Rust: the input queue has two feeders, `write_pty` and `/open`'s `type_line`
  (`saved_servers/input-queue.sites`). A remote terminal has no `/open` request
  id and `type_line` refuses it.
- Ending writes nothing: a remote terminal's writer is ADE's own duplicate of the
  master, never the library's writer (ADR 0045). A terminal that is ending is
  sent nothing more: `write_pty` for it returns `Ok` and drops the bytes.

## The outward name

What a tab is called anywhere off this machine. One table,
`src/lib/outwardName.cases.json`, tested on both sides (`outwardName` in the
webview, `sync::outward_name` in Rust):

| Server-named | Holds a remote pane | Outward name |
|---|---|---|
| no | no | the tab's name |
| yes | yes | `Remote server` |
| no | yes | `Remote server` |
| yes | no | `Remote server` |

`ade-session`'s export uses it and drops every `remote` member. The phone's tab
payload, when it is built, takes a tab's title from `outwardName`.

## Not offered for a server tab

Duplicate; Move to New Window (`detachTabToWindow` refuses); a place in a saved
tab set (`tabSetEntries` leaves it out and counts it).

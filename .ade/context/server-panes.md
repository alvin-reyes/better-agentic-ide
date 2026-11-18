# Server panes: the remote record, the mark, the states, the events

Status: **proposed** with the F7 S1 design
(`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, revision 1, not
approved). PRD: `docs/prd.md` F7, SV-2 to SV-6. Companion: `saved-servers.md`.
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
  `server_connect` (Connect, Reconnect) and ended only by `server_terminal_end`.

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
reader, which has no status). For a remote terminal `status` is the process's
exit status, null when a signal ended it. One thread per remote terminal sends
`live`, `notice` and `exit`, so their order is: zero or one `notice` of each
kind, at most one `live`, exactly one `exit`, last.

States: `connecting` from a resolved `server_connect`; `live` on `live`; `ended`
on `exit`. A pane is never shown live without a `live` event.

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
  master, never the library's writer (ADR 0045).

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

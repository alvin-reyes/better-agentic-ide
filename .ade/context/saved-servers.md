# Saved servers: the record, the store, the commands, the kinds

Status: **proposed** with the F7 S1 design
(`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, revision 3, not
approved, awaiting a re-check of finding A2-B1). PRD: `docs/prd.md` F7, SV-1, SV-2, SV-5, SV-8, SV-9. Companion:
`server-panes.md`. ADRs (provisional numbers): 0043, 0044.

## The record

| Member | JSON type | Required | Rule (one Rust function, `saved_servers::rules::check`) |
|---|---|---|---|
| `id` | string | yes | 32 lowercase hex characters, made by ADE, never shown |
| `name` | string | yes | trimmed; 1 to 64 code points; each passes `terminal_open::name_char_ok`; unique by name key (NFC, then lowercase; NFC from the crate `unicode-normalization`, new in `Cargo.lock` with F7) |
| `host` | string | yes | 1 to 253 of `A-Z a-z 0-9 . - _ :`; first is a letter, digit or `:`; with `:` it parses as IPv6 and is not `::`; digits and dots only: four parts 0 to 255, no leading zero; no part starting `0x` |
| `port` | number | no | 1 to 65535 |
| `user` | string | no | 1 to 64 of `A-Z a-z 0-9 . _ - @`; first is not `-` |
| `identityFile` | string | no | absolute or starting `~/`; 1 to 1024 characters in `0x20`-`0x7e`; no `%`, no `${` |

A record never holds anything else. The webview does not validate: it sends what
was typed and shows, for each field a refusal lists, the words for its reason
code (below).

## Why a value was refused: the reason codes

Owner decision, 2026-11-18: a refusal carries a fixed reason code for **every**
failing field, never a typed value. `rules::check` is the one implementation:
it returns `Vec<Failure>`, used at a save, at every client start, and when a
row is loaded. `Failure` is one Rust enum of **21** `(field, reason)` pairs,
serialised `{ "field": "...", "reason": "..." }`; a pair not in this table
cannot be built. One entry per failing field (its **first** matching row, top
to bottom), fields in the order name, host, port, user, identityFile.

| Field | Reason | When (first match wins) |
|---|---|---|
| `name` | `empty` | nothing left after trimming |
| `name` | `too-long` | more than 64 code points |
| `name` | `characters` | a character `name_char_ok` refuses (control, format, line or paragraph separator) |
| `name` | `taken` | another record has the same name key |
| `host` | `empty` | empty |
| `host` | `too-long` | more than 253 characters |
| `host` | `holds-user` | contains `@` |
| `host` | `holds-port` | exactly one `:`, something before it, and 1 to 5 digits after it to the end |
| `host` | `not-ipv6` | any other value that contains `:` and is not an accepted IPv6 address (brackets, a `%` zone, `::`, a bad group) |
| `host` | `first-character` | the first character is not a letter or a digit |
| `host` | `characters` | a character outside `A-Z a-z 0-9 . - _` |
| `host` | `not-ipv4` | only digits and dots, and not four parts 0 to 255 with no leading zero |
| `host` | `leading-0x` | a dot-separated part starts `0x` or `0X` |
| `port` | `not-a-port` | not 1 to 5 digits with no leading zero and no sign, or not 1 to 65535 |
| `user` | `too-long` | more than 64 characters |
| `user` | `characters` | a character outside the set, or a leading `-` |
| `identityFile` | `not-a-path` | neither absolute nor starting `~/` |
| `identityFile` | `too-long` | more than 1024 characters |
| `identityFile` | `characters` | a character outside `0x20`-`0x7e` |
| `identityFile` | `expands` | holds `%` or `${` |
| `identityFile` | `home-unusable` | **at a client start only:** it starts `~/` and the home folder is unset, not absolute, or makes the expanded path fail one of the three rows above |

The 14 reason words (`empty`, `too-long`, `characters`, `taken`, `holds-user`,
`holds-port`, `not-ipv6`, `first-character`, `not-ipv4`, `leading-0x`,
`not-a-port`, `not-a-path`, `expands`, `home-unusable`) are the closed list; a
fifteenth, or a twenty-second pair, is a change to this file, to `kinds.json`
and to the PRD's table. Nothing the user typed is in a `Failure`, in the log or
in a message: the webview composes a message from the field's label and the
code.

## The store

- File: `saved-servers.json` in the instance's app-data folder (beside
  `vault-index.json`). Not under `state/`: not a persisted key, not snapshotted,
  not in `SHARED_KEYS` or `DEVICE_KEYS`.
- Shape: `{ "version": 1, "servers": [record, ...] }`. At most 200 records.
- Written by Rust only, with `state::atomic_write`. Read from disk on every
  command; nothing is cached.
- Unreadable (never overwritten, every mutation and every connect refused): not
  JSON, wrong shape, `version` missing or above 1, a bad or repeated `id`, a
  member of the wrong JSON type.
- A member other than the six is dropped on load and is gone at the next save.
- A record whose values fail `check` is loaded with `problems: Failure[]` (every
  failing field with its reason, as above), listed, never connected to. **A
  member that failed its own rule is not sent to the webview:** it is left out
  of the `ServerRow` (a failing name is the empty string), and `summary` is
  empty unless host, port and user passed. The Edit form therefore receives
  **nothing** for a failing field, and its reason code: it shows the field
  empty with that reason's words. The stored value is never shown and cannot be
  recovered through ADE; saving the form replaces it.
- Two records with one name key: the first in the file keeps its name; each
  later one has `{ field: "name", reason: "taken" }` and its name is still sent
  (it passed the character rule).
- **Telling such rows apart.** Every row carries `id` (always valid: a store
  with a bad `id` is unreadable) and `fileIndex`, its 1-based position among
  the records in the file. ADE's own saves keep the file's order (an add
  appends, an edit replaces in place, a remove closes the gap), so `fileIndex`
  changes only when a row before it is removed or the file is rewritten by
  hand. A row with a withheld name is listed after every named row, in
  `fileIndex` order. The UX may print `fileIndex` ("entry 3 in the file");
  `id` is the key for every action and is not for display.

## Grammar and summary (Rust only)

- Arguments of the SSH client: `[-p PORT] [-l USER] [-i IDENTITY_FILE] -- HOST`; a
  leading `~/` of the identity file is replaced by the home folder. Nothing else,
  ever. The expanded identity file must itself pass the identity-file rule: when
  the home folder is unset, not absolute, or has a character outside
  `0x20`-`0x7e`, a record with a `~/` identity file is refused at the client
  start (`server-failed-checks`, field `identityFile`).
- Destination summary: `[USER@]HOST[:PORT]`, an IPv6 host in brackets when a port
  follows. The webview shows the string Rust returns. **"The destination
  changed" is decided on the four members** (host, port, user, identity file),
  compared as the values Rust returned (`sameDestination`), not on the summary,
  which leaves the identity file out.
- The identity-file warning uses `std::fs::metadata` (it follows a link, never
  opens the file). **Only `servers_save` returns it**, for the row just saved.
  `servers_list` carries no warning: it is re-read on every Connect and
  Reconnect press and must not look at up to 200 paths the user typed (one on
  an unreachable network mount would hold every press). The UX warns after a
  save, and nowhere else.

## Commands (main window only, Unix only)

| Command | Arguments | Resolves | 
|---|---|---|
| `servers_list` | none | `ServerRow[]` in list order |
| `servers_save` | `{ args: { id?, name, host, port, user, identityFile } }`, strings as typed | `{ server: ServerRow, warning?: "not-found" \| "not-a-regular-file" }` |
| `servers_remove` | `{ args: { id } }` | nothing |
| `server_connect` | `{ args: { serverId, paneId, rows, cols }, onEvent }` | `{ ptyId, destination, summary }` |
| `server_terminal_end` | `{ args: { id } }` (a PTY id) | nothing, when the terminal has left Rust's table or 5 s have passed, whatever is then left |

`ServerRow = { id, fileIndex, name, host?, port?, user?, identityFile?, summary,
problems? }`; `problems` is absent or holds 1 to 5 `Failure`s.
Each command's arguments are one `serde` struct (`camelCase`, unknown members
refused). **The connect request carries the saved server's identifier and the
pane it is for, and nothing else of the server.** `paneId` is 1 to 64 of `A-Z a-z
0-9 - _`; Rust refuses a start for a pane that already has a remote terminal
that is not ending, before the spawn and again at the insert. After a save or a remove Rust emits the event
`servers-changed` (no payload) to the main window. `src/lib/serverInvoke.ts` is
the only webview file that calls the five commands.

**Before every connect request** (Connect and Reconnect) the webview reloads the
list, compares the row's destination with the one the pressed control was
showing, and sends only when they are equal and, for a Reconnect, equal to the
pane's own destination or to the one the engineer gave the second confirmation
for. A file rewritten by another program is not announced by any event; this
reload is what catches it.

**What the webview holds when the row changed since it was shown.**
`requestConnect` answers `{ outcome: "sent" }` or `{ outcome: "held", check }`,
and keeps the same `check` in `serverListStore.held`, keyed by the pane id (a
Reconnect) or by the server id (a Connect), until it is confirmed, cancelled,
or a later press finds nothing to hold:

```ts
type Shown = { name: string; destination: Destination; summary: string };
type ConnectCheck = {
  serverId: string;
  paneId?: string;            // present for a Reconnect
  why: "changed" | "gone" | "problem" | "unreadable";
  shown: Shown;               // what the pressed control was showing
  pane?: Shown;               // a Reconnect: what the pane last connected to
  now?: ServerRow;            // the row as just read; absent for "gone" and "unreadable"
  differs?: ("host" | "port" | "user" | "identityFile")[]; // now against shown; "changed" only
};
```

`shown`, `pane` and `now` are only values Rust returned. The confirming press
is `requestConnect({ serverId, paneId?, shown: now, confirmed: now.destination })`,
which reads the list once more. Nothing was sent for a held press.

`terminal-not-started` has three causes (Kinds, below): only `start` means the
shell could not be started.

## Fixtures: the shapes that cross the boundary

Under `src/lib/serverFixtures/`, each read by a Rust test (`include_str!`) and a
TypeScript test. A shape changes only together with its file and both tests.

| File | Holds | Made by story |
|---|---|---|
| `kinds.json` | every kind with each payload form; it is the one checked-in id list | R1 |
| `commands.json` | each command's arguments; `ServerRow`, `SaveResult`, `Connected` | R1 |
| `events.json` | every `PtyEvent`, a local terminal's `exit` included | R3a |
| `session.json` | a session as `saveSession` writes it; the store test asserts equality, the export strip test reads it | W2 |

## Kinds

Every outcome that is not a success is `{ "kind": "<id>", ...payload }`, as a
command's rejection or in an event (`server-panes.md`). No payload can hold a
host, a user, a key path or a server's name. A message that names a server gets
the name in the webview, from the identifier it sent and the list it holds.

| Id | Payload | PRD wording |
|---|---|---|
| `server-failed-checks` | `fields`: 1 to 5 `Failure`s, `{ field, reason }`, one per failing field, in field order (above) | a saved server failed its checks |
| `list-unreadable` | none | the server list could not be read |
| `list-not-saved` | `errno?`: the system's error number; absent when the failure has none | the server list could not be saved |
| `list-full` | none | the server list is full |
| `server-gone` | none | that saved server no longer exists |
| `shell-not-supported` | `shell?`: a base name of 1 to 32 of `A-Z a-z 0-9 . _ + -` | shell not supported |
| `not-in-engagement` | none | not available in an engagement |
| `terminal-not-started` | `cause`: `start`, `closing` or `pane`; `errno?` only with `start`, absent when the library's error holds none | could not start a terminal |
| `no-ssh-client` | `status`: 127 | no SSH client found |
| `ended-before-ssh` | `status?`: absent when a signal ended the process | ended before ssh was seen to start |
| `not-handed-over-another-program` | none | not handed over: another program is running |
| `not-handed-over-yet` | none | not handed over yet |

`terminal-not-started`'s `cause`: `start`, the shell or its terminal could not
be started (the only cause whose message may say so); `closing`, the main
window was destroyed, its page was replaced, or ADE is exiting (nobody is left
to show it to); `pane`, the pane already has a connection or a start in
progress, or the pane id is not one. The webview's own rules prevent `pane`
(one request per pane); it has words in case they fail. A member, not a
thirteenth kind.

Optional payload members are **absent**, never null. A message must have a form
without the number for `list-not-saved`, `terminal-not-started` (cause `start`)
and `ended-before-ssh`.

The file a "could not be read" message may name is the constant
`saved-servers.json` (`SERVER_LIST_FILE_NAME` in `src/lib/serverKinds.ts`), "in
Better Terminal's data folder". No kind and no command carries the folder's
path (a path can hold the user's name).

The id list is checked in once, as `src/lib/serverFixtures/kinds.json`, and
mirrored as a union type in `src/lib/serverKinds.ts`; a test on each side fails
when they differ. A thirteenth kind is a PRD change.

**Nothing of a saved server reaches `ade.log`.** F7's Rust files use no `unwrap`,
`expect` or panic macro outside tests (bar `.lock().unwrap()`), because the
panic hook logs the message; the record, the destination and every wire type
have a `Debug` that prints no member.

## Availability

`serversAvailable({ platform, engagement })` in the webview and
`saved_servers::availability` in Rust: yes on macOS and Linux outside an
engagement, no otherwise. In S1 the engagement input is the constant `false`,
supplied from one function on each side; F1 e29 or F7 S1, whichever merges
second, connects it (`f7-merges-second.md`, written at sharding).

## The quoter

Rust quotes the instruction's words by ADR 0008's rule
(`saved_servers::quote::shell_quote`). It and `src/lib/shellQuote.ts` are pinned
by one table, `src/lib/shellQuote.cases.json`, which both sides' tests read.
The Rust quoter takes a `Word`, which cannot hold a character outside
`0x20`-`0x7e`.

Quoting every word defeats an alias named for the bare word. It does not defeat
a `zsh` global alias whose name includes the quotes (`alias -g
"'db1.example.com'"=...`); that start is never shown live (the list observed is
not the grammar).

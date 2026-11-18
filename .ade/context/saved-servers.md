# Saved servers: the record, the store, the commands, the kinds

Status: **proposed** with the F7 S1 design
(`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, revision 2, not
approved, awaiting a delta review). PRD: `docs/prd.md` F7, SV-1, SV-2, SV-5, SV-8, SV-9. Companion:
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
was typed and shows the field a refusal names.

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
- A record whose values fail `check` is loaded with `problem: <field>` (the first
  failing field in the order name, host, port, user, identity file), listed,
  never connected to. **A member that failed its own rule is not sent to the
  webview:** it is left out of the `ServerRow` (a failing name is the empty
  string), and `summary` is empty unless host, port and user passed.
- Two records with one name key: the first in the file keeps its name; each
  later one has `problem: "name"` and its name is still sent.

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
  opens the file).

## Commands (main window only, Unix only)

| Command | Arguments | Resolves | 
|---|---|---|
| `servers_list` | none | `ServerRow[]` in list order |
| `servers_save` | `{ args: { id?, name, host, port, user, identityFile } }`, strings as typed | `{ server: ServerRow, warning?: "not-found" \| "not-a-regular-file" }` |
| `servers_remove` | `{ args: { id } }` | nothing |
| `server_connect` | `{ args: { serverId, paneId, rows, cols }, onEvent }` | `{ ptyId, destination, summary }` |
| `server_terminal_end` | `{ args: { id } }` (a PTY id) | nothing, when the terminal has left Rust's table or 5 s have passed, whatever is then left |

`ServerRow = { id, name, host?, port?, user?, identityFile?, summary, problem? }`.
Each command's arguments are one `serde` struct (`camelCase`, unknown members
refused). **The connect request carries the saved server's identifier and the
pane it is for, and nothing else of the server.** `paneId` is 1 to 64 of `A-Z a-z
0-9 - _`; Rust refuses a start for a pane that already has a remote terminal
that is not ending. After a save or a remove Rust emits the event
`servers-changed` (no payload) to the main window. `src/lib/serverInvoke.ts` is
the only webview file that calls the five commands.

**Before every connect request** (Connect and Reconnect) the webview reloads the
list, compares the row's destination with the one the pressed control was
showing, and sends only when they are equal and, for a Reconnect, equal to the
pane's own destination or to the one the engineer gave the second confirmation
for. A file rewritten by another program is not announced by any event; this
reload is what catches it.

`could not start a terminal` is also the rejection for: a closed gate (the main
window is gone), a second start for one pane, and a start that completed after
the main window was destroyed or its page replaced (`server-panes.md`).

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
| `server-failed-checks` | `field`: `name`, `host`, `port`, `user` or `identityFile` | a saved server failed its checks |
| `list-unreadable` | none | the server list could not be read |
| `list-not-saved` | `errno?` | the server list could not be saved |
| `list-full` | none | the server list is full |
| `server-gone` | none | that saved server no longer exists |
| `shell-not-supported` | `shell?`: a base name of 1 to 32 of `A-Z a-z 0-9 . _ + -` | shell not supported |
| `not-in-engagement` | none | not available in an engagement |
| `terminal-not-started` | `errno?` | could not start a terminal |
| `no-ssh-client` | `status`: 127 | no SSH client found |
| `ended-before-ssh` | `status?` | ended before ssh was seen to start |
| `not-handed-over-another-program` | none | not handed over: another program is running |
| `not-handed-over-yet` | none | not handed over yet |

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

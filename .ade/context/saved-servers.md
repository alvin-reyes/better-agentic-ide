# Saved servers: the record, the store, the commands, the kinds

Status: **proposed** with the F7 S1 design
(`docs/superpowers/specs/2026-11-18-saved-servers-design.md`, revision 1, not
approved). PRD: `docs/prd.md` F7, SV-1, SV-2, SV-5, SV-8, SV-9. Companion:
`server-panes.md`. ADRs (provisional numbers): 0043, 0044.

## The record

| Member | JSON type | Required | Rule (one Rust function, `saved_servers::rules::check`) |
|---|---|---|---|
| `id` | string | yes | 32 lowercase hex characters, made by ADE, never shown |
| `name` | string | yes | trimmed; 1 to 64 code points; each passes `terminal_open::name_char_ok`; unique by name key (NFC, then lowercase) |
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
- A record whose values fail `check` is loaded with `problem: <field>`, listed,
  never connected to.

## Grammar and summary (Rust only)

- Arguments of the SSH client: `[-p PORT] [-l USER] [-i IDENTITY_FILE] -- HOST`; a
  leading `~/` of the identity file is replaced by the home folder. Nothing else,
  ever.
- Destination summary: `[USER@]HOST[:PORT]`, an IPv6 host in brackets when a port
  follows. The webview shows the string Rust returns and compares summaries as
  strings.

## Commands (main window only, Unix only)

| Command | Arguments | Resolves | 
|---|---|---|
| `servers_list` | none | `ServerRow[]` in list order |
| `servers_save` | `{ id?, name, host, port, user, identityFile }`, strings as typed | `{ server: ServerRow, warning?: "not-found" \| "not-a-regular-file" }` |
| `servers_remove` | `{ id }` | nothing |
| `server_connect` | `{ serverId, rows, cols, onEvent }` | `{ ptyId, destination, summary }` |
| `server_terminal_end` | `{ id }` (a PTY id) | nothing, once no process of the pane is alive |

`ServerRow = { id, name, host, port?, user?, identityFile?, summary, problem? }`.
**The connect request carries the identifier and nothing else of the server.**
After a save or a remove Rust emits the event `servers-changed` (no payload) to
the main window.

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

The id list is checked in on the Rust side (`saved_servers/kinds.list`) and
mirrored as a union type in `src/lib/serverKinds.ts`; a test fails when they
differ. A thirteenth kind is a PRD change.

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

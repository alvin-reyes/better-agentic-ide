# Sync: fields that stay on this machine

- **Decided in:** ADR `0040-sync-splits-shared-keys-into-a-public-and-a-local-part`.
- **Design:** `docs/superpowers/specs/2026-11-15-workspaces-design.md`, section 9.
- **PRD:** F4 WS-7 AC3 (OQ-5); F2 OB-10 AC2 and OB-14 AC5 (revisions 5 and 5.1). One mechanism for both features.
- **Status:** proposed 2026-11-15, design revision 1; not reviewed, not approved, not built.

## The mechanism

`src-tauri/src/sync_local.rs`:

```rust
pub fn split(key: &str, value: &str, know: &Knowledge) -> Option<(String /* public */, Local)>;
pub fn join(key: &str, public: &str, local: &Local) -> String;
```

- **Export** writes the public part. `None` (the value is not the expected shape) means the key is not exported in that run. The strip never fails open.
- **Import** takes `split(local value).local` and writes `join(imported public, local)`: an entry in both keeps this machine's local fields; an entry the other machine deleted stays deleted; an entry only the other machine has is taken as it came.
- **Invariant:** `split(join(p, l)).public == p`. A join must never look like a local change.
- `import_state` compares the **public part** of the local value with the repo value, not the whole local value.
- A key with no row below passes through unchanged.

## The rows

| Key | Entry id | Local fields | Taken out when |
|---|---|---|---|
| `ade-session` (device key; exported, never imported) | each saved tab | every pane's `savedCwd` (own view and sub-terminals); every `subViews[].name` (becomes `null`); `name` when it equals the last component of the mark's path (becomes `"Terminal"`); `workspace` | the saved tab has `workspace` (F4) or `hub` (F2) |
| `better-terminal-workspaces` (tab sets) | the tab set's `id` and the tab's index | `cwd`, `hub` | the entry has `cwd` |
| `better-terminal-orchestrator` | the session's `id` | `projectDir` | the path is inside a known workspace folder |
| `better-terminal-agent-tracker` | the entry's `id`; for entries without one, `paneId` and `startTime` | `cwd` | the same |
| `better-terminal-prompt-history`, `better-terminal-saved-notes`, `ade-scratchpad-draft` | | none | never: the engineer's own text |

- Agent-tracker entries gain an optional random `id`, minted in `startSession`.
- Whether an exported `ade-session` tab keeps `hub: true` is F2's decision, to be written here by F2's design revision.
- A new feature that puts a path into a synced key adds a row here and a test of the invariant for it.

## Known workspace folders

Built at the start of each export and each import, as path keys (`workspaces.md`):

1. every record's hub folder, added folders, hidden folders and `order` entries;
2. every checkout a discovery of each recorded hub finds, run then, under the 2-second bounds;
3. the last discovery of every workspace open in this instance.

**Fail closed:** if any recorded hub's discovery is not complete (the hub is missing, a file is unreadable or does not answer, work folders were skipped), that run takes out every `projectDir` and every `cwd`, workspace or not. A path whose key cannot be computed in time counts as inside.

**Stated limits:** a folder of a hub whose record was dropped, and a checkout whose row was removed from the hub's files, are no longer known; entries inside them are exported at the next write of their key (design 9.5, question Q1).

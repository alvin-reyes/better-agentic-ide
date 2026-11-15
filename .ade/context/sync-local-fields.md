# Sync: fields that stay on this machine

- **Decided in:** ADR `0040-sync-splits-shared-keys-into-a-public-and-a-local-part`.
- **Design:** `docs/superpowers/specs/2026-11-15-workspaces-design.md`, section 9.
- **PRD:** F4 WS-7 AC3 (OQ-5); F2 OB-10 AC2 and OB-14 AC5 (revisions 5 and 5.1). One mechanism for both features.
- **Owner decision, 2026-11-15:** an orchestrator session's `projectDir` and an agent-tracker entry's `cwd` are never synced, for anyone, hub or not. Each machine keeps its own. The PRD amendment this needs is in the design's section 21 and is not yet applied.
- **Status:** proposed 2026-11-15, design revision 2; not approved, not built.

## The rule

- Some fields are **local**: they never go to the sync repo, and each machine keeps its own.
- Which fields are local is fixed by the key and the field's name, or by a field of the same saved tab. **Sync looks at no workspace, no record, no discovery and no folder.** `sync.rs` and `sync_local.rs` do not use the `workspace` module.
- A new feature that puts a path into a synced key adds a row below and the tests of the invariants for it.

## The rows

| Key | Group | Local fields | Decided by |
|---|---|---|---|
| `better-terminal-orchestrator` | shared | every `projectDir`, at any depth | the name |
| `better-terminal-agent-tracker` | shared | every `cwd`, at any depth | the name |
| `better-terminal-workspaces` (tab sets) | shared | every `cwd` and every `hub`, at any depth (F2 OB-14 AC5's fields) | the names |
| `ade-session` | device: exported, never imported | for a saved tab that has `workspace` (F4) or `hub` (F2): everything but the allowlist below | that saved tab's own fields |
| `better-terminal-prompt-history`, `better-terminal-saved-notes`, `ade-scratchpad-draft`, every other key | | none | the engineer's own text |

**The `ade-session` allowlist.** A saved tab with `workspace` or `hub` is exported as a new object holding only: `id`, `type`, `color`, `activePaneId`, `shownView`; `name` (a name equal to the last component of `workspace` becomes `"Terminal"`); `root` as structure only (`type`, `direction`, `children`, a pane's `id`); and `subViews[]` with `id`, `activePaneId`, `root` (structure only) and `name: null`. Everything else is left out, including any field added later. A tab with neither field is exported as today. Whether an exported hub tab keeps `hub: true` is F2's decision, to be written here by F2's design revision; until then it is left out.

## The functions

`src-tauri/src/sync_local.rs`:

```rust
/// `value` with every local field of `key` removed. None when `value` is not JSON.
pub fn public(key: &str, value: &str) -> Option<String>;
/// The imported copy with this machine's local fields put back. None when `imported` cannot be joined.
pub fn join(key: &str, imported: &str, local: Option<&str>) -> Option<String>;
```

- Every comparison of two values in sync is made on parsed JSON, not on text (`serde_json` sorts keys when it writes).
- **Export** writes `public(local value)`. `None` means the key is not exported in that run and is listed in `SyncReport.skipped_keys` (`local_unreadable`).
- **The scrub:** before the export's comparison, a repo copy that holds a local field is rewritten with `public` of it, keeping its `updated_at` and `device`.
- **Import** imports a key when `public(local)` differs from `public(repo copy)` and the repo copy is newer, and writes `join(repo copy, local)`. `None` means the key is not imported in that run, the local value stays, and it is listed in `skipped_keys` (`imported_unreadable`).

## Entries and ids (for `join`)

| Key | An entry | Its id |
|---|---|---|
| `better-terminal-orchestrator` | each element of the array | its `id` |
| `better-terminal-agent-tracker` | each element of the array | its `id` when it has one; else `paneId` and `startTime` together |
| `better-terminal-workspaces` | each element of each tab set's `tabs` | the tab set's `id` and the element's index |

- Agent-tracker entries gain an optional random `id`, minted in `startSession`.
- The persisted shape of each store is pinned by a checked-in file under `src-tauri/src/fixtures/sync/`, asserted by a vitest and read by the Rust tests.

## `join`, every case

- The imported copy is not JSON or not an array → not imported.
- This machine's value is absent, not JSON or not an array → `public(imported)`.
- Otherwise each imported entry, in the imported order. For each local field of an entry:
  - this machine has an entry with the same id that has the field → **this machine's value**;
  - otherwise → absent.
- An imported value of a local field is never taken, whichever machine wrote it.
- An entry only this machine has is not in the result (today's whole-replace rule).

## Invariants (each is a test, per key)

1. `public(public(v)) == public(v)`, and `public(v)` holds no local field at any depth.
2. `public(join(p, l)) == public(p)`. A join never looks like a local change.
3. For every id in both `p` and `l`, each local field of `l`'s entry is in the join with `l`'s value.
4. `join(public(v), v) == v` when ids are unique.
5. The join has exactly `p`'s entries, in `p`'s order.

## Stated limits

- Paths synced before this change leave the repo's current files at the first sync of a machine on this build. They stay in the repo's git history.
- A machine on an older build writes its paths back when it exports, and loses its own `projectDir` and `cwd` values for the entries it imports. The guarantee holds once every machine syncing to the repo runs this build.
- `ade-session` still exports, as today, the folder of a plain tab, an editor tab's file and a contracts tab's root (the PRD's table strips workspace tabs only; design question O-3).

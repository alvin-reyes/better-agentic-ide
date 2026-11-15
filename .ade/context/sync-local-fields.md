# Sync: fields that stay on this machine (and what ships with them in S0)

- **Decided in:** ADR `0040-sync-splits-shared-keys-into-a-public-and-a-local-part`.
- **Design:** `docs/superpowers/specs/2026-11-15-workspaces-design.md`, section 9.
- **PRD:** F4 WS-7 AC3 (OQ-5; revisions 3.4 to 3.7, pending the owner's approval of their text); F2 OB-10 AC2 and OB-14 AC5 (revisions 5 and 5.1). One mechanism for both features.
- **Owner decisions, 2026-11-15:** an orchestrator session's `projectDir` and an agent-tracker entry's `cwd` are never synced, for anyone, hub or not; each machine keeps its own. OQ-14 to OQ-21 answered as recommended (cleanup yes; notice yes; history kept; release note; per-task Dispatch makes the folder; S0 ships ahead with all four rules; a missing recorded folder counts as none), and OQ-20 as (b′).
- **Status:** proposed 2026-11-15, design revision 3; not approved, not built.

## The rule

- Some fields are **local**: they never go to the sync repo, and each machine keeps its own.
- Which fields are local is fixed by the key and the field's name, or by a field of the same saved tab. **Sync looks at no workspace, no record, no discovery and no folder.** `sync.rs` and `sync_local.rs` do not use the `workspace` module.
- **Every rule beyond "strip, and keep this machine's own" has a scope, stated per row below.** The never-take rule, the unreadable rule, the cleanup and the skipped-key notice apply to rows 1 and 2 only (PRD F4.9: "only those two fields in those two keys, and none of F2's rows").
- A new feature that puts a path into a synced key adds a row below, with each rule's scope, and the tests of the invariants for it.

## The rows

| | 1. `better-terminal-orchestrator` | 2. `better-terminal-agent-tracker` | 3. `better-terminal-workspaces` (tab sets) | 4. `ade-session` (device; never imported) |
|---|---|---|---|---|
| Slice | S0 | S0 | S1 | S1 |
| Local fields | `projectDir`, anywhere in each element | `cwd`, anywhere in each element | `cwd` and `hub` of each entry of each set's `tabs` (F2's fields) | for a saved tab with `workspace` or `hub`: all but the allowlist |
| Readable means | a JSON array; non-object elements pass as they are | the same | no rule (as today) | JSON (as today) |
| Local value unreadable | not exported; recorded `local_unreadable` | the same | as today | not exported (as today); not recorded |
| Import | join by `id` | join by `id`, else `paneId` + `startTime` | join by set `id` + set `name` + index | none |
| Imported value of a local field | **never taken** | **never taken** | taken when this machine holds none for that entry | |
| Imported copy unreadable | not imported; local stays; recorded `imported_unreadable` | the same | as today (whole replace) | |
| Cleanup of the repo's current file (OQ-14) | yes, when the copy is a list; keeps `updated_at`, `device` | the same | no | no |
| Shown in Settings → Sync (OQ-15) | yes, until the key next syncs | yes | no | no |

Every other key (`better-terminal-prompt-history`, `better-terminal-saved-notes`, `ade-scratchpad-draft`, the rest): no local field, no new rule.

**The `ade-session` allowlist.** A saved tab with `workspace` or `hub` is exported as a new object holding only: `id`, `type`, `color`, `activePaneId`, `shownView`, `hub`; `name` (a name equal to the last component of `workspace` becomes `"Terminal"`); `root` as structure only (a split `{ type: "split", direction, children }`; a pane `{ type: "pane", pane: { id } }`); and `subViews[]` with `id`, `activePaneId`, `root` (structure only) and `name: null`. Everything else is left out, including any field added later. A tab with neither field is exported as today. F2's design may take `hub` out of the list.

## The functions

`src-tauri/src/sync_local.rs`:

```rust
pub enum Unreadable { NotJson, NotAList }
pub fn public<'a>(key: &str, value: &'a str) -> Result<Cow<'a, str>, Unreadable>; // Err: rows 1, 2 (not a list); row 4 (not JSON)
pub fn join(key: &str, imported: &str, local: Option<&str>) -> Result<String, Unreadable>; // Err: rows 1, 2
pub fn clean(key: &str, repo_value: &str) -> Option<String>; // rows 1, 2 only
```

- Every comparison of two values in sync is made on parsed JSON, not on text (`serde_json` sorts keys when it writes).
- **Export** writes `public(local value)`; `Err` on rows 1, 2 means not exported in that run, recorded.
- **Cleanup** (rows 1, 2): before the export's comparison, a repo copy that is a list and holds the field is rewritten with `clean` of it, keeping its `updated_at` and `device`.
- **Import** imports a key when `public(local)` differs from `public(repo copy)` and the repo copy is newer, and writes `join(repo copy, local)`; `Err` on rows 1, 2 means not imported, the local value stays, recorded.
- **Skipped keys** are kept in `SyncState.skipped` (`sync-state.json`, this machine only) as `{ key, why, sinceMs }`, until a run reads the failing side as the key's list again. Every `SyncReport.skippedKeys` comes from it. `SyncSettings.tsx` shows one line per entry, naming the store in words; the copy is the designer's.

## `join`, every case

- Rows 1, 2: the imported copy is not a JSON array → `Err`, not imported. This machine's value is absent or not a list → `public(imported)`. Otherwise each imported entry, in order; for each local field: this machine's value when it has an entry with that id holding the field, else absent.
- Row 3: the imported copy is not a list → the imported copy as it is. Otherwise each imported entry, in order; for each local field: this machine's value when it holds one for that entry, else the imported entry's own value, if any.
- An entry only this machine has is not in the result (today's whole-replace rule). Two local entries with one id: the first is used.

## Invariants (each is a test, per row)

1. `public(public(v)) == public(v)`, and `public(v)` holds no local field of its row.
2. `public(join(p, l)) == public(p)`. A join never looks like a local change.
3. For every id in both `p` and `l`, each local field of `l`'s entry is in the join with `l`'s value.
4. `join(public(v), v) == v` when every entry of `v` holding a local field has an id and the ids are unique.
5. The join has exactly `p`'s entries, in `p`'s order.
6. Rows 1, 2: no value of a local field in `join(p, l)` comes from `p`.

## Ids

- Agent-tracker entries gain an optional random `id` (`crypto.randomUUID()`), minted in `startSession`. Older entries are matched by `paneId` and `startTime`.
- Tab-set ids are `Date.now().toString(36)`; the join adds the set's `name`. Two sets saved in the same millisecond with the same name on two machines still share an id (stated).
- The persisted shape of each store is pinned by a checked-in file under `src-tauri/src/fixtures/sync/`, asserted by a vitest and read by the Rust tests.

## What ships with rows 1 and 2 in S0

- **The fleet (OQ-20 (b′)).** `agentTrackerStore.ts` keeps `startedHere`, a module-level `Set` of the ids `startSession` minted in this page, never saved or synced; `startedThisLaunch(entry)` asks it. `buildLanes(sessions, subagents, paneMeta, joinable)` joins an entry to `paneMeta[entry.paneId]` only when `joinable(entry)`; every other entry has no tab and only its own `cwd`. The agent picker and `dispatchAgent` pass the run's folder to `startSession`, as orchestrator dispatch does.
- **Dispatch (OQ-18 (i), OQ-21).** Rust command `orchestrator_project_dir(recorded: Option<String>, name: Option<String>) -> Result<String, String>` (`src-tauri/src/orchestrator_dir.rs`): the recorded path when it is an existing folder, else a new `~/.ade/orchestrator/<slug>-<ms base 36>` (`-2`, `-3` … when taken). Webview `projectDirFor(sessionId)` (`src/lib/orchestratorProjectDir.ts`): one in-flight promise per session; writes `SPEC.md` before `setProjectDir`; called by Dispatch all, per-task Dispatch and generation. On failure no agent starts and nothing is recorded.

## Stated limits

- Paths synced before this change leave the two keys' current files at the first sync of a machine on this build. They stay in the repo's git history (OQ-16).
- A machine on an older build writes its folders back when it exports, and loses its own `projectDir` and `cwd` for the entries it imports. The guarantee holds once every machine syncing to the repo runs this build (release note, OQ-17).
- Values imported before this build count as this machine's own.
- `ade-session` still exports, as today, the folder of a plain tab, an editor tab's file and a contracts tab's root (design question O-3).

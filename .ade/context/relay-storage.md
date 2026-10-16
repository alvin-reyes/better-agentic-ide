# Phone remote: relay storage, clock and cleanup

Set by story 7a (`_bmad-output/initiative-phone-remote/epic-phone-watch/story-relay-storage-cleanup-and-metrics-plan.md`).
Spec: "The relay" → Storage. The wire side (1011, `/metrics`, env vars) is in
`remote-protocol.md`.

## Where things live

- `relay_core::store` holds the contract and the pure decisions; it has no I/O. `relay-core`
  depends on neither SQLite nor tokio (`cargo tree -p relay-core -e normal`).
- `relay_server::store::SqliteStore` implements it (`rusqlite` 0.40.2, `bundled`).
- `relay_core::clock`: `Clock` (`now_ms() -> u64`, Unix ms, `Send + Sync`), `SystemClock`,
  and `ManualClock` (shareable as `Arc<ManualClock>`; `new()` starts at
  2026-01-01T00:00Z = `MANUAL_CLOCK_START_MS` = 1 767 225 600 000; `at(ms)`, `set(ms)`,
  `advance(Duration)`). The relay reads time only through `Config.clock`.

## Schema (`PRAGMA user_version` = 1)

Keys as BLOB, times as INTEGER Unix ms. Opened with WAL, `foreign_keys = ON` and a 5 s
`busy_timeout`. A file with a newer `user_version` is refused (`newer_schema`).

```sql
devices(id BLOB PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('mac','phone')),
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL)
pairs(pair_id BLOB PRIMARY KEY,
      mac BLOB NOT NULL REFERENCES devices ON DELETE CASCADE,
      phone BLOB NOT NULL REFERENCES devices ON DELETE CASCADE,
      mac_static BLOB NOT NULL, phone_static BLOB NOT NULL, slot BLOB NOT NULL,
      paired_at INTEGER NOT NULL, sig_m BLOB NOT NULL, acked INTEGER NOT NULL DEFAULT 0)
      -- indexes pairs_mac, pairs_phone
push_tokens(phone BLOB PRIMARY KEY REFERENCES devices ON DELETE CASCADE,
            token TEXT NOT NULL, env TEXT NOT NULL, updated INTEGER NOT NULL)
```

The main schema has exactly these three tables. Cleanup uses two per-connection TEMP
tables (`cleanup_online`, `cleanup_batch`), which are never on disk in the main file.

## `Store` API (`relay_core::Store: PairDirectory + Send + Sync`)

Every method returns `Result<_, StoreError>`. `StoreError` is `RoleConflict` or
`Failed(&'static str)`, and `code()` gives a log code, never a SQLite message.

| Method | Returns |
|---|---|
| `peers_of(id)` (from `PairDirectory`) | `Vec<PairInfo>`, in pairing (insert) order |
| `device(id)` | `Option<DeviceRecord{id, role, first_seen, last_seen}>` |
| `register(id, role, now)` | `Registered{new}`. One atomic upsert under the lock: sets `last_seen = now` (and `first_seen` when new). The other role gives `Err(RoleConflict)`, leaving the row as it was |
| `touch(id, now)` | `bool`, false if no such device |
| `insert_pair(&PairRecord)` | `()`. Both devices must exist (foreign keys) |
| `pair(pair_id)` | `Option<PairRecord>` |
| `set_acked(pair_id)` / `delete_pair(pair_id)` | `bool`, false if no such pair |
| `put_push_token(phone, token, env, now)` | `()`. One token per phone: replaces |
| `cleanup(now, cutoff, online)` | `CleanupCounts` (below) |
| `counts()` | `StoreCounts{devices, pairs, pairs_acked, push_tokens}` |

`PairRecord`: `pair_id: PairId`, `mac`, `phone: DeviceKey`, `mac_static`, `phone_static:
Bytes<32>`, `slot: Bytes<16>`, `paired_at: u64`, `sig_m: Bytes<64>`, `acked: bool`.

`CleanupCounts`: `touched`, `devices`, `pairs`, `push_tokens` (u64), `deleted:
Vec<DeviceKey>`, and `deleted_pairs: Vec<PairId>`. Each batch reads the pair ids it is
about to cascade away, in the same transaction as its delete. Story 7b strips its
in-memory peer sets by these pair ids.

Pure functions: `admit(stored_role: Option<Role>, &Identity) -> Result<Admit::{Known,
New}, LoginError>` and `cleanup_cutoff(now) -> Option<u64>`.

Story 5a extends the trait with what pairing needs.

## Calling the store from the server

`relay_server::StoreHandle::call(|s| ...) -> Result<T, StoreError>` runs each call on
`spawn_blocking`, so a held store lock never blocks a tokio worker (the bin is a plain
`#[tokio::main]`, a single worker on a 1-vCPU machine). A panicked call is
`Failed("store_task")`. `SqliteStore` is one `Mutex<Connection>`.

## Cleanup rules

- `cleanup_cutoff(now) = now − 90 days`, **inclusive**: a device whose `last_seen <= cutoff`
  is deleted, so one unseen for exactly 90 days goes and one unseen for 1 ms less stays.
  It is `None` (delete nothing) while `now` is under 90 days, so it can't underflow.
- The relay runs it first **one interval after start**, then every `Config.cleanup_interval`
  (1 h by default), and on `Relay::run_cleanup()`.
- One run: first touch every online device to `now` in one transaction (a crash skips the
  leave that would have written `last_seen`). Then delete in **batches of 500 devices, one
  transaction each**, so the lock is free between batches. Each batch picks its devices
  again, and the delete itself re-applies the cutoff and the online list. It repeats until
  a batch deletes nothing. Pairs and push tokens go by `ON DELETE CASCADE`.
- Cleanup sends nothing to a deleted device's online peers. They reconcile at their next
  `welcome`.

## Test helpers (`relay/e2e/tests/common/mod.rs`)

`CountingStore::new(Arc<dyn Store>)` wraps a store. `count(method)`; `fail(method)` /
`heal(method)` make one method return `Failed("injected")` while the others still work;
`hold()` / `release()` gate every call, and `waiting()` says how many are parked;
`until(what, cond)` polls up to 5 s. Method names are the `Store` method names (`METHODS`).
`CaptureLog` is a `LogSink` that keeps every rendered line.

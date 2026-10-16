---
title: 'Relay storage, cleanup and metrics'
type: 'feature'
ticket: '7a'
created: '2026-10-16'
status: 'in-progress'
baseline_revision: '57b626b9adbaf30a243b4801eee250b3a4db1970'
route: 'full'
route_source: 'auto'
risk: 'high'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context:
  - '{project-root}/docs/superpowers/specs/2026-10-14-relay-pairing-design.md'
  - '{project-root}/.ade/context/remote-protocol.md'
  - '{project-root}/.ade/context/phone-remote-layout.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The relay holds devices, roles and pairs in memory, so a restart loses every pair. It also never forgets an abandoned device, and it has no `/metrics`. Stories 5a and 10 need a pairs table with `acked` and a `push_tokens` table.

**Approach:**
- SQLite sits behind a `Store` trait, defined in `relay-core` and implemented in `relay-server`. Story 2's plan named this seam.
- The 90-day cleanup runs on a timer. A test can trigger it, and it runs on an injected clock.
- `/metrics` sits behind a token.
- Logs go through a typed sink that can carry only codes and counts.

## Boundaries & Constraints

**Always:**
- Follow the spec's "The relay" (Storage, and Operations' `/health` and `/metrics`) exactly, as amended by the decisions below.
- `relay-core` holds the decisions as pure code (admission over the stored role, the cleanup cutoff) and has no I/O. `relay-server` does SQLite and HTTP.
- Time comes from an injected `Clock`. Tests trigger cleanup rather than waiting for its timer.
- Logs and `/metrics` carry counts and error codes only. They never carry keys, ids, IPs, tokens or contents.
- Earlier decisions stand. Every story-2 e2e test keeps passing.
  - Owner, story 2: a refused login closes with 4401 `login_refused`.
  - Owner, PR #60: an unknown `t` is ignored.
- Crates, and every new `Cargo.lock` entry, were published before 2026-10-02.
- **Owner decisions, 2026-10-16:**
  - Story 7 is split into 7a, this story, and 7b (limits, routing and replacement). 5a waits on both. The ticket (`tickets.toml`, entry "7a") keeps story 7's AC numbers 1, 6, 7 and 8.
  - On a store error, a login closes with 1011 and gets no `welcome`. A leave that hits a store error sends no presence.
  - `pairs` has a `sig_m` column, so `paired` can be re-sent after a restart.
  - The canary's "bytes the relay received" clause moves to story 6's e2e test. 7a proves the logs and the SQLite files.
  - The 90-day boundary is inclusive.
  - Cleanup runs hourly, and sends nothing to a deleted device's online peers. They reconcile at `welcome`.
  - There is one push token per phone.
  - `RELAY_DB` is required.
  - The metrics token is at least 32 characters. Without one, `/metrics` answers 404.
  - In `Authorization: Bearer <token>`, the scheme name matches in any letter case, and the token must match exactly.
  - Cleanup deletes in batches of 500 devices, one transaction per batch.
  - Ticket 7a keeps story 7's AC numbers, gaps included, and this plan's size is accepted.

**Never:**
- Nothing from 7b: no limits, no routing, no `rate_limited`, `control_limited` or `rehandshake`, no 4409 or 4429 close, no 1009 close, and no client IP.
- Nothing from 5a: no pairing messages, no `paired_ack`, and no re-sent `paired`.
- Nothing from story 10: no push and no `push_token` message.
- Nothing from stories 4 or 6, and no change to `packages/protocol`, `src/`, `src-tauri/` or `mobile/`.

</frozen-after-approval>

## Code Map

- `relay/core/src/lib.rs`:
  - `PairDirectory::peers_of` returns a plain `Vec`, and `InMemoryPairs` implements it.
  - `DeviceRoles` is held in memory.
  - Keep `Presence` and `verify_login`.
- `relay/server/src/lib.rs`:
  - `Config.pairs`.
  - `Live.roles`, used in `connection`'s admit block at about line 238.
  - `Leave::drop` re-queries `peers_of`.
  - `serve()` returns `(addr, JoinHandle)`, with no shutdown.
  - Logging is `eprintln!`, in 6 places.
- `relay/server/src/main.rs` -- the environment parsing, which exits 2 on bad input. Its start-up lines print the configuration (hosts and the listen address), which is not traffic, and they stay.
- `relay/e2e/tests/e2e.rs` -- `relay()` seeds `InMemoryPairs`. The raw-socket helpers are `Raw`, `raw_challenge`, `signed_login` and `raw_next`.
- `.ade/context/remote-protocol.md` -- the "Roles", "Pair directory" and "Relay endpoints" sections.
- Spec lines ~701–760 (The relay) and ~1020–1024 (cleanup, canary).

## Tasks & Acceptance

**Execution** (each task's tests are written and seen red first):
- [x] **Dependencies** (`relay/Cargo.toml`, `relay/server/Cargo.toml`, `relay/e2e/Cargo.toml`):
  - Add `rusqlite = { version = "0.40.2", features = ["bundled"] }`, published 2026-08-08. Through `libsqlite3-sys` 0.38.2, published the same day, it bundles SQLite.
  - Add `subtle = "2.6.1"`, published 2024-06-24 and already in the lock file.
  - Add the dev-dependency `tempfile = "3.27.0"`, published 2026-03-11.
  - Check every new `Cargo.lock` entry on crates.io, and use `cargo update --precise` on any dated 2026-10-02 or later.
- [x] **The clock** (`relay/core/src/clock.rs`, new) -- A `Clock` trait (`now_ms() -> u64`, Unix ms), with `SystemClock` and a public, shareable `ManualClock`. `ManualClock::new()` starts at a realistic time, 2026-01-01T00:00Z, never at 0. 7b's limiters use it too.
- [x] **The store contract** (`relay/core/src/store.rs`, new):
  - The trait is `Store: PairDirectory + Send + Sync`, with:
    - `device(id)`;
    - `register(id, role, now) -> Result<Registered{new}, StoreError>`, one atomic upsert that sets `last_seen = now` and refuses a role mismatch;
    - `touch(id, now) -> bool`;
    - `insert_pair` and `pair(pair_id)`;
    - `set_acked(pair_id) -> bool` and `delete_pair(pair_id) -> bool`;
    - `put_push_token(phone, token, env, now)`;
    - `cleanup(cutoff_ms, online: &[DeviceKey]) -> CleanupCounts`;
    - `counts() -> StoreCounts`.
  - `PairRecord` holds `pair_id`, `mac`, `phone`, `mac_static`, `phone_static`, `slot`, `paired_at`, `sig_m` and `acked`.
  - `peers_of` becomes `Result<Vec<PairInfo>, StoreError>`, and `InMemoryPairs` follows.
  - Two pure functions:
    - `admit(stored_role, who) -> Result<Admit::{Known, New}, LoginError>`;
    - `cleanup_cutoff(now) -> Option<u64>`, which is `None`, meaning delete nothing, while `now` is under 90 days. A unit test covers it.
  - `CleanupCounts` carries the counts, plus `deleted: Vec<DeviceKey>` and `deleted_pairs: Vec<PairId>`. Each batch reads the pair ids it is about to cascade away, in the same transaction as the delete. 7b uses `deleted_pairs` to strip its in-memory peer sets by pair id. The store test checks both lists.
  - `DeviceRoles` is removed, and its tests become `admit` tests.
  - 5a extends the trait with what it needs.
- [x] **The SQLite store** (`relay/server/src/store.rs`, new) -- `SqliteStore::open(path)` turns on WAL, `foreign_keys=ON` and `busy_timeout`, sets `user_version` 1, refuses a newer schema, and holds the schema in the Design Notes. Tests on a temp file:
  - values survive a reopen, `acked` included;
  - the tables are exactly `devices`, `pairs` and `push_tokens`;
  - a newer `user_version` is refused;
  - a device unseen for exactly 90 days is deleted, and one unseen for that time less 1 ms is kept;
  - `register(now)` followed by `cleanup(now − 90 d)` keeps the device;
  - an online device is spared;
  - a role conflict is refused;
  - `touch` on a missing row returns false.
- [x] **Typed logs** (`relay/server/src/log.rs`, new):
  - `LogEvent` is an enum whose fields are only `&'static str` codes and counts.
  - `LogSink` is a trait, with `StderrLog` as the default.
  - A test renders every variant and matches `^relay: [a-z_]+( [a-z_]+=[0-9a-z_]+)*$`.
  - Every `eprintln!` in `lib.rs` moves to it.
- [x] **Metrics** (`relay/server/src/metrics.rs`, new):
  - `Counters` are atomics, rendered in the Prometheus text format.
  - The gauges are `relay_online`, `relay_devices`, `relay_pairs`, `relay_pairs_acked` and `relay_push_tokens`.
  - The counters are `relay_logins_total{result="ok|refused"}` and `relay_cleanup_deleted_devices_total`. 7b adds its own.
  - The handler reads `Authorization: Bearer <token>`. The scheme name matches in any case, as RFC 7235 says, and the token must match exactly. It is compared in constant time, with `subtle`.
- [x] **The server** (`relay/server/src/lib.rs`):
  - **`Config`** -- `store: Arc<dyn Store>` replaces `pairs`. The new fields are `clock`, `log`, `metrics_token` and `cleanup_interval`, the last defaulting to 1 h.
  - **`serve()`** -- returns a `Relay` handle with `addr` and three methods:
    - `run_cleanup().await -> CleanupCounts`.
    - `shutdown().await`. It works in this order: stop accepting; close every connection; wait for each leave's store work to finish; then drop the store.
    - `abort()`. It simulates a crash: it first sets an `aborted` flag on the hub, then cancels the tasks. `Leave::drop`, and the task it spawns, check the flag and do nothing, so there is no leave and no `touch`. `Leave` is a drop guard that would otherwise run on cancellation.
  - **The store runs off the async workers.** Every store call goes through `spawn_blocking`, behind `StoreHandle::call(|s| ...)`, so a held store lock never blocks a tokio worker. The bin is a plain `#[tokio::main]`, which on a 1-vCPU machine has a single worker.
    - `Leave::drop` cannot await. It spawns a task that does the touch and the `peers_of` query off the async workers, then the fan-out.
  - **Login** -- runs `verify_login`, then `admit` over `store.device()`, then `register`. A store error closes the connection with 1011 and sends no `welcome`.
  - **Leave** -- touches the device. Presence and the sender are always cleared. If `peers_of` fails, only the fan-out is skipped, and the code is logged.
  - **Cleanup** -- runs first one interval after start, then every interval, and on `run_cleanup`. Each run happens on `spawn_blocking`. It first touches the online devices in one transaction, then deletes in batches of 500 devices, each its own transaction, so the lock is released between batches. Each batch picks its devices again, with the cutoff and the online list applied inside the delete itself: `DELETE FROM devices WHERE id IN (SELECT id FROM devices WHERE last_seen <= ?cutoff AND id NOT IN (online) LIMIT 500)`. It repeats until a batch deletes nothing. A device that logs in during a long cleanup has a fresh `last_seen` by then, so it is never deleted.
  - **`/metrics`** -- answers 401 without its token, and 404 when no token is set.
- [x] **Settings** (`relay/server/src/main.rs`):
  - `RELAY_DB` is required. A missing value exits 2; a file that won't open exits 1.
  - `RELAY_METRICS_TOKEN` is optional, but when set it must be 32 characters or more, or the binary exits 2.
  - Unit tests cover each rule.
- [x] **Existing e2e tests** (`relay/e2e/tests/e2e.rs`) -- `relay()` switches to `SqliteStore` on a temp file, with devices and pairs seeded. Every existing test is kept.
- [x] **Shared test helper** (`relay/e2e/tests/common/mod.rs`, new) -- `CountingStore` wraps a `Store`. It counts calls per method, can be made to fail one method at a time with `fail(method)`, and has a gate that holds every call until it is released. 7b reuses it, and 7b's register-fails test relies on the per-method switch: `device()` succeeds while `register` fails.
- [x] **New e2e tests** (`relay/e2e/tests/storage.rs`, new) -- the Acceptance Criteria tests and the contract tests below, using `ManualClock` and `run_cleanup()`.
- [x] **Shared contract** (`.ade/context/remote-protocol.md`) -- record the stored roles, the 1011 close, `/metrics`, and `RELAY_DB` and `RELAY_METRICS_TOKEN`.
- [x] **Storage contract** (`.ade/context/relay-storage.md`, new) -- the schema, the `Store` API, the clock, and the cleanup rules.

**Acceptance Criteria** (ticket 7a's ACs, in its order):
1. **Storage survives a restart (ticket AC 1).** Given a pair stored un-acked, then `set_acked`, with both devices online. When the relay is shut down and served again on the same file, then `welcome` still lists the pair and `pair()` shows it acked, but `online` is empty. (`storage_survives_a_restart_but_presence_does_not`)
2. **The 90-day cleanup (ticket AC 6).** Given a phone with a push token, last seen 90 days ago and paired with an active Mac. When `run_cleanup` runs, then the phone, its pair and its token are gone, and the Mac's next `welcome` lists no pair.
   - A stale Mac is deleted while its active phone keeps its token.
   - A device online across 91 days survives.
   - That device also survives a crash: an online device is touched by a cleanup on day 90, then `abort()` stops the relay. `CountingStore` shows the `touch` count unchanged by `abort()`, so no leave ran. A cleanup on the restarted relay one interval later keeps the device. The test fails if cleanup's touch of online devices is removed.

   (`devices_unseen_for_90_days_are_deleted_with_their_pairs_and_tokens`)
3. **`/health` and `/metrics` (ticket AC 7).**
   - `/metrics` answers 401 with no token or a wrong one.
   - With the right token it answers 200, and every line matches `^(# .*|relay_[a-z_]+(\{[a-z_]+="[a-z_]+"\})? [0-9]+)$`.
   - Seed a stale phone C, last seen 90 days ago. Mac A and phone B log in, one login is refused for a bad signature, B disconnects, then `run_cleanup` deletes C. The values then match exactly:

     | Metric | Value |
     |---|---|
     | `relay_logins_total{result="ok"}` | 2 |
     | `relay_logins_total{result="refused"}` | 1 |
     | `relay_devices` | 2 |
     | `relay_online` | 1 |
     | `relay_cleanup_deleted_devices_total` | 1 |
   - `/health` answers 200 with no token.
   - With no token configured, `/metrics` answers 404.

   (`metrics_need_their_token_and_carry_counts_only`)
4. **The canary (ticket AC 8).** Given a canary string sent in all of these:
   - binary frames;
   - control messages, of known and unknown types;
   - an extra field in a `login`;
   - the WebSocket path;
   - the `Authorization` header of a refused `/metrics` call.

   Then no captured log line contains it, and neither do the database file, its `-wal` or its `-shm`, which are read before `shutdown`, since a checkpoint can remove them. (`the_canary_never_reaches_logs_or_the_database`)

**Contract tests:**
- `a_store_error_at_login_closes_1011_without_welcome`;
- `a_store_error_at_leave_sends_no_presence`: presence and the sender are still cleared, so the device can log in again and is listed offline until then;
- `a_held_store_lock_does_not_stall_the_relay`: with the `CountingStore` gate held and a login waiting on it, `/health` answers and an online device still gets its pings, on a `current_thread` runtime. The test runs under a 5 s timeout, so if a store call blocks the runtime it fails instead of hanging;
- `cleanup_cutoff_is_none_before_90_days` (core);
- the store tests listed above;
- the `relay-core` purity check in Verification.

## Design Notes

**Schema** (`user_version` 1, keys as BLOB, times in Unix ms):
```sql
devices(id BLOB PRIMARY KEY, role TEXT CHECK(role IN ('mac','phone')), first_seen INT, last_seen INT)
pairs(pair_id BLOB PRIMARY KEY, mac BLOB REFERENCES devices ON DELETE CASCADE,
      phone BLOB REFERENCES devices ON DELETE CASCADE, mac_static BLOB, phone_static BLOB,
      slot BLOB, paired_at INT, sig_m BLOB, acked INT NOT NULL DEFAULT 0)   -- index on mac, on phone
push_tokens(phone BLOB PRIMARY KEY REFERENCES devices ON DELETE CASCADE, token TEXT, env TEXT, updated INT)
```
`register` is `INSERT … ON CONFLICT(id) DO UPDATE SET last_seen = ?now`, followed by reading the role back, all under the store lock. A login therefore never leaves a stale `last_seen` behind for cleanup to find.

**`peers_of` can fail.** A version that couldn't fail would return `[]` on a read error, and a `welcome` with no pairs makes devices drop their pairs.

**Cleanup touches online devices first, and waits one interval after start.** `last_seen` is written at login and leave, and a crash skips the leave. Without this, the first cleanup after an unclean restart would delete a device that had been online for more than 90 days.

**Store calls never block a tokio worker.** They are short indexed calls behind one `Mutex<Connection>`, each made through `spawn_blocking`. Cleanup releases the lock between batches.

## Plan Change Log

- **2026-10-16, split.** The owner split story 7, and this plan holds ticket 7a's part of it. The first review's fixes are kept:
  - **C1.** Online devices are touched before the delete, and the first cleanup runs one interval after start.
  - **C2.** `register` is an atomic upsert.
  - **M4.** The token case is a stale phone paired with an active Mac, and the reverse.
  - **M5.** Tests call `run_cleanup()`, and the cutoff can't underflow.
  - **M8.** The store-error tests.
- **2026-10-16, second review** (7a: pass with fixes):
  - **Major 1.** Store calls go through `spawn_blocking`, and cleanup deletes in batches. Test: `a_held_store_lock_does_not_stall_the_relay`.
  - **Minor 1.** `cleanup_cutoff` returns an `Option`, and `ManualClock` starts at a realistic epoch.
  - **Minor 2.** `shutdown` has a stated order, and `abort()` simulates a crash.
  - **Minor 10.** AC 3 asserts the metric values.
  - **Minor 11.** On a store error at leave, presence and the sender are still cleared.
  - **Minor 12.** The canary covers the login and `Authorization`, and the `-wal` is read before shutdown.
  - **Minor 13.** The purity check excludes `rusqlite`.
  - **Minor 14.** This change log.
  - **Major 3.** `CleanupCounts` carries `deleted` for 7b's peer sets.
- **2026-10-16, owner's final rulings.** The Bearer case rule and the batches of 500 are recorded in Boundaries. The numbering and the plan size are accepted.
- **2026-10-16, third review** (7a: pass with fixes):
  - **Major 1.** `abort()` sets an `aborted` flag that `Leave` checks, and the crash test asserts the `touch` count is unchanged.
  - **Major 2.** `CountingStore` can fail one method at a time.
  - **Minors.** Exact values for `relay_devices` and `relay_online`. Each cleanup batch re-applies the cutoff. The stall test runs under a 5 s timeout.
- **2026-10-16, from 7b's fourth review.** `CleanupCounts` gains `deleted_pairs`, read in each batch's transaction, so 7b can strip peer sets by pair id.

## Verification

**Commands** (the five approved lines):
- `cd relay && cargo test` -- passes, and the output names each AC test and contract test above.
- `npx tsc --noEmit` -- passes, unchanged.
- `npm test` -- passes, unchanged.
- `cd src-tauri && cargo test` -- passes, unchanged.
- `cd mobile && npx tsc --noEmit && npx jest` -- passes, unchanged.

**Manual checks:**
- `git diff --stat main` shows only `relay/`, `.ade/context/` and this initiative's `_bmad-output` files.
- `cargo tree -p relay-core -e normal` shows no `rusqlite`, `libsqlite3-sys`, `tokio` or `axum`.
- `cargo tree -p relay-server -e normal | grep rusqlite` shows 0.40.2 with `bundled`.

## Implementation Notes

**2026-10-16, Dev (ticket 7a).** Branch `phone-relay-storage`. Every task above is built. Done is not claimed here: QA runs the verification and decides.

**What was built:**
- `relay/core/src/clock.rs`: `Clock`, `SystemClock` and `ManualClock` (starts at 2026-01-01T00:00Z).
- `relay/core/src/store.rs`: the `Store` trait, `PairRecord`, `DeviceRecord`, `Registered`, `CleanupCounts` (with `deleted` and `deleted_pairs`), `StoreCounts`, `StoreError`, `admit`, `cleanup_cutoff` and `CLEANUP_AGE_MS`.
- `relay/core/src/lib.rs`:
  - `DeviceRoles` is removed; its test became the `admit` tests.
  - `peers_of` returns a `Result`.
  - `Presence::online_ids()` is new.
- `relay/server/src/store.rs`: `SqliteStore`, with the Design Notes schema, WAL, `foreign_keys`, a 5 s busy timeout, `user_version` 1, and batched cleanup.
- `relay/server/src/log.rs`: `LogEvent`, `LogSink` and `StderrLog`.
- `relay/server/src/metrics.rs`: `Counters`, `render` and `authorized`, which uses `subtle`.
- `relay/server/src/lib.rs`:
  - The `Config` fields.
  - `StoreHandle::call`, which runs on `spawn_blocking`.
  - The `Relay` handle: `run_cleanup`, `shutdown` and `abort`.
  - Login through `device`, then `admit`, then `register`, then `peers_of`. A store error closes with 1011.
  - `Leave`, which spawns its store work, checks `aborted`, and on a `peers_of` error clears presence without fanning out.
  - The cleanup timer.
  - `/metrics`.
  - Every `eprintln!` now goes through `LogSink`.
- `relay/server/src/main.rs`: `RELAY_DB` and `RELAY_METRICS_TOKEN`.
- `relay/e2e/tests/common/mod.rs`: `CountingStore` (counts, `fail`/`heal(method)`, the `hold`/`release` gate, `waiting`, `until`) and `CaptureLog`.
- `relay/e2e/tests/storage.rs`: the 4 AC tests and 3 contract tests.
- `relay/e2e/tests/e2e.rs`: `relay()` now seeds a `SqliteStore` on a temp file. All 14 story-2 tests still pass.
- Contracts: `.ade/context/remote-protocol.md` (updated) and `.ade/context/relay-storage.md` (new).

**Dependencies.** Each new `Cargo.lock` entry was checked on crates.io by full `created_at`.
- `cc` resolved to 1.8.0, published 2026-10-11, and was pinned back with `--precise` to 1.5.1, published 2026-09-25.
- The newest of the rest are all on 2026-09-25: `js-sys` 0.3.106, the `wasm-bindgen` family 0.2.129, and `find-msvc-tools` 0.1.14.
- `rusqlite` 0.40.2 and `libsqlite3-sys` 0.38.2: 2026-08-08.
- `tempfile` 3.27.0: 2026-03-11.
- `subtle` 2.6.1: 2024-06-24, already in the lock file.

**Choices the plan left open, or where it differs:**
1. Every `Store` method returns `Result<_, StoreError>`, `touch`, `set_acked`, `delete_pair` and `cleanup` included. SQLite can fail on any call, and `CountingStore::fail(method)` needs every method to be able to fail.
2. `Store::cleanup(now, cutoff, online)` also takes `now`, so that it can touch the online devices to now. `CleanupCounts` also carries `touched`.
3. `Relay` has a fourth method, `wait()`. The binary needs something to await, as it did with the old `JoinHandle`.
4. `Presence::online_ids()` was added to `relay-core`. It gives cleanup's online list and the `relay_online` gauge.
5. The schema adds `NOT NULL` to every column and writes `INTEGER` for `INT` (the same affinity). Otherwise it is the Design Notes schema, indexes included.
6. Cleanup keeps the online list and the current batch in two per-connection TEMP tables, rather than binding a `NOT IN (?, …)` list, which would hit SQLite's variable limit. Each batch's `DELETE … RETURNING id` re-applies the cutoff and the online list.
7. `register` works in one transaction under the lock: it checks whether the key exists, upserts with `ON CONFLICT DO UPDATE … WHERE devices.role = excluded.role`, then reads the role back. A mismatch rolls back and gives `RoleConflict`.
8. The 1011 close reason is `internal_error`.
9. `relay_logins_total{result="refused"}` counts every 4401 close, timeouts included. A 1011 close counts as neither ok nor refused.
10. While `cleanup_cutoff` is `None`, the server doesn't call the store at all, so nothing is touched.
11. `a_held_store_lock_does_not_stall_the_relay` is a plain `#[test]`. It runs its body on its own thread, on a `current_thread` runtime, under a 5 s `recv_timeout`. A tokio `timeout` on the same runtime could never fire if a store call blocked that runtime.

**Test-first record.** The unit tests in `relay-core` and `relay-server` (store, log, metrics, settings and lib) were each written first, against `todo!()` stubs, and seen red. These were not seen red:
- `store_errors_have_log_codes` passed at once, because `code()` was written with the type.
- The two matcher self-tests passed at once; they test test helpers.
- The 7 e2e tests in `storage.rs` were written after the server code and passed on their first run.

Each e2e test was then mutation-checked: break the code it guards, see it fail, restore the code.
- Remove cleanup's touch of online devices: `devices_unseen…` fails.
- Remove the `aborted` checks in `Leave`: `devices_unseen…` fails, because the touch count changes.
- Skip `/metrics` auth: `metrics_need…` fails.
- Make store calls inline instead of on `spawn_blocking`: `a_held_store_lock…` fails at 5 s.
- Close a store error with 4401 instead of 1011: `a_store_error_at_login…` fails.
- Return early on a `peers_of` error at leave: `a_store_error_at_leave…` fails.
- Delete the file on open: `storage_survives…` fails.
- Plant the canary in the database: `the_canary…` fails, finding it in the `-wal`.

**Checks:**
- `cargo clippy --workspace --all-targets -D warnings` is clean, and `cargo fmt --check` is clean.
- `cargo test --locked` builds.
- `cargo tree -p relay-core -e normal` shows no `rusqlite`, `libsqlite3-sys`, `tokio` or `axum`.
- `cargo tree -p relay-server -e normal,features -i rusqlite` shows 0.40.2 with feature `bundled`.
- No `src/`, `src-tauri/`, `mobile/` or `packages/protocol` changes.

**Follow-ups, not done here:** none.


//! The relay's SQLite store: `relay_core::Store` on one `Mutex<Connection>`.
//!
//! Schema (`user_version` 1, keys as BLOB, times in Unix ms):
//! `devices(id, role, first_seen, last_seen)`,
//! `pairs(pair_id, mac, phone, mac_static, phone_static, slot, paired_at, sig_m, acked)`,
//! `push_tokens(phone, token, env, updated)`. Pairs and tokens go with their devices
//! (`ON DELETE CASCADE`). Errors carry only a code.

use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use relay_core::{
    CleanupCounts, DeviceRecord, PairDirectory, PairRecord, Registered, Store, StoreCounts,
    StoreError,
};
use relay_protocol::{Bytes, DeviceKey, PairId, PairInfo, Role};
use rusqlite::{params, Connection, ErrorCode, OptionalExtension, Row};

/// The schema version this build writes and reads.
pub const SCHEMA_VERSION: i64 = 1;

/// Cleanup deletes at most this many devices per transaction.
pub const CLEANUP_BATCH: usize = 500;

/// How long a call waits for a lock held by another connection.
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

const SCHEMA: &str = "
CREATE TABLE devices (
    id BLOB PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('mac', 'phone')),
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
);
CREATE TABLE pairs (
    pair_id BLOB PRIMARY KEY,
    mac BLOB NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    phone BLOB NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
    mac_static BLOB NOT NULL,
    phone_static BLOB NOT NULL,
    slot BLOB NOT NULL,
    paired_at INTEGER NOT NULL,
    sig_m BLOB NOT NULL,
    acked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX pairs_mac ON pairs (mac);
CREATE INDEX pairs_phone ON pairs (phone);
CREATE TABLE push_tokens (
    phone BLOB PRIMARY KEY REFERENCES devices (id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    env TEXT NOT NULL,
    updated INTEGER NOT NULL
);
";

/// Per-connection scratch tables for cleanup: the online list and the current batch.
const CLEANUP_TABLES: &str = "
CREATE TEMP TABLE IF NOT EXISTS cleanup_online (id BLOB PRIMARY KEY);
CREATE TEMP TABLE IF NOT EXISTS cleanup_batch (id BLOB PRIMARY KEY);
";

/// A SQLite error as a log code. Never the message, which can quote values.
fn code(e: rusqlite::Error) -> StoreError {
    StoreError::Failed(match e.sqlite_error_code() {
        Some(ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked) => "busy",
        Some(ErrorCode::NotADatabase) => "not_a_database",
        Some(ErrorCode::DatabaseCorrupt) => "corrupt",
        Some(ErrorCode::DiskFull) => "disk_full",
        Some(ErrorCode::CannotOpen) => "cannot_open",
        Some(ErrorCode::ReadOnly) => "read_only",
        Some(ErrorCode::ConstraintViolation) => "constraint",
        _ => "sqlite",
    })
}

/// Times are Unix ms, stored as INTEGER.
fn ms(t: u64) -> i64 {
    i64::try_from(t).unwrap_or(i64::MAX)
}

fn bytes<const N: usize>(row: &Row, i: usize) -> rusqlite::Result<Bytes<N>> {
    let v: Vec<u8> = row.get(i)?;
    <[u8; N]>::try_from(v.as_slice()).map(Bytes).map_err(|_| {
        rusqlite::Error::InvalidColumnType(i, "blob".into(), rusqlite::types::Type::Blob)
    })
}

fn time(row: &Row, i: usize) -> rusqlite::Result<u64> {
    let t: i64 = row.get(i)?;
    Ok(u64::try_from(t).unwrap_or(0))
}

fn role_of(text: &str) -> Result<Role, StoreError> {
    match text {
        "mac" => Ok(Role::Mac),
        "phone" => Ok(Role::Phone),
        _ => Err(StoreError::Failed("bad_row")),
    }
}

/// SQLite behind `relay_core::Store`.
pub struct SqliteStore {
    conn: Mutex<Connection>,
    /// Calls that have asked for `conn`, and calls that have got it. The difference is
    /// how many are waiting; cleanup lets those in between its batches.
    entered: AtomicU64,
    acquired: AtomicU64,
    /// Cleanup batches committed, ever.
    batches: AtomicU64,
    /// Held for a whole cleanup, so two cleanups never share its temp tables.
    cleanup: Mutex<()>,
    /// Tests only: called at the start of each cleanup batch, with the connection held
    /// and the number of batches committed so far.
    #[cfg(test)]
    batch_hook: Mutex<Option<Box<dyn Fn(u64) + Send>>>,
}

impl SqliteStore {
    /// Opens (creating if needed) the database at `path`: WAL, foreign keys on, a busy
    /// timeout, and schema version 1. A newer schema is refused.
    pub fn open(path: &Path) -> Result<Self, StoreError> {
        let conn = Connection::open(path).map_err(code)?;
        conn.busy_timeout(BUSY_TIMEOUT).map_err(code)?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(code)?;
        let mode: String = conn
            .query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))
            .map_err(code)?;
        if !mode.eq_ignore_ascii_case("wal") {
            return Err(StoreError::Failed("no_wal"));
        }
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(code)?;
        if version > SCHEMA_VERSION {
            return Err(StoreError::Failed("newer_schema"));
        }
        if version == 0 {
            conn.execute_batch(&format!(
                "BEGIN; {SCHEMA} PRAGMA user_version = {SCHEMA_VERSION}; COMMIT;"
            ))
            .map_err(code)?;
        }
        conn.execute_batch(CLEANUP_TABLES).map_err(code)?;
        Ok(SqliteStore {
            conn: Mutex::new(conn),
            entered: AtomicU64::new(0),
            acquired: AtomicU64::new(0),
            batches: AtomicU64::new(0),
            cleanup: Mutex::new(()),
            #[cfg(test)]
            batch_hook: Mutex::new(None),
        })
    }

    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.entered.fetch_add(1, Ordering::SeqCst);
        let guard = self.conn.lock().unwrap_or_else(PoisonError::into_inner);
        self.acquired.fetch_add(1, Ordering::SeqCst);
        guard
    }

    /// Lets in every call that was already waiting for the connection, before the
    /// caller takes it again. `std::sync::Mutex` is not fair: without this, a cleanup
    /// that re-locks straight after a batch can keep a login waiting through every
    /// batch. Calls that arrive later don't extend the wait.
    fn hand_over(&self) {
        let queued = self.entered.load(Ordering::SeqCst);
        while self.acquired.load(Ordering::SeqCst) < queued {
            std::thread::yield_now();
        }
    }

    /// How many calls are waiting for the connection.
    #[cfg(test)]
    fn waiting(&self) -> u64 {
        self.entered.load(Ordering::SeqCst) - self.acquired.load(Ordering::SeqCst)
    }
}

impl PairDirectory for SqliteStore {
    fn peers_of(&self, id: &DeviceKey) -> Result<Vec<PairInfo>, StoreError> {
        let conn = self.conn();
        let mut stmt = conn
            .prepare_cached(
                "SELECT pair_id, mac, phone FROM pairs WHERE mac = ?1 OR phone = ?1 ORDER BY rowid",
            )
            .map_err(code)?;
        let rows = stmt
            .query_map([&id.0[..]], |r| {
                Ok((bytes::<16>(r, 0)?, bytes::<32>(r, 1)?, bytes::<32>(r, 2)?))
            })
            .map_err(code)?;
        let mut peers = Vec::new();
        for row in rows {
            let (pair_id, mac, phone) = row.map_err(code)?;
            peers.push(if mac == *id {
                PairInfo {
                    pair_id,
                    peer_id: phone,
                    peer_role: Role::Phone,
                }
            } else {
                PairInfo {
                    pair_id,
                    peer_id: mac,
                    peer_role: Role::Mac,
                }
            });
        }
        Ok(peers)
    }
}

impl Store for SqliteStore {
    fn device(&self, id: &DeviceKey) -> Result<Option<DeviceRecord>, StoreError> {
        let row = self
            .conn()
            .query_row(
                "SELECT role, first_seen, last_seen FROM devices WHERE id = ?1",
                [&id.0[..]],
                |r| Ok((r.get::<_, String>(0)?, time(r, 1)?, time(r, 2)?)),
            )
            .optional()
            .map_err(code)?;
        match row {
            None => Ok(None),
            Some((role, first_seen, last_seen)) => Ok(Some(DeviceRecord {
                id: *id,
                role: role_of(&role)?,
                first_seen,
                last_seen,
            })),
        }
    }

    fn register(&self, id: &DeviceKey, role: Role, now: u64) -> Result<Registered, StoreError> {
        let mut conn = self.conn();
        let tx = conn.transaction().map_err(code)?;
        let existed = tx
            .query_row("SELECT 1 FROM devices WHERE id = ?1", [&id.0[..]], |_| {
                Ok(())
            })
            .optional()
            .map_err(code)?
            .is_some();
        tx.execute(
            "INSERT INTO devices (id, role, first_seen, last_seen) VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT (id) DO UPDATE SET last_seen = excluded.last_seen
             WHERE devices.role = excluded.role",
            params![&id.0[..], role.as_str(), ms(now)],
        )
        .map_err(code)?;
        let stored: String = tx
            .query_row("SELECT role FROM devices WHERE id = ?1", [&id.0[..]], |r| {
                r.get(0)
            })
            .map_err(code)?;
        if stored != role.as_str() {
            // Dropping the transaction rolls it back; nothing was changed anyway.
            return Err(StoreError::RoleConflict);
        }
        tx.commit().map_err(code)?;
        Ok(Registered { new: !existed })
    }

    fn touch(&self, id: &DeviceKey, now: u64) -> Result<bool, StoreError> {
        let changed = self
            .conn()
            .execute(
                "UPDATE devices SET last_seen = ?2 WHERE id = ?1",
                params![&id.0[..], ms(now)],
            )
            .map_err(code)?;
        Ok(changed > 0)
    }

    fn insert_pair(&self, p: &PairRecord) -> Result<(), StoreError> {
        self.conn()
            .execute(
                "INSERT INTO pairs (pair_id, mac, phone, mac_static, phone_static, slot,
                                    paired_at, sig_m, acked)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    &p.pair_id.0[..],
                    &p.mac.0[..],
                    &p.phone.0[..],
                    &p.mac_static.0[..],
                    &p.phone_static.0[..],
                    &p.slot.0[..],
                    ms(p.paired_at),
                    &p.sig_m.0[..],
                    p.acked,
                ],
            )
            .map_err(code)?;
        Ok(())
    }

    fn pair(&self, pair_id: &PairId) -> Result<Option<PairRecord>, StoreError> {
        self.conn()
            .query_row(
                "SELECT pair_id, mac, phone, mac_static, phone_static, slot, paired_at, sig_m,
                        acked
                 FROM pairs WHERE pair_id = ?1",
                [&pair_id.0[..]],
                |r| {
                    Ok(PairRecord {
                        pair_id: bytes(r, 0)?,
                        mac: bytes(r, 1)?,
                        phone: bytes(r, 2)?,
                        mac_static: bytes(r, 3)?,
                        phone_static: bytes(r, 4)?,
                        slot: bytes(r, 5)?,
                        paired_at: time(r, 6)?,
                        sig_m: bytes(r, 7)?,
                        acked: r.get(8)?,
                    })
                },
            )
            .optional()
            .map_err(code)
    }

    fn set_acked(&self, pair_id: &PairId) -> Result<bool, StoreError> {
        let changed = self
            .conn()
            .execute(
                "UPDATE pairs SET acked = 1 WHERE pair_id = ?1",
                [&pair_id.0[..]],
            )
            .map_err(code)?;
        Ok(changed > 0)
    }

    fn delete_pair(&self, pair_id: &PairId) -> Result<bool, StoreError> {
        let changed = self
            .conn()
            .execute("DELETE FROM pairs WHERE pair_id = ?1", [&pair_id.0[..]])
            .map_err(code)?;
        Ok(changed > 0)
    }

    fn put_push_token(
        &self,
        phone: &DeviceKey,
        token: &str,
        env: &str,
        now: u64,
    ) -> Result<(), StoreError> {
        self.conn()
            .execute(
                "INSERT INTO push_tokens (phone, token, env, updated) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT (phone) DO UPDATE
                 SET token = excluded.token, env = excluded.env, updated = excluded.updated",
                params![&phone.0[..], token, env, ms(now)],
            )
            .map_err(code)?;
        Ok(())
    }

    fn cleanup(
        &self,
        now: u64,
        cutoff: u64,
        online: &[DeviceKey],
    ) -> Result<CleanupCounts, StoreError> {
        let _cleanup = self.cleanup.lock().unwrap_or_else(PoisonError::into_inner);
        let mut counts = CleanupCounts::default();

        // Online devices first, in one transaction: a crash skips their leave, so their
        // last_seen may be as old as their login.
        {
            let mut conn = self.conn();
            let tx = conn.transaction().map_err(code)?;
            tx.execute("DELETE FROM temp.cleanup_online", [])
                .map_err(code)?;
            for id in online {
                tx.execute(
                    "INSERT OR IGNORE INTO temp.cleanup_online (id) VALUES (?1)",
                    [&id.0[..]],
                )
                .map_err(code)?;
                counts.touched += tx
                    .execute(
                        "UPDATE devices SET last_seen = MAX(last_seen, ?2) WHERE id = ?1",
                        params![&id.0[..], ms(now)],
                    )
                    .map_err(code)? as u64;
            }
            tx.commit().map_err(code)?;
        }
        self.hand_over();

        // Then batches, each its own transaction. Between batches the connection is
        // handed over to every call already waiting for it. Each batch picks its devices
        // again, and the delete applies the cutoff and the online list itself.
        loop {
            let mut conn = self.conn();
            #[cfg(test)]
            if let Some(hook) = &*self.batch_hook.lock().unwrap() {
                hook(self.batches.load(Ordering::SeqCst));
            }
            let tx = conn.transaction().map_err(code)?;
            tx.execute("DELETE FROM temp.cleanup_batch", [])
                .map_err(code)?;
            tx.execute(
                "INSERT INTO temp.cleanup_batch (id)
                 SELECT id FROM devices
                 WHERE last_seen <= ?1 AND id NOT IN (SELECT id FROM temp.cleanup_online)
                 LIMIT ?2",
                params![ms(cutoff), CLEANUP_BATCH as i64],
            )
            .map_err(code)?;
            let pair_ids: Vec<PairId> = {
                let mut stmt = tx
                    .prepare(
                        "SELECT pair_id FROM pairs
                         WHERE mac IN (SELECT id FROM temp.cleanup_batch)
                            OR phone IN (SELECT id FROM temp.cleanup_batch)
                         ORDER BY rowid",
                    )
                    .map_err(code)?;
                let rows = stmt.query_map([], |r| bytes::<16>(r, 0)).map_err(code)?;
                rows.collect::<Result<_, _>>().map_err(code)?
            };
            let tokens: i64 = tx
                .query_row(
                    "SELECT count(*) FROM push_tokens
                     WHERE phone IN (SELECT id FROM temp.cleanup_batch)",
                    [],
                    |r| r.get(0),
                )
                .map_err(code)?;
            let deleted: Vec<DeviceKey> = {
                let mut stmt = tx
                    .prepare(
                        "DELETE FROM devices
                         WHERE id IN (SELECT id FROM temp.cleanup_batch)
                           AND last_seen <= ?1
                           AND id NOT IN (SELECT id FROM temp.cleanup_online)
                         RETURNING id",
                    )
                    .map_err(code)?;
                let rows = stmt
                    .query_map([ms(cutoff)], |r| bytes::<32>(r, 0))
                    .map_err(code)?;
                rows.collect::<Result<_, _>>().map_err(code)?
            };
            tx.commit().map_err(code)?;
            drop(conn);
            self.batches.fetch_add(1, Ordering::SeqCst);
            if deleted.is_empty() {
                break;
            }
            self.hand_over();
            counts.devices += deleted.len() as u64;
            counts.pairs += pair_ids.len() as u64;
            counts.push_tokens += tokens as u64;
            counts.deleted.extend(deleted);
            counts.deleted_pairs.extend(pair_ids);
        }
        Ok(counts)
    }

    fn counts(&self) -> Result<StoreCounts, StoreError> {
        self.conn()
            .query_row(
                "SELECT (SELECT count(*) FROM devices),
                        (SELECT count(*) FROM pairs),
                        (SELECT count(*) FROM pairs WHERE acked),
                        (SELECT count(*) FROM push_tokens)",
                [],
                |r| {
                    let n = |i| r.get::<_, i64>(i).map(|v| v as u64);
                    Ok(StoreCounts {
                        devices: n(0)?,
                        pairs: n(1)?,
                        pairs_acked: n(2)?,
                        push_tokens: n(3)?,
                    })
                },
            )
            .map_err(code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use relay_core::store::CLEANUP_AGE_MS;
    use relay_core::Clock;
    use relay_core::{cleanup_cutoff, ManualClock};
    use relay_protocol::Bytes;
    use std::sync::Arc;

    const NOW: u64 = relay_core::clock::MANUAL_CLOCK_START_MS + 200 * 24 * 3600 * 1000;

    fn temp() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("relay.db");
        (dir, path)
    }

    fn key(n: u16) -> DeviceKey {
        let mut k = [0u8; 32];
        k[..2].copy_from_slice(&n.to_be_bytes());
        k[31] = 0xAA;
        Bytes(k)
    }

    fn pid(n: u8) -> PairId {
        Bytes([n; 16])
    }

    fn pair(id: u8, mac: DeviceKey, phone: DeviceKey) -> PairRecord {
        PairRecord {
            pair_id: pid(id),
            mac,
            phone,
            mac_static: Bytes([3; 32]),
            phone_static: Bytes([4; 32]),
            slot: Bytes([5; 16]),
            paired_at: NOW - 10,
            sig_m: Bytes([6; 64]),
            acked: false,
        }
    }

    #[test]
    fn values_survive_a_reopen_acked_included() {
        let (_dir, path) = temp();
        let (mac, phone) = (key(1), key(2));
        {
            let s = SqliteStore::open(&path).unwrap();
            s.register(&mac, Role::Mac, NOW - 100).unwrap();
            s.register(&phone, Role::Phone, NOW - 50).unwrap();
            s.insert_pair(&pair(9, mac, phone)).unwrap();
            assert!(s.set_acked(&pid(9)).unwrap());
            s.put_push_token(&phone, "tok", "production", NOW).unwrap();
        }
        let s = SqliteStore::open(&path).unwrap();
        assert_eq!(
            s.device(&mac).unwrap(),
            Some(DeviceRecord {
                id: mac,
                role: Role::Mac,
                first_seen: NOW - 100,
                last_seen: NOW - 100
            })
        );
        assert_eq!(s.device(&phone).unwrap().unwrap().role, Role::Phone);
        let mut want = pair(9, mac, phone);
        want.acked = true;
        assert_eq!(s.pair(&pid(9)).unwrap(), Some(want));
        assert_eq!(
            s.counts().unwrap(),
            StoreCounts {
                devices: 2,
                pairs: 1,
                pairs_acked: 1,
                push_tokens: 1
            }
        );
    }

    #[test]
    fn the_tables_are_exactly_devices_pairs_and_push_tokens() {
        let (_dir, path) = temp();
        drop(SqliteStore::open(&path).unwrap());
        let conn = Connection::open(&path).unwrap();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        let names: Vec<String> = stmt
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(names, vec!["devices", "pairs", "push_tokens"]);
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 1);
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        assert!(s.insert_pair(&pair(1, key(1), key(2))).is_err());
    }

    #[test]
    fn a_newer_user_version_is_refused() {
        let (_dir, path) = temp();
        drop(SqliteStore::open(&path).unwrap());
        Connection::open(&path)
            .unwrap()
            .execute_batch("PRAGMA user_version = 2")
            .unwrap();
        assert_eq!(
            SqliteStore::open(&path).err(),
            Some(StoreError::Failed("newer_schema"))
        );
    }

    #[test]
    fn a_file_that_is_not_a_database_is_refused() {
        let (_dir, path) = temp();
        std::fs::write(&path, vec![0x42; 4096]).unwrap();
        assert!(SqliteStore::open(&path).is_err());
    }

    #[test]
    fn a_device_unseen_for_exactly_90_days_is_deleted_and_one_ms_less_is_kept() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        let cutoff = cleanup_cutoff(NOW).unwrap();
        s.register(&key(1), Role::Phone, NOW - CLEANUP_AGE_MS)
            .unwrap();
        s.register(&key(2), Role::Phone, NOW - CLEANUP_AGE_MS + 1)
            .unwrap();
        let counts = s.cleanup(NOW, cutoff, &[]).unwrap();
        assert_eq!(counts.devices, 1);
        assert_eq!(counts.deleted, vec![key(1)]);
        assert_eq!(s.device(&key(1)).unwrap(), None);
        assert!(s.device(&key(2)).unwrap().is_some());
    }

    #[test]
    fn register_then_cleanup_at_now_minus_90_days_keeps_the_device() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        // Seen long ago, then logs in now: the login moves last_seen.
        s.register(&key(1), Role::Mac, NOW - 2 * CLEANUP_AGE_MS)
            .unwrap();
        assert_eq!(
            s.register(&key(1), Role::Mac, NOW).unwrap(),
            Registered { new: false }
        );
        let counts = s.cleanup(NOW, NOW - CLEANUP_AGE_MS, &[]).unwrap();
        assert_eq!(counts.devices, 0);
        let d = s.device(&key(1)).unwrap().unwrap();
        assert_eq!((d.first_seen, d.last_seen), (NOW - 2 * CLEANUP_AGE_MS, NOW));
    }

    #[test]
    fn an_online_device_is_spared_and_touched() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        s.register(&key(1), Role::Mac, NOW - 2 * CLEANUP_AGE_MS)
            .unwrap();
        s.register(&key(2), Role::Mac, NOW - 2 * CLEANUP_AGE_MS)
            .unwrap();
        let counts = s.cleanup(NOW, NOW - CLEANUP_AGE_MS, &[key(1)]).unwrap();
        assert_eq!(counts.touched, 1);
        assert_eq!(counts.deleted, vec![key(2)]);
        assert_eq!(s.device(&key(1)).unwrap().unwrap().last_seen, NOW);
    }

    #[test]
    fn cleanup_deletes_pairs_and_tokens_with_their_device() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        let (mac, stale_phone, other_phone) = (key(1), key(2), key(3));
        s.register(&mac, Role::Mac, NOW).unwrap();
        s.register(&stale_phone, Role::Phone, NOW - CLEANUP_AGE_MS)
            .unwrap();
        s.register(&other_phone, Role::Phone, NOW).unwrap();
        s.insert_pair(&pair(1, mac, stale_phone)).unwrap();
        s.insert_pair(&pair(2, mac, other_phone)).unwrap();
        s.put_push_token(&stale_phone, "a", "production", NOW)
            .unwrap();
        s.put_push_token(&other_phone, "b", "sandbox", NOW).unwrap();

        let counts = s.cleanup(NOW, cleanup_cutoff(NOW).unwrap(), &[]).unwrap();
        assert_eq!(
            counts,
            CleanupCounts {
                touched: 0,
                devices: 1,
                pairs: 1,
                push_tokens: 1,
                deleted: vec![stale_phone],
                deleted_pairs: vec![pid(1)],
            }
        );
        assert_eq!(s.pair(&pid(1)).unwrap(), None);
        assert!(s.pair(&pid(2)).unwrap().is_some());
        assert_eq!(s.peers_of(&mac).unwrap().len(), 1);
        assert_eq!(s.counts().unwrap().push_tokens, 1);
    }

    #[test]
    fn an_online_device_is_spared_even_when_the_touch_cannot_save_it() {
        // With now == cutoff, the touch moves last_seen only to the cutoff itself, which
        // is still deletable: only the online exclusion in the delete keeps the device.
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        s.register(&key(1), Role::Phone, NOW - 10).unwrap();
        s.register(&key(2), Role::Phone, NOW - 10).unwrap();
        let counts = s.cleanup(NOW, NOW, &[key(1)]).unwrap();
        assert_eq!(counts.touched, 1);
        assert_eq!(counts.deleted, vec![key(2)]);
        assert_eq!(s.device(&key(1)).unwrap().unwrap().last_seen, NOW);
    }

    /// Built on the review's probe: a call that is waiting while cleanup runs gets the
    /// connection between batches, not after the whole cleanup. Deterministic: the probe
    /// is queued before cleanup starts, and reads the batch count while it holds the
    /// connection, as `device()` would.
    #[test]
    fn a_call_waiting_during_cleanup_gets_in_between_batches() {
        let (_dir, path) = temp();
        let s = Arc::new(SqliteStore::open(&path).unwrap());
        let stale = (CLEANUP_BATCH * 20) as u16;
        {
            let mut conn = s.conn();
            let tx = conn.transaction().unwrap();
            for n in 0..stale {
                tx.execute(
                    "INSERT INTO devices (id, role, first_seen, last_seen) VALUES (?1, 'phone', 0, 0)",
                    [&key(n).0[..]],
                )
                .unwrap();
            }
            tx.commit().unwrap();
        }

        let held = s.conn();
        let cleaner = {
            let s = s.clone();
            std::thread::spawn(move || s.cleanup(NOW, cleanup_cutoff(NOW).unwrap(), &[]))
        };
        wait_until(|| s.waiting() == 1);
        let prober = {
            let s = s.clone();
            std::thread::spawn(move || {
                let _conn = s.conn();
                s.batches.load(Ordering::SeqCst)
            })
        };
        wait_until(|| s.waiting() == 2);
        drop(held);

        let batches_seen = prober.join().unwrap();
        let counts = cleaner.join().unwrap().unwrap();
        assert_eq!(counts.devices, u64::from(stale));
        assert_eq!(
            batches_seen,
            0,
            "the waiting call got in only after {batches_seen} of {} batches",
            s.batches.load(Ordering::SeqCst)
        );
        assert_eq!(s.device(&key(60_000)).unwrap(), None);
    }

    /// 7a's deferred gap, closed in 7b: the `hand_over()` inside the batch loop. A call
    /// queues for the connection while batch 2 holds it (a test-only hook at each batch's
    /// start), and is let in 100 ms after batch 2 has committed. Batch 3 must not start
    /// before it is in. The queued call is the store's own count of callers that have
    /// asked for the connection and got it, which is what `hand_over` waits on; a real
    /// thread on the mutex can win the lock between batches even without `hand_over`, so
    /// it can't show the hand-over is there.
    #[test]
    fn a_call_queued_during_a_later_batch_gets_in_before_the_next_batch() {
        let (_dir, path) = temp();
        let s = Arc::new(SqliteStore::open(&path).unwrap());
        let stale = (CLEANUP_BATCH * 4) as u16;
        {
            let mut conn = s.conn();
            let tx = conn.transaction().unwrap();
            for n in 0..stale {
                tx.execute(
                    "INSERT INTO devices (id, role, first_seen, last_seen) VALUES (?1, 'phone', 0, 0)",
                    [&key(n).0[..]],
                )
                .unwrap();
            }
            tx.commit().unwrap();
        }

        let let_in = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let in_at_batch_3 = Arc::new(Mutex::new(None));
        {
            let weak = Arc::downgrade(&s);
            let (let_in, in_at_batch_3) = (let_in.clone(), in_at_batch_3.clone());
            *s.batch_hook.lock().unwrap() = Some(Box::new(move |committed| match committed {
                // Batch 2 holds the connection: a call asks for it.
                1 => {
                    let s = weak.upgrade().unwrap();
                    s.entered.fetch_add(1, Ordering::SeqCst);
                    let let_in = let_in.clone();
                    std::thread::spawn(move || {
                        wait_until(|| s.batches.load(Ordering::SeqCst) >= 2);
                        std::thread::sleep(std::time::Duration::from_millis(100));
                        let_in.store(true, Ordering::SeqCst);
                        s.acquired.fetch_add(1, Ordering::SeqCst);
                    });
                }
                2 => *in_at_batch_3.lock().unwrap() = Some(let_in.load(Ordering::SeqCst)),
                _ => {}
            }));
        }
        let counts = s.cleanup(NOW, cleanup_cutoff(NOW).unwrap(), &[]).unwrap();
        *s.batch_hook.lock().unwrap() = None;
        assert_eq!(counts.devices, u64::from(stale));
        assert_eq!(
            *in_at_batch_3.lock().unwrap(),
            Some(true),
            "batch 3 started before the call queued during batch 2 got the connection"
        );
    }

    fn wait_until(cond: impl Fn() -> bool) {
        let started = std::time::Instant::now();
        while !cond() {
            assert!(
                started.elapsed() < std::time::Duration::from_secs(5),
                "timed out"
            );
            std::thread::sleep(std::time::Duration::from_millis(1));
        }
    }

    #[test]
    fn cleanup_works_through_more_than_one_batch() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        let stale = (CLEANUP_BATCH * 2 + 3) as u16;
        for n in 0..stale {
            s.register(&key(n), Role::Phone, NOW - CLEANUP_AGE_MS - 1)
                .unwrap();
        }
        s.register(&key(60_000), Role::Phone, NOW).unwrap();
        let counts = s.cleanup(NOW, cleanup_cutoff(NOW).unwrap(), &[]).unwrap();
        assert_eq!(counts.devices, u64::from(stale));
        assert_eq!(counts.deleted.len(), stale as usize);
        assert_eq!(s.counts().unwrap().devices, 1);
    }

    #[test]
    fn a_role_conflict_is_refused() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        assert_eq!(
            s.register(&key(1), Role::Phone, NOW - 5).unwrap(),
            Registered { new: true }
        );
        assert_eq!(
            s.register(&key(1), Role::Mac, NOW),
            Err(StoreError::RoleConflict)
        );
        // Left as it was.
        let d = s.device(&key(1)).unwrap().unwrap();
        assert_eq!((d.role, d.last_seen), (Role::Phone, NOW - 5));
    }

    #[test]
    fn touch_on_a_missing_row_returns_false() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        assert!(!s.touch(&key(1), NOW).unwrap());
        s.register(&key(1), Role::Phone, NOW - 5).unwrap();
        assert!(s.touch(&key(1), NOW).unwrap());
        assert_eq!(s.device(&key(1)).unwrap().unwrap().last_seen, NOW);
    }

    #[test]
    fn missing_pairs_are_reported() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        assert!(!s.set_acked(&pid(1)).unwrap());
        assert!(!s.delete_pair(&pid(1)).unwrap());
        assert_eq!(s.pair(&pid(1)).unwrap(), None);
        s.register(&key(1), Role::Mac, NOW).unwrap();
        s.register(&key(2), Role::Phone, NOW).unwrap();
        s.insert_pair(&pair(1, key(1), key(2))).unwrap();
        assert!(s.delete_pair(&pid(1)).unwrap());
        assert_eq!(s.pair(&pid(1)).unwrap(), None);
    }

    #[test]
    fn peers_are_listed_from_each_side_in_pairing_order() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        let (mac, a, b) = (key(1), key(2), key(3));
        s.register(&mac, Role::Mac, NOW).unwrap();
        s.register(&a, Role::Phone, NOW).unwrap();
        s.register(&b, Role::Phone, NOW).unwrap();
        s.insert_pair(&pair(8, mac, b)).unwrap();
        s.insert_pair(&pair(7, mac, a)).unwrap();
        assert_eq!(
            s.peers_of(&mac).unwrap(),
            vec![
                PairInfo {
                    pair_id: pid(8),
                    peer_id: b,
                    peer_role: Role::Phone
                },
                PairInfo {
                    pair_id: pid(7),
                    peer_id: a,
                    peer_role: Role::Phone
                }
            ]
        );
        assert_eq!(
            s.peers_of(&a).unwrap(),
            vec![PairInfo {
                pair_id: pid(7),
                peer_id: mac,
                peer_role: Role::Mac
            }]
        );
        assert!(s.peers_of(&key(4)).unwrap().is_empty());
    }

    #[test]
    fn a_phone_has_one_push_token() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        s.register(&key(2), Role::Phone, NOW).unwrap();
        s.put_push_token(&key(2), "old", "sandbox", NOW - 1)
            .unwrap();
        s.put_push_token(&key(2), "new", "production", NOW).unwrap();
        assert_eq!(s.counts().unwrap().push_tokens, 1);
    }

    #[test]
    fn a_manual_clock_time_round_trips() {
        let (_dir, path) = temp();
        let s = SqliteStore::open(&path).unwrap();
        let now = ManualClock::new().now_ms();
        s.register(&key(1), Role::Mac, now).unwrap();
        assert_eq!(s.device(&key(1)).unwrap().unwrap().first_seen, now);
    }
}

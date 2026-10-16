//! Test helpers shared by the e2e test files (story 7a; story 7b reuses them).
//!
//! - `CountingStore` wraps a `Store`: it counts calls per method, can fail one method at
//!   a time (`fail("register")` while `device` still succeeds), and has a gate that holds
//!   every call until it is released.
//! - `CaptureLog` keeps every log line the relay writes.

#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use relay_core::{
    CleanupCounts, DeviceRecord, PairDirectory, PairRecord, Registered, Store, StoreCounts,
    StoreError,
};
use relay_protocol::{DeviceKey, PairId, PairInfo, Role};
use relay_server::{LogEvent, LogSink};

/// The error a failing method returns.
pub const INJECTED: StoreError = StoreError::Failed("injected");

/// Every `Store` method `CountingStore` counts, by name.
pub const METHODS: [&str; 11] = [
    "peers_of",
    "device",
    "register",
    "touch",
    "insert_pair",
    "pair",
    "set_acked",
    "delete_pair",
    "put_push_token",
    "cleanup",
    "counts",
];

#[derive(Default)]
struct Gate {
    held: bool,
    waiting: usize,
}

/// A `Store` that counts, fails and holds calls on request.
pub struct CountingStore {
    inner: Arc<dyn Store>,
    calls: Mutex<HashMap<&'static str, usize>>,
    failing: Mutex<HashSet<&'static str>>,
    gate: Mutex<Gate>,
    opened: Condvar,
}

impl CountingStore {
    pub fn new(inner: Arc<dyn Store>) -> Arc<Self> {
        Arc::new(CountingStore {
            inner,
            calls: Mutex::new(HashMap::new()),
            failing: Mutex::new(HashSet::new()),
            gate: Mutex::new(Gate::default()),
            opened: Condvar::new(),
        })
    }

    fn known(method: &str) -> &'static str {
        METHODS
            .iter()
            .find(|m| **m == method)
            .unwrap_or_else(|| panic!("no Store method {method:?}"))
    }

    /// How many times `method` has been called.
    pub fn count(&self, method: &str) -> usize {
        let method = Self::known(method);
        self.calls.lock().unwrap().get(method).copied().unwrap_or(0)
    }

    /// From now on, `method` returns `INJECTED` instead of reaching the store.
    pub fn fail(&self, method: &str) {
        self.failing.lock().unwrap().insert(Self::known(method));
    }

    /// `method` reaches the store again.
    pub fn heal(&self, method: &str) {
        self.failing.lock().unwrap().remove(Self::known(method));
    }

    /// Closes the gate: every call from now on waits until `release`.
    pub fn hold(&self) {
        self.gate.lock().unwrap().held = true;
    }

    /// Opens the gate.
    pub fn release(&self) {
        self.gate.lock().unwrap().held = false;
        self.opened.notify_all();
    }

    /// How many calls are waiting at the gate.
    pub fn waiting(&self) -> usize {
        self.gate.lock().unwrap().waiting
    }

    /// Waits (polling) until `cond` holds, for at most 5 s.
    pub async fn until(&self, what: &str, cond: impl Fn(&Self) -> bool) {
        let started = std::time::Instant::now();
        while !cond(self) {
            assert!(
                started.elapsed() < Duration::from_secs(5),
                "timed out waiting for {what}"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    /// Counts the call, waits at the gate, then fails it if asked to.
    fn enter(&self, method: &'static str) -> Result<(), StoreError> {
        *self.calls.lock().unwrap().entry(method).or_default() += 1;
        let mut gate = self.gate.lock().unwrap();
        if gate.held {
            gate.waiting += 1;
            while gate.held {
                gate = self.opened.wait(gate).unwrap();
            }
            gate.waiting -= 1;
        }
        drop(gate);
        if self.failing.lock().unwrap().contains(method) {
            Err(INJECTED)
        } else {
            Ok(())
        }
    }
}

impl PairDirectory for CountingStore {
    fn peers_of(&self, id: &DeviceKey) -> Result<Vec<PairInfo>, StoreError> {
        self.enter("peers_of")?;
        self.inner.peers_of(id)
    }
}

impl Store for CountingStore {
    fn device(&self, id: &DeviceKey) -> Result<Option<DeviceRecord>, StoreError> {
        self.enter("device")?;
        self.inner.device(id)
    }

    fn register(&self, id: &DeviceKey, role: Role, now: u64) -> Result<Registered, StoreError> {
        self.enter("register")?;
        self.inner.register(id, role, now)
    }

    fn touch(&self, id: &DeviceKey, now: u64) -> Result<bool, StoreError> {
        self.enter("touch")?;
        self.inner.touch(id, now)
    }

    fn insert_pair(&self, pair: &PairRecord) -> Result<(), StoreError> {
        self.enter("insert_pair")?;
        self.inner.insert_pair(pair)
    }

    fn pair(&self, pair_id: &PairId) -> Result<Option<PairRecord>, StoreError> {
        self.enter("pair")?;
        self.inner.pair(pair_id)
    }

    fn set_acked(&self, pair_id: &PairId) -> Result<bool, StoreError> {
        self.enter("set_acked")?;
        self.inner.set_acked(pair_id)
    }

    fn delete_pair(&self, pair_id: &PairId) -> Result<bool, StoreError> {
        self.enter("delete_pair")?;
        self.inner.delete_pair(pair_id)
    }

    fn put_push_token(
        &self,
        phone: &DeviceKey,
        token: &str,
        env: &str,
        now: u64,
    ) -> Result<(), StoreError> {
        self.enter("put_push_token")?;
        self.inner.put_push_token(phone, token, env, now)
    }

    fn cleanup(
        &self,
        now: u64,
        cutoff: u64,
        online: &[DeviceKey],
    ) -> Result<CleanupCounts, StoreError> {
        self.enter("cleanup")?;
        self.inner.cleanup(now, cutoff, online)
    }

    fn counts(&self) -> Result<StoreCounts, StoreError> {
        self.enter("counts")?;
        self.inner.counts()
    }
}

/// A log sink that keeps every line.
#[derive(Default)]
pub struct CaptureLog {
    lines: Mutex<Vec<String>>,
}

impl CaptureLog {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn lines(&self) -> Vec<String> {
        self.lines.lock().unwrap().clone()
    }

    /// Whether any line is exactly `line`.
    pub fn has(&self, line: &str) -> bool {
        self.lines.lock().unwrap().iter().any(|l| l == line)
    }
}

impl LogSink for CaptureLog {
    fn log(&self, event: LogEvent) {
        self.lines.lock().unwrap().push(event.render());
    }
}

//! Test helpers shared by the e2e test files (story 7a; story 7b reuses them).
//!
//! - `CountingStore` wraps a `Store`: it counts calls per method, can fail one method at
//!   a time (`fail("register")` while `device` still succeeds), and has a gate that holds
//!   every call (`hold`), or one method's calls (`hold_only`), until it is released.
//!   Story 7b adds `fail_nth` (fail only the nth call to a method) and `hold_nth` (run the
//!   nth call, then hold its result until `Held::release`).
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
    /// Every call waits.
    all: bool,
    /// Calls to these methods wait.
    methods: HashSet<&'static str>,
    waiting: usize,
}

impl Gate {
    fn holds(&self, method: &str) -> bool {
        self.all || self.methods.contains(method)
    }
}

/// One call held by `hold_nth`: it has run, and its result waits for `release`.
#[derive(Default)]
struct HeldState {
    /// (started, released)
    state: Mutex<(bool, bool)>,
    changed: Condvar,
}

/// The handle `hold_nth` gives back. Dropping it releases the call, so a test that
/// panics before `release` fails rather than hangs.
pub struct Held(Arc<HeldState>);

impl Held {
    /// Whether the held call has run and is now waiting.
    pub fn is_started(&self) -> bool {
        self.0.state.lock().unwrap().0
    }

    /// Waits (polling) until the held call has run and is waiting, for at most 5 s.
    pub async fn started(&self) {
        let began = std::time::Instant::now();
        while !self.is_started() {
            assert!(
                began.elapsed() < Duration::from_secs(5),
                "timed out waiting for the held call"
            );
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }

    /// Lets the held call return its result.
    pub fn release(&self) {
        self.0.state.lock().unwrap().1 = true;
        self.0.changed.notify_all();
    }
}

impl Drop for Held {
    fn drop(&mut self) {
        self.release();
    }
}

/// A `Store` that counts, fails and holds calls on request.
pub struct CountingStore {
    inner: Arc<dyn Store>,
    calls: Mutex<HashMap<&'static str, usize>>,
    failing: Mutex<HashSet<&'static str>>,
    /// Single calls to fail, by method and call number (1-based, over all calls).
    fail_once: Mutex<HashSet<(&'static str, usize)>>,
    /// Single calls to hold after they have run, by method and call number.
    hold_once: Mutex<HashMap<(&'static str, usize), Arc<HeldState>>>,
    gate: Mutex<Gate>,
    opened: Condvar,
}

impl CountingStore {
    pub fn new(inner: Arc<dyn Store>) -> Arc<Self> {
        Arc::new(CountingStore {
            inner,
            calls: Mutex::new(HashMap::new()),
            failing: Mutex::new(HashSet::new()),
            fail_once: Mutex::new(HashSet::new()),
            hold_once: Mutex::new(HashMap::new()),
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

    /// The nth call to `method` (counting every call since the store was made, from 1)
    /// returns `INJECTED` without reaching the store; the calls before and after it work.
    pub fn fail_nth(&self, method: &str, n: usize) {
        self.fail_once
            .lock()
            .unwrap()
            .insert((Self::known(method), n));
    }

    /// The nth call to `method` runs on the store, then keeps its result and waits until
    /// the returned `Held` is released (or dropped). Every other call goes through.
    pub fn hold_nth(&self, method: &str, n: usize) -> Held {
        let state = Arc::new(HeldState::default());
        self.hold_once
            .lock()
            .unwrap()
            .insert((Self::known(method), n), state.clone());
        Held(state)
    }

    /// Every call so far, all methods together.
    pub fn total(&self) -> usize {
        self.calls.lock().unwrap().values().sum()
    }

    /// Closes the gate: every call from now on waits until `release`.
    pub fn hold(&self) {
        self.gate.lock().unwrap().all = true;
    }

    /// Closes the gate for `method` only: its calls wait until `release`.
    pub fn hold_only(&self, method: &str) {
        let method = Self::known(method);
        self.gate.lock().unwrap().methods.insert(method);
    }

    /// Opens the gate, for every method.
    pub fn release(&self) {
        let mut gate = self.gate.lock().unwrap();
        gate.all = false;
        gate.methods.clear();
        drop(gate);
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

    /// Counts the call, waits at the gate, then fails it if asked to. Returns the call's
    /// number for `finish`.
    fn enter(&self, method: &'static str) -> Result<usize, StoreError> {
        let n = {
            let mut calls = self.calls.lock().unwrap();
            let count = calls.entry(method).or_default();
            *count += 1;
            *count
        };
        let mut gate = self.gate.lock().unwrap();
        if gate.holds(method) {
            gate.waiting += 1;
            while gate.holds(method) {
                gate = self.opened.wait(gate).unwrap();
            }
            gate.waiting -= 1;
        }
        drop(gate);
        if self.failing.lock().unwrap().contains(method)
            || self.fail_once.lock().unwrap().remove(&(method, n))
        {
            Err(INJECTED)
        } else {
            Ok(n)
        }
    }

    /// Hands back a call's result, first holding it if `hold_nth` asked for this call.
    fn finish<T>(&self, method: &'static str, n: usize, result: T) -> T {
        let held = self.hold_once.lock().unwrap().remove(&(method, n));
        if let Some(held) = held {
            let mut state = held.state.lock().unwrap();
            state.0 = true;
            held.changed.notify_all();
            while !state.1 {
                state = held.changed.wait(state).unwrap();
            }
        }
        result
    }
}

impl PairDirectory for CountingStore {
    fn peers_of(&self, id: &DeviceKey) -> Result<Vec<PairInfo>, StoreError> {
        let n = self.enter("peers_of")?;
        self.finish("peers_of", n, self.inner.peers_of(id))
    }
}

impl Store for CountingStore {
    fn device(&self, id: &DeviceKey) -> Result<Option<DeviceRecord>, StoreError> {
        let n = self.enter("device")?;
        self.finish("device", n, self.inner.device(id))
    }

    fn register(&self, id: &DeviceKey, role: Role, now: u64) -> Result<Registered, StoreError> {
        let n = self.enter("register")?;
        self.finish("register", n, self.inner.register(id, role, now))
    }

    fn touch(&self, id: &DeviceKey, now: u64) -> Result<bool, StoreError> {
        let n = self.enter("touch")?;
        self.finish("touch", n, self.inner.touch(id, now))
    }

    fn insert_pair(&self, pair: &PairRecord) -> Result<(), StoreError> {
        let n = self.enter("insert_pair")?;
        self.finish("insert_pair", n, self.inner.insert_pair(pair))
    }

    fn pair(&self, pair_id: &PairId) -> Result<Option<PairRecord>, StoreError> {
        let n = self.enter("pair")?;
        self.finish("pair", n, self.inner.pair(pair_id))
    }

    fn set_acked(&self, pair_id: &PairId) -> Result<bool, StoreError> {
        let n = self.enter("set_acked")?;
        self.finish("set_acked", n, self.inner.set_acked(pair_id))
    }

    fn delete_pair(&self, pair_id: &PairId) -> Result<bool, StoreError> {
        let n = self.enter("delete_pair")?;
        self.finish("delete_pair", n, self.inner.delete_pair(pair_id))
    }

    fn put_push_token(
        &self,
        phone: &DeviceKey,
        token: &str,
        env: &str,
        now: u64,
    ) -> Result<(), StoreError> {
        let n = self.enter("put_push_token")?;
        self.finish(
            "put_push_token",
            n,
            self.inner.put_push_token(phone, token, env, now),
        )
    }

    fn cleanup(
        &self,
        now: u64,
        cutoff: u64,
        online: &[DeviceKey],
    ) -> Result<CleanupCounts, StoreError> {
        let n = self.enter("cleanup")?;
        self.finish("cleanup", n, self.inner.cleanup(now, cutoff, online))
    }

    fn counts(&self) -> Result<StoreCounts, StoreError> {
        let n = self.enter("counts")?;
        self.finish("counts", n, self.inner.counts())
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

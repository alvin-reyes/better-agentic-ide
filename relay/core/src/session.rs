//! Story 4: the Noise session machines, sans-IO. Time is passed in (`now`, a
//! monotonic millisecond clock; `wall_ms` only for the phone's counter), and the
//! stores are injected traits. `MacSessions` is the Mac's side (one per Mac identity
//! and relay), `PhoneSession` the phone's (one per Mac and relay), used by the
//! in-process tests and by story 5a's CLI phone.
//!
//! Restart rules (owner decisions, 2026-10-16): one 10 s restart window per (peer,
//! relay) on each side, shared by every trigger. A trigger inside it is coalesced into
//! one deferred start at the window's end, dropped if a session completes first. A
//! phone handshake with no `hs2` gets one retry 10 s later.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use relay_protocol::{
    read_hs1, DeviceKey, HandshakeError, Initiator, Opened, Routed, RoutedKind, Session,
    StaticKeypair, MAX_COUNTER, MAX_PLAINTEXT, NONCE_CEILING,
};

/// The restart window: at most one start (or `Rehandshake`) per 10 s per (peer, relay).
pub const RESTART_WINDOW_MS: u64 = 10_000;
/// A phone handshake with no `hs2` is retried once, this long after it started.
pub const RETRY_MS: u64 = 10_000;
/// An armed newer handshake with no `hs2` this long after its start raises a trigger.
pub const HANGING_MS: u64 = 10_000;
/// The phone handshakes again this long after a session completed.
pub const MAX_SESSION_AGE_MS: u64 = 86_400_000;
/// An outstanding handshake expires this long after it started.
pub const OUTSTANDING_TTL_MS: u64 = 86_400_000;
/// The phone keeps at most this many outstanding handshakes, dropping the oldest.
pub const MAX_OUTSTANDING: usize = 4;

// --- Stores ---------------------------------------------------------------------------

/// Why a store couldn't give or record a counter.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StoreError {
    /// The store failed (a write, a read).
    Failed(String),
    /// The phone's counter would pass 2^53 - 1.
    Exhausted,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Failed(why) => write!(f, "store failed: {why}"),
            StoreError::Exhausted => f.write_str("hs1 counter exhausted"),
        }
    }
}

impl std::error::Error for StoreError {}

/// The Mac's last accepted `hs1` counter per (Mac key, phone key). No pair id, no
/// relay: it survives an unpair and is shared by every relay.
pub trait Hs1Counters: Send + Sync {
    /// Records `v` and returns true if it is above the last accepted for (mac, phone),
    /// in one atomic step; otherwise records nothing and returns false.
    fn accept_if_above(
        &self,
        mac: &DeviceKey,
        phone: &DeviceKey,
        v: u64,
    ) -> Result<bool, StoreError>;
}

/// The phone statics `S_P` the Mac is paired with, for one phone identity key.
pub trait PairedStatics: Send + Sync {
    fn statics(&self, mac: &DeviceKey, phone: &DeviceKey) -> Vec<[u8; 32]>;
}

/// The phone's `last_sent` counter per Mac key, whatever the relay.
pub trait LastSent: Send + Sync {
    /// `max(wall_ms, last + 1)` (or `wall_ms` if nothing was sent), recorded and
    /// returned in one atomic step.
    fn next_counter(&self, mac: &DeviceKey, wall_ms: u64) -> Result<u64, StoreError>;
}

/// The counter rule both languages share: `max(wall_ms, last + 1)`, at most 2^53 - 1.
pub fn next_counter_value(last: Option<u64>, wall_ms: u64) -> Result<u64, StoreError> {
    let v = match last {
        None => wall_ms,
        Some(last) => wall_ms.max(last.checked_add(1).ok_or(StoreError::Exhausted)?),
    };
    if v > MAX_COUNTER {
        return Err(StoreError::Exhausted);
    }
    Ok(v)
}

/// `Hs1Counters` in memory, over a `Mutex`.
#[derive(Debug, Default)]
pub struct MemoryHs1Counters {
    last: Mutex<HashMap<KeyPair, u64>>,
}

impl MemoryHs1Counters {
    pub fn new() -> Self {
        Self::default()
    }
}

impl Hs1Counters for MemoryHs1Counters {
    fn accept_if_above(
        &self,
        mac: &DeviceKey,
        phone: &DeviceKey,
        v: u64,
    ) -> Result<bool, StoreError> {
        let mut last = self.last.lock().unwrap();
        match last.get(&(*mac, *phone)) {
            Some(&l) if v <= l => Ok(false),
            _ => {
                last.insert((*mac, *phone), v);
                Ok(true)
            }
        }
    }
}

/// (Mac key, phone key).
type KeyPair = (DeviceKey, DeviceKey);

/// `PairedStatics` in memory, seeded by hand until pairing (story 5a) exists.
#[derive(Debug, Default)]
pub struct MemoryPairedStatics {
    statics: Mutex<HashMap<KeyPair, Vec<[u8; 32]>>>,
}

impl MemoryPairedStatics {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a pair between `mac` and `phone`, whose static is `s_p`.
    pub fn add(&self, mac: DeviceKey, phone: DeviceKey, s_p: [u8; 32]) {
        self.statics
            .lock()
            .unwrap()
            .entry((mac, phone))
            .or_default()
            .push(s_p);
    }

    /// Removes one pair with static `s_p`.
    pub fn remove(&self, mac: &DeviceKey, phone: &DeviceKey, s_p: &[u8; 32]) {
        let mut statics = self.statics.lock().unwrap();
        if let Some(list) = statics.get_mut(&(*mac, *phone)) {
            if let Some(i) = list.iter().position(|s| s == s_p) {
                list.remove(i);
            }
        }
    }
}

impl PairedStatics for MemoryPairedStatics {
    fn statics(&self, mac: &DeviceKey, phone: &DeviceKey) -> Vec<[u8; 32]> {
        self.statics
            .lock()
            .unwrap()
            .get(&(*mac, *phone))
            .cloned()
            .unwrap_or_default()
    }
}

/// `LastSent` in memory, over a `Mutex`.
#[derive(Debug, Default)]
pub struct MemoryLastSent {
    last: Mutex<HashMap<DeviceKey, u64>>,
}

impl MemoryLastSent {
    pub fn new() -> Self {
        Self::default()
    }
}

impl LastSent for MemoryLastSent {
    fn next_counter(&self, mac: &DeviceKey, wall_ms: u64) -> Result<u64, StoreError> {
        let mut last = self.last.lock().unwrap();
        let v = next_counter_value(last.get(mac).copied(), wall_ms)?;
        last.insert(*mac, v);
        Ok(v)
    }
}

// --- Limits and the restart window ------------------------------------------------------

/// The time limits and the frame ceiling. Only crate-private test constructors lower
/// them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Limits {
    pub(crate) window_ms: u64,
    pub(crate) retry_ms: u64,
    pub(crate) hanging_ms: u64,
    pub(crate) max_age_ms: u64,
    pub(crate) ttl_ms: u64,
    /// The send nonce a side stops at, and one past the received nonce that makes the
    /// phone handshake.
    pub(crate) frame_ceiling: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            window_ms: RESTART_WINDOW_MS,
            retry_ms: RETRY_MS,
            hanging_ms: HANGING_MS,
            max_age_ms: MAX_SESSION_AGE_MS,
            ttl_ms: OUTSTANDING_TTL_MS,
            frame_ceiling: NONCE_CEILING,
        }
    }
}

/// One restart window: the last start, and a deferred trigger's time if one is
/// waiting for the window's end. Shared by both sides.
#[derive(Clone, Debug, Default)]
pub(crate) struct RestartWindow {
    last_start: Option<u64>,
    deferred: Option<u64>,
}

impl RestartWindow {
    fn open(&self, now: u64, window_ms: u64) -> bool {
        self.last_start
            .is_none_or(|t| now >= t.saturating_add(window_ms))
    }

    fn started(&mut self, now: u64) {
        self.last_start = Some(now);
        self.deferred = None;
    }

    /// Raises a trigger: true if it starts now, else it is deferred to the window's
    /// end (several coalesce into one).
    fn raise(&mut self, now: u64, window_ms: u64) -> bool {
        if self.open(now, window_ms) {
            self.started(now);
            true
        } else {
            self.deferred = Some(now);
            false
        }
    }

    /// A session completed: a deferred trigger raised before now is dropped.
    fn completed(&mut self) {
        self.deferred = None;
    }

    fn deferred_due(&self, now: u64, window_ms: u64) -> bool {
        self.deferred.is_some() && self.open(now, window_ms)
    }

    fn deadline(&self, window_ms: u64) -> Option<u64> {
        self.deferred
            .map(|_| self.last_start.map_or(0, |t| t.saturating_add(window_ms)))
    }
}

// --- The phone's scheduler ------------------------------------------------------------

/// What raised a phone trigger.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Cause {
    MacOnline,
    Foreground,
    Rehandshake,
    BadFrame,
    PullToRefresh,
    NoSession,
    Ceiling,
}

#[derive(Debug)]
struct Pending {
    token: u64,
    started_at: u64,
    counter: Option<u64>,
    hanging_due: Option<u64>,
    hanging_done: bool,
}

#[derive(Clone, Copy, Debug)]
struct Adopted {
    counter: u64,
    completed_at: u64,
    aged: bool,
}

/// A poll's result: the start it emitted, and the counters whose hanging trigger fired.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Polled {
    pub(crate) start: Option<u64>,
    pub(crate) hanging: Vec<u64>,
}

/// The phone's handshake scheduler, pure: the window and coalescing, the retry, the
/// hanging-handshake trigger, 24 h, the frame ceilings and the adoption rule. A start
/// is a token; it counts when it is emitted, whether or not `begin` follows.
#[derive(Debug)]
pub(crate) struct Scheduler {
    limits: Limits,
    window: RestartWindow,
    /// Oldest first.
    outstanding: Vec<Pending>,
    /// The latest fresh start's retry: (token, due).
    retry: Option<(u64, u64)>,
    session: Option<Adopted>,
    next_token: u64,
}

impl Scheduler {
    pub(crate) fn new(limits: Limits) -> Self {
        Scheduler {
            limits,
            window: RestartWindow::default(),
            outstanding: Vec::new(),
            retry: None,
            session: None,
            next_token: 1,
        }
    }

    /// A trigger, of any cause, through the window. Pull to refresh starts one with or
    /// without a session (owner decision, 2026-10-16).
    pub(crate) fn trigger(&mut self, _cause: Cause, now: u64) -> Option<u64> {
        if self.window.raise(now, self.limits.window_ms) {
            Some(self.start(now, true))
        } else {
            None
        }
    }

    /// Emits a start: it opens a new window, and a fresh one (not a retry) gets its
    /// one retry.
    fn start(&mut self, now: u64, fresh: bool) -> u64 {
        let token = self.next_token;
        self.next_token += 1;
        self.window.started(now);
        self.outstanding.push(Pending {
            token,
            started_at: now,
            counter: None,
            hanging_due: None,
            hanging_done: false,
        });
        if self.outstanding.len() > MAX_OUTSTANDING {
            self.outstanding.remove(0);
        }
        self.retry = fresh.then_some((token, now.saturating_add(self.limits.retry_ms)));
        token
    }

    pub(crate) fn is_outstanding(&self, token: u64) -> bool {
        self.outstanding.iter().any(|p| p.token == token)
    }

    /// Gives a start its counter. False if the token is stale (or already begun).
    pub(crate) fn begin(&mut self, token: u64, counter: u64) -> bool {
        match self.outstanding.iter_mut().find(|p| p.token == token) {
            Some(p) if p.counter.is_none() => {
                p.counter = Some(counter);
                true
            }
            _ => false,
        }
    }

    /// The outstanding handshakes an `hs2` may complete: begun, with a counter above
    /// the session's, newest first.
    pub(crate) fn candidates(&self) -> Vec<(u64, u64)> {
        let floor = self.session.map(|s| s.counter);
        self.outstanding
            .iter()
            .rev()
            .filter_map(|p| Some((p.token, p.counter?)))
            .filter(|(_, c)| floor.is_none_or(|f| *c > f))
            .collect()
    }

    /// An `hs2` completed the handshake with `counter`. It is adopted only if that
    /// counter is above the session's. Adoption drops the deferred trigger, every
    /// outstanding handshake not above it (and any not yet begun), and arms the
    /// hanging trigger of each newer one still outstanding, due at
    /// `max(its start + 10 s, now + the adopted handshake's round trip)` (owner
    /// decision, 2026-10-16), so a round trip over 10 s cannot loop.
    pub(crate) fn adopt(&mut self, counter: u64, now: u64) -> bool {
        self.expire(now);
        let Some(adopted_start) = self
            .outstanding
            .iter()
            .find(|p| p.counter == Some(counter))
            .map(|p| p.started_at)
        else {
            return false;
        };
        if self.session.is_some_and(|s| counter <= s.counter) {
            return false;
        }
        self.session = Some(Adopted {
            counter,
            completed_at: now,
            aged: false,
        });
        self.window.completed();
        self.outstanding
            .retain(|p| p.counter.is_some_and(|c| c > counter));
        let hanging_ms = self.limits.hanging_ms;
        let round_trip_end = now.saturating_add(now.saturating_sub(adopted_start));
        for p in &mut self.outstanding {
            if p.hanging_due.is_none() && !p.hanging_done {
                p.hanging_due = Some(p.started_at.saturating_add(hanging_ms).max(round_trip_end));
            }
        }
        self.drop_stale_retry();
        true
    }

    /// This side sent a frame with `nonce`: the send nonce reaching the ceiling is a
    /// trigger.
    pub(crate) fn on_sent(&mut self, nonce: u64, now: u64) -> Option<u64> {
        if self.session.is_some() && nonce.saturating_add(1) >= self.limits.frame_ceiling {
            return self.trigger(Cause::Ceiling, now);
        }
        None
    }

    /// This side accepted a frame with `nonce`: ceiling - 1 is a trigger.
    pub(crate) fn on_received(&mut self, nonce: u64, now: u64) -> Option<u64> {
        if self.session.is_some() && nonce.saturating_add(1) >= self.limits.frame_ceiling {
            return self.trigger(Cause::Ceiling, now);
        }
        None
    }

    /// Drops the session and every outstanding handshake. The window stays.
    pub(crate) fn end(&mut self) {
        self.outstanding.clear();
        self.retry = None;
        self.session = None;
        self.window.completed();
    }

    fn drop_stale_retry(&mut self) {
        if let Some((token, _)) = self.retry {
            if !self.is_outstanding(token) {
                self.retry = None;
            }
        }
    }

    pub(crate) fn expire(&mut self, now: u64) {
        let ttl = self.limits.ttl_ms;
        self.outstanding
            .retain(|p| now < p.started_at.saturating_add(ttl));
        self.drop_stale_retry();
    }

    /// Runs whatever is due at `now`. Several causes due together give one start: it
    /// is fresh (with its own retry) unless the retry alone was due.
    pub(crate) fn poll(&mut self, now: u64) -> Polled {
        self.expire(now);
        let mut raised = false;
        if let Some(s) = &mut self.session {
            if !s.aged && now >= s.completed_at.saturating_add(self.limits.max_age_ms) {
                s.aged = true;
                raised = true;
            }
        }
        let mut hanging = Vec::new();
        for p in &mut self.outstanding {
            if p.hanging_due.is_some_and(|due| now >= due) {
                p.hanging_due = None;
                p.hanging_done = true;
                raised = true;
                hanging.extend(p.counter);
            }
        }
        let retry_due = self.retry.is_some_and(|(_, due)| now >= due);
        let window_ms = self.limits.window_ms;
        let start = if self.window.open(now, window_ms) {
            let fresh = raised || self.window.deferred_due(now, window_ms);
            (fresh || retry_due).then(|| self.start(now, fresh))
        } else {
            // A retry is due only at its start's window end, so it is never here.
            if raised {
                self.window.raise(now, window_ms);
            }
            None
        };
        Polled { start, hanging }
    }

    /// The earliest time `poll` has work, if any.
    pub(crate) fn next_deadline(&self) -> Option<u64> {
        let window = self.window.deadline(self.limits.window_ms);
        let retry = self.retry.map(|(_, due)| due);
        let hanging = self.outstanding.iter().filter_map(|p| p.hanging_due).min();
        let age = self
            .session
            .filter(|s| !s.aged)
            .map(|s| s.completed_at.saturating_add(self.limits.max_age_ms));
        [window, retry, hanging, age].into_iter().flatten().min()
    }

    #[cfg(test)]
    pub(crate) fn session_counter(&self) -> Option<u64> {
        self.session.map(|s| s.counter)
    }
}

// --- The phone --------------------------------------------------------------------------

/// What the phone's driver raises.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trigger {
    /// `welcome` or `presence` shows the Mac online.
    MacOnline,
    /// The app came to the foreground.
    Foreground,
    /// The Mac asked, with `rehandshake` (its wire form is story 7b's).
    Rehandshake,
    /// Pull to refresh, with or without a session (owner decision, 2026-10-16).
    PullToRefresh,
}

/// What the phone's driver must do.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PhoneAction {
    /// Get a counter (`LastSent::next_counter`) and call `begin(token, counter)`. If
    /// the store fails, skip `begin`: no `hs1` is sent.
    StartHandshake { token: u64 },
    /// Send this envelope to the relay.
    Send(Routed),
    /// A newer session was adopted.
    Started,
    /// A frame's plaintext.
    Deliver(Vec<u8>),
}

/// Why `send` refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SendError {
    /// No session. A trigger was raised; its action comes from the next `poll`.
    NoSession,
    /// The send nonce is at the ceiling (the phone side). A trigger was raised.
    Ceiling,
    /// Over 60,000 bytes. Nothing raised.
    TooLarge,
}

/// The phone's session with one Mac over one relay.
pub struct PhoneSession {
    own: StaticKeypair,
    i_m: DeviceKey,
    i_p: DeviceKey,
    mac_static: [u8; 32],
    limits: Limits,
    sched: Scheduler,
    initiators: Vec<(u64, Initiator)>,
    session: Option<Session>,
    outbox: Vec<PhoneAction>,
    outbox_at: Option<u64>,
}

impl PhoneSession {
    /// The phone (`own`, identity `i_p`) and its Mac (`i_m`, static `mac_static`).
    /// Refuses a low-order Mac static.
    pub fn new(
        own: StaticKeypair,
        i_m: DeviceKey,
        i_p: DeviceKey,
        mac_static: [u8; 32],
    ) -> Result<Self, HandshakeError> {
        Self::with_limits(own, i_m, i_p, mac_static, Limits::default())
    }

    pub(crate) fn with_limits(
        own: StaticKeypair,
        i_m: DeviceKey,
        i_p: DeviceKey,
        mac_static: [u8; 32],
        limits: Limits,
    ) -> Result<Self, HandshakeError> {
        Initiator::start(&own, &i_m, &i_p, &mac_static, 0)?;
        Ok(PhoneSession {
            own,
            i_m,
            i_p,
            mac_static,
            limits,
            sched: Scheduler::new(limits),
            initiators: Vec::new(),
            session: None,
            outbox: Vec::new(),
            outbox_at: None,
        })
    }

    fn starts(token: Option<u64>) -> Vec<PhoneAction> {
        token
            .map(|token| PhoneAction::StartHandshake { token })
            .into_iter()
            .collect()
    }

    fn sync(&mut self) {
        let sched = &self.sched;
        self.initiators.retain(|(t, _)| sched.is_outstanding(*t));
    }

    fn queue(&mut self, token: Option<u64>, now: u64) {
        if let Some(token) = token {
            self.outbox.push(PhoneAction::StartHandshake { token });
            self.outbox_at.get_or_insert(now);
        }
    }

    pub fn trigger(&mut self, kind: Trigger, now: u64) -> Vec<PhoneAction> {
        let cause = match kind {
            Trigger::MacOnline => Cause::MacOnline,
            Trigger::Foreground => Cause::Foreground,
            Trigger::Rehandshake => Cause::Rehandshake,
            Trigger::PullToRefresh => Cause::PullToRefresh,
        };
        let token = self.sched.trigger(cause, now);
        self.sync();
        Self::starts(token)
    }

    /// The second step of a start: `hs1` with `counter`, as an envelope to the Mac.
    /// `Ok(None)` if the token is stale (`end()` ran, or a newer session was adopted,
    /// since the start); the counter is then simply skipped. A counter above
    /// 2^53 - 1 is an error, as TypeScript's `RangeError` is.
    pub fn begin(&mut self, token: u64, counter: u64) -> Result<Option<Routed>, HandshakeError> {
        if counter > MAX_COUNTER {
            return Err(HandshakeError::CounterRange);
        }
        if !self.sched.is_outstanding(token) {
            return Ok(None);
        }
        let (init, hs1) =
            Initiator::start(&self.own, &self.i_m, &self.i_p, &self.mac_static, counter)?;
        if !self.sched.begin(token, counter) {
            return Ok(None);
        }
        self.initiators.push((token, init));
        Ok(Some(Routed {
            kind: RoutedKind::Hs1,
            peer: self.i_m,
            body: hs1,
        }))
    }

    /// An `hs2` from the Mac: tried against the outstanding handshakes newest first,
    /// only those above the current session's counter, and adopted if one completes.
    pub fn on_hs2(&mut self, hs2: &[u8], now: u64) -> Vec<PhoneAction> {
        self.sched.expire(now);
        self.sync();
        for (token, counter) in self.sched.candidates() {
            let Some((_, init)) = self.initiators.iter_mut().find(|(t, _)| *t == token) else {
                continue;
            };
            if let Ok(session) = init.finish(hs2) {
                self.sched.adopt(counter, now);
                self.session = Some(session);
                self.sync();
                return vec![PhoneAction::Started];
            }
        }
        Vec::new()
    }

    /// A frame body from the Mac.
    pub fn on_frame(&mut self, body: &[u8], now: u64) -> Vec<PhoneAction> {
        let Some(session) = self.session.as_mut() else {
            return Vec::new();
        };
        let token = match session.open(body) {
            Opened::Accept(plain) => {
                let nonce = session.last_recv().expect("just accepted");
                let token = self.sched.on_received(nonce, now);
                self.sync();
                let mut out = vec![PhoneAction::Deliver(plain)];
                out.extend(Self::starts(token));
                return out;
            }
            Opened::Drop => return Vec::new(),
            Opened::Bad => self.sched.trigger(Cause::BadFrame, now),
        };
        self.sync();
        Self::starts(token)
    }

    /// Seals a frame to the Mac. With no session, or at the ceiling, it refuses and
    /// raises the trigger, whose action comes from the next `poll`.
    pub fn send(&mut self, plaintext: &[u8], now: u64) -> Result<Routed, SendError> {
        if plaintext.len() > MAX_PLAINTEXT {
            return Err(SendError::TooLarge);
        }
        let Some(session) = self.session.as_mut() else {
            let token = self.sched.trigger(Cause::NoSession, now);
            self.queue(token, now);
            return Err(SendError::NoSession);
        };
        if session.send_nonce() >= self.limits.frame_ceiling {
            let token = self.sched.trigger(Cause::Ceiling, now);
            self.queue(token, now);
            return Err(SendError::Ceiling);
        }
        let nonce = session.send_nonce();
        let body = session.seal(plaintext).map_err(|_| SendError::Ceiling)?;
        let token = self.sched.on_sent(nonce, now);
        self.queue(token, now);
        Ok(Routed {
            kind: RoutedKind::Frame,
            peer: self.i_m,
            body,
        })
    }

    /// Drops the session and its outstanding handshakes (no pair remains).
    pub fn end(&mut self) {
        self.sched.end();
        self.initiators.clear();
        self.session = None;
        self.outbox.clear();
        self.outbox_at = None;
    }

    /// Runs whatever is due at `now`.
    pub fn poll(&mut self, now: u64) -> Vec<PhoneAction> {
        let mut out = std::mem::take(&mut self.outbox);
        self.outbox_at = None;
        let polled = self.sched.poll(now);
        self.sync();
        out.extend(Self::starts(polled.start));
        out
    }

    /// The earliest time `poll` has work, if any.
    pub fn next_deadline(&self) -> Option<u64> {
        [self.outbox_at, self.sched.next_deadline()]
            .into_iter()
            .flatten()
            .min()
    }

    pub fn session_id(&self) -> Option<[u8; 8]> {
        self.session.as_ref().map(Session::id)
    }
}

impl std::fmt::Debug for PhoneSession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PhoneSession")
            .field("mac", &self.i_m)
            .field("session", &self.session_id())
            .finish_non_exhaustive()
    }
}

// --- The Mac ------------------------------------------------------------------------------

/// What the Mac's driver must do.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MacAction {
    /// Send this envelope to the relay.
    Send(Routed),
    /// Ask the phone to handshake (story 7b carries it as `rehandshake`).
    Rehandshake(DeviceKey),
    /// A session with this phone completed.
    Started(DeviceKey),
    /// A frame's plaintext from this phone.
    Deliver(DeviceKey, Vec<u8>),
}

#[derive(Debug, Default)]
struct MacPeer {
    session: Option<Session>,
    window: RestartWindow,
}

/// The Mac's sessions with its phones over one relay. Several may share one store.
pub struct MacSessions {
    own: StaticKeypair,
    i_m: DeviceKey,
    counters: Arc<dyn Hs1Counters>,
    statics: Arc<dyn PairedStatics>,
    limits: Limits,
    peers: HashMap<DeviceKey, MacPeer>,
    outbox: Vec<MacAction>,
    outbox_at: Option<u64>,
}

impl MacSessions {
    pub fn new(
        own: StaticKeypair,
        i_m: DeviceKey,
        counters: Arc<dyn Hs1Counters>,
        statics: Arc<dyn PairedStatics>,
    ) -> Self {
        Self::with_limits(own, i_m, counters, statics, Limits::default())
    }

    pub(crate) fn with_limits(
        own: StaticKeypair,
        i_m: DeviceKey,
        counters: Arc<dyn Hs1Counters>,
        statics: Arc<dyn PairedStatics>,
        limits: Limits,
    ) -> Self {
        MacSessions {
            own,
            i_m,
            counters,
            statics,
            limits,
            peers: HashMap::new(),
            outbox: Vec::new(),
            outbox_at: None,
        }
    }

    /// An `hs1` the relay says came from `phone`. A bad one is refused silently
    /// (`Ok` with no actions). The counter is recorded before `hs2` is written; a
    /// failed write is an error and sends nothing.
    pub fn on_hs1(
        &mut self,
        phone: DeviceKey,
        hs1: &[u8],
        _now: u64,
    ) -> Result<Vec<MacAction>, StoreError> {
        let Ok(read) = read_hs1(&self.own, &self.i_m, &phone, hs1) else {
            return Ok(Vec::new());
        };
        if !self
            .statics
            .statics(&self.i_m, &phone)
            .contains(&read.remote_static())
        {
            return Ok(Vec::new());
        }
        if !self
            .counters
            .accept_if_above(&self.i_m, &phone, read.counter())?
        {
            return Ok(Vec::new());
        }
        let (hs2, session) = read.reply();
        let peer = self.peers.entry(phone).or_default();
        peer.session = Some(session);
        peer.window.completed();
        Ok(vec![
            MacAction::Send(Routed {
                kind: RoutedKind::Hs2,
                peer: phone,
                body: hs2,
            }),
            MacAction::Started(phone),
        ])
    }

    /// Raises `Rehandshake` for a phone the Mac already holds state for; no entry is
    /// made here, so unpaired keys can't grow the map.
    fn raise(&mut self, phone: DeviceKey, now: u64) -> Option<MacAction> {
        let window_ms = self.limits.window_ms;
        let peer = self.peers.get_mut(&phone)?;
        peer.window
            .raise(now, window_ms)
            .then_some(MacAction::Rehandshake(phone))
    }

    /// A frame body from `phone`. With no session it is dropped (frames in flight
    /// from an old session start nothing); a bad one raises `Rehandshake`.
    pub fn on_frame(&mut self, phone: DeviceKey, body: &[u8], now: u64) -> Vec<MacAction> {
        let Some(session) = self.peers.get_mut(&phone).and_then(|p| p.session.as_mut()) else {
            return Vec::new();
        };
        match session.open(body) {
            Opened::Accept(plain) => vec![MacAction::Deliver(phone, plain)],
            Opened::Drop => Vec::new(),
            Opened::Bad => self.raise(phone, now).into_iter().collect(),
        }
    }

    /// Seals a frame to `phone`. With no session, or at the Mac's send ceiling (which
    /// drops the session), it returns `NoSession` and raises `Rehandshake`, whose
    /// action comes from the next `poll`.
    pub fn send(
        &mut self,
        phone: DeviceKey,
        plaintext: &[u8],
        now: u64,
    ) -> Result<Routed, SendError> {
        if plaintext.len() > MAX_PLAINTEXT {
            return Err(SendError::TooLarge);
        }
        let ceiling = self.limits.frame_ceiling;
        // A phone gets an entry only once it is paired; an unpaired key gets
        // `NoSession` and nothing is kept.
        if !self.peers.contains_key(&phone) {
            if self.statics.statics(&self.i_m, &phone).is_empty() {
                return Err(SendError::NoSession);
            }
            self.peers.insert(phone, MacPeer::default());
        }
        let peer = self.peers.get_mut(&phone).expect("just ensured");
        if peer
            .session
            .as_ref()
            .is_some_and(|s| s.send_nonce() >= ceiling)
        {
            peer.session = None;
        }
        let Some(session) = peer.session.as_mut() else {
            if let Some(action) = self.raise(phone, now) {
                self.outbox.push(action);
                self.outbox_at.get_or_insert(now);
            }
            return Err(SendError::NoSession);
        };
        let body = session.seal(plaintext).map_err(|_| SendError::NoSession)?;
        Ok(Routed {
            kind: RoutedKind::Frame,
            peer: phone,
            body,
        })
    }

    /// Drops the session with `phone` (no pair remains). Its window stays.
    pub fn end(&mut self, phone: &DeviceKey) {
        if let Some(peer) = self.peers.get_mut(phone) {
            peer.session = None;
            peer.window.completed();
        }
    }

    /// Runs whatever is due at `now`: queued actions, and deferred `Rehandshake`s.
    pub fn poll(&mut self, now: u64) -> Vec<MacAction> {
        let mut out = std::mem::take(&mut self.outbox);
        self.outbox_at = None;
        let window_ms = self.limits.window_ms;
        let mut due: Vec<DeviceKey> = self
            .peers
            .iter()
            .filter(|(_, p)| p.window.deferred_due(now, window_ms))
            .map(|(k, _)| *k)
            .collect();
        due.sort();
        for phone in due {
            self.peers
                .get_mut(&phone)
                .expect("listed")
                .window
                .started(now);
            out.push(MacAction::Rehandshake(phone));
        }
        out
    }

    /// The earliest time `poll` has work, if any.
    pub fn next_deadline(&self) -> Option<u64> {
        let window_ms = self.limits.window_ms;
        self.peers
            .values()
            .filter_map(|p| p.window.deadline(window_ms))
            .chain(self.outbox_at)
            .min()
    }

    pub fn session_id(&self, phone: &DeviceKey) -> Option<[u8; 8]> {
        self.peers.get(phone)?.session.as_ref().map(Session::id)
    }
}

impl std::fmt::Debug for MacSessions {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MacSessions")
            .field("mac", &self.i_m)
            .field("peers", &self.peers.len())
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use relay_protocol::Bytes;
    use serde_json::Value;
    use std::sync::Barrier;

    // --- schedule.json -------------------------------------------------------------

    const SCHEDULE: &str = include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../packages/protocol/vectors/schedule.json"
    ));

    fn schedule() -> Value {
        serde_json::from_str(SCHEDULE).expect("schedule.json is JSON")
    }

    #[test]
    fn schedule_json_constants_are_the_limits() {
        let c = &schedule()["constants"];
        let l = Limits::default();
        assert_eq!(c["window_ms"].as_u64(), Some(l.window_ms));
        assert_eq!(c["retry_ms"].as_u64(), Some(l.retry_ms));
        assert_eq!(c["hanging_ms"].as_u64(), Some(l.hanging_ms));
        assert_eq!(c["max_age_ms"].as_u64(), Some(l.max_age_ms));
        assert_eq!(c["outstanding_ttl_ms"].as_u64(), Some(l.ttl_ms));
        assert_eq!(c["max_outstanding"].as_u64(), Some(MAX_OUTSTANDING as u64));
        assert_eq!(c["nonce_ceiling"].as_u64(), Some(l.frame_ceiling));
    }

    fn cause_of(kind: &str) -> Cause {
        match kind {
            "mac_online" => Cause::MacOnline,
            "foreground" => Cause::Foreground,
            "rehandshake" => Cause::Rehandshake,
            "bad_frame" => Cause::BadFrame,
            "pull_to_refresh" => Cause::PullToRefresh,
            other => panic!("unknown trigger {other}"),
        }
    }

    #[test]
    fn schedule_json_scripts() {
        let file = schedule();
        let scripts = file["scripts"].as_array().unwrap();
        assert!(scripts.len() >= 20);
        for script in scripts {
            let name = script["name"].as_str().unwrap();
            let mut s = Scheduler::new(Limits::default());
            let mut starts = 0u64;
            for step in script["steps"].as_array().unwrap() {
                let now = step["at_mono_ms"].as_u64().unwrap();
                let event = step["event"].as_str().unwrap();
                let at = format!("{name}: {event} at {now}");
                let (verb, arg) = event.split_once(':').unwrap_or((event, ""));
                let mut polled = Polled::default();
                match verb {
                    "trigger" => polled.start = s.trigger(cause_of(arg), now),
                    "tick" => polled = s.poll(now),
                    "hs2_ok" => {
                        s.adopt(arg.parse().unwrap(), now);
                    }
                    "sent_nonce" => polled.start = s.on_sent(arg.parse().unwrap(), now),
                    "recv_nonce" => polled.start = s.on_received(arg.parse().unwrap(), now),
                    "end" => s.end(),
                    other => panic!("unknown event {other}"),
                }
                let mut started = None;
                if let Some(token) = polled.start {
                    starts += 1;
                    assert_eq!(token, starts, "{at}");
                    started = Some(starts);
                    if step.get("store_fails") != Some(&Value::Bool(true)) {
                        let counter = step["begin_counter"].as_u64().unwrap_or(starts);
                        assert!(s.begin(token, counter), "{at}");
                    }
                }
                let expect = &step["expect"];
                assert_eq!(started, expect["start"].as_u64(), "start, {at}");
                let hanging: Vec<u64> = expect
                    .get("hanging")
                    .map(|h| {
                        h.as_array()
                            .unwrap()
                            .iter()
                            .map(|v| v.as_u64().unwrap())
                            .collect()
                    })
                    .unwrap_or_default();
                assert_eq!(polled.hanging, hanging, "hanging, {at}");
                if let Some(session) = expect.get("session") {
                    assert_eq!(s.session_counter(), session.as_u64(), "session, {at}");
                }
                if let Some(deadline) = expect.get("deadline") {
                    assert_eq!(s.next_deadline(), deadline.as_u64(), "deadline, {at}");
                }
            }
        }
    }

    #[test]
    fn schedule_json_counters() {
        let file = schedule();
        for c in file["counters"].as_array().unwrap() {
            let why = c["why"].as_str().unwrap();
            let got = next_counter_value(c["last_sent"].as_u64(), c["wall_ms"].as_u64().unwrap());
            match c["expect"].as_u64() {
                Some(v) => assert_eq!(got, Ok(v), "{why}"),
                None => assert_eq!(got, Err(StoreError::Exhausted), "{why}"),
            }
        }
    }

    // --- An in-process Mac and phone ------------------------------------------------

    fn key(b: u8) -> DeviceKey {
        Bytes([b; 32])
    }

    struct World {
        mac: MacSessions,
        phone: PhoneSession,
        i_m: DeviceKey,
        i_p: DeviceKey,
        counters: Arc<MemoryHs1Counters>,
        statics: Arc<MemoryPairedStatics>,
        last_sent: Arc<dyn LastSent>,
        phone_static: [u8; 32],
        wall_ms: u64,
        to_mac: Vec<Routed>,
        to_phone: Vec<Routed>,
        phone_got: Vec<Vec<u8>>,
        mac_got: Vec<Vec<u8>>,
        phone_starts: Vec<u64>,
        rehandshakes: usize,
        store_errors: usize,
    }

    fn world_with(limits: Limits, last_sent: Arc<dyn LastSent>) -> World {
        let (mac_key, phone_key) = (StaticKeypair::generate(), StaticKeypair::generate());
        let (i_m, i_p) = (key(1), key(2));
        let counters = Arc::new(MemoryHs1Counters::new());
        let statics = Arc::new(MemoryPairedStatics::new());
        statics.add(i_m, i_p, phone_key.public());
        let mac = MacSessions::with_limits(
            mac_key.clone(),
            i_m,
            counters.clone(),
            statics.clone(),
            limits,
        );
        let phone_static = phone_key.public();
        let phone =
            PhoneSession::with_limits(phone_key, i_m, i_p, mac_key.public(), limits).unwrap();
        World {
            mac,
            phone,
            i_m,
            i_p,
            counters,
            statics,
            last_sent,
            phone_static,
            wall_ms: 1_760_000_000_000,
            to_mac: Vec::new(),
            to_phone: Vec::new(),
            phone_got: Vec::new(),
            mac_got: Vec::new(),
            phone_starts: Vec::new(),
            rehandshakes: 0,
            store_errors: 0,
        }
    }

    fn world() -> World {
        world_with(Limits::default(), Arc::new(MemoryLastSent::new()))
    }

    impl World {
        fn phone_actions(&mut self, actions: Vec<PhoneAction>) {
            for a in actions {
                match a {
                    PhoneAction::StartHandshake { token } => {
                        self.phone_starts.push(token);
                        match self.last_sent.next_counter(&self.i_m, self.wall_ms) {
                            Ok(c) => self.to_mac.extend(self.phone.begin(token, c).unwrap()),
                            Err(_) => self.store_errors += 1,
                        }
                    }
                    PhoneAction::Send(r) => self.to_mac.push(r),
                    PhoneAction::Started => {}
                    PhoneAction::Deliver(p) => self.phone_got.push(p),
                }
            }
        }

        fn mac_actions(&mut self, actions: Vec<MacAction>) {
            for a in actions {
                match a {
                    MacAction::Send(r) => self.to_phone.push(r),
                    MacAction::Rehandshake(p) => {
                        assert_eq!(p, self.i_p);
                        self.rehandshakes += 1;
                    }
                    MacAction::Started(p) => assert_eq!(p, self.i_p),
                    MacAction::Deliver(p, body) => {
                        assert_eq!(p, self.i_p);
                        self.mac_got.push(body);
                    }
                }
            }
        }

        fn trigger(&mut self, kind: Trigger, now: u64) {
            let a = self.phone.trigger(kind, now);
            self.phone_actions(a);
        }

        fn tick(&mut self, now: u64) {
            let a = self.phone.poll(now);
            self.phone_actions(a);
            let a = self.mac.poll(now);
            self.mac_actions(a);
        }

        /// Delivers everything in flight, both ways, until quiet.
        fn run(&mut self, now: u64) {
            while !self.to_mac.is_empty() || !self.to_phone.is_empty() {
                for r in std::mem::take(&mut self.to_mac) {
                    assert_eq!(r.peer, self.i_m);
                    let a = match r.kind {
                        RoutedKind::Hs1 => self.mac.on_hs1(self.i_p, &r.body, now).unwrap(),
                        RoutedKind::Frame => self.mac.on_frame(self.i_p, &r.body, now),
                        RoutedKind::Hs2 => panic!("the phone never sends hs2"),
                    };
                    self.mac_actions(a);
                }
                for r in std::mem::take(&mut self.to_phone) {
                    assert_eq!(r.peer, self.i_p);
                    let a = match r.kind {
                        RoutedKind::Hs2 => self.phone.on_hs2(&r.body, now),
                        RoutedKind::Frame => self.phone.on_frame(&r.body, now),
                        RoutedKind::Hs1 => panic!("the Mac never sends hs1"),
                    };
                    self.phone_actions(a);
                }
            }
        }

        fn connect(&mut self, now: u64) {
            self.trigger(Trigger::MacOnline, now);
            self.run(now);
            assert!(self.phone.session_id().is_some());
            assert_eq!(self.phone.session_id(), self.mac.session_id(&self.i_p));
        }

        /// One frame each way, delivered.
        fn frames_flow(&mut self, now: u64) -> bool {
            let (p, m) = (self.phone_got.len(), self.mac_got.len());
            let Ok(r) = self.phone.send(b"from the phone", now) else {
                return false;
            };
            self.to_mac.push(r);
            let Ok(r) = self.mac.send(self.i_p, b"from the Mac", now) else {
                return false;
            };
            self.to_phone.push(r);
            self.run(now);
            self.mac_got.len() == m + 1 && self.phone_got.len() == p + 1
        }
    }

    // --- AC4: the spec's "Sessions" lines --------------------------------------------

    #[test]
    fn a_replayed_hs1_is_refused() {
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let hs1 = w.to_mac[0].body.clone();
        w.run(0);
        let id = w.mac.session_id(&w.i_p);
        assert!(id.is_some());
        // The same hs1 again: no hs2, and the Mac's session is unchanged.
        assert_eq!(w.mac.on_hs1(w.i_p, &hs1, 1).unwrap(), vec![]);
        assert_eq!(w.mac.session_id(&w.i_p), id);
        assert!(w.frames_flow(2));
    }

    #[test]
    fn a_phone_clock_set_back_or_skewed_still_connects() {
        let mut w = world();
        w.connect(0);
        // Set back by a day: the phone sends last_sent + 1.
        w.wall_ms -= 86_400_000;
        w.trigger(Trigger::Foreground, 20_000);
        w.run(20_000);
        assert_eq!(w.phone_starts.len(), 2);
        assert_eq!(w.phone.session_id(), w.mac.session_id(&w.i_p));
        assert!(w.frames_flow(20_001));

        // Skewed: a phone whose clock reads 1970 connects to a fresh Mac; the Mac
        // never compares clocks.
        let mut w = world();
        w.wall_ms = 5;
        w.connect(0);
        assert!(w.frames_flow(1));
    }

    #[test]
    fn frames_from_an_old_session_start_no_handshake() {
        let mut w = world();
        w.connect(0);
        let old_to_mac = w.phone.send(b"old", 1).unwrap();
        let old_to_phone = w.mac.send(w.i_p, b"old", 1).unwrap();
        w.trigger(Trigger::Foreground, 20_000);
        w.run(20_000);
        assert_eq!(w.phone_starts.len(), 2);
        // In flight from the old session: dropped, with no action either side.
        assert_eq!(w.mac.on_frame(w.i_p, &old_to_mac.body, 20_001), vec![]);
        assert_eq!(w.phone.on_frame(&old_to_phone.body, 20_001), vec![]);
        w.tick(40_000);
        assert_eq!(w.phone_starts.len(), 2);
        assert_eq!(w.rehandshakes, 0);
        assert!(w.frames_flow(40_001));
    }

    #[test]
    fn a_remote_static_that_differs_from_the_paired_one_is_refused() {
        let mut w = world();
        // The phone is paired with a different static: its hs1 is refused, and the
        // counter is not recorded.
        w.statics.remove(&w.i_m, &w.i_p, &w.phone_static);
        w.statics
            .add(w.i_m, w.i_p, StaticKeypair::generate().public());
        w.trigger(Trigger::MacOnline, 0);
        let hs1 = w.to_mac[0].body.clone();
        w.run(0);
        assert_eq!(w.mac.session_id(&w.i_p), None);
        assert_eq!(w.phone.session_id(), None);
        // Paired with the right static, the same hs1 is accepted: nothing was recorded.
        w.statics.add(w.i_m, w.i_p, w.phone_static);
        assert_eq!(w.mac.on_hs1(w.i_p, &hs1, 1).unwrap().len(), 2);
    }

    #[test]
    fn an_hs1_from_one_phone_delivered_as_from_another_is_refused() {
        let mut w = world();
        let other = key(3);
        w.statics.add(w.i_m, other, w.phone_static);
        w.trigger(Trigger::MacOnline, 0);
        let hs1 = w.to_mac.remove(0).body;
        assert_eq!(w.mac.on_hs1(other, &hs1, 0).unwrap(), vec![]);
        assert_eq!(w.mac.on_hs1(w.i_p, &hs1, 0).unwrap().len(), 2);
    }

    #[test]
    fn the_mac_asks_for_a_handshake_when_it_has_no_session() {
        let mut w = world();
        assert_eq!(w.mac.send(w.i_p, b"snapshot", 0), Err(SendError::NoSession));
        assert_eq!(w.mac.next_deadline(), Some(0));
        w.tick(0);
        assert_eq!(w.rehandshakes, 1);
        // Within 10 s: deferred to the window's end, not sent twice.
        assert_eq!(
            w.mac.send(w.i_p, b"snapshot", 3_000),
            Err(SendError::NoSession)
        );
        w.tick(3_000);
        assert_eq!(w.rehandshakes, 1);
        assert_eq!(w.mac.next_deadline(), Some(10_000));
        w.tick(10_000);
        assert_eq!(w.rehandshakes, 2);
        // The phone, told, handshakes; then the Mac can send.
        w.trigger(Trigger::Rehandshake, 10_001);
        w.run(10_001);
        assert!(w.mac.send(w.i_p, b"snapshot", 10_002).is_ok());
    }

    #[test]
    fn a_deferred_rehandshake_is_dropped_when_a_session_completes_first() {
        let mut w = world();
        assert!(w.mac.send(w.i_p, b"x", 0).is_err());
        assert!(w.mac.send(w.i_p, b"x", 1_000).is_err());
        w.tick(1_000);
        assert_eq!(w.rehandshakes, 1);
        w.connect(2_000);
        w.tick(10_000);
        assert_eq!(w.rehandshakes, 1);
        assert_eq!(w.mac.next_deadline(), None);
    }

    #[test]
    fn a_dropped_frame_does_not_break_the_session() {
        let mut w = world();
        w.connect(0);
        let a = w.phone.send(b"0", 1).unwrap();
        let _lost = w.phone.send(b"1", 1).unwrap();
        let c = w.phone.send(b"2", 1).unwrap();
        w.to_mac.extend([a, c]);
        w.run(1);
        assert_eq!(w.mac_got, vec![b"0".to_vec(), b"2".to_vec()]);
        assert!(w.frames_flow(2));
        w.tick(20_000);
        assert_eq!((w.phone_starts.len(), w.rehandshakes), (1, 0));
    }

    #[test]
    fn two_handshakes_at_once_leave_the_newest() {
        // A and its retry B both reach the Mac, and both hs2 reach the phone, in
        // either order: both sides end on B.
        for b_first in [false, true] {
            let mut w = world();
            w.trigger(Trigger::MacOnline, 0);
            w.tick(10_000);
            assert_eq!(w.phone_starts.len(), 2);
            let hs1s = std::mem::take(&mut w.to_mac);
            let mut hs2s = Vec::new();
            for r in hs1s {
                for a in w.mac.on_hs1(w.i_p, &r.body, 10_001).unwrap() {
                    if let MacAction::Send(r) = a {
                        hs2s.push(r);
                    }
                }
            }
            assert_eq!(hs2s.len(), 2);
            if b_first {
                hs2s.reverse();
            }
            for r in hs2s {
                let a = w.phone.on_hs2(&r.body, 10_002);
                w.phone_actions(a);
            }
            assert_eq!(
                w.phone.session_id(),
                w.mac.session_id(&w.i_p),
                "b_first {b_first}"
            );
            assert!(w.frames_flow(10_003));
        }
    }

    #[test]
    fn two_handshakes_at_once_the_stuck_state_newer_hs1_lost() {
        // A sent, retry B sent but lost; the Mac adopts A; the phone adopts A.
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let a = w.to_mac.remove(0);
        w.tick(10_000);
        let _b_lost = w.to_mac.remove(0);
        w.to_mac.push(a);
        w.run(10_001);
        assert!(w.phone.session_id().is_some());
        assert_eq!(w.phone.session_id(), w.mac.session_id(&w.i_p));
        assert!(w.frames_flow(10_002));
    }

    #[test]
    fn two_handshakes_at_once_the_lost_newer_hs2_converges() {
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let a = w.to_mac.remove(0);
        w.tick(10_000);
        let b = w.to_mac.remove(0);
        // The Mac accepts A then B, and is on B.
        let hs2_a = w.mac.on_hs1(w.i_p, &a.body, 10_001).unwrap();
        let _hs2_b_lost = w.mac.on_hs1(w.i_p, &b.body, 10_001).unwrap();
        let mac_on_b = w.mac.session_id(&w.i_p);
        // hs2_A arrives; hs2_B is lost. The phone adopts A.
        for act in hs2_a {
            if let MacAction::Send(r) = act {
                let p = w.phone.on_hs2(&r.body, 11_000);
                w.phone_actions(p);
            }
        }
        assert!(w.phone.session_id().is_some());
        assert_ne!(w.phone.session_id(), mac_on_b);
        // Frames between A and B are dropped silently, with no restart.
        assert!(!w.frames_flow(11_001));
        w.to_mac.clear();
        w.to_phone.clear();
        // At max(B's start + 10 s, 11 s + A's 11 s round trip) = 22 s: one trigger, C,
        // and both sides end on C.
        assert_eq!(w.phone.next_deadline(), Some(22_000));
        w.tick(20_000);
        assert_eq!(w.phone_starts.len(), 2);
        w.tick(22_000);
        assert_eq!(w.phone_starts.len(), 3);
        w.run(22_000);
        assert_eq!(w.phone.session_id(), w.mac.session_id(&w.i_p));
        assert_ne!(w.phone.session_id(), mac_on_b);
        assert!(w.frames_flow(22_001));
        w.tick(32_000);
        w.tick(60_000);
        assert_eq!(w.phone_starts.len(), 3);
    }

    #[test]
    fn a_constant_12_s_round_trip_gives_at_most_2_starts_and_converges() {
        // A one-way delay of 6 s: every hs2 arrives 12 s after its hs1 was sent.
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let a = w.to_mac.remove(0);
        let hs2_a = w.mac.on_hs1(w.i_p, &a.body, 6_000).unwrap();
        w.tick(10_000);
        let b = w.to_mac.remove(0);
        for act in hs2_a {
            if let MacAction::Send(r) = act {
                let p = w.phone.on_hs2(&r.body, 12_000);
                w.phone_actions(p);
            }
        }
        let hs2_b = w.mac.on_hs1(w.i_p, &b.body, 16_000).unwrap();
        // B's hanging deadline scales to A's 12 s round trip: not at 20 s.
        assert_eq!(w.phone.next_deadline(), Some(24_000));
        w.tick(20_000);
        assert_eq!(w.phone_starts.len(), 2);
        for act in hs2_b {
            if let MacAction::Send(r) = act {
                let p = w.phone.on_hs2(&r.body, 22_000);
                w.phone_actions(p);
            }
        }
        for t in [24_000, 60_000, 600_000] {
            w.tick(t);
        }
        assert_eq!(w.phone_starts.len(), 2);
        assert_eq!(w.phone.session_id(), w.mac.session_id(&w.i_p));
        assert!(w.frames_flow(600_001));
    }

    #[test]
    fn the_lost_newer_hs2_then_c_lost_too_gets_one_retry_and_b_no_second_trigger() {
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let a = w.to_mac.remove(0);
        w.tick(10_000);
        let b = w.to_mac.remove(0);
        let hs2_a = w.mac.on_hs1(w.i_p, &a.body, 10_001).unwrap();
        w.mac.on_hs1(w.i_p, &b.body, 10_001).unwrap();
        for act in hs2_a {
            if let MacAction::Send(r) = act {
                let p = w.phone.on_hs2(&r.body, 11_000);
                w.phone_actions(p);
            }
        }
        // C's hs1 is lost, and so is its retry D's: the phone then waits.
        for t in [20_000, 30_000, 40_000, 50_000, 60_000] {
            w.tick(t);
            w.to_mac.clear();
        }
        assert_eq!(w.phone_starts, vec![1, 2, 3, 4]);
    }

    // --- AC5: frames and restarts ----------------------------------------------------

    #[test]
    fn a_frame_with_another_session_id_is_dropped_with_no_action() {
        let mut w = world();
        w.connect(0);
        let mut body = w.phone.send(b"x", 1).unwrap().body;
        body[0] ^= 1;
        assert_eq!(w.mac.on_frame(w.i_p, &body, 1), vec![]);
        let mut body = w.mac.send(w.i_p, b"x", 1).unwrap().body;
        body[0] ^= 1;
        assert_eq!(w.phone.on_frame(&body, 1), vec![]);
        assert_eq!(w.mac.next_deadline(), None);
    }

    #[test]
    fn a_bad_frame_makes_the_phone_handshake_and_the_mac_emit_rehandshake() {
        let mut w = world();
        w.connect(0);
        let mut body = w.mac.send(w.i_p, b"x", 20_000).unwrap().body;
        let last = body.len() - 1;
        body[last] ^= 1;
        let a = w.phone.on_frame(&body, 20_000);
        assert!(matches!(a.as_slice(), [PhoneAction::StartHandshake { .. }]));
        let mut body = w.phone.send(b"x", 20_000).unwrap().body;
        body[last] ^= 1;
        assert_eq!(
            w.mac.on_frame(w.i_p, &body, 20_000),
            vec![MacAction::Rehandshake(w.i_p)]
        );
        // The current session stays usable until a newer one completes.
        assert!(w.frames_flow(20_001));
    }

    #[test]
    fn each_side_restarts_at_most_once_per_10_s_per_peer_and_relay() {
        let mut w = world();
        w.connect(0);
        let bad = |w: &mut World, now| {
            let mut body = w.mac.send(w.i_p, b"x", now).unwrap().body;
            body[20] ^= 1;
            let a = w.phone.on_frame(&body, now);
            let mut body = w.phone.send(b"x", now).unwrap().body;
            body[20] ^= 1;
            let m = w.mac.on_frame(w.i_p, &body, now);
            (a.len(), m.len())
        };
        assert_eq!(bad(&mut w, 20_000), (1, 1));
        assert_eq!(bad(&mut w, 21_000), (0, 0));
        assert_eq!(bad(&mut w, 29_999), (0, 0));
        assert_eq!(w.phone.next_deadline(), Some(30_000));
        assert_eq!(w.mac.next_deadline(), Some(30_000));
        let (p, m) = (w.phone.poll(30_000), w.mac.poll(30_000));
        assert_eq!(p.len(), 1);
        assert_eq!(m, vec![MacAction::Rehandshake(w.i_p)]);
    }

    #[test]
    fn the_phone_starts_on_mac_online_foreground_rehandshake_and_pull_to_refresh() {
        for kind in [
            Trigger::MacOnline,
            Trigger::Foreground,
            Trigger::Rehandshake,
            Trigger::PullToRefresh,
        ] {
            let mut w = world();
            w.trigger(kind, 0);
            assert_eq!(w.phone_starts.len(), 1, "{kind:?}");
            w.run(0);
            assert!(w.frames_flow(1), "{kind:?}");
        }
        // Pull to refresh with a session starts one too (owner decision, 2026-10-16),
        // through the same window.
        let mut w = world();
        w.connect(0);
        w.trigger(Trigger::PullToRefresh, 5_000);
        assert_eq!(w.phone_starts.len(), 1);
        w.trigger(Trigger::PullToRefresh, 20_000);
        assert_eq!(w.phone_starts.len(), 2);
        w.run(20_000);
        assert!(w.frames_flow(20_001));
    }

    #[test]
    fn the_phone_starts_after_24_h() {
        let limits = Limits {
            max_age_ms: 100_000,
            ..Limits::default()
        };
        let mut w = world_with(limits, Arc::new(MemoryLastSent::new()));
        w.connect(0);
        w.tick(99_999);
        assert_eq!(w.phone_starts.len(), 1);
        assert_eq!(w.phone.next_deadline(), Some(100_000));
        w.tick(100_000);
        assert_eq!(w.phone_starts.len(), 2);
        w.run(100_000);
        assert!(w.frames_flow(100_001));
    }

    #[test]
    fn the_phone_starts_at_its_send_ceiling_and_at_a_received_nonce_of_ceiling_minus_1() {
        let limits = Limits {
            frame_ceiling: 3,
            ..Limits::default()
        };
        // Its own send nonce reaching the ceiling.
        let mut w = world_with(limits, Arc::new(MemoryLastSent::new()));
        w.connect(0);
        assert!(w.phone.send(b"0", 20_000).is_ok());
        assert!(w.phone.send(b"1", 20_000).is_ok());
        assert_eq!(w.phone.next_deadline(), Some(86_400_000));
        assert!(w.phone.send(b"2", 20_000).is_ok());
        assert_eq!(w.phone.next_deadline(), Some(20_000));
        assert_eq!(w.phone.send(b"3", 20_000), Err(SendError::Ceiling));
        w.tick(20_000);
        assert_eq!(w.phone_starts.len(), 2);
        w.run(20_000);
        assert!(w.phone.send(b"new", 20_001).is_ok());

        // A received nonce of ceiling - 1.
        let mut w = world_with(limits, Arc::new(MemoryLastSent::new()));
        w.connect(0);
        for n in 0..3u8 {
            let r = w.mac.send(w.i_p, &[n], 20_000).unwrap();
            let a = w.phone.on_frame(&r.body, 20_000);
            assert_eq!(a.len(), if n == 2 { 2 } else { 1 }, "nonce {n}");
        }
    }

    #[test]
    fn the_mac_at_its_send_ceiling_drops_the_session_and_emits_rehandshake() {
        let limits = Limits {
            frame_ceiling: 2,
            ..Limits::default()
        };
        let mut w = world_with(limits, Arc::new(MemoryLastSent::new()));
        w.connect(0);
        assert!(w.mac.send(w.i_p, b"0", 20_000).is_ok());
        assert!(w.mac.send(w.i_p, b"1", 20_000).is_ok());
        assert_eq!(w.mac.send(w.i_p, b"2", 20_000), Err(SendError::NoSession));
        assert_eq!(w.mac.session_id(&w.i_p), None);
        w.tick(20_000);
        assert_eq!(w.rehandshakes, 1);
    }

    #[test]
    fn a_60001_byte_plaintext_is_refused_by_both_machines_with_no_restart() {
        let mut w = world();
        w.connect(0);
        let big = vec![0u8; MAX_PLAINTEXT + 1];
        assert_eq!(w.phone.send(&big, 1), Err(SendError::TooLarge));
        assert_eq!(w.mac.send(w.i_p, &big, 1), Err(SendError::TooLarge));
        assert!(w.phone.send(&big[1..], 1).is_ok());
        assert_eq!(w.phone.next_deadline(), Some(86_400_000));
        assert_eq!(w.mac.next_deadline(), None);
    }

    #[test]
    fn send_with_no_session_raises_the_phone_trigger() {
        let mut w = world();
        assert_eq!(w.phone.send(b"x", 0), Err(SendError::NoSession));
        assert_eq!(w.phone.next_deadline(), Some(0));
        w.tick(0);
        assert_eq!(w.phone_starts.len(), 1);
    }

    // --- AC2: counters ----------------------------------------------------------------

    #[test]
    fn the_phone_sends_max_of_now_and_last_sent_plus_1_recorded_per_mac_before_sending() {
        let store = MemoryLastSent::new();
        let mac = key(1);
        assert_eq!(store.next_counter(&mac, 1_000), Ok(1_000));
        assert_eq!(store.next_counter(&mac, 1_000), Ok(1_001));
        assert_eq!(store.next_counter(&mac, 500), Ok(1_002));
        assert_eq!(store.next_counter(&mac, 5_000), Ok(5_000));
        // The hs1 carries the recorded counter.
        let mut w = world();
        w.wall_ms = 42;
        w.trigger(Trigger::MacOnline, 0);
        let r = w.to_mac.remove(0);
        assert_eq!(w.last_sent.next_counter(&w.i_m, 0), Ok(43));
        let (mac_key, i_m, i_p) = (w.mac.own.clone(), w.i_m, w.i_p);
        assert_eq!(
            read_hs1(&mac_key, &i_m, &i_p, &r.body).unwrap().counter(),
            42
        );
    }

    #[test]
    fn the_mac_accepts_only_a_counter_above_the_last_and_records_it_before_hs2() {
        let mut w = world();
        w.wall_ms = 100;
        w.connect(0);
        // Recorded: the next accepted counter must be above 100.
        assert_eq!(w.counters.accept_if_above(&w.i_m, &w.i_p, 100), Ok(false));
        assert_eq!(w.counters.accept_if_above(&w.i_m, &w.i_p, 101), Ok(true));
        // A phone whose store is behind the Mac's record: refused.
        let behind = Arc::new(MemoryLastSent::new());
        w.last_sent = behind;
        w.wall_ms = 50;
        w.trigger(Trigger::Foreground, 20_000);
        let before = w.mac.session_id(&w.i_p);
        w.run(20_000);
        assert_eq!(w.mac.session_id(&w.i_p), before);
    }

    struct FailingCounters;
    impl Hs1Counters for FailingCounters {
        fn accept_if_above(
            &self,
            _: &DeviceKey,
            _: &DeviceKey,
            _: u64,
        ) -> Result<bool, StoreError> {
            Err(StoreError::Failed("disk full".into()))
        }
    }

    struct FailingLastSent;
    impl LastSent for FailingLastSent {
        fn next_counter(&self, _: &DeviceKey, _: u64) -> Result<u64, StoreError> {
            Err(StoreError::Failed("keychain locked".into()))
        }
    }

    #[test]
    fn a_store_whose_write_fails_stops_the_handshake_on_either_side() {
        // The phone: no hs1 is sent; the start still counts, and its retry asks again.
        let mut w = world_with(Limits::default(), Arc::new(FailingLastSent));
        w.trigger(Trigger::MacOnline, 0);
        assert_eq!((w.store_errors, w.to_mac.len()), (1, 0));
        w.tick(10_000);
        assert_eq!((w.store_errors, w.phone_starts.len()), (2, 2));

        // The Mac: an error, and no hs2.
        let mut w = world();
        let mut mac = MacSessions::new(
            StaticKeypair::generate(),
            w.i_m,
            Arc::new(FailingCounters),
            w.statics.clone(),
        );
        let mac_static = mac.own.public();
        w.phone = PhoneSession::new(
            StaticKeypair::from_secret([9; 32]),
            w.i_m,
            w.i_p,
            mac_static,
        )
        .unwrap();
        w.statics
            .add(w.i_m, w.i_p, StaticKeypair::from_secret([9; 32]).public());
        w.trigger(Trigger::MacOnline, 0);
        let r = w.to_mac.remove(0);
        assert_eq!(
            mac.on_hs1(w.i_p, &r.body, 0),
            Err(StoreError::Failed("disk full".into()))
        );
        assert_eq!(mac.session_id(&w.i_p), None);
    }

    #[test]
    fn two_mac_machines_sharing_a_store_accept_a_replayed_hs1_once_at_most() {
        let mac_key = StaticKeypair::generate();
        let phone_key = StaticKeypair::generate();
        let (i_m, i_p) = (key(1), key(2));
        let counters = Arc::new(MemoryHs1Counters::new());
        let statics = Arc::new(MemoryPairedStatics::new());
        statics.add(i_m, i_p, phone_key.public());
        let mut relay_a = MacSessions::new(mac_key.clone(), i_m, counters.clone(), statics.clone());
        let mut relay_b = MacSessions::new(mac_key.clone(), i_m, counters, statics);
        for i in 0..1_000u64 {
            let (_, hs1) = Initiator::start(&phone_key, &i_m, &i_p, &mac_key.public(), i).unwrap();
            let barrier = Barrier::new(2);
            let (a, b) = std::thread::scope(|s| {
                let a = s.spawn(|| {
                    barrier.wait();
                    relay_a.on_hs1(i_p, &hs1, 0).unwrap().len()
                });
                let b = s.spawn(|| {
                    barrier.wait();
                    relay_b.on_hs1(i_p, &hs1, 0).unwrap().len()
                });
                (a.join().unwrap(), b.join().unwrap())
            });
            assert_eq!(a + b, 2, "loop {i}: exactly one accepts");
        }
    }

    #[test]
    fn the_hs1_counter_store_checks_and_records_in_one_atomic_step() {
        // Eight threads offer the same counter at once, 2,000 times: exactly one is
        // accepted each time. A store that checks under one lock and records under
        // another fails this.
        let counters = MemoryHs1Counters::new();
        let (mac, phone) = (key(1), key(2));
        for v in 0..2_000u64 {
            let barrier = Barrier::new(8);
            let accepted: usize = std::thread::scope(|s| {
                let handles: Vec<_> = (0..8)
                    .map(|_| {
                        s.spawn(|| {
                            barrier.wait();
                            counters.accept_if_above(&mac, &phone, v).unwrap() as usize
                        })
                    })
                    .collect();
                handles.into_iter().map(|h| h.join().unwrap()).sum()
            });
            assert_eq!(accepted, 1, "counter {v}");
        }
    }

    #[test]
    fn two_phone_sessions_for_one_mac_key_send_distinct_counters() {
        let mac_key = StaticKeypair::generate();
        let store: Arc<dyn LastSent> = Arc::new(MemoryLastSent::new());
        let (i_m, i_p) = (key(1), key(2));
        let new_phone = || {
            PhoneSession::new(
                StaticKeypair::from_secret([7; 32]),
                i_m,
                i_p,
                mac_key.public(),
            )
            .unwrap()
        };
        for i in 0..1_000u64 {
            let (mut relay_a, mut relay_b) = (new_phone(), new_phone());
            let barrier = Barrier::new(2);
            let start = |phone: &mut PhoneSession| {
                barrier.wait();
                let Some(PhoneAction::StartHandshake { token }) =
                    phone.trigger(Trigger::MacOnline, i).pop()
                else {
                    panic!("a start");
                };
                let c = store.next_counter(&i_m, 1_000).unwrap();
                phone.begin(token, c).unwrap().expect("hs1");
                c
            };
            let (a, b) = std::thread::scope(|s| {
                let a = s.spawn(|| start(&mut relay_a));
                let b = s.spawn(|| start(&mut relay_b));
                (a.join().unwrap(), b.join().unwrap())
            });
            assert_ne!(a, b, "loop {i}");
        }
    }

    // --- AC3: counters across pairs and relays ---------------------------------------

    #[test]
    fn the_counter_carries_over_an_unpair_and_pair_again_and_an_older_hs1_is_refused() {
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let captured = w.to_mac[0].body.clone();
        w.run(0);
        // Unpair, end the session, and pair again with the same keys.
        w.statics.remove(&w.i_m, &w.i_p, &w.phone_static);
        w.mac.end(&w.i_p);
        w.phone.end();
        w.statics.add(w.i_m, w.i_p, w.phone_static);
        // The hs1 captured before the unpair is refused.
        assert_eq!(w.mac.on_hs1(w.i_p, &captured, 20_000).unwrap(), vec![]);
        // A new handshake still connects: its counter is above the carried one.
        w.trigger(Trigger::MacOnline, 20_000);
        w.run(20_000);
        assert!(w.frames_flow(20_001));
    }

    #[test]
    fn an_hs1_accepted_through_another_relay_is_refused() {
        let mut w = world();
        let mut relay_b = MacSessions::new(
            w.mac.own.clone(),
            w.i_m,
            w.counters.clone(),
            w.statics.clone(),
        );
        w.trigger(Trigger::MacOnline, 0);
        let hs1 = w.to_mac[0].body.clone();
        w.run(0);
        assert_eq!(relay_b.on_hs1(w.i_p, &hs1, 1).unwrap(), vec![]);
        assert_eq!(relay_b.session_id(&w.i_p), None);
    }

    #[test]
    fn one_phone_with_two_macs_keeps_two_counters() {
        // The phone side: one LastSent, a counter per Mac key.
        let store = MemoryLastSent::new();
        assert_eq!(store.next_counter(&key(1), 1_000), Ok(1_000));
        assert_eq!(store.next_counter(&key(5), 1_000), Ok(1_000));
        assert_eq!(store.next_counter(&key(1), 1_000), Ok(1_001));
        // The Mac side: one Hs1Counters, a counter per (Mac key, phone key).
        let counters = MemoryHs1Counters::new();
        assert_eq!(counters.accept_if_above(&key(1), &key(2), 1_000), Ok(true));
        assert_eq!(counters.accept_if_above(&key(5), &key(2), 1_000), Ok(true));
        assert_eq!(counters.accept_if_above(&key(1), &key(2), 1_000), Ok(false));
        assert_eq!(counters.accept_if_above(&key(5), &key(2), 1_001), Ok(true));
    }

    #[test]
    fn a_cross_relay_collision_heals_on_the_retry() {
        // One Mac on relays A and B, one phone with a session machine per relay, one
        // counter store each side. Triggered together, A's lower counter reaches the
        // Mac second and is refused; A's retry 10 s later connects.
        let mac_key = StaticKeypair::generate();
        let phone_key = StaticKeypair::generate();
        let (i_m, i_p) = (key(1), key(2));
        let counters = Arc::new(MemoryHs1Counters::new());
        let statics = Arc::new(MemoryPairedStatics::new());
        statics.add(i_m, i_p, phone_key.public());
        let mut mac_a = MacSessions::new(mac_key.clone(), i_m, counters.clone(), statics.clone());
        let mut mac_b = MacSessions::new(mac_key.clone(), i_m, counters, statics);
        let last_sent = MemoryLastSent::new();
        let mut phone_a = PhoneSession::new(phone_key.clone(), i_m, i_p, mac_key.public()).unwrap();
        let mut phone_b = PhoneSession::new(phone_key, i_m, i_p, mac_key.public()).unwrap();
        let start = |phone: &mut PhoneSession, actions: Vec<PhoneAction>| -> Vec<u8> {
            let [PhoneAction::StartHandshake { token }] = actions.as_slice() else {
                panic!("{actions:?}");
            };
            let c = last_sent.next_counter(&i_m, 1_000).unwrap();
            phone.begin(*token, c).unwrap().unwrap().body
        };
        let a = phone_a.trigger(Trigger::MacOnline, 0);
        let hs1_a = start(&mut phone_a, a);
        let b = phone_b.trigger(Trigger::MacOnline, 0);
        let hs1_b = start(&mut phone_b, b);
        let hs2_of = |actions: Vec<MacAction>| {
            actions.into_iter().find_map(|a| match a {
                MacAction::Send(r) => Some(r.body),
                _ => None,
            })
        };
        let hs2_b = hs2_of(mac_b.on_hs1(i_p, &hs1_b, 1).unwrap()).unwrap();
        assert_eq!(hs2_of(mac_a.on_hs1(i_p, &hs1_a, 1).unwrap()), None);
        phone_b.on_hs2(&hs2_b, 2);
        assert!(phone_b.session_id().is_some());
        assert_eq!(phone_a.session_id(), None);
        // The retry heals it.
        let retry = phone_a.poll(10_000);
        let hs1_a2 = start(&mut phone_a, retry);
        let hs2_a2 = hs2_of(mac_a.on_hs1(i_p, &hs1_a2, 10_001).unwrap()).unwrap();
        phone_a.on_hs2(&hs2_a2, 10_002);
        assert_eq!(phone_a.session_id(), mac_a.session_id(&i_p));
        assert!(phone_a.session_id().is_some());
    }

    // --- The two-step start ---------------------------------------------------------

    #[test]
    fn a_stale_begin_token_returns_nothing() {
        // After end().
        let mut w = world();
        let [PhoneAction::StartHandshake { token }] = w.phone.trigger(Trigger::MacOnline, 0)[..]
        else {
            panic!()
        };
        w.phone.end();
        assert_eq!(w.phone.begin(token, 1), Ok(None));

        // After a newer session was adopted.
        let mut w = world();
        w.trigger(Trigger::MacOnline, 0);
        let [PhoneAction::StartHandshake { token }] =
            w.phone.trigger(Trigger::Foreground, 10_000)[..]
        else {
            panic!()
        };
        w.run(10_001);
        assert!(w.phone.session_id().is_some());
        assert_eq!(w.phone.begin(token, 1_760_000_000_005), Ok(None));
    }

    #[test]
    fn begin_refuses_a_counter_above_2_pow_53_minus_1_as_an_error_not_a_stale_token() {
        let mut w = world();
        let [PhoneAction::StartHandshake { token }] = w.phone.trigger(Trigger::MacOnline, 0)[..]
        else {
            panic!()
        };
        assert_eq!(
            w.phone.begin(token, MAX_COUNTER + 1),
            Err(HandshakeError::CounterRange)
        );
        assert!(matches!(w.phone.begin(token, MAX_COUNTER), Ok(Some(_))));
    }

    #[test]
    fn unpaired_keys_leave_no_state_on_the_mac() {
        let mut w = world();
        w.connect(0);
        for i in 0..1_000u32 {
            let mut k = [0xee; 32];
            k[..4].copy_from_slice(&i.to_be_bytes());
            let stranger = Bytes(k);
            assert_eq!(w.mac.send(stranger, b"x", 1), Err(SendError::NoSession));
            assert_eq!(w.mac.on_frame(stranger, &[0; 40], 1), vec![]);
            assert_eq!(w.mac.on_hs1(stranger, &[0; 104], 1).unwrap(), vec![]);
        }
        assert_eq!(w.mac.peers.len(), 1);
        assert_eq!(w.mac.poll(1), vec![]);
        assert_eq!(w.mac.next_deadline(), None);
    }

    #[test]
    fn a_low_order_mac_static_is_refused_by_the_phone_machine() {
        let got = PhoneSession::new(StaticKeypair::generate(), key(1), key(2), [0; 32]);
        assert!(matches!(got, Err(HandshakeError::LowOrder)));
    }
}

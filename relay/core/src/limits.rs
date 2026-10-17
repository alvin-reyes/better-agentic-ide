//! The spec's limits (story 7b), as pure code over 7a's `Clock` times: token buckets
//! for the per-second limits, sliding windows for the hourly ones, and keyed sets of
//! either. `relay-server` holds them in memory and asks before any store call.
//!
//! Every refusal carries `retry_ms`, the time until the limiter would let the next one
//! through, rounded up.

use std::collections::{HashMap, VecDeque};
use std::hash::Hash;
use std::net::IpAddr;

use relay_protocol::DeviceKey;

/// One token, in millitokens.
const TOKEN: u64 = 1000;

/// An hour, in ms.
pub const HOUR_MS: u64 = 60 * 60 * 1000;

/// What a limiter keyed by device or IP needs: take one, and say whether it is back
/// to full (so `KeyedLimits::prune` can forget it).
pub trait Limiter {
    /// Takes one at `now`, or says how long until one is free.
    fn take(&mut self, now: u64) -> Result<(), u64>;
    /// Whether the limiter is back to its starting state at `now`.
    fn is_full(&self, now: u64) -> bool;
}

/// A token bucket in integer millitokens: `per_sec` tokens a second, up to `burst`. A
/// new bucket is full. It refills against the latest time it has seen, so a clock that
/// steps back refills nothing until it passes that time again.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenBucket {
    burst: u64,
    per_sec: u64,
    level: u64,
    last: Option<u64>,
}

impl TokenBucket {
    /// A full bucket. `per_sec` tokens a second is `per_sec` millitokens a ms.
    pub fn new(per_sec: u64, burst: u64) -> Self {
        assert!(
            per_sec > 0 && burst > 0,
            "a bucket needs a rate and a burst"
        );
        TokenBucket {
            burst,
            per_sec,
            level: burst * TOKEN,
            last: None,
        }
    }

    fn level_at(&self, now: u64) -> u64 {
        match self.last {
            Some(last) if now > last => {
                let refill = (now - last).saturating_mul(self.per_sec);
                (self.level.saturating_add(refill)).min(self.burst * TOKEN)
            }
            _ => self.level,
        }
    }
}

impl Limiter for TokenBucket {
    fn take(&mut self, now: u64) -> Result<(), u64> {
        self.level = self.level_at(now);
        let last = match self.last {
            Some(last) if last > now => last,
            _ => now,
        };
        self.last = Some(last);
        if self.level >= TOKEN {
            self.level -= TOKEN;
            return Ok(());
        }
        let need = TOKEN - self.level;
        // Measured on the caller's clock: until the latest time seen, then the refill.
        Err((last - now) + need.div_ceil(self.per_sec))
    }

    fn is_full(&self, now: u64) -> bool {
        self.level_at(now) >= self.burst * TOKEN
    }
}

/// A sliding window: at most `limit` takes in any `window_ms`. A take at exactly the
/// oldest entry plus the window is allowed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HourWindow {
    limit: usize,
    window_ms: u64,
    taken: VecDeque<u64>,
    latest: u64,
}

impl HourWindow {
    /// At most `limit` in an hour.
    pub fn new(limit: usize) -> Self {
        Self::with_window(limit, HOUR_MS)
    }

    /// At most `limit` in `window_ms`.
    pub fn with_window(limit: usize, window_ms: u64) -> Self {
        assert!(
            limit > 0 && window_ms > 0,
            "a window needs a limit and a length"
        );
        HourWindow {
            limit,
            window_ms,
            taken: VecDeque::new(),
            latest: 0,
        }
    }

    fn prune_at(&mut self, now: u64) {
        while let Some(&oldest) = self.taken.front() {
            if oldest + self.window_ms <= now {
                self.taken.pop_front();
            } else {
                break;
            }
        }
    }
}

impl Limiter for HourWindow {
    fn take(&mut self, now: u64) -> Result<(), u64> {
        // Against the latest time seen, so the entries stay in order.
        self.latest = self.latest.max(now);
        let at = self.latest;
        self.prune_at(at);
        if self.taken.len() < self.limit {
            self.taken.push_back(at);
            return Ok(());
        }
        let oldest = *self.taken.front().expect("the window is full");
        Err((oldest + self.window_ms).saturating_sub(now))
    }

    fn is_full(&self, now: u64) -> bool {
        let at = self.latest.max(now);
        self.taken.iter().all(|t| t + self.window_ms <= at)
    }
}

/// One limiter per key, each made from a template on first use.
#[derive(Clone, Debug)]
pub struct KeyedLimits<K, L> {
    template: L,
    entries: HashMap<K, L>,
}

impl<K: Eq + Hash, L: Limiter + Clone> KeyedLimits<K, L> {
    pub fn new(template: L) -> Self {
        KeyedLimits {
            template,
            entries: HashMap::new(),
        }
    }

    /// Takes one for `key` at `now`.
    pub fn take(&mut self, key: K, now: u64) -> Result<(), u64> {
        let template = &self.template;
        self.entries
            .entry(key)
            .or_insert_with(|| template.clone())
            .take(now)
    }

    /// Forgets every key whose limiter is back to full at `now`; a part-used one stays.
    pub fn prune(&mut self, now: u64) {
        self.entries.retain(|_, l| !l.is_full(now));
    }

    /// How many keys are remembered.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

/// The spec's limits. The server's `Config.limits` defaults to these.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    /// Frames (`hs1`, `hs2`, frames): tokens a second per device.
    pub frames_per_sec: u64,
    /// Frames: the burst.
    pub frame_burst: u64,
    /// Control messages after login: tokens a second per device.
    pub control_per_sec: u64,
    /// Control messages: the burst.
    pub control_burst: u64,
    /// Slots opened per hour per Mac.
    pub slots_per_hour: usize,
    /// New identity keys per hour per IP.
    pub new_keys_per_hour: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            frames_per_sec: 20,
            frame_burst: 100,
            control_per_sec: 10,
            control_burst: 30,
            slots_per_hour: 30,
            new_keys_per_hour: 20,
        }
    }
}

/// Frames per device: 20 a second, bursts to 100.
#[derive(Clone, Debug)]
pub struct FrameLimiter(KeyedLimits<DeviceKey, TokenBucket>);

impl FrameLimiter {
    pub fn new(limits: &Limits) -> Self {
        FrameLimiter(KeyedLimits::new(TokenBucket::new(
            limits.frames_per_sec,
            limits.frame_burst,
        )))
    }

    pub fn take(&mut self, device: DeviceKey, now: u64) -> Result<(), u64> {
        self.0.take(device, now)
    }

    pub fn prune(&mut self, now: u64) {
        self.0.prune(now)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Control messages per device: 10 a second, bursts to 30.
#[derive(Clone, Debug)]
pub struct ControlLimiter(KeyedLimits<DeviceKey, TokenBucket>);

impl ControlLimiter {
    pub fn new(limits: &Limits) -> Self {
        ControlLimiter(KeyedLimits::new(TokenBucket::new(
            limits.control_per_sec,
            limits.control_burst,
        )))
    }

    pub fn take(&mut self, device: DeviceKey, now: u64) -> Result<(), u64> {
        self.0.take(device, now)
    }

    pub fn prune(&mut self, now: u64) {
        self.0.prune(now)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Slots opened per Mac: 30 an hour, counted only when an open is allowed. Story 5a
/// calls it; 7b only provides it.
#[derive(Clone, Debug)]
pub struct SlotLimiter(KeyedLimits<DeviceKey, HourWindow>);

impl SlotLimiter {
    pub fn new(limits: &Limits) -> Self {
        SlotLimiter(KeyedLimits::new(HourWindow::new(limits.slots_per_hour)))
    }

    pub fn try_open(&mut self, mac: DeviceKey, now: u64) -> Result<(), u64> {
        self.0.take(mac, now)
    }

    pub fn prune(&mut self, now: u64) {
        self.0.prune(now)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// New identity keys per IP: 20 an hour. Keyed by `ip_key`.
#[derive(Clone, Debug)]
pub struct NewKeyLimiter(KeyedLimits<IpAddr, HourWindow>);

impl NewKeyLimiter {
    pub fn new(limits: &Limits) -> Self {
        NewKeyLimiter(KeyedLimits::new(HourWindow::new(limits.new_keys_per_hour)))
    }

    pub fn take(&mut self, ip: IpAddr, now: u64) -> Result<(), u64> {
        self.0.take(ip_key(ip), now)
    }

    pub fn prune(&mut self, now: u64) {
        self.0.prune(now)
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// The key an IP counts under: itself, except that an IPv4-mapped IPv6 address counts
/// as its IPv4 address. Every other address, IPv6 included, counts alone.
pub fn ip_key(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => IpAddr::V4(v4),
            None => IpAddr::V6(v6),
        },
        v4 => v4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use relay_protocol::Bytes;

    const T0: u64 = crate::clock::MANUAL_CLOCK_START_MS;

    fn dev(n: u8) -> DeviceKey {
        Bytes([n; 32])
    }

    fn drain<L: Limiter>(l: &mut L, now: u64) -> usize {
        let mut n = 0;
        while l.take(now).is_ok() {
            n += 1;
            assert!(n < 10_000, "never refused");
        }
        n
    }

    // --- TokenBucket ---

    #[test]
    fn a_bucket_gives_its_burst_then_refuses_with_the_exact_retry() {
        let mut b = TokenBucket::new(20, 100);
        assert_eq!(drain(&mut b, T0), 100);
        assert_eq!(b.take(T0), Err(50));
        let mut b = TokenBucket::new(10, 30);
        assert_eq!(drain(&mut b, T0), 30);
        assert_eq!(b.take(T0), Err(100));
    }

    #[test]
    fn a_bucket_rounds_retry_up_and_refills_by_the_ms() {
        let mut b = TokenBucket::new(20, 100);
        drain(&mut b, T0);
        // 49 ms gives 980 millitokens: 20 short, which is 1 ms away.
        assert_eq!(b.take(T0 + 49), Err(1));
        assert_eq!(b.take(T0 + 50), Ok(()));
        // 3 rate: 333.3 ms a token, rounded up to 334.
        let mut b = TokenBucket::new(3, 1);
        assert_eq!(b.take(T0), Ok(()));
        assert_eq!(b.take(T0), Err(334));
        assert_eq!(b.take(T0 + 333), Err(1));
        assert_eq!(b.take(T0 + 334), Ok(()));
    }

    #[test]
    fn a_bucket_paces_steadily_at_its_rate() {
        let mut b = TokenBucket::new(10, 30);
        drain(&mut b, T0);
        for step in 1..=100u64 {
            assert_eq!(b.take(T0 + step * 100), Ok(()), "step {step}");
            assert_eq!(b.take(T0 + step * 100), Err(100), "step {step}");
        }
    }

    #[test]
    fn a_bucket_refills_only_to_its_burst() {
        let mut b = TokenBucket::new(20, 100);
        drain(&mut b, T0);
        assert!(!b.is_full(T0 + 4_999));
        assert!(b.is_full(T0 + 5_000));
        assert_eq!(drain(&mut b, T0 + 60_000), 100);
    }

    #[test]
    fn a_bucket_refills_against_the_latest_time_it_has_seen() {
        let mut b = TokenBucket::new(20, 100);
        drain(&mut b, T0 + 1_000);
        // The clock steps back: no refill, and the retry counts the way back.
        assert_eq!(b.take(T0 + 500), Err(550));
        assert_eq!(b.take(T0 + 1_049), Err(1));
        // Then forward: refilled from the latest time seen, not from the step back.
        assert_eq!(b.take(T0 + 1_050), Ok(()));
        assert_eq!(b.take(T0 + 1_050), Err(50));
    }

    // --- HourWindow ---

    #[test]
    fn a_window_allows_its_limit_and_refuses_until_the_oldest_leaves() {
        let mut w = HourWindow::new(3);
        assert_eq!(w.take(T0), Ok(()));
        assert_eq!(w.take(T0 + 10), Ok(()));
        assert_eq!(w.take(T0 + 20), Ok(()));
        assert_eq!(w.take(T0 + 30), Err(HOUR_MS - 30));
        assert_eq!(w.take(T0 + HOUR_MS - 1), Err(1));
        // Exactly the oldest plus the window is allowed.
        assert_eq!(w.take(T0 + HOUR_MS), Ok(()));
        assert_eq!(w.take(T0 + HOUR_MS), Err(10));
    }

    #[test]
    fn a_window_paces_steadily() {
        let mut w = HourWindow::with_window(2, 1_000);
        for step in 0..50u64 {
            assert_eq!(w.take(T0 + step * 500), Ok(()), "step {step}");
        }
        assert_eq!(w.take(T0 + 49 * 500), Err(500));
    }

    #[test]
    fn a_window_survives_a_clock_that_steps_back_then_forward() {
        let mut w = HourWindow::new(2);
        w.take(T0 + 10_000).unwrap();
        w.take(T0 + 10_000).unwrap();
        // Back: still full, measured on the given clock.
        assert_eq!(w.take(T0), Err(HOUR_MS + 10_000));
        // Forward past the window: free again.
        assert_eq!(w.take(T0 + 10_000 + HOUR_MS), Ok(()));
    }

    #[test]
    fn a_window_is_full_again_only_when_every_take_has_left() {
        let mut w = HourWindow::new(5);
        assert!(w.is_full(T0));
        w.take(T0).unwrap();
        w.take(T0 + 100).unwrap();
        assert!(!w.is_full(T0 + HOUR_MS));
        assert!(w.is_full(T0 + HOUR_MS + 100));
    }

    // --- KeyedLimits ---

    #[test]
    fn prune_keeps_a_part_used_entry_and_drops_a_full_one() {
        let mut k = KeyedLimits::new(TokenBucket::new(10, 30));
        k.take(dev(1), T0).unwrap();
        for _ in 0..30 {
            let _ = k.take(dev(2), T0);
        }
        assert_eq!(k.len(), 2);
        // 100 ms refills dev 1's single token, but dev 2 is still 29 short.
        k.prune(T0 + 100);
        assert_eq!(k.len(), 1);
        // dev 2 kept its state: it is not handed a fresh burst.
        assert_eq!(k.take(dev(2), T0 + 100), Ok(()));
        assert_eq!(k.take(dev(2), T0 + 100), Err(100));
        k.prune(T0 + 100 + 3_000);
        assert!(k.is_empty());
    }

    #[test]
    fn keys_are_limited_apart() {
        let mut k = KeyedLimits::new(TokenBucket::new(20, 100));
        assert_eq!(drain_key(&mut k, dev(1)), 100);
        assert_eq!(drain_key(&mut k, dev(2)), 100);
    }

    fn drain_key(k: &mut KeyedLimits<DeviceKey, TokenBucket>, d: DeviceKey) -> usize {
        let mut n = 0;
        while k.take(d, T0).is_ok() {
            n += 1;
        }
        n
    }

    // --- The four limiters ---

    #[test]
    fn the_limits_are_the_specs() {
        let l = Limits::default();
        assert_eq!((l.frames_per_sec, l.frame_burst), (20, 100));
        assert_eq!((l.control_per_sec, l.control_burst), (10, 30));
        assert_eq!((l.slots_per_hour, l.new_keys_per_hour), (30, 20));
    }

    #[test]
    fn the_frame_limiter_bursts_to_100_at_20_a_second() {
        let mut f = FrameLimiter::new(&Limits::default());
        for _ in 0..100 {
            f.take(dev(1), T0).unwrap();
        }
        assert_eq!(f.take(dev(1), T0), Err(50));
        assert_eq!(f.take(dev(1), T0 + 50), Ok(()));
        assert_eq!(f.take(dev(1), T0 + 25), Err(75));
        assert_eq!(f.take(dev(1), T0 + 100), Ok(()));
        assert_eq!(f.take(dev(2), T0), Ok(()));
        f.prune(T0 + 100 + 5_000);
        assert!(f.is_empty());
    }

    #[test]
    fn the_control_limiter_bursts_to_30_at_10_a_second() {
        let mut c = ControlLimiter::new(&Limits::default());
        let passed = (0..100).filter(|_| c.take(dev(1), T0).is_ok()).count();
        assert_eq!(passed, 30);
        assert_eq!(c.take(dev(1), T0), Err(100));
        assert_eq!(c.take(dev(1), T0 + 100), Ok(()));
        assert_eq!(c.take(dev(1), T0 + 50), Err(150));
        assert_eq!(c.take(dev(1), T0 + 200), Ok(()));
        let mut c = ControlLimiter::new(&Limits::default());
        for step in 0..400u64 {
            assert_eq!(c.take(dev(1), T0 + step * 100), Ok(()), "step {step}");
        }
        c.prune(T0 + 400 * 100 + 3_000);
        assert!(c.is_empty());
    }

    /// AC 3 (ticket AC 4).
    #[test]
    fn thirty_slots_fit_in_an_hour_and_the_31st_is_refused() {
        let mut s = SlotLimiter::new(&Limits::default());
        for n in 0..30u64 {
            assert_eq!(s.try_open(dev(1), T0 + n * 60_000), Ok(()), "open {n}");
        }
        let at = T0 + 30 * 60_000;
        assert_eq!(s.try_open(dev(1), at), Err(T0 + HOUR_MS - at));
        // A refused open isn't counted: retrying at the first's expiry gets in.
        assert_eq!(s.try_open(dev(1), at + 1), Err(T0 + HOUR_MS - at - 1));
        assert_eq!(s.try_open(dev(1), T0 + HOUR_MS), Ok(()));
        assert_eq!(s.try_open(dev(1), T0 + HOUR_MS), Err(60_000));
        // A second Mac is unaffected.
        for _ in 0..30 {
            s.try_open(dev(2), at).unwrap();
        }
        // Back then forward.
        assert!(s.try_open(dev(2), T0).is_err());
        assert_eq!(s.try_open(dev(2), at + HOUR_MS), Ok(()));
        s.prune(at + 3 * HOUR_MS);
        assert!(s.is_empty());
    }

    #[test]
    fn new_keys_are_20_an_hour_per_ip() {
        let mut n = NewKeyLimiter::new(&Limits::default());
        let ip: IpAddr = "203.0.113.7".parse().unwrap();
        for _ in 0..20 {
            n.take(ip, T0).unwrap();
        }
        assert_eq!(n.take(ip, T0), Err(HOUR_MS));
        // The same address, IPv4-mapped, shares the budget.
        let mapped: IpAddr = "::ffff:203.0.113.7".parse().unwrap();
        assert_eq!(n.take(mapped, T0 + 1), Err(HOUR_MS - 1));
        // Another IPv4 address, and two IPv6 addresses in one /64, each count alone.
        for other in ["203.0.113.8", "2001:db8::1", "2001:db8::2"] {
            let other: IpAddr = other.parse().unwrap();
            for _ in 0..20 {
                n.take(other, T0).unwrap();
            }
            assert!(n.take(other, T0).is_err(), "{other}");
        }
        assert_eq!(n.take(ip, T0 + HOUR_MS), Ok(()));
        n.prune(T0 + 3 * HOUR_MS);
        assert!(n.is_empty());
    }

    #[test]
    fn ip_key_maps_ipv4_mapped_ipv6_to_ipv4_only() {
        let v4: IpAddr = "198.51.100.1".parse().unwrap();
        assert_eq!(ip_key(v4), v4);
        assert_eq!(ip_key("::ffff:198.51.100.1".parse().unwrap()), v4);
        let v6: IpAddr = "2001:db8::1".parse().unwrap();
        assert_eq!(ip_key(v6), v6);
        // IPv4-compatible (deprecated) addresses and loopback stay IPv6.
        let compat: IpAddr = "::198.51.100.1".parse().unwrap();
        assert_eq!(ip_key(compat), compat);
        let lo6: IpAddr = "::1".parse().unwrap();
        assert_eq!(ip_key(lo6), lo6);
    }
}

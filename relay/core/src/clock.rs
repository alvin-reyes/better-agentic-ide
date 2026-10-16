//! Time, injected. The relay reads Unix milliseconds only through a `Clock`, so tests
//! drive storage times, cleanup and (story 7b) the limiters with a `ManualClock`.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// Where the relay gets the time: Unix milliseconds.
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
}

/// The system's wall clock.
#[derive(Clone, Copy, Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}

/// A clock that moves only when told. Share it as `Arc<ManualClock>`.
#[derive(Debug)]
pub struct ManualClock {
    ms: AtomicU64,
}

/// 2026-01-01T00:00Z in Unix ms: where a `ManualClock` starts.
pub const MANUAL_CLOCK_START_MS: u64 = 1_767_225_600_000;

impl ManualClock {
    /// A clock at 2026-01-01T00:00Z, a realistic time rather than 0.
    pub fn new() -> Self {
        Self::at(MANUAL_CLOCK_START_MS)
    }

    /// A clock at `ms`.
    pub fn at(ms: u64) -> Self {
        ManualClock {
            ms: AtomicU64::new(ms),
        }
    }

    /// Sets the time.
    pub fn set(&self, ms: u64) {
        self.ms.store(ms, Ordering::SeqCst);
    }

    /// Moves the time forward.
    pub fn advance(&self, by: Duration) {
        self.ms.fetch_add(by.as_millis() as u64, Ordering::SeqCst);
    }
}

impl Default for ManualClock {
    fn default() -> Self {
        Self::new()
    }
}

impl Clock for ManualClock {
    fn now_ms(&self) -> u64 {
        self.ms.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn a_manual_clock_starts_at_2026_not_at_zero() {
        assert_eq!(ManualClock::new().now_ms(), MANUAL_CLOCK_START_MS);
        // 2026-01-01T00:00:00Z.
        assert_eq!(MANUAL_CLOCK_START_MS, 1_767_225_600 * 1000);
    }

    #[test]
    fn a_manual_clock_moves_only_when_told_and_is_shared() {
        let clock = Arc::new(ManualClock::at(1_000));
        let shared: Arc<dyn Clock> = clock.clone();
        assert_eq!(shared.now_ms(), 1_000);
        clock.advance(Duration::from_millis(250));
        assert_eq!(shared.now_ms(), 1_250);
        clock.set(5);
        assert_eq!(shared.now_ms(), 5);
    }

    #[test]
    fn the_system_clock_reads_unix_ms() {
        let now = SystemClock.now_ms();
        assert!(now > MANUAL_CLOCK_START_MS, "{now}");
    }
}

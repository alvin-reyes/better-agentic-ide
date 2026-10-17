//! `/metrics`: counts only, in the Prometheus text format, behind a Bearer token.

use std::sync::atomic::{AtomicU64, Ordering};

use relay_core::StoreCounts;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// The relay's counters.
#[derive(Debug, Default)]
pub struct Counters {
    pub logins_ok: AtomicU64,
    pub logins_refused: AtomicU64,
    pub cleanup_deleted_devices: AtomicU64,
    /// Story 7b: frames answered `rate_limited`.
    pub rate_limited: AtomicU64,
    /// Control messages answered `control_limited`.
    pub control_limited: AtomicU64,
    /// New keys closed with 4429.
    pub new_keys_refused: AtomicU64,
    /// Connections closed with 4409 by a newer login.
    pub replaced: AtomicU64,
    /// Frames delivered to a peer's queue.
    pub frames_routed: AtomicU64,
    /// Frames to an unpaired or offline key, or to a full queue.
    pub frames_dropped: AtomicU64,
    /// `rehandshake` messages delivered to a peer's queue.
    pub rehandshakes_routed: AtomicU64,
    /// `rehandshake` messages to an unpaired or offline key, or to a full queue.
    pub rehandshakes_dropped: AtomicU64,
    /// Text or binary messages the relay couldn't read, dropped unanswered.
    pub unreadable: AtomicU64,
    /// Later `login` messages on a logged-in connection.
    pub ignored: AtomicU64,
}

/// Story 7b's counters, by name, in the order `/metrics` lists them.
fn story_7b_counters(c: &Counters) -> [(&'static str, &'static str, &AtomicU64); 10] {
    [
        (
            "relay_rate_limited_total",
            "Frames answered rate_limited.",
            &c.rate_limited,
        ),
        (
            "relay_control_limited_total",
            "Control messages answered control_limited.",
            &c.control_limited,
        ),
        (
            "relay_new_keys_refused_total",
            "New keys refused by the per-IP limit.",
            &c.new_keys_refused,
        ),
        (
            "relay_replaced_total",
            "Connections replaced by a newer login.",
            &c.replaced,
        ),
        (
            "relay_frames_routed_total",
            "Frames routed to a peer.",
            &c.frames_routed,
        ),
        (
            "relay_frames_dropped_total",
            "Frames dropped.",
            &c.frames_dropped,
        ),
        (
            "relay_rehandshakes_routed_total",
            "Rehandshakes routed to a peer.",
            &c.rehandshakes_routed,
        ),
        (
            "relay_rehandshakes_dropped_total",
            "Rehandshakes dropped.",
            &c.rehandshakes_dropped,
        ),
        (
            "relay_unreadable_total",
            "Messages that could not be read.",
            &c.unreadable,
        ),
        (
            "relay_ignored_total",
            "Later logins on a logged-in connection.",
            &c.ignored,
        ),
    ]
}

impl Counters {
    /// Adds one to a counter.
    pub fn bump(counter: &AtomicU64) {
        Self::add(counter, 1);
    }

    /// Adds `n` to a counter.
    pub fn add(counter: &AtomicU64, n: u64) {
        counter.fetch_add(n, Ordering::Relaxed);
    }
}

/// Renders the gauges and counters as Prometheus text.
pub fn render(counters: &Counters, online: usize, store: &StoreCounts) -> String {
    let read = |c: &AtomicU64| c.load(Ordering::Relaxed);
    let mut out = String::new();
    let mut gauge = |name: &str, help: &str, value: u64| {
        out.push_str(&format!(
            "# HELP {name} {help}\n# TYPE {name} gauge\n{name} {value}\n"
        ));
    };
    gauge("relay_online", "Devices online now.", online as u64);
    gauge("relay_devices", "Devices stored.", store.devices);
    gauge("relay_pairs", "Pairs stored.", store.pairs);
    gauge(
        "relay_pairs_acked",
        "Pairs stored and acked.",
        store.pairs_acked,
    );
    gauge(
        "relay_push_tokens",
        "Push tokens stored.",
        store.push_tokens,
    );
    out.push_str(&format!(
        "# HELP relay_logins_total Logins, by result.\n\
         # TYPE relay_logins_total counter\n\
         relay_logins_total{{result=\"ok\"}} {}\n\
         relay_logins_total{{result=\"refused\"}} {}\n",
        read(&counters.logins_ok),
        read(&counters.logins_refused),
    ));
    out.push_str(&format!(
        "# HELP relay_cleanup_deleted_devices_total Devices deleted by the 90-day cleanup.\n\
         # TYPE relay_cleanup_deleted_devices_total counter\n\
         relay_cleanup_deleted_devices_total {}\n",
        read(&counters.cleanup_deleted_devices),
    ));
    for (name, help, counter) in story_7b_counters(counters) {
        out.push_str(&format!(
            "# HELP {name} {help}\n# TYPE {name} counter\n{name} {}\n",
            read(counter)
        ));
    }
    out
}

/// Whether an `Authorization` header carries `Bearer <token>`. The scheme name matches
/// in any letter case (RFC 7235); the token must match exactly. The SHA-256 digests of
/// the given and the configured token are compared in constant time, so neither the
/// matching prefix nor the token's length shows in the timing.
pub fn authorized(header: Option<&[u8]>, token: &str) -> bool {
    let Some(header) = header else {
        return false;
    };
    let Some(space) = header.iter().position(|b| *b == b' ') else {
        return false;
    };
    let (scheme, given) = (&header[..space], &header[space + 1..]);
    if !scheme.eq_ignore_ascii_case(b"bearer") {
        return false;
    }
    let given = Sha256::digest(given);
    let token = Sha256::digest(token.as_bytes());
    bool::from(given.as_slice().ct_eq(token.as_slice()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "0123456789abcdef0123456789abcdef";

    /// Matches `^(# .*|relay_[a-z_]+(\{[a-z_]+="[a-z_]+"\})? [0-9]+)$`.
    pub(crate) fn well_formed(line: &str) -> bool {
        if line.starts_with("# ") {
            return true;
        }
        let Some((name, value)) = line.rsplit_once(' ') else {
            return false;
        };
        if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
            return false;
        }
        let snake =
            |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_lowercase() || c == '_');
        let (metric, label) = match name.split_once('{') {
            Some((m, rest)) => (m, Some(rest)),
            None => (name, None),
        };
        let Some(metric) = metric.strip_prefix("relay_") else {
            return false;
        };
        if !snake(metric) {
            return false;
        }
        match label {
            None => true,
            Some(l) => {
                let Some(l) = l.strip_suffix("\"}") else {
                    return false;
                };
                match l.split_once("=\"") {
                    Some((k, v)) => snake(k) && snake(v),
                    None => false,
                }
            }
        }
    }

    #[test]
    fn the_matcher_is_strict() {
        assert!(well_formed("# TYPE relay_online gauge"));
        assert!(well_formed("relay_online 1"));
        assert!(well_formed("relay_logins_total{result=\"ok\"} 2"));
        assert!(!well_formed("relay_online -1"));
        assert!(!well_formed("relay_online 1.5"));
        assert!(!well_formed("relay_online"));
        assert!(!well_formed("online 1"));
        assert!(!well_formed("relay_x{id=\"AB\"} 1"));
        assert!(!well_formed("relay_x{id=\"a\",b=\"c\"} 1"));
        assert!(!well_formed(""));
    }

    #[test]
    fn metrics_render_as_prometheus_counts() {
        let c = Counters::default();
        Counters::add(&c.logins_ok, 2);
        Counters::bump(&c.logins_refused);
        Counters::add(&c.cleanup_deleted_devices, 7);
        for (n, (_, _, counter)) in story_7b_counters(&c).into_iter().enumerate() {
            Counters::add(counter, 10 + n as u64);
        }
        let text = render(
            &c,
            3,
            &StoreCounts {
                devices: 4,
                pairs: 5,
                pairs_acked: 6,
                push_tokens: 8,
            },
        );
        for line in text.lines() {
            assert!(well_formed(line), "{line:?}");
        }
        let values: Vec<&str> = text.lines().filter(|l| !l.starts_with('#')).collect();
        assert_eq!(
            values,
            vec![
                "relay_online 3",
                "relay_devices 4",
                "relay_pairs 5",
                "relay_pairs_acked 6",
                "relay_push_tokens 8",
                "relay_logins_total{result=\"ok\"} 2",
                "relay_logins_total{result=\"refused\"} 1",
                "relay_cleanup_deleted_devices_total 7",
                "relay_rate_limited_total 10",
                "relay_control_limited_total 11",
                "relay_new_keys_refused_total 12",
                "relay_replaced_total 13",
                "relay_frames_routed_total 14",
                "relay_frames_dropped_total 15",
                "relay_rehandshakes_routed_total 16",
                "relay_rehandshakes_dropped_total 17",
                "relay_unreadable_total 18",
                "relay_ignored_total 19",
            ]
        );
        assert!(text.contains("# TYPE relay_frames_routed_total counter"));
        assert!(text.contains("# TYPE relay_online gauge"));
        assert!(text.contains("# TYPE relay_logins_total counter"));
        assert!(text.ends_with('\n'));
    }

    /// The token's length must not leak through timing: `ct_eq` on slices of different
    /// lengths returns early, so the comparison is over fixed-length SHA-256 digests.
    #[test]
    fn the_token_is_compared_as_sha256_digests() {
        let src = include_str!("metrics.rs");
        let body = src
            .split("pub fn authorized")
            .nth(1)
            .and_then(|rest| rest.split("\n}\n").next())
            .unwrap();
        assert!(body.contains("Sha256::digest(given)"), "{body}");
        assert!(body.contains("Sha256::digest(token.as_bytes())"), "{body}");
        assert!(!body.contains("given.ct_eq(token"), "{body}");
    }

    #[test]
    fn the_bearer_scheme_matches_in_any_case() {
        for scheme in ["Bearer", "bearer", "BEARER", "bEaReR"] {
            let header = format!("{scheme} {TOKEN}");
            assert!(authorized(Some(header.as_bytes()), TOKEN), "{scheme}");
        }
    }

    #[test]
    fn the_token_must_match_exactly() {
        let upper = TOKEN.to_ascii_uppercase();
        let short = &TOKEN[..31];
        let long = format!("{TOKEN}0");
        let bad: Vec<String> = vec![
            String::new(),
            "Bearer".into(),
            "Bearer ".into(),
            format!("Bearer {upper}"),
            format!("Bearer {short}"),
            format!("Bearer {long}"),
            format!("Bearer  {TOKEN}"),
            format!("Bearer {TOKEN} "),
            format!("Basic {TOKEN}"),
            format!("Bearerx {TOKEN}"),
            TOKEN.to_string(),
        ];
        for h in &bad {
            assert!(!authorized(Some(h.as_bytes()), TOKEN), "{h:?}");
        }
        assert!(!authorized(None, TOKEN));
        assert!(!authorized(Some(&[0xff, 0xfe]), TOKEN));
    }
}

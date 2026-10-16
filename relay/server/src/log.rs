//! The relay's log, typed so it can carry only codes and counts: every field is a
//! `&'static str` code or a number. Never keys, ids, IPs, tokens or contents.

/// One thing worth logging.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogEvent {
    /// A login was accepted.
    LoginOk { online: usize },
    /// A login was refused (4401), with the reason's code.
    LoginRefused { code: &'static str },
    /// A login hit a store error and was closed with 1011.
    LoginStoreError { code: &'static str },
    /// A device left.
    DeviceLeft { online: usize },
    /// A leave hit a store error; the code says which.
    LeaveStoreError { code: &'static str },
    /// A device's queue was full, so it was dropped.
    QueueFull,
    /// A cleanup ran.
    Cleanup {
        touched: u64,
        devices: u64,
        pairs: u64,
        push_tokens: u64,
    },
    /// A cleanup hit a store error.
    CleanupStoreError { code: &'static str },
    /// `/metrics` couldn't read the store's counts.
    MetricsStoreError { code: &'static str },
    /// The HTTP server stopped with an error.
    ServeError,
}

impl LogEvent {
    /// The line as written: `relay: <event>( <name>=<value>)*`.
    pub fn render(&self) -> String {
        let (name, fields): (&str, Vec<(&str, String)>) = match *self {
            LogEvent::LoginOk { online } => ("login_ok", vec![("online", online.to_string())]),
            LogEvent::LoginRefused { code } => ("login_refused", vec![("code", code.into())]),
            LogEvent::LoginStoreError { code } => {
                ("login_store_error", vec![("code", code.into())])
            }
            LogEvent::DeviceLeft { online } => {
                ("device_left", vec![("online", online.to_string())])
            }
            LogEvent::LeaveStoreError { code } => {
                ("leave_store_error", vec![("code", code.into())])
            }
            LogEvent::QueueFull => ("queue_full", vec![]),
            LogEvent::Cleanup {
                touched,
                devices,
                pairs,
                push_tokens,
            } => (
                "cleanup",
                vec![
                    ("touched", touched.to_string()),
                    ("devices", devices.to_string()),
                    ("pairs", pairs.to_string()),
                    ("push_tokens", push_tokens.to_string()),
                ],
            ),
            LogEvent::CleanupStoreError { code } => {
                ("cleanup_store_error", vec![("code", code.into())])
            }
            LogEvent::MetricsStoreError { code } => {
                ("metrics_store_error", vec![("code", code.into())])
            }
            LogEvent::ServeError => ("serve_error", vec![]),
        };
        let mut line = format!("relay: {name}");
        for (key, value) in fields {
            line.push_str(&format!(" {key}={value}"));
        }
        line
    }
}

/// Where log lines go.
pub trait LogSink: Send + Sync {
    fn log(&self, event: LogEvent);
}

/// The default sink: one line on stderr per event.
#[derive(Clone, Copy, Debug, Default)]
pub struct StderrLog;

impl LogSink for StderrLog {
    fn log(&self, event: LogEvent) {
        eprintln!("{}", event.render());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Matches `^relay: [a-z_]+( [a-z_]+=[0-9a-z_]+)*$` without a regex crate.
    fn well_formed(line: &str) -> bool {
        let Some(rest) = line.strip_prefix("relay: ") else {
            return false;
        };
        let mut parts = rest.split(' ');
        let name = parts.next().unwrap_or("");
        let word = |s: &str, extra: &dyn Fn(char) -> bool| {
            !s.is_empty()
                && s.chars()
                    .all(|c| c.is_ascii_lowercase() || c == '_' || extra(c))
        };
        if !word(name, &|_| false) {
            return false;
        }
        parts.all(|kv| match kv.split_once('=') {
            Some((k, v)) => word(k, &|_| false) && word(v, &|c| c.is_ascii_digit()),
            None => false,
        })
    }

    #[test]
    fn the_matcher_is_strict() {
        assert!(well_formed("relay: login_ok online=3"));
        assert!(well_formed("relay: queue_full"));
        assert!(!well_formed("relay: login_ok online=3 "));
        assert!(!well_formed("relay: Login"));
        assert!(!well_formed("relay: x key=AbC"));
        assert!(!well_formed("relay: x key="));
        assert!(!well_formed("relay: x key=a-b"));
        assert!(!well_formed("relay:x"));
    }

    fn every_variant() -> Vec<LogEvent> {
        vec![
            LogEvent::LoginOk { online: 2 },
            LogEvent::LoginRefused {
                code: "bad_signature",
            },
            LogEvent::LoginStoreError { code: "busy" },
            LogEvent::DeviceLeft { online: 0 },
            LogEvent::LeaveStoreError { code: "injected" },
            LogEvent::QueueFull,
            LogEvent::Cleanup {
                touched: 1,
                devices: 2,
                pairs: 3,
                push_tokens: 4,
            },
            LogEvent::CleanupStoreError { code: "sqlite" },
            LogEvent::MetricsStoreError { code: "sqlite" },
            LogEvent::ServeError,
        ]
    }

    #[test]
    fn every_variant_renders_as_codes_and_counts() {
        for event in every_variant() {
            let line = event.render();
            assert!(well_formed(&line), "{event:?} rendered as {line:?}");
        }
    }

    #[test]
    fn lines_read_as_expected() {
        assert_eq!(
            LogEvent::LoginOk { online: 2 }.render(),
            "relay: login_ok online=2"
        );
        assert_eq!(
            LogEvent::LoginRefused {
                code: "bad_signature"
            }
            .render(),
            "relay: login_refused code=bad_signature"
        );
        assert_eq!(
            LogEvent::Cleanup {
                touched: 1,
                devices: 2,
                pairs: 3,
                push_tokens: 4
            }
            .render(),
            "relay: cleanup touched=1 devices=2 pairs=3 push_tokens=4"
        );
        assert_eq!(LogEvent::QueueFull.render(), "relay: queue_full");
    }
}

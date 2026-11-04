//! The relay's binary.
//!
//! - `RELAY_HOSTS` (required): comma-separated host names a login may be signed for, each
//!   a bare name or a bracketed IPv6 literal, with no scheme, port, path or user.
//! - `RELAY_LISTEN` (default `0.0.0.0:8080`): where it listens.
//! - `RELAY_DB` (required): the SQLite file's path.
//! - `RELAY_METRICS_TOKEN` (optional): the Bearer token for `/metrics`, at least 32
//!   characters. Without one, `/metrics` answers 404.
//! - `RELAY_CLIENT_IP` (default `socket`): where a connection's IP comes from, for the
//!   new-key limit: `socket`, or `fly-client-ip` to trust Fly's `Fly-Client-IP` header
//!   (falling back to the socket address).
//!
//! A missing, bad or non-Unicode value exits 2; a database that won't open, a relay that
//! can't listen, or a server that stops, exits 1.

use std::ffi::OsString;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use relay_server::{serve, ClientIp, Config, SqliteStore};

/// The shortest `/metrics` token accepted.
const MIN_METRICS_TOKEN: usize = 32;

struct Settings {
    listen: SocketAddr,
    hosts: Vec<String>,
    db: PathBuf,
    metrics_token: Option<String>,
    client_ip: ClientIp,
}

#[tokio::main]
async fn main() {
    let settings = settings().unwrap_or_else(|e| {
        eprintln!("relay: {e}");
        std::process::exit(2);
    });
    eprintln!("relay: hosts {}", settings.hosts.join(","));
    let store = SqliteStore::open(&settings.db).unwrap_or_else(|e| {
        eprintln!("relay: cannot open RELAY_DB: {}", e.code());
        std::process::exit(1);
    });
    let mut config = Config::new(settings.listen, settings.hosts, Arc::new(store));
    config.metrics_token = settings.metrics_token;
    config.client_ip = settings.client_ip;
    let relay = match serve(config).await {
        Ok(relay) => {
            eprintln!("relay: listening on {}", relay.addr);
            relay
        }
        Err(e) => {
            eprintln!("relay: cannot listen: {}", e.kind());
            std::process::exit(1);
        }
    };
    // The server ends only on a fatal error.
    let _ = relay.wait().await;
    eprintln!("relay: server stopped");
    std::process::exit(1);
}

fn settings() -> Result<Settings, String> {
    let listen = env_text("RELAY_LISTEN", std::env::var_os("RELAY_LISTEN"))?
        .unwrap_or_else(|| "0.0.0.0:8080".into());
    let listen = listen
        .parse()
        .map_err(|_| "RELAY_LISTEN is not an address".to_string())?;
    let hosts = hosts_from(env_text("RELAY_HOSTS", std::env::var_os("RELAY_HOSTS"))?)?;
    let db = db_from(env_text("RELAY_DB", std::env::var_os("RELAY_DB"))?)?;
    let metrics_token = metrics_token_from(env_text(
        "RELAY_METRICS_TOKEN",
        std::env::var_os("RELAY_METRICS_TOKEN"),
    )?)?;
    let client_ip = client_ip_from(env_text(
        "RELAY_CLIENT_IP",
        std::env::var_os("RELAY_CLIENT_IP"),
    )?)?;
    Ok(Settings {
        listen,
        hosts,
        db,
        metrics_token,
        client_ip,
    })
}

/// `RELAY_CLIENT_IP`: `socket` (the default) or `fly-client-ip`. Anything else is an
/// error, so a typo can't quietly trust or ignore the header.
fn client_ip_from(value: Option<String>) -> Result<ClientIp, String> {
    match value.as_deref() {
        None | Some("socket") => Ok(ClientIp::Socket),
        Some("fly-client-ip") => Ok(ClientIp::FlyClientIp),
        Some(_) => Err("RELAY_CLIENT_IP must be socket or fly-client-ip".into()),
    }
}

/// `RELAY_DB` is required: a default would quietly lose every pair on a restart.
fn db_from(value: Option<String>) -> Result<PathBuf, String> {
    match value {
        Some(path) if !path.is_empty() => Ok(PathBuf::from(path)),
        _ => Err("RELAY_DB is required (the SQLite file's path)".into()),
    }
}

/// `RELAY_METRICS_TOKEN` is optional; when set it must be long enough to guess at no
/// better than chance. The message never repeats the value.
fn metrics_token_from(value: Option<String>) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(token) if token.chars().count() >= MIN_METRICS_TOKEN => Ok(Some(token)),
        Some(_) => Err(format!(
            "RELAY_METRICS_TOKEN must be at least {MIN_METRICS_TOKEN} characters"
        )),
    }
}

/// An environment value as text: unset is `None`, and a non-Unicode value is an error
/// rather than a silent default.
fn env_text(name: &str, value: Option<OsString>) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(v) => v
            .into_string()
            .map(Some)
            .map_err(|_| format!("{name} is not valid Unicode")),
    }
}

/// `RELAY_HOSTS` is required: a default would quietly sign the relay up for the wrong
/// name.
fn hosts_from(value: Option<String>) -> Result<Vec<String>, String> {
    let raw =
        value.ok_or_else(|| "RELAY_HOSTS is required (comma-separated host names)".to_string())?;
    parse_hosts(&raw)
}

/// The comma-separated host list. Each entry is a bare host name or a bracketed IPv6
/// literal; an empty list would refuse every login, so it is an error.
fn parse_hosts(raw: &str) -> Result<Vec<String>, String> {
    let hosts: Vec<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .map(str::to_string)
        .collect();
    if hosts.is_empty() {
        return Err("RELAY_HOSTS names no host".into());
    }
    for host in &hosts {
        let bracketed = host.starts_with('[') && host.ends_with(']');
        if host.contains('/') || host.contains('@') || (host.contains(':') && !bracketed) {
            return Err(format!(
                "RELAY_HOSTS entry {host:?} must be a bare host name, with no scheme, port, path or user"
            ));
        }
    }
    Ok(hosts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_are_required() {
        assert!(hosts_from(None).is_err());
        assert_eq!(
            hosts_from(Some("localhost".into())),
            Ok(vec!["localhost".to_string()])
        );
    }

    #[test]
    fn a_host_entry_must_be_a_bare_name() {
        for bad in [
            "relay.fly.dev:443",
            "wss://relay.fly.dev",
            "relay.fly.dev/ws",
            "user@relay.fly.dev",
            "::1",
            "[::1]:8080",
        ] {
            assert!(parse_hosts(bad).is_err(), "{bad}");
            assert!(parse_hosts(&format!("localhost,{bad}")).is_err(), "{bad}");
        }
        assert_eq!(
            parse_hosts("[::1], relay.fly.dev"),
            Ok(vec!["[::1]".to_string(), "relay.fly.dev".to_string()])
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_non_unicode_value_is_an_error_not_a_default() {
        use std::os::unix::ffi::OsStringExt;
        let bad = std::ffi::OsString::from_vec(vec![0x66, 0xff, 0x6f]);
        assert!(env_text("RELAY_HOSTS", Some(bad)).is_err());
        assert_eq!(env_text("RELAY_HOSTS", None), Ok(None));
        assert_eq!(
            env_text("RELAY_HOSTS", Some("localhost".into())),
            Ok(Some("localhost".to_string()))
        );
    }

    #[test]
    fn the_database_path_is_required() {
        assert!(db_from(None).is_err());
        assert!(db_from(Some(String::new())).is_err());
        assert_eq!(
            db_from(Some("/data/relay.db".into())),
            Ok(PathBuf::from("/data/relay.db"))
        );
    }

    #[test]
    fn a_metrics_token_is_optional_but_at_least_32_characters() {
        assert_eq!(metrics_token_from(None), Ok(None));
        let ok = "x".repeat(32);
        assert_eq!(metrics_token_from(Some(ok.clone())), Ok(Some(ok)));
        for short in [String::new(), "x".repeat(31)] {
            let err = metrics_token_from(Some(short.clone())).unwrap_err();
            assert!(err.contains("RELAY_METRICS_TOKEN"), "{err}");
            if !short.is_empty() {
                assert!(!err.contains(&short), "the message repeats the token");
            }
        }
        // Characters, not bytes: 31 two-byte characters are still too short.
        assert!(metrics_token_from(Some("é".repeat(31))).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_database_that_will_not_open_is_an_error() {
        // The bin exits 1 on this error; here, the store refuses a directory.
        let dir = std::env::temp_dir();
        assert!(SqliteStore::open(&dir).is_err());
    }

    #[test]
    fn the_client_ip_source_is_socket_or_fly_client_ip() {
        assert_eq!(client_ip_from(None), Ok(ClientIp::Socket));
        assert_eq!(client_ip_from(Some("socket".into())), Ok(ClientIp::Socket));
        assert_eq!(
            client_ip_from(Some("fly-client-ip".into())),
            Ok(ClientIp::FlyClientIp)
        );
        for bad in ["", "Socket", "fly", "x-forwarded-for", "fly-client-ip "] {
            let err = client_ip_from(Some(bad.into())).unwrap_err();
            assert!(err.contains("RELAY_CLIENT_IP"), "{bad:?}: {err}");
        }
    }

    #[test]
    fn an_empty_host_list_is_refused() {
        assert!(parse_hosts("").is_err());
        assert!(parse_hosts(" , ,").is_err());
    }

    #[test]
    fn hosts_are_comma_separated_and_trimmed() {
        assert_eq!(
            parse_hosts("relay.fly.dev, remote.example.com,,"),
            Ok(vec![
                "relay.fly.dev".to_string(),
                "remote.example.com".to_string()
            ])
        );
    }
}

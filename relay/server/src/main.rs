//! The relay's binary.
//!
//! - `RELAY_HOSTS` (required): comma-separated host names a login may be signed for, each
//!   a bare name or a bracketed IPv6 literal, with no scheme, port, path or user.
//! - `RELAY_LISTEN` (default `0.0.0.0:8080`): where it listens.
//!
//! A bad or non-Unicode value exits 2; a relay that can't listen, or whose server
//! stops, exits 1.

use std::ffi::OsString;
use std::sync::Arc;

use relay_core::InMemoryPairs;
use relay_server::{serve, Config};

#[tokio::main]
async fn main() {
    let (listen, hosts) = settings().unwrap_or_else(|e| {
        eprintln!("relay: {e}");
        std::process::exit(2);
    });
    eprintln!("relay: hosts {}", hosts.join(","));
    // Pairs are held in memory until story 7 adds the database.
    let config = Config::new(listen, hosts, Arc::new(InMemoryPairs::new()));
    let handle = match serve(config).await {
        Ok((addr, handle)) => {
            eprintln!("relay: listening on {addr}");
            handle
        }
        Err(e) => {
            eprintln!("relay: cannot listen: {}", e.kind());
            std::process::exit(1);
        }
    };
    // The server task ends only on a fatal error.
    let _ = handle.await;
    eprintln!("relay: server stopped");
    std::process::exit(1);
}

fn settings() -> Result<(std::net::SocketAddr, Vec<String>), String> {
    let listen = env_text("RELAY_LISTEN", std::env::var_os("RELAY_LISTEN"))?
        .unwrap_or_else(|| "0.0.0.0:8080".into());
    let listen = listen
        .parse()
        .map_err(|_| "RELAY_LISTEN is not an address".to_string())?;
    let hosts = hosts_from(env_text("RELAY_HOSTS", std::env::var_os("RELAY_HOSTS"))?)?;
    Ok((listen, hosts))
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

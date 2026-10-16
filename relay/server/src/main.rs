//! The relay's binary. `RELAY_LISTEN` (default `0.0.0.0:8080`) is where it listens;
//! `RELAY_HOSTS` (comma-separated, default `localhost`) are the host names a login may
//! be signed for.

use std::sync::Arc;

use relay_core::InMemoryPairs;
use relay_server::{serve, Config};

#[tokio::main]
async fn main() {
    let listen = std::env::var("RELAY_LISTEN").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let listen = listen.parse().unwrap_or_else(|_| {
        eprintln!("relay: RELAY_LISTEN is not an address");
        std::process::exit(2);
    });
    let hosts = parse_hosts(&std::env::var("RELAY_HOSTS").unwrap_or_else(|_| "localhost".into()))
        .unwrap_or_else(|e| {
            eprintln!("relay: {e}");
            std::process::exit(2);
        });
    // Pairs are held in memory until story 7 adds the database.
    let config = Config::new(listen, hosts, Arc::new(InMemoryPairs::new()));
    match serve(config).await {
        Ok((addr, handle)) => {
            eprintln!("relay: listening on {addr}");
            let _ = handle.await;
        }
        Err(e) => {
            eprintln!("relay: cannot listen: {}", e.kind());
            std::process::exit(1);
        }
    }
}

/// The comma-separated host list. An empty one would refuse every login, so it is an
/// error.
fn parse_hosts(raw: &str) -> Result<Vec<String>, &'static str> {
    let hosts: Vec<String> = raw
        .split(',')
        .map(str::trim)
        .filter(|h| !h.is_empty())
        .map(str::to_string)
        .collect();
    if hosts.is_empty() {
        return Err("RELAY_HOSTS names no host");
    }
    Ok(hosts)
}

#[cfg(test)]
mod tests {
    use super::*;

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

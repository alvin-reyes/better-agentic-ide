//! The relay's test client. `relay-cli --url ws://localhost:8080/ --role mac --key-file id.key`
//! logs in and prints each event; the key file is created if it's missing.

use std::path::PathBuf;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use relay_cli::{load_or_create_key, Client, Event};
use relay_protocol::Role;

#[derive(Debug, PartialEq)]
struct Args {
    url: String,
    role: Role,
    key_file: PathBuf,
}

const USAGE: &str = "usage: relay-cli --url <ws-url> --role <mac|phone> --key-file <path>";

fn parse_args(args: &[String]) -> Result<Args, String> {
    let (mut url, mut role, mut key_file) = (None, None, None);
    let mut it = args.iter();
    while let Some(flag) = it.next() {
        let value = it.next().ok_or_else(|| format!("{flag} needs a value"))?;
        match flag.as_str() {
            "--url" => url = Some(value.clone()),
            "--role" => {
                role = Some(match value.as_str() {
                    "mac" => Role::Mac,
                    "phone" => Role::Phone,
                    _ => return Err("--role is mac or phone".into()),
                })
            }
            "--key-file" => key_file = Some(PathBuf::from(value)),
            _ => return Err(format!("unknown flag {flag}")),
        }
    }
    Ok(Args {
        url: url.ok_or("--url is required")?,
        role: role.ok_or("--role is required")?,
        key_file: key_file.ok_or("--key-file is required")?,
    })
}

fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

#[tokio::main]
async fn main() {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    let args = parse_args(&raw).unwrap_or_else(|e| {
        eprintln!("{e}\n{USAGE}");
        std::process::exit(2);
    });
    let key = load_or_create_key(&args.key_file).unwrap_or_else(|e| {
        eprintln!("key file: {e}");
        std::process::exit(1);
    });
    println!("id {}", b64(&key.verifying_key().to_bytes()));
    let mut client = Client::connect(&args.url, args.role, &key)
        .await
        .unwrap_or_else(|e| {
            eprintln!("{e}");
            std::process::exit(1);
        });
    loop {
        match client.next_event().await {
            Ok(Event::Welcome { pairs, online }) => {
                println!("welcome: {} pairs, {} online", pairs.len(), online.len());
                for p in pairs {
                    println!(
                        "  pair {} with {} ({})",
                        b64(&p.pair_id.0),
                        b64(&p.peer_id.0),
                        p.peer_role.as_str()
                    );
                }
            }
            Ok(Event::Presence { peer, online }) => {
                println!(
                    "presence {} {}",
                    b64(&peer.0),
                    if online { "online" } else { "offline" }
                )
            }
            Ok(Event::RateLimited { peer, retry_ms }) => {
                println!("rate_limited {} retry_ms {retry_ms}", b64(&peer.0))
            }
            Ok(Event::ControlLimited { msg, retry_ms, .. }) => {
                println!("control_limited {msg} retry_ms {retry_ms}")
            }
            Ok(Event::Rehandshake { peer }) => println!("rehandshake {}", b64(&peer.0)),
            Ok(Event::Closed { code, reason }) => {
                println!("closed {code} {reason}");
                std::process::exit(if code == 4401 { 3 } else { 0 });
            }
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(args: &[&str]) -> Vec<String> {
        args.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reads_url_role_and_key_file() {
        assert_eq!(
            parse_args(&strings(&[
                "--url",
                "ws://localhost:8080/",
                "--role",
                "phone",
                "--key-file",
                "k"
            ])),
            Ok(Args {
                url: "ws://localhost:8080/".into(),
                role: Role::Phone,
                key_file: PathBuf::from("k"),
            })
        );
    }

    #[test]
    fn refuses_a_bad_role_or_a_missing_flag() {
        assert!(parse_args(&strings(&[
            "--url",
            "u",
            "--role",
            "tablet",
            "--key-file",
            "k"
        ]))
        .is_err());
        assert!(parse_args(&strings(&["--url", "u", "--role", "mac"])).is_err());
        assert!(parse_args(&strings(&["--url"])).is_err());
    }
}

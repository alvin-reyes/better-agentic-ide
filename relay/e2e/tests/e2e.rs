//! Login and presence end to end: a real relay on a random port, driven by the CLI's
//! client and, for the attacks, by a raw WebSocket.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use relay_cli::{Client, Event};
use relay_core::{login_message, InMemoryPairs};
use relay_protocol::{Bytes, Control, DeviceKey, PairInfo, Role};
use relay_server::{serve, Config};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

const WAIT: Duration = Duration::from_secs(5);
const PAIR: Bytes<16> = Bytes([7; 16]);

struct Relay {
    addr: SocketAddr,
    mac: SigningKey,
    phone: SigningKey,
}

impl Relay {
    fn url(&self) -> String {
        format!("ws://localhost:{}/", self.addr.port())
    }
}

fn id_of(k: &SigningKey) -> DeviceKey {
    Bytes(k.verifying_key().to_bytes())
}

/// A relay on 127.0.0.1:0 with hosts `["localhost"]`, short ping times, and the Mac
/// and the phone seeded as a pair.
async fn relay() -> Relay {
    let mac = SigningKey::generate(&mut rand::rngs::OsRng);
    let phone = SigningKey::generate(&mut rand::rngs::OsRng);
    let pairs = Arc::new(InMemoryPairs::new());
    pairs.add(PAIR, id_of(&mac), id_of(&phone));
    let mut config = Config::new(
        "127.0.0.1:0".parse().unwrap(),
        vec!["localhost".into()],
        pairs,
    );
    config.ping_interval = Duration::from_millis(100);
    config.ping_timeout = Duration::from_millis(1000);
    let (addr, _handle) = serve(config).await.expect("relay starts");
    Relay { addr, mac, phone }
}

async fn next(client: &mut Client) -> Event {
    timeout(WAIT, client.next_event())
        .await
        .expect("an event in time")
        .expect("the connection is open")
}

fn refused(event: Event) {
    match event {
        Event::Closed { code, reason } => {
            assert_eq!(code, 4401);
            assert_eq!(reason, "login_refused");
        }
        other => panic!("expected the login to be refused, got {other:?}"),
    }
}

/// A raw socket: reads the challenge and sends a login signed for `host`.
type Raw =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn raw_challenge(url: &str) -> (Raw, [u8; 32]) {
    let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let msg = timeout(WAIT, ws.next()).await.unwrap().unwrap().unwrap();
    let Message::Text(text) = msg else {
        panic!("expected a challenge, got {msg:?}")
    };
    match Control::from_json(&text).unwrap() {
        Control::Challenge { c } => (ws, c.0),
        other => panic!("expected a challenge, got {other:?}"),
    }
}

fn signed_login(key: &SigningKey, c: &[u8; 32], host: &str, role: Role) -> Control {
    Control::Login {
        id: id_of(key),
        role,
        sig: Bytes(key.sign(&login_message(c, host, role)).to_bytes()),
    }
}

/// What the relay sends a raw socket next: a control message, or the close code
/// and reason.
async fn raw_next(ws: &mut Raw) -> Result<Control, (u16, String)> {
    loop {
        match timeout(WAIT, ws.next()).await.expect("a reply in time") {
            Some(Ok(Message::Text(text))) => return Ok(Control::from_json(&text).unwrap()),
            Some(Ok(Message::Close(Some(frame)))) => {
                return Err((u16::from(frame.code), frame.reason.to_string()))
            }
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
            other => panic!("unexpected {other:?}"),
        }
    }
}

#[tokio::test]
async fn both_log_in_and_see_each_other() {
    let r = relay().await;
    let mut mac = Client::connect(&r.url(), Role::Mac, &r.mac).await.unwrap();
    match next(&mut mac).await {
        Event::Welcome { pairs, online } => {
            assert_eq!(
                pairs,
                vec![PairInfo {
                    pair_id: PAIR,
                    peer_id: id_of(&r.phone),
                    peer_role: Role::Phone
                }]
            );
            assert!(online.is_empty());
        }
        other => panic!("{other:?}"),
    }

    let mut phone = Client::connect(&r.url(), Role::Phone, &r.phone)
        .await
        .unwrap();
    match next(&mut phone).await {
        Event::Welcome { pairs, online } => {
            assert_eq!(
                pairs,
                vec![PairInfo {
                    pair_id: PAIR,
                    peer_id: id_of(&r.mac),
                    peer_role: Role::Mac
                }]
            );
            assert_eq!(online, vec![id_of(&r.mac)]);
        }
        other => panic!("{other:?}"),
    }
    match next(&mut mac).await {
        Event::Presence { peer, online } => {
            assert_eq!(peer, id_of(&r.phone));
            assert!(online);
        }
        other => panic!("{other:?}"),
    }
}

#[tokio::test]
async fn a_close_is_seen_as_offline() {
    let r = relay().await;
    let mut mac = Client::connect(&r.url(), Role::Mac, &r.mac).await.unwrap();
    next(&mut mac).await; // welcome
    let mut phone = Client::connect(&r.url(), Role::Phone, &r.phone)
        .await
        .unwrap();
    next(&mut phone).await; // welcome
    next(&mut mac).await; // phone online

    phone.close().await;
    match next(&mut mac).await {
        Event::Presence { peer, online } => {
            assert_eq!(peer, id_of(&r.phone));
            assert!(!online);
        }
        other => panic!("{other:?}"),
    }
}

#[tokio::test]
async fn a_client_that_stops_answering_pings_goes_offline() {
    let r = relay().await;
    let mut mac = Client::connect(&r.url(), Role::Mac, &r.mac).await.unwrap();
    next(&mut mac).await; // welcome
    let mut phone = Client::connect(&r.url(), Role::Phone, &r.phone)
        .await
        .unwrap();
    next(&mut phone).await; // welcome
    next(&mut mac).await; // phone online

    // The phone's socket stays open, but it is never read again, so no pong goes out.
    let started = tokio::time::Instant::now();
    match next(&mut mac).await {
        Event::Presence { peer, online } => {
            assert_eq!(peer, id_of(&r.phone));
            assert!(!online);
        }
        other => panic!("{other:?}"),
    }
    // Gone at the timeout, not a ping interval later: 1000 ms timeout, 100 ms pings.
    let gone_after = started.elapsed();
    assert!(gone_after >= Duration::from_millis(900), "{gone_after:?}");
    assert!(gone_after < Duration::from_millis(1050), "{gone_after:?}");
    drop(phone);
}

#[tokio::test]
async fn a_replayed_login_is_refused() {
    let r = relay().await;
    let (mut first, c) = raw_challenge(&r.url()).await;
    let login = signed_login(&r.phone, &c, "localhost", Role::Phone);
    first.send(Message::text(login.to_json())).await.unwrap();
    assert!(matches!(
        raw_next(&mut first).await,
        Ok(Control::Welcome { .. })
    ));

    let (mut second, _) = raw_challenge(&r.url()).await;
    second.send(Message::text(login.to_json())).await.unwrap();
    assert_eq!(
        raw_next(&mut second).await,
        Err((4401, "login_refused".to_string()))
    );
}

#[tokio::test]
async fn a_login_signed_for_another_host_is_refused() {
    let r = relay().await;
    let (mut ws, c) = raw_challenge(&r.url()).await;
    let login = signed_login(&r.phone, &c, "evil.example", Role::Phone);
    ws.send(Message::text(login.to_json())).await.unwrap();
    assert_eq!(
        raw_next(&mut ws).await,
        Err((4401, "login_refused".to_string()))
    );
}

#[tokio::test]
async fn a_phone_key_cannot_log_in_as_a_mac() {
    let r = relay().await;
    let mut phone = Client::connect(&r.url(), Role::Phone, &r.phone)
        .await
        .unwrap();
    assert!(matches!(next(&mut phone).await, Event::Welcome { .. }));
    phone.close().await;

    let mut again = Client::connect(&r.url(), Role::Mac, &r.phone)
        .await
        .unwrap();
    refused(next(&mut again).await);
}

#[tokio::test]
async fn an_unpaired_key_is_invisible_to_the_pair() {
    let r = relay().await;
    let mut mac = Client::connect(&r.url(), Role::Mac, &r.mac).await.unwrap();
    next(&mut mac).await; // welcome
    let mut phone = Client::connect(&r.url(), Role::Phone, &r.phone)
        .await
        .unwrap();
    next(&mut phone).await; // welcome
    next(&mut mac).await; // phone online

    let stranger_key = SigningKey::generate(&mut rand::rngs::OsRng);
    let mut stranger = Client::connect(&r.url(), Role::Phone, &stranger_key)
        .await
        .unwrap();
    match next(&mut stranger).await {
        Event::Welcome { pairs, online } => {
            assert!(pairs.is_empty());
            assert!(online.is_empty());
        }
        other => panic!("{other:?}"),
    }
    stranger.close().await;

    // Neither device hears anything. Both are read meanwhile, so both keep answering
    // pings; the window outlasts the ping timeout, so a relay that ignored pongs would
    // be caught here too.
    let quiet = Duration::from_millis(1500);
    let (heard_by_mac, heard_by_phone) = tokio::join!(
        timeout(quiet, mac.next_event()),
        timeout(quiet, phone.next_event())
    );
    assert!(heard_by_mac.is_err(), "the Mac heard {heard_by_mac:?}");
    assert!(
        heard_by_phone.is_err(),
        "the phone heard {heard_by_phone:?}"
    );

    // And the next thing the phone hears is the Mac leaving, not the stranger, so the
    // check above can't pass merely because the relay had gone quiet.
    mac.close().await;
    match next(&mut phone).await {
        Event::Presence { peer, online } => {
            assert_eq!(peer, id_of(&r.mac));
            assert!(!online);
        }
        other => panic!("{other:?}"),
    }
}

#[tokio::test]
async fn health_answers_ok() {
    let r = relay().await;
    let mut stream = tokio::net::TcpStream::connect(r.addr).await.unwrap();
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .await
        .unwrap();
    let mut body = String::new();
    timeout(WAIT, stream.read_to_string(&mut body))
        .await
        .unwrap()
        .unwrap();
    assert!(body.starts_with("HTTP/1.1 200"), "{body}");
    assert!(body.ends_with("ok"), "{body}");
}

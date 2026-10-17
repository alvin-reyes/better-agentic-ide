//! Story 7a end to end: storage across restarts, the 90-day cleanup, `/health` and
//! `/metrics`, the canary, and the store-error and held-lock contracts. Times come from
//! a `ManualClock`; cleanup is triggered with `run_cleanup()`.

mod common;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use common::{CaptureLog, CountingStore};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use relay_cli::{Client, Event};
use relay_core::store::CLEANUP_AGE_MS;
use relay_core::{login_message, Clock, ManualClock, PairRecord, Store};
use relay_protocol::{Bytes, Control, DeviceKey, PairId, PairInfo, Role};
use relay_server::{serve, Config, Relay, SqliteStore};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

const WAIT: Duration = Duration::from_secs(5);
const DAY: Duration = Duration::from_secs(24 * 60 * 60);
const HOUR: Duration = Duration::from_secs(60 * 60);
const TOKEN: &str = "metrics-token-0123456789abcdef-0123";

fn key() -> SigningKey {
    SigningKey::generate(&mut rand::rngs::OsRng)
}

fn id_of(k: &SigningKey) -> DeviceKey {
    Bytes(k.verifying_key().to_bytes())
}

fn pair_record(pair_id: PairId, mac: DeviceKey, phone: DeviceKey, at: u64) -> PairRecord {
    PairRecord {
        pair_id,
        mac,
        phone,
        mac_static: Bytes([1; 32]),
        phone_static: Bytes([2; 32]),
        slot: Bytes([3; 16]),
        paired_at: at,
        sig_m: Bytes([4; 64]),
        acked: false,
    }
}

/// A database file in its own temp directory.
struct Db {
    dir: tempfile::TempDir,
}

impl Db {
    fn new() -> Self {
        Db {
            dir: tempfile::tempdir().unwrap(),
        }
    }

    fn path(&self) -> PathBuf {
        self.dir.path().join("relay.db")
    }

    /// Opens the file, wrapped in a `CountingStore`.
    fn open(&self) -> Arc<CountingStore> {
        CountingStore::new(Arc::new(SqliteStore::open(&self.path()).unwrap()))
    }
}

/// A relay on 127.0.0.1:0 with short ping times, the given clock, log and store.
async fn start(
    store: Arc<CountingStore>,
    clock: Arc<ManualClock>,
    log: Arc<CaptureLog>,
    token: Option<&str>,
) -> Relay {
    let mut config = Config::new(
        "127.0.0.1:0".parse().unwrap(),
        vec!["localhost".into()],
        store,
    );
    config.ping_interval = Duration::from_millis(100);
    config.ping_timeout = Duration::from_millis(1000);
    config.clock = clock;
    config.log = log;
    config.metrics_token = token.map(str::to_string);
    serve(config).await.expect("relay starts")
}

fn url(addr: SocketAddr) -> String {
    format!("ws://localhost:{}/", addr.port())
}

async fn next(client: &mut Client) -> Event {
    timeout(WAIT, client.next_event())
        .await
        .expect("an event in time")
        .expect("the connection is open")
}

async fn login(
    addr: SocketAddr,
    role: Role,
    k: &SigningKey,
) -> (Client, Vec<PairInfo>, Vec<DeviceKey>) {
    let mut c = Client::connect(&url(addr), role, k).await.unwrap();
    match next(&mut c).await {
        Event::Welcome { pairs, online } => (c, pairs, online),
        other => panic!("expected a welcome, got {other:?}"),
    }
}

/// Asserts the client hears nothing for `quiet`.
async fn hears_nothing(c: &mut Client, quiet: Duration) {
    let heard = timeout(quiet, c.next_event()).await;
    assert!(heard.is_err(), "heard {heard:?}");
}

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

fn signed_login(k: &SigningKey, c: &[u8; 32], host: &str, role: Role) -> Control {
    Control::Login {
        id: id_of(k),
        role,
        sig: Bytes(k.sign(&login_message(c, host, role)).to_bytes()),
    }
}

/// What the relay sends next: a control message, or the close code and reason.
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

/// A plain HTTP GET: the status code and the body.
async fn get(addr: SocketAddr, path: &str, authorization: Option<&str>) -> (u16, String) {
    let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
    let auth = authorization
        .map(|a| format!("Authorization: {a}\r\n"))
        .unwrap_or_default();
    stream
        .write_all(
            format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n{auth}Connection: close\r\n\r\n")
                .as_bytes(),
        )
        .await
        .unwrap();
    let mut response = String::new();
    timeout(WAIT, stream.read_to_string(&mut response))
        .await
        .unwrap()
        .unwrap();
    let status = response[9..12].parse().unwrap();
    let body = response
        .split_once("\r\n\r\n")
        .map(|(_, b)| b.to_string())
        .unwrap_or_default();
    (status, body)
}

fn metric(body: &str, name: &str) -> u64 {
    body.lines()
        .find_map(|l| l.strip_prefix(name)?.strip_prefix(' ')?.parse().ok())
        .unwrap_or_else(|| panic!("no {name} in {body}"))
}

/// `^(# .*|relay_[a-z_]+(\{[a-z_]+="[a-z_]+"\})? [0-9]+)$`, without a regex crate.
fn metric_line_ok(line: &str) -> bool {
    if line.starts_with("# ") {
        return true;
    }
    let snake = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_lowercase() || c == '_');
    let Some((name, value)) = line.rsplit_once(' ') else {
        return false;
    };
    if value.is_empty() || !value.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    let Some(name) = name.strip_prefix("relay_") else {
        return false;
    };
    match name.split_once('{') {
        None => snake(name),
        Some((metric, label)) => {
            let Some(label) = label.strip_suffix("\"}") else {
                return false;
            };
            match label.split_once("=\"") {
                Some((k, v)) => snake(metric) && snake(k) && snake(v),
                None => false,
            }
        }
    }
}

/// `^relay: [a-z_]+( [a-z_]+=[0-9a-z_]+)*$`, without a regex crate.
fn log_line_ok(line: &str) -> bool {
    let word = |s: &str, digits: bool| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_lowercase() || c == '_' || (digits && c.is_ascii_digit()))
    };
    let Some(rest) = line.strip_prefix("relay: ") else {
        return false;
    };
    let mut parts = rest.split(' ');
    word(parts.next().unwrap_or(""), false)
        && parts.all(|kv| match kv.split_once('=') {
            Some((k, v)) => word(k, false) && word(v, true),
            None => false,
        })
}

// ---------------------------------------------------------------------------------------
// Acceptance criteria
// ---------------------------------------------------------------------------------------

/// AC 1 (ticket AC 1).
#[tokio::test]
async fn storage_survives_a_restart_but_presence_does_not() {
    let db = Db::new();
    let clock = Arc::new(ManualClock::new());
    let (mac, phone) = (key(), key());
    let pair_id: PairId = Bytes([7; 16]);
    let store = db.open();
    let now = clock.now_ms();
    store.register(&id_of(&mac), Role::Mac, now).unwrap();
    store.register(&id_of(&phone), Role::Phone, now).unwrap();
    store
        .insert_pair(&pair_record(pair_id, id_of(&mac), id_of(&phone), now))
        .unwrap();
    assert!(!store.pair(&pair_id).unwrap().unwrap().acked);

    let relay = start(store.clone(), clock.clone(), CaptureLog::new(), None).await;
    let (mut mac_c, _, _) = login(relay.addr, Role::Mac, &mac).await;
    let (_phone_c, _, online) = login(relay.addr, Role::Phone, &phone).await;
    assert_eq!(online, vec![id_of(&mac)]);
    next(&mut mac_c).await; // phone online
    assert!(store.set_acked(&pair_id).unwrap());

    timeout(WAIT, relay.shutdown())
        .await
        .expect("shutdown ends");
    drop(store);

    let store = db.open();
    let relay = start(store.clone(), clock, CaptureLog::new(), None).await;
    let (_mac_c, pairs, online) = login(relay.addr, Role::Mac, &mac).await;
    assert_eq!(
        pairs,
        vec![PairInfo {
            pair_id,
            peer_id: id_of(&phone),
            peer_role: Role::Phone
        }]
    );
    assert!(
        online.is_empty(),
        "presence survived the restart: {online:?}"
    );
    assert!(store.pair(&pair_id).unwrap().unwrap().acked);
    relay.shutdown().await;
}

/// AC 2 (ticket AC 6).
#[tokio::test]
async fn devices_unseen_for_90_days_are_deleted_with_their_pairs_and_tokens() {
    let db = Db::new();
    let clock = Arc::new(ManualClock::new());
    let t0 = clock.now_ms();
    let stale = t0 - CLEANUP_AGE_MS;
    let store = db.open();

    // A stale phone paired with an active Mac, and a stale Mac paired with an active
    // phone. Both phones have a push token.
    let (active_mac, stale_phone) = (key(), key());
    let (stale_mac, active_phone) = (key(), key());
    let (p1, p2): (PairId, PairId) = (Bytes([1; 16]), Bytes([2; 16]));
    store.register(&id_of(&active_mac), Role::Mac, t0).unwrap();
    store
        .register(&id_of(&stale_phone), Role::Phone, stale)
        .unwrap();
    store
        .register(&id_of(&stale_mac), Role::Mac, stale)
        .unwrap();
    store
        .register(&id_of(&active_phone), Role::Phone, t0)
        .unwrap();
    store
        .insert_pair(&pair_record(
            p1,
            id_of(&active_mac),
            id_of(&stale_phone),
            stale,
        ))
        .unwrap();
    store
        .insert_pair(&pair_record(
            p2,
            id_of(&stale_mac),
            id_of(&active_phone),
            stale,
        ))
        .unwrap();
    store
        .put_push_token(&id_of(&stale_phone), "tok-stale", "production", stale)
        .unwrap();
    store
        .put_push_token(&id_of(&active_phone), "tok-active", "production", t0)
        .unwrap();

    let relay = start(store.clone(), clock.clone(), CaptureLog::new(), None).await;
    let (mut mac_c, pairs, _) = login(relay.addr, Role::Mac, &active_mac).await;
    assert_eq!(pairs.len(), 1);

    let counts = relay.run_cleanup().await;
    let mut deleted = counts.deleted.clone();
    deleted.sort();
    let mut want = vec![id_of(&stale_phone), id_of(&stale_mac)];
    want.sort();
    assert_eq!(deleted, want);
    let mut deleted_pairs = counts.deleted_pairs.clone();
    deleted_pairs.sort();
    assert_eq!(deleted_pairs, vec![p1, p2]);
    assert_eq!(
        (counts.devices, counts.pairs, counts.push_tokens),
        (2, 2, 1)
    );

    // The stale phone, its pair and its token are gone; so is the stale Mac and its
    // pair, while its active phone keeps its token.
    assert_eq!(store.device(&id_of(&stale_phone)).unwrap(), None);
    assert_eq!(store.device(&id_of(&stale_mac)).unwrap(), None);
    assert_eq!(store.pair(&p1).unwrap(), None);
    assert_eq!(store.pair(&p2).unwrap(), None);
    assert!(store.device(&id_of(&active_phone)).unwrap().is_some());
    let c = store.counts().unwrap();
    assert_eq!((c.devices, c.pairs, c.push_tokens), (2, 0, 1));

    // Cleanup tells nobody; the Mac's next welcome lists no pair.
    hears_nothing(&mut mac_c, Duration::from_millis(300)).await;
    mac_c.close().await;
    let (mut mac_c, pairs, _) = login(relay.addr, Role::Mac, &active_mac).await;
    assert!(pairs.is_empty(), "{pairs:?}");

    // A device online across 91 days survives: cleanup touches it first.
    let long_lived = key();
    let (_ll_c, _, _) = login(relay.addr, Role::Phone, &long_lived).await;
    clock.advance(DAY * 90);
    relay.run_cleanup().await;
    assert!(store.device(&id_of(&long_lived)).unwrap().is_some());
    clock.advance(DAY);
    relay.run_cleanup().await;
    let d = store.device(&id_of(&long_lived)).unwrap().unwrap();
    assert_eq!(d.last_seen, clock.now_ms(), "cleanup touched it");

    // It also survives a crash: no leave runs (the touch count stays put), and a
    // cleanup on the restarted relay one interval later keeps it.
    let touches = store.count("touch");
    relay.abort();
    let ended = timeout(WAIT, async {
        loop {
            match mac_c.next_event().await {
                Err(_) | Ok(Event::Closed { .. }) => break,
                Ok(_) => continue,
            }
        }
    })
    .await;
    assert!(ended.is_ok(), "abort left a connection open");
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(store.count("touch"), touches, "a leave ran after abort");

    let restarted = db.open();
    let relay = start(restarted.clone(), clock.clone(), CaptureLog::new(), None).await;
    clock.advance(HOUR);
    relay.run_cleanup().await;
    assert!(
        restarted.device(&id_of(&long_lived)).unwrap().is_some(),
        "the long-lived device was deleted after the crash"
    );
    relay.shutdown().await;
}

/// AC 3 (ticket AC 7).
#[tokio::test]
async fn metrics_need_their_token_and_carry_counts_only() {
    let db = Db::new();
    let clock = Arc::new(ManualClock::new());
    let t0 = clock.now_ms();
    let store = db.open();
    let (a, b, c) = (key(), key(), key());
    store.register(&id_of(&a), Role::Mac, t0).unwrap();
    store.register(&id_of(&b), Role::Phone, t0).unwrap();
    store
        .register(&id_of(&c), Role::Phone, t0 - CLEANUP_AGE_MS)
        .unwrap();
    store
        .insert_pair(&pair_record(Bytes([5; 16]), id_of(&a), id_of(&b), t0))
        .unwrap();
    let relay = start(store, clock, CaptureLog::new(), Some(TOKEN)).await;
    let addr = relay.addr;

    // 401 with no token or a wrong one.
    assert_eq!(get(addr, "/metrics", None).await.0, 401);
    for wrong in [
        format!("Bearer {}", &TOKEN[1..]),
        format!("Bearer {TOKEN}x"),
        format!("Basic {TOKEN}"),
        TOKEN.to_string(),
    ] {
        assert_eq!(get(addr, "/metrics", Some(&wrong)).await.0, 401, "{wrong}");
    }

    // A and B log in; one login is refused for a bad signature; B leaves.
    let (mut a_c, _, _) = login(addr, Role::Mac, &a).await;
    let (b_c, _, _) = login(addr, Role::Phone, &b).await;
    next(&mut a_c).await; // B online
    let (mut ws, ch) = raw_challenge(&url(addr)).await;
    let Control::Login { id, role, .. } = signed_login(&key(), &ch, "localhost", Role::Phone)
    else {
        unreachable!()
    };
    let forged = Control::Login {
        id,
        role,
        sig: Bytes([9; 64]),
    };
    ws.send(Message::text(forged.to_json())).await.unwrap();
    assert_eq!(
        raw_next(&mut ws).await,
        Err((4401, "login_refused".to_string()))
    );
    b_c.close().await;
    assert_eq!(
        next(&mut a_c).await,
        Event::Presence {
            peer: id_of(&b),
            online: false
        }
    );
    assert_eq!(relay.run_cleanup().await.deleted, vec![id_of(&c)]);

    for scheme in ["Bearer", "bearer", "BEARER"] {
        let (status, body) = get(addr, "/metrics", Some(&format!("{scheme} {TOKEN}"))).await;
        assert_eq!(status, 200, "{scheme}");
        for line in body.lines() {
            assert!(metric_line_ok(line), "{line:?}");
        }
        assert_eq!(metric(&body, "relay_logins_total{result=\"ok\"}"), 2);
        assert_eq!(metric(&body, "relay_logins_total{result=\"refused\"}"), 1);
        assert_eq!(metric(&body, "relay_devices"), 2);
        assert_eq!(metric(&body, "relay_online"), 1);
        assert_eq!(metric(&body, "relay_cleanup_deleted_devices_total"), 1);
        assert_eq!(metric(&body, "relay_pairs"), 1);
        assert_eq!(metric(&body, "relay_pairs_acked"), 0);
        assert_eq!(metric(&body, "relay_push_tokens"), 0);
    }

    // /health needs no token.
    let (status, body) = get(addr, "/health", None).await;
    assert_eq!((status, body.as_str()), (200, "ok"));
    relay.shutdown().await;

    // With no token configured, /metrics is not there at all.
    let db = Db::new();
    let relay = start(
        db.open(),
        Arc::new(ManualClock::new()),
        CaptureLog::new(),
        None,
    )
    .await;
    assert_eq!(get(relay.addr, "/metrics", None).await.0, 404);
    assert_eq!(
        get(relay.addr, "/metrics", Some(&format!("Bearer {TOKEN}")))
            .await
            .0,
        404
    );
    relay.shutdown().await;
}

/// AC 4 (ticket AC 8).
#[tokio::test]
async fn the_canary_never_reaches_logs_or_the_database() {
    const CANARY: &str = "canary7a9f3e2b1dzz";
    let db = Db::new();
    let clock = Arc::new(ManualClock::new());
    let log = CaptureLog::new();
    let store = db.open();
    let (mac, phone) = (key(), key());
    let now = clock.now_ms();
    store.register(&id_of(&mac), Role::Mac, now).unwrap();
    store.register(&id_of(&phone), Role::Phone, now).unwrap();
    store
        .insert_pair(&pair_record(
            Bytes([8; 16]),
            id_of(&mac),
            id_of(&phone),
            now,
        ))
        .unwrap();
    let relay = start(store, clock, log.clone(), Some(TOKEN)).await;
    let addr = relay.addr;

    // A login with an extra field carrying the canary.
    let mut sockets = Vec::new();
    for (k, role) in [(&mac, Role::Mac), (&phone, Role::Phone)] {
        let (mut ws, c) = raw_challenge(&url(addr)).await;
        let json = signed_login(k, &c, "localhost", role).to_json();
        let with_canary = format!("{{\"x\":\"{CANARY}\",{}", &json[1..]);
        ws.send(Message::text(with_canary)).await.unwrap();
        assert!(matches!(
            raw_next(&mut ws).await,
            Ok(Control::Welcome { .. })
        ));
        sockets.push(ws);
    }
    // A refused login carrying it too.
    let (mut ws, _) = raw_challenge(&url(addr)).await;
    ws.send(Message::text(format!(
        "{{\"v\":1,\"t\":\"login\",\"id\":\"{CANARY}\"}}"
    )))
    .await
    .unwrap();
    assert_eq!(
        raw_next(&mut ws).await,
        Err((4401, "login_refused".to_string()))
    );

    // Binary frames, and control messages of known and unknown types.
    let ws = &mut sockets[0];
    ws.send(Message::binary(CANARY.as_bytes().to_vec()))
        .await
        .unwrap();
    for text in [
        format!("{{\"v\":1,\"t\":\"presence\",\"peer\":\"{CANARY}\",\"online\":true}}"),
        format!("{{\"v\":1,\"t\":\"{CANARY}\",\"body\":\"{CANARY}\"}}"),
        format!("{{\"v\":1,\"t\":\"welcome\",\"pairs\":[],\"online\":[],\"x\":\"{CANARY}\"}}"),
    ] {
        ws.send(Message::text(text)).await.unwrap();
    }

    // Story 7b: a routed frame, a dropped frame, a `rehandshake`, frames over the frame
    // limit and control messages over the control limit, each carrying the canary. The
    // clock is frozen, so the limits are reached.
    let frame = |to: DeviceKey| {
        relay_protocol::Routed {
            kind: relay_protocol::RoutedKind::Frame,
            peer: to,
            body: CANARY.as_bytes().to_vec(),
        }
        .encode()
    };
    ws.send(Message::binary(frame(id_of(&phone))))
        .await
        .unwrap();
    ws.send(Message::binary(frame(id_of(&key()))))
        .await
        .unwrap();
    ws.send(Message::text(format!(
        "{{\"v\":1,\"t\":\"rehandshake\",\"peer\":\"{}\",\"x\":\"{CANARY}\"}}",
        base64_url(&id_of(&phone).0)
    )))
    .await
    .unwrap();
    for _ in 0..101 {
        ws.send(Message::binary(frame(id_of(&phone))))
            .await
            .unwrap();
    }
    for _ in 0..31 {
        ws.send(Message::text(format!(
            "{{\"v\":1,\"t\":\"pair_status\",\"slot\":\"{CANARY}\",\"x\":\"{CANARY}\"}}"
        )))
        .await
        .unwrap();
    }

    // The WebSocket path, and the Authorization header of a refused /metrics call.
    assert!(
        tokio_tungstenite::connect_async(format!("ws://localhost:{}/{CANARY}", addr.port()))
            .await
            .is_err()
    );
    assert_eq!(
        get(addr, "/metrics", Some(&format!("Bearer {CANARY}")))
            .await
            .0,
        401
    );

    // The Mac's socket still answers after all of it, so the frames above were read and
    // ignored; then the phone leaves, so a leave is logged and stored too.
    // It was answered `rate_limited` and `control_limited`, so the limits were reached.
    let (mut rate_limited, mut control_limited) = (false, false);
    let pong = timeout(WAIT, async {
        loop {
            match sockets[0].next().await {
                Some(Ok(Message::Ping(_))) if rate_limited && control_limited => return,
                Some(Ok(Message::Text(text))) => match Control::from_json(&text) {
                    Ok(Control::RateLimited { .. }) => rate_limited = true,
                    Ok(Control::ControlLimited { .. }) => control_limited = true,
                    _ => {}
                },
                Some(Ok(_)) => {}
                _ => return,
            }
        }
    })
    .await;
    assert!(pong.is_ok(), "the Mac's connection died");
    assert!(rate_limited && control_limited, "a limit was not reached");
    sockets[1].close(None).await.ok();
    tokio::time::sleep(Duration::from_millis(300)).await;

    let lines = log.lines();
    assert!(
        lines.iter().any(|l| l.starts_with("relay: login_ok")),
        "{lines:?}"
    );
    for line in &lines {
        assert!(log_line_ok(line), "{line:?}");
        assert!(!line.contains(CANARY), "{line:?}");
    }

    // The database files, read before shutdown since a checkpoint can remove them.
    let path = db.path();
    let wal = sibling(&path, "-wal");
    let shm = sibling(&path, "-shm");
    assert!(
        path.exists() && wal.exists(),
        "expected the database and its -wal"
    );
    for file in [&path, &wal, &shm] {
        if let Ok(bytes) = std::fs::read(file) {
            assert!(
                !bytes.windows(CANARY.len()).any(|w| w == CANARY.as_bytes()),
                "the canary is in {}",
                file.display()
            );
        }
    }
    relay.shutdown().await;
}

fn base64_url(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

// ---------------------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------------------

#[tokio::test]
async fn a_store_error_at_login_closes_1011_without_welcome() {
    let db = Db::new();
    let store = db.open();
    let log = CaptureLog::new();
    let relay = start(
        store.clone(),
        Arc::new(ManualClock::new()),
        log.clone(),
        None,
    )
    .await;
    let k = key();
    for method in ["device", "register", "peers_of"] {
        store.fail(method);
        let (mut ws, c) = raw_challenge(&url(relay.addr)).await;
        ws.send(Message::text(
            signed_login(&k, &c, "localhost", Role::Phone).to_json(),
        ))
        .await
        .unwrap();
        assert_eq!(
            raw_next(&mut ws).await,
            Err((1011, "internal_error".to_string())),
            "{method}"
        );
        store.heal(method);
    }
    // register failing while device succeeds: the per-method switch.
    assert!(store.count("device") >= 3);
    assert!(log.has("relay: login_store_error code=injected"));
    // And the next login, with the store healthy, is welcomed.
    let (_c, _, _) = login(relay.addr, Role::Phone, &k).await;
    relay.shutdown().await;
}

#[tokio::test]
async fn a_store_error_at_leave_sends_no_presence() {
    let db = Db::new();
    let store = db.open();
    let clock = Arc::new(ManualClock::new());
    let log = CaptureLog::new();
    let (mac, phone) = (key(), key());
    let now = clock.now_ms();
    store.register(&id_of(&mac), Role::Mac, now).unwrap();
    store.register(&id_of(&phone), Role::Phone, now).unwrap();
    store
        .insert_pair(&pair_record(
            Bytes([6; 16]),
            id_of(&mac),
            id_of(&phone),
            now,
        ))
        .unwrap();
    let relay = start(store.clone(), clock, log.clone(), None).await;

    let (mut mac_c, _, _) = login(relay.addr, Role::Mac, &mac).await;
    let (phone_c, _, _) = login(relay.addr, Role::Phone, &phone).await;
    next(&mut mac_c).await; // phone online

    store.fail("peers_of");
    let leaves = store.count("peers_of");
    phone_c.close().await;
    store
        .until("the leave's peers_of", |s| s.count("peers_of") > leaves)
        .await;
    hears_nothing(&mut mac_c, Duration::from_millis(500)).await;
    assert!(log.has("relay: leave_store_error code=injected"));
    store.heal("peers_of");

    // Presence was cleared: the Mac, logging in again, sees the phone offline.
    mac_c.close().await;
    let (mut mac_c, _, online) = login(relay.addr, Role::Mac, &mac).await;
    assert!(online.is_empty(), "{online:?}");
    // And the sender was cleared: the phone logs in again, and the Mac hears it come
    // online, with no offline first (which a stale entry would produce).
    let (_phone_c, _, online) = login(relay.addr, Role::Phone, &phone).await;
    assert_eq!(online, vec![id_of(&mac)]);
    assert_eq!(
        next(&mut mac_c).await,
        Event::Presence {
            peer: id_of(&phone),
            online: true
        }
    );
    relay.shutdown().await;
}

/// Releases the gate however the test ends, so no blocking thread stays parked.
struct Release(Arc<CountingStore>);

impl Drop for Release {
    fn drop(&mut self) {
        self.0.release();
    }
}

/// On a `current_thread` runtime, a store call made on the runtime's own thread would
/// stop everything. The body runs on its own thread with a 5 s limit, so that case fails
/// instead of hanging.
#[test]
fn a_held_store_lock_does_not_stall_the_relay() {
    let db = Db::new();
    let store = db.open();
    let _release = Release(store.clone());
    let (done_tx, done_rx) = std::sync::mpsc::channel();
    let inner = store.clone();
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        runtime.block_on(held_lock_body(inner));
        let _ = done_tx.send(());
    });
    let outcome = done_rx.recv_timeout(Duration::from_secs(5));
    store.release();
    outcome.expect("the relay stalled while the store lock was held, or the body panicked");
}

async fn held_lock_body(store: Arc<CountingStore>) {
    let relay = start(
        store.clone(),
        Arc::new(ManualClock::new()),
        CaptureLog::new(),
        None,
    )
    .await;
    let addr = relay.addr;

    // An online device, on a raw socket so its pings are visible.
    let mac = key();
    let (mut online, c) = raw_challenge(&url(addr)).await;
    online
        .send(Message::text(
            signed_login(&mac, &c, "localhost", Role::Mac).to_json(),
        ))
        .await
        .unwrap();
    assert!(matches!(
        raw_next(&mut online).await,
        Ok(Control::Welcome { .. })
    ));

    // Hold the store, and start a login that waits on it.
    store.hold();
    let phone = key();
    let waiting = tokio::spawn(async move { login(addr, Role::Phone, &phone).await });
    store
        .until("a login at the gate", |s| s.waiting() >= 1)
        .await;

    // /health answers, and the online device still gets its pings.
    assert_eq!(get(addr, "/health", None).await, (200, "ok".to_string()));
    for _ in 0..2 {
        let ping = timeout(Duration::from_secs(1), async {
            loop {
                match online.next().await {
                    Some(Ok(Message::Ping(_))) => return true,
                    Some(Ok(_)) => continue,
                    _ => return false,
                }
            }
        })
        .await;
        assert_eq!(ping, Ok(true), "no ping while the store was held");
    }
    assert!(store.waiting() >= 1, "the gate let the login through");

    // Released, the waiting login completes.
    store.release();
    let (_c, _, _) = timeout(WAIT, waiting).await.unwrap().unwrap();
    relay.shutdown().await;
}

// ---------------------------------------------------------------------------------------
// Leave and shutdown (review fixes, 2026-10-16)
// ---------------------------------------------------------------------------------------

/// Seeds a Mac and a phone as a pair, registered now.
fn seed_pair(
    store: &CountingStore,
    clock: &ManualClock,
    pair_id: PairId,
) -> (SigningKey, SigningKey) {
    let (mac, phone) = (key(), key());
    let now = clock.now_ms();
    store.register(&id_of(&mac), Role::Mac, now).unwrap();
    store.register(&id_of(&phone), Role::Phone, now).unwrap();
    store
        .insert_pair(&pair_record(pair_id, id_of(&mac), id_of(&phone), now))
        .unwrap();
    (mac, phone)
}

/// Offline presence fans out from the `peers_of` read, without waiting for the leave's
/// `touch` write.
#[tokio::test]
async fn a_leave_tells_peers_before_its_touch_write() {
    let db = Db::new();
    let store = db.open();
    let _release = Release(store.clone());
    let clock = Arc::new(ManualClock::new());
    let (mac, phone) = seed_pair(&store, &clock, Bytes([11; 16]));
    let relay = start(store.clone(), clock, CaptureLog::new(), None).await;
    let (mut mac_c, _, _) = login(relay.addr, Role::Mac, &mac).await;
    let (phone_c, _, _) = login(relay.addr, Role::Phone, &phone).await;
    next(&mut mac_c).await; // phone online

    store.hold_only("touch");
    phone_c.close().await;
    assert_eq!(
        next(&mut mac_c).await,
        Event::Presence {
            peer: id_of(&phone),
            online: false
        },
        "the offline waited for the touch write"
    );
    store.until("the held touch", |s| s.waiting() >= 1).await;
    store.release();
    relay.shutdown().await;
}

/// Owner decision, 2026-10-16: only a failed `peers_of` suppresses presence at leave. A
/// failed `touch` is logged, and the peers are still told.
#[tokio::test]
async fn a_failed_touch_at_leave_still_tells_peers() {
    let db = Db::new();
    let store = db.open();
    let clock = Arc::new(ManualClock::new());
    let log = CaptureLog::new();
    let (mac, phone) = seed_pair(&store, &clock, Bytes([12; 16]));
    let relay = start(store.clone(), clock, log.clone(), None).await;
    let (mut mac_c, _, _) = login(relay.addr, Role::Mac, &mac).await;
    let (phone_c, _, _) = login(relay.addr, Role::Phone, &phone).await;
    next(&mut mac_c).await; // phone online

    store.fail("touch");
    phone_c.close().await;
    assert_eq!(
        next(&mut mac_c).await,
        Event::Presence {
            peer: id_of(&phone),
            online: false
        }
    );
    store
        .until("the failed touch to be logged", |_| {
            log.has("relay: leave_store_error code=injected")
        })
        .await;
    relay.shutdown().await;
}

/// A leave writes `last_seen` = now.
#[tokio::test]
async fn a_leave_touches_last_seen() {
    let db = Db::new();
    let store = db.open();
    let clock = Arc::new(ManualClock::new());
    let phone = key();
    let relay = start(store.clone(), clock.clone(), CaptureLog::new(), None).await;
    let (phone_c, _, _) = login(relay.addr, Role::Phone, &phone).await;
    let logged_in = clock.now_ms();
    assert_eq!(
        store.device(&id_of(&phone)).unwrap().unwrap().last_seen,
        logged_in
    );

    clock.advance(DAY);
    let left = clock.now_ms();
    phone_c.close().await;
    let id = id_of(&phone);
    store
        .until("last_seen to be the leave's time", |s| {
            s.device(&id).unwrap().map(|d| d.last_seen) == Some(left)
        })
        .await;
    relay.shutdown().await;
}

/// `shutdown()` waits for every store call in flight: a leave's, and a login's that the
/// shutdown cancelled mid-call. Afterwards the relay holds no reference to the store.
#[tokio::test]
async fn shutdown_waits_for_store_work_in_flight() {
    // A leave's store call, held at the gate.
    let db = Db::new();
    let store = db.open();
    let _release = Release(store.clone());
    let clock = Arc::new(ManualClock::new());
    let relay = start(store.clone(), clock.clone(), CaptureLog::new(), None).await;
    let (_phone_c, _, _) = login(relay.addr, Role::Phone, &key()).await;
    store.hold();
    let stopping = tokio::spawn(relay.shutdown());
    store
        .until("the leave at the gate", |s| s.waiting() >= 1)
        .await;
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(
        !stopping.is_finished(),
        "shutdown returned before the leave's store work"
    );
    store.release();
    timeout(WAIT, stopping).await.unwrap().unwrap();
    assert_eq!(
        Arc::strong_count(&store),
        2,
        "the relay still holds the store"
    );

    // A login's store call, in flight when shutdown cancels the login.
    let db = Db::new();
    let store = db.open();
    let _release = Release(store.clone());
    let relay = start(store.clone(), clock, CaptureLog::new(), None).await;
    store.hold();
    let addr = relay.addr;
    let phone = key();
    let _login =
        tokio::spawn(async move { Client::connect(&url(addr), Role::Phone, &phone).await });
    store
        .until("the login at the gate", |s| s.waiting() >= 1)
        .await;
    let stopping = tokio::spawn(relay.shutdown());
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert!(
        !stopping.is_finished(),
        "shutdown returned before the login's store call"
    );
    store.release();
    timeout(WAIT, stopping).await.unwrap().unwrap();
    assert_eq!(
        Arc::strong_count(&store),
        2,
        "the relay still holds the store"
    );
}

//! Story 7b end to end: the limits, routing over the peer task's sets (ADR 0006), and
//! replacement. Times come from a frozen `ManualClock` unless a test moves it; each test
//! waits for a message to be dispatched before it moves the clock. "Not received" is
//! shown with a sentinel: a message sent afterwards must be the next one to arrive.
//!
//! The counting `TestHandler` stands in for story 5a: on test-only message types it
//! inserts or deletes a pair and returns a chosen `refresh` list. `Control` has no
//! `paired` yet (5a's), so a `control_limited` whose `msg` starts with `test_` stands in
//! for a handler's message.

mod common;

use std::net::SocketAddr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use common::{CaptureLog, CountingStore};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use relay_core::store::CLEANUP_AGE_MS;
use relay_core::{
    login_message, Clock, ControlHandler, ControlOutcome, Identity, ManualClock, PairRecord, Store,
    StoreError,
};
use relay_protocol::{Bytes, Control, ControlHead, DeviceKey, PairId, Role, Routed, RoutedKind};
use relay_server::{serve, ClientIp, Config, Relay, SqliteStore, WriterGate};
use serde_json::{json, Value};
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;

const WAIT: Duration = Duration::from_secs(5);
const TOKEN: &str = "metrics-token-0123456789abcdef-0123";

// ---------------------------------------------------------------------------------------
// The counting handler
// ---------------------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Fail {
    Err,
    Panic,
}

/// What the next matching `on_leave` does. Used once.
#[derive(Clone, Default)]
struct LeavePlan {
    who: Option<DeviceKey>,
    current: Option<bool>,
    insert: Option<PairRecord>,
    delete: Option<PairId>,
    out: Vec<(DeviceKey, Control)>,
    refresh: Vec<DeviceKey>,
    fail: Option<Fail>,
}

#[derive(Default)]
struct TestHandler {
    logins: AtomicUsize,
    /// Every `control` call, as (sender, `t`), recorded as the call starts.
    handled: Mutex<Vec<(DeviceKey, String)>>,
    /// Every `on_leave` call, as (key, current).
    leaves: Mutex<Vec<(DeviceKey, bool)>>,
    on_login: Mutex<Vec<Control>>,
    leave_plan: Mutex<Option<LeavePlan>>,
}

impl TestHandler {
    fn handled_by(&self, who: DeviceKey, t: &str) -> usize {
        self.handled
            .lock()
            .unwrap()
            .iter()
            .filter(|(w, h)| *w == who && h == t)
            .count()
    }

    fn handled_t(&self, t: &str) -> usize {
        self.handled
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, h)| h == t)
            .count()
    }

    fn leaves_of(&self, who: DeviceKey) -> Vec<bool> {
        self.leaves
            .lock()
            .unwrap()
            .iter()
            .filter(|(w, _)| *w == who)
            .map(|(_, c)| *c)
            .collect()
    }

    fn leave_count(&self) -> usize {
        self.leaves.lock().unwrap().len()
    }

    fn plan_leave(&self, plan: LeavePlan) {
        *self.leave_plan.lock().unwrap() = Some(plan);
    }
}

/// A stand-in for a handler's message, such as 5a's `paired`.
fn marker(tag: &str) -> Control {
    Control::ControlLimited {
        msg: tag.into(),
        slot: None,
        pair_id: None,
        peer: None,
        retry_ms: 0,
    }
}

fn key_field(v: &Value, name: &str) -> Option<DeviceKey> {
    let raw = URL_SAFE_NO_PAD.decode(v.get(name)?.as_str()?).ok()?;
    Some(Bytes(raw.try_into().ok()?))
}

fn key_list(v: &Value, name: &str) -> Vec<DeviceKey> {
    v.get(name)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .map(|k| {
                    let raw = URL_SAFE_NO_PAD.decode(k.as_str().unwrap()).unwrap();
                    Bytes(raw.try_into().unwrap())
                })
                .collect()
        })
        .unwrap_or_default()
}

fn record(pair_id: PairId, a: Identity, b: DeviceKey, at: u64) -> PairRecord {
    let (mac, phone) = if a.role == Role::Mac {
        (a.id, b)
    } else {
        (b, a.id)
    };
    pair_record(pair_id, mac, phone, at)
}

impl ControlHandler for TestHandler {
    fn on_login(&self, _store: &dyn Store, _who: &Identity) -> Vec<Control> {
        self.logins.fetch_add(1, Ordering::SeqCst);
        self.on_login.lock().unwrap().clone()
    }

    fn control(
        &self,
        store: &dyn Store,
        who: &Identity,
        head: &ControlHead,
        text: &str,
        now: u64,
    ) -> Result<ControlOutcome, StoreError> {
        self.handled.lock().unwrap().push((who.id, head.t.clone()));
        let v: Value = serde_json::from_str(text).unwrap();
        let refresh = key_list(&v, "refresh");
        match head.t.as_str() {
            // A lookup, as 5a's would be: the flood test counts these.
            "pair_status" => {
                store.pair(&Bytes([0; 16]))?;
                Ok(ControlOutcome::default())
            }
            "test_pair" => {
                let pair_id = head.pair_id.unwrap();
                store.insert_pair(&record(pair_id, *who, head.peer.unwrap(), now))?;
                let out = key_field(&v, "to")
                    .map(|to| vec![(to, marker("test_paired"))])
                    .unwrap_or_default();
                Ok(ControlOutcome { out, refresh })
            }
            "test_unpair" => {
                store.delete_pair(&head.pair_id.unwrap())?;
                Ok(ControlOutcome {
                    out: Vec::new(),
                    refresh,
                })
            }
            "test_noop" => Ok(ControlOutcome {
                out: Vec::new(),
                refresh,
            }),
            "test_panic" => {
                store.delete_pair(&head.pair_id.unwrap())?;
                panic!("the test handler panics after its write");
            }
            _ => Ok(ControlOutcome::default()),
        }
    }

    fn on_leave(
        &self,
        store: &dyn Store,
        who: &Identity,
        current: bool,
    ) -> Result<ControlOutcome, StoreError> {
        self.leaves.lock().unwrap().push((who.id, current));
        let plan = {
            let mut slot = self.leave_plan.lock().unwrap();
            let applies = slot.as_ref().is_some_and(|p| {
                p.who.is_none_or(|w| w == who.id) && p.current.is_none_or(|c| c == current)
            });
            if applies {
                slot.take()
            } else {
                None
            }
        };
        let Some(plan) = plan else {
            return Ok(ControlOutcome::default());
        };
        if let Some(r) = &plan.insert {
            store.insert_pair(r)?;
        }
        if let Some(p) = &plan.delete {
            store.delete_pair(p)?;
        }
        match plan.fail {
            Some(Fail::Err) => Err(StoreError::Failed("injected")),
            Some(Fail::Panic) => panic!("the test handler panics at leave"),
            None => Ok(ControlOutcome {
                out: plan.out,
                refresh: plan.refresh,
            }),
        }
    }
}

// ---------------------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------------------

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

#[derive(Clone)]
struct Key {
    sk: SigningKey,
    id: DeviceKey,
    role: Role,
}

fn key(role: Role) -> Key {
    let sk = SigningKey::generate(&mut rand::rngs::OsRng);
    Key {
        id: Bytes(sk.verifying_key().to_bytes()),
        sk,
        role,
    }
}

fn b64(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// A control message `{"v":1,"t":t, ...fields}`.
fn msg(t: &str, fields: Value) -> String {
    let mut v = if fields.is_object() {
        fields
    } else {
        json!({})
    };
    v["v"] = json!(1);
    v["t"] = json!(t);
    v.to_string()
}

fn keys(ks: &[DeviceKey]) -> Value {
    json!(ks.iter().map(|k| b64(&k.0)).collect::<Vec<_>>())
}

fn pid(n: u8) -> PairId {
    Bytes([n; 16])
}

struct H {
    relay: Option<Relay>,
    addr: SocketAddr,
    store: Arc<CountingStore>,
    clock: Arc<ManualClock>,
    handler: Arc<TestHandler>,
    gate: WriterGate,
    _dir: tempfile::TempDir,
}

async fn harness() -> H {
    harness_with(|_| {}).await
}

/// A relay with a frozen clock, the counting store and handler, the writer gate, a
/// metrics token, and a ping timeout (30 s) well above any hold.
async fn harness_with(tweak: impl FnOnce(&mut Config)) -> H {
    let dir = tempfile::tempdir().unwrap();
    let store = CountingStore::new(Arc::new(
        SqliteStore::open(&dir.path().join("relay.db")).unwrap(),
    ));
    let clock = Arc::new(ManualClock::new());
    let handler = Arc::new(TestHandler::default());
    let gate = WriterGate::new();
    let mut config = Config::new(
        "127.0.0.1:0".parse().unwrap(),
        vec!["localhost".into()],
        store.clone(),
    );
    config.ping_interval = Duration::from_secs(10);
    config.ping_timeout = Duration::from_secs(30);
    config.clock = clock.clone();
    config.log = CaptureLog::new();
    config.metrics_token = Some(TOKEN.into());
    config.control = handler.clone();
    config.writer_gate = gate.clone();
    tweak(&mut config);
    let relay = serve(config).await.expect("relay starts");
    H {
        addr: relay.addr,
        relay: Some(relay),
        store,
        clock,
        handler,
        gate,
        _dir: dir,
    }
}

impl H {
    fn relay(&self) -> &Relay {
        self.relay.as_ref().unwrap()
    }

    fn url(&self) -> String {
        format!("ws://localhost:{}/", self.addr.port())
    }

    fn now(&self) -> u64 {
        self.clock.now_ms()
    }

    /// Registers a key now, as an earlier login would have.
    fn register(&self, k: &Key) {
        self.store.register(&k.id, k.role, self.now()).unwrap();
    }

    /// Registers both keys and stores a pair between them.
    fn pair(&self, pair_id: PairId, mac: &Key, phone: &Key) {
        self.register(mac);
        self.register(phone);
        self.store
            .insert_pair(&pair_record(pair_id, mac.id, phone.id, self.now()))
            .unwrap();
    }

    fn requests(&self) -> u64 {
        self.relay().peer_requests_received()
    }

    async fn requests_reach(&self, want: u64) {
        let began = std::time::Instant::now();
        while self.requests() < want {
            assert!(began.elapsed() < WAIT, "the peer request never came");
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }

    async fn until(&self, what: &str, cond: impl Fn(&Self) -> bool) {
        let began = std::time::Instant::now();
        while !cond(self) {
            assert!(began.elapsed() < WAIT, "timed out waiting for {what}");
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    }

    async fn metric(&self, name: &str) -> u64 {
        let mut stream = tokio::net::TcpStream::connect(self.addr).await.unwrap();
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        stream
            .write_all(
                format!(
                    "GET /metrics HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer {TOKEN}\r\nConnection: close\r\n\r\n"
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        let mut body = String::new();
        timeout(WAIT, stream.read_to_string(&mut body))
            .await
            .unwrap()
            .unwrap();
        body.lines()
            .find_map(|l| l.strip_prefix(name)?.strip_prefix(' ')?.parse().ok())
            .unwrap_or_else(|| panic!("no {name} in {body}"))
    }

    async fn metric_reaches(&self, name: &str, want: u64) {
        let began = std::time::Instant::now();
        loop {
            let got = self.metric(name).await;
            if got == want {
                return;
            }
            assert!(
                got < want && began.elapsed() < WAIT,
                "{name} is {got}, waiting for {want}"
            );
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    }

    async fn shutdown(mut self) {
        timeout(WAIT, self.relay.take().unwrap().shutdown())
            .await
            .expect("shutdown ends");
    }
}

type Raw =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// What a device hears.
#[derive(Debug, PartialEq)]
enum In {
    Text(Control),
    Bin(Routed),
    Closed(u16, String),
    Ended,
}

struct Dev {
    ws: Raw,
    id: DeviceKey,
}

/// Opens a socket, with a `Fly-Client-IP` header if given, and reads the challenge.
async fn open(url: &str, fly_ip: Option<&str>) -> (Raw, [u8; 32]) {
    let mut request = url.into_client_request().unwrap();
    if let Some(ip) = fly_ip {
        request
            .headers_mut()
            .insert("Fly-Client-IP", ip.parse().unwrap());
    }
    let (mut ws, _) = tokio_tungstenite::connect_async(request).await.unwrap();
    let msg = timeout(WAIT, ws.next()).await.unwrap().unwrap().unwrap();
    let Message::Text(text) = msg else {
        panic!("expected a challenge, got {msg:?}")
    };
    match Control::from_json(&text).unwrap() {
        Control::Challenge { c } => (ws, c.0),
        other => panic!("expected a challenge, got {other:?}"),
    }
}

fn login_text(k: &Key, c: &[u8; 32]) -> String {
    Control::Login {
        id: k.id,
        role: k.role,
        sig: Bytes(k.sk.sign(&login_message(c, "localhost", k.role)).to_bytes()),
    }
    .to_json()
}

/// Logs `k` in and returns the device with the first thing it hears.
async fn connect_via(url: &str, k: &Key, fly_ip: Option<&str>) -> (Dev, In) {
    let (mut ws, c) = open(url, fly_ip).await;
    ws.send(Message::text(login_text(k, &c))).await.unwrap();
    let mut dev = Dev { ws, id: k.id };
    let first = dev.next().await;
    (dev, first)
}

async fn connect(h: &H, k: &Key) -> (Dev, In) {
    connect_via(&h.url(), k, None).await
}

/// Logs `k` in and expects a `welcome`.
async fn login(h: &H, k: &Key) -> Dev {
    login_url(&h.url(), k).await
}

async fn login_url(url: &str, k: &Key) -> Dev {
    let (dev, first) = connect_via(url, k, None).await;
    assert!(
        matches!(first, In::Text(Control::Welcome { .. })),
        "expected a welcome, got {first:?}"
    );
    dev
}

impl Dev {
    async fn next(&mut self) -> In {
        timeout(WAIT, self.read())
            .await
            .expect("something arrived in time")
    }

    async fn read(&mut self) -> In {
        loop {
            match self.ws.next().await {
                Some(Ok(Message::Text(text))) => {
                    return In::Text(Control::from_json(&text).unwrap())
                }
                Some(Ok(Message::Binary(bytes))) => {
                    return In::Bin(Routed::parse(&bytes).expect("a routed envelope"))
                }
                Some(Ok(Message::Close(frame))) => {
                    let (code, reason) = frame
                        .map(|f| (u16::from(f.code), f.reason.to_string()))
                        .unwrap_or((0, String::new()));
                    return In::Closed(code, reason);
                }
                Some(Ok(_)) => continue,
                None | Some(Err(_)) => return In::Ended,
            }
        }
    }

    /// The next thing heard that isn't a `presence`.
    async fn next_skipping_presence(&mut self) -> In {
        loop {
            match self.next().await {
                In::Text(Control::Presence { .. }) => continue,
                other => return other,
            }
        }
    }

    /// Whatever arrives within `wait`, if anything.
    async fn poll(&mut self, wait: Duration) -> Option<In> {
        timeout(wait, self.read()).await.ok()
    }

    async fn text(&mut self, text: impl Into<String>) {
        self.ws.send(Message::text(text.into())).await.unwrap();
    }

    async fn routed(&mut self, kind: RoutedKind, to: DeviceKey, body: &[u8]) {
        let bytes = Routed {
            kind,
            peer: to,
            body: body.to_vec(),
        }
        .encode();
        self.ws.send(Message::binary(bytes)).await.unwrap();
    }

    async fn frame(&mut self, to: DeviceKey, body: &[u8]) {
        self.routed(RoutedKind::Frame, to, body).await
    }

    async fn rehandshake(&mut self, to: DeviceKey) {
        self.text(Control::Rehandshake { peer: to }.to_json()).await
    }

    async fn close(mut self) {
        let _ = self.ws.close(None).await;
        let _ = timeout(WAIT, async {
            while let Some(Ok(_)) = self.ws.next().await {}
        })
        .await;
    }
}

fn frame_from(from: DeviceKey, body: &[u8]) -> In {
    In::Bin(Routed {
        kind: RoutedKind::Frame,
        peer: from,
        body: body.to_vec(),
    })
}

/// A round trip on the peer task through `who`: a control message whose handler
/// returns `refresh [who]`, then one more; once the second is handled, the first's
/// `Refresh` has been handled, and so has everything queued before it.
async fn barrier(h: &H, dev: &mut Dev) {
    dev.text(msg("test_noop", json!({ "refresh": keys(&[dev.id]) })))
        .await;
    round_trip(h, dev).await;
}

/// A control message round trip with no refresh (`test_rt`, which nothing else sends):
/// once it is handled, everything `dev` sent before it has been handled, its `Refresh`
/// included, because a connection reads its next message only after its `Refresh`.
async fn round_trip(h: &H, dev: &mut Dev) {
    let before = h.handler.handled_by(dev.id, "test_rt");
    dev.text(msg("test_rt", json!({}))).await;
    let id = dev.id;
    h.until("the round trip", |h| {
        h.handler.handled_by(id, "test_rt") == before + 1
    })
    .await;
}

// ---------------------------------------------------------------------------------------
// Acceptance criteria
// ---------------------------------------------------------------------------------------

/// AC 1 (ticket AC 2).
#[tokio::test]
async fn frames_are_limited_per_device() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    assert_eq!(
        mac.next().await,
        In::Text(Control::Presence {
            peer: p.id,
            online: true
        })
    );

    let calls = h.store.total();
    for n in 0..101u8 {
        mac.frame(p.id, &[n]).await;
    }
    for n in 0..100u8 {
        assert_eq!(phone.next().await, frame_from(m.id, &[n]), "frame {n}");
    }
    assert_eq!(
        mac.next().await,
        In::Text(Control::RateLimited {
            peer: p.id,
            retry_ms: 50
        })
    );
    assert_eq!(h.store.total(), calls, "a frame made a store call");

    // The 101st was dispatched (answered), so the clock can move: 50 ms gives a token.
    h.clock.advance(Duration::from_millis(50));
    mac.frame(p.id, &[200]).await;
    assert_eq!(phone.next().await, frame_from(m.id, &[200]));
    h.shutdown().await;
}

/// AC 1 (ticket AC 2), the size half.
#[tokio::test]
async fn a_frame_over_64_kib_is_closed_1009() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    // A whole message of exactly 64 KiB, the 33-byte header included, is routed.
    let body = vec![0xab; 64 * 1024 - Routed::HEADER_LEN];
    mac.frame(p.id, &body).await;
    assert_eq!(phone.next().await, frame_from(m.id, &body));
    // One byte more is closed with 1009, and gets no `rate_limited`.
    let over = vec![0xcd; 64 * 1024 - Routed::HEADER_LEN + 1];
    mac.frame(p.id, &over).await;
    assert_eq!(
        mac.next_skipping_presence().await,
        In::Closed(1009, "message_too_big".into())
    );
    h.shutdown().await;
}

/// AC 2 (ticket AC 3).
#[tokio::test]
async fn a_pair_status_flood_is_control_limited_before_any_lookup() {
    let h = harness().await;
    let m = key(Role::Mac);
    let mut mac = login(&h, &m).await;
    let (lookups, calls) = (h.store.count("pair"), h.store.total());
    for n in 0..100u8 {
        mac.text(msg("pair_status", json!({ "slot": b64(&[n; 16]) })))
            .await;
    }
    for n in 30..100u8 {
        assert_eq!(
            mac.next().await,
            In::Text(Control::ControlLimited {
                msg: "pair_status".into(),
                slot: Some(Bytes([n; 16])),
                pair_id: None,
                peer: None,
                retry_ms: 100
            }),
            "message {n}"
        );
    }
    h.until("30 handled", |h| h.handler.handled_t("pair_status") == 30)
        .await;
    // Only the 30 handled made a lookup; the 70 refused made no store call at all.
    assert_eq!(h.store.count("pair"), lookups + 30);
    assert_eq!(h.store.total(), calls + 30);
    assert_eq!(h.metric("relay_control_limited_total").await, 70);
    h.shutdown().await;
}

/// AC 4 (ticket AC 5), the per-IP limit in `fly-client-ip` mode.
#[tokio::test]
async fn new_keys_are_limited_per_ip() {
    let h = harness_with(|c| c.client_ip = ClientIp::FlyClientIp).await;
    let url = h.url();
    let first = key(Role::Phone);
    for n in 0..21 {
        let k = if n == 0 {
            first.clone()
        } else {
            key(Role::Phone)
        };
        let (dev, heard) = connect_via(&url, &k, Some("203.0.113.9")).await;
        if n < 20 {
            assert!(
                matches!(heard, In::Text(Control::Welcome { .. })),
                "key {n}: {heard:?}"
            );
            dev.close().await;
        } else {
            assert_eq!(
                heard,
                In::Closed(4429, "too_many_new_keys".into()),
                "key {n}"
            );
        }
    }
    // A known key from that IP still logs in.
    let (_dev, heard) = connect_via(&url, &first, Some("203.0.113.9")).await;
    assert!(
        matches!(heard, In::Text(Control::Welcome { .. })),
        "{heard:?}"
    );
    // A second header IP has its own budget.
    let (_dev2, heard) = connect_via(&url, &key(Role::Mac), Some("203.0.113.10")).await;
    assert!(
        matches!(heard, In::Text(Control::Welcome { .. })),
        "{heard:?}"
    );
    assert_eq!(h.metric("relay_new_keys_refused_total").await, 1);
    h.shutdown().await;
}

/// AC 4 (ticket AC 5): `socket` mode ignores the header; `fly-client-ip` mode falls back
/// to the socket address without it.
#[tokio::test]
async fn the_client_ip_comes_from_the_configured_source() {
    let h = harness().await;
    let url = h.url();
    for n in 0..21u8 {
        let forged = format!("198.51.100.{n}");
        let (dev, heard) = connect_via(&url, &key(Role::Phone), Some(&forged)).await;
        if n < 20 {
            assert!(
                matches!(heard, In::Text(Control::Welcome { .. })),
                "key {n}: {heard:?}"
            );
            dev.close().await;
        } else {
            assert_eq!(heard, In::Closed(4429, "too_many_new_keys".into()));
        }
    }
    h.shutdown().await;

    let h = harness_with(|c| c.client_ip = ClientIp::FlyClientIp).await;
    let url = h.url();
    for n in 0..21 {
        let (dev, heard) = connect_via(&url, &key(Role::Phone), None).await;
        if n < 20 {
            assert!(
                matches!(heard, In::Text(Control::Welcome { .. })),
                "key {n}: {heard:?}"
            );
            dev.close().await;
        } else {
            assert_eq!(heard, In::Closed(4429, "too_many_new_keys".into()));
        }
    }
    let (_dev, heard) = connect_via(&url, &key(Role::Phone), Some("198.51.100.77")).await;
    assert!(
        matches!(heard, In::Text(Control::Welcome { .. })),
        "{heard:?}"
    );
    h.shutdown().await;
}

/// AC 5 (ticket AC 9).
#[tokio::test]
async fn forty_queued_unpairs_at_ten_per_second_all_reach_the_relay() {
    let h = harness().await;
    let m = key(Role::Mac);
    let mut mac = login(&h, &m).await;
    // Paced at 10 a second: every one is handled, none limited.
    for n in 0..40u8 {
        mac.text(msg("unpair", json!({ "pair_id": b64(&[n; 16]) })))
            .await;
        h.until("the unpair", |h| {
            h.handler.handled_t("unpair") == n as usize + 1
        })
        .await;
        h.clock.advance(Duration::from_millis(100));
    }
    // At once, on a full bucket: 30 handled and 10 limited, each echoing its pair id.
    h.clock.advance(Duration::from_secs(3));
    for n in 100..140u8 {
        mac.text(msg("unpair", json!({ "pair_id": b64(&[n; 16]) })))
            .await;
    }
    // The first thing the Mac hears is the 31st of the burst: the paced 40 got nothing.
    for n in 130..140u8 {
        assert_eq!(
            mac.next().await,
            In::Text(Control::ControlLimited {
                msg: "unpair".into(),
                slot: None,
                pair_id: Some(Bytes([n; 16])),
                peer: None,
                retry_ms: 100
            }),
            "unpair {n}"
        );
    }
    h.until("70 handled", |h| h.handler.handled_t("unpair") == 70)
        .await;
    assert_eq!(h.metric("relay_control_limited_total").await, 10);
    h.shutdown().await;
}

/// AC 6 (ticket AC 10).
#[tokio::test]
async fn routing_reaches_only_paired_online_peers() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    let (m2, p2) = (key(Role::Mac), key(Role::Phone));
    let (stranger, offline) = (key(Role::Phone), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    assert!(h.store.set_acked(&pid(1)).unwrap(), "M-P is acked");
    h.pair(pid(2), &m2, &p2); // un-acked
    h.pair(pid(3), &m, &offline);
    let mut devs = vec![
        login(&h, &m).await,
        login(&h, &p).await,
        login(&h, &m2).await,
        login(&h, &p2).await,
    ];
    let mut x = login(&h, &stranger).await;

    // Over the acked pair and the un-acked one, both ways.
    for (s, r) in [(0, 1), (1, 0), (2, 3), (3, 2)] {
        let (from, to) = (devs[s].id, devs[r].id);
        devs[s].routed(RoutedKind::Hs1, to, &[1, s as u8]).await;
        devs[s].routed(RoutedKind::Hs2, to, &[2, s as u8]).await;
        devs[s].routed(RoutedKind::Frame, to, &[3, s as u8]).await;
        devs[s].rehandshake(to).await;
        for (kind, tag) in [
            (RoutedKind::Hs1, 1),
            (RoutedKind::Hs2, 2),
            (RoutedKind::Frame, 3),
        ] {
            assert_eq!(
                devs[r].next_skipping_presence().await,
                In::Bin(Routed {
                    kind,
                    peer: from,
                    body: vec![tag, s as u8]
                }),
                "{s} to {r}"
            );
        }
        assert_eq!(
            devs[r].next_skipping_presence().await,
            In::Text(Control::Rehandshake { peer: from }),
            "{s} to {r}"
        );
    }

    // To the unpaired key and to the offline peer: dropped. The sentinel comes next.
    for to in [stranger.id, offline.id] {
        devs[0].routed(RoutedKind::Hs1, to, &[9]).await;
        devs[0].routed(RoutedKind::Hs2, to, &[9]).await;
        devs[0].frame(to, &[9]).await;
        devs[0].rehandshake(to).await;
    }
    x.routed(RoutedKind::Hs1, m.id, &[8]).await;
    x.frame(m.id, &[8]).await;
    x.rehandshake(m.id).await;
    // X's messages go out on X's own connection: a round trip on it shows they were
    // handled before the sentinel from another connection is sent and the counters read.
    round_trip(&h, &mut x).await;
    devs[0].frame(p.id, b"sentinel").await;
    assert_eq!(
        devs[1].next_skipping_presence().await,
        frame_from(m.id, b"sentinel")
    );
    devs[1].frame(m.id, b"sentinel").await;
    assert_eq!(
        devs[0].next_skipping_presence().await,
        frame_from(p.id, b"sentinel")
    );
    assert_eq!(h.metric("relay_frames_dropped_total").await, 8);
    assert_eq!(h.metric("relay_rehandshakes_dropped_total").await, 3);
    assert_eq!(h.metric("relay_frames_routed_total").await, 14);
    assert_eq!(h.metric("relay_rehandshakes_routed_total").await, 4);
    assert_eq!(
        x.poll(Duration::from_millis(100)).await,
        None,
        "the unpaired key heard something"
    );
    h.shutdown().await;
}

// ---------------------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------------------

#[tokio::test]
async fn limits_survive_a_reconnect() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    for n in 0..101u8 {
        mac.frame(p.id, &[n]).await;
    }
    assert_eq!(
        mac.next().await,
        In::Text(Control::RateLimited {
            peer: p.id,
            retry_ms: 50
        })
    );
    for _ in 0..30 {
        mac.text(msg("test_noop", json!({}))).await;
    }
    h.until("30 handled", |h| h.handler.handled_t("test_noop") == 30)
        .await;
    mac.close().await;
    h.until("the leave", |h| h.handler.leave_count() == 1).await;

    let mut mac = login(&h, &m).await;
    mac.frame(p.id, &[0]).await;
    assert_eq!(
        mac.next().await,
        In::Text(Control::RateLimited {
            peer: p.id,
            retry_ms: 50
        })
    );
    mac.text(msg("test_noop", json!({}))).await;
    assert!(matches!(
        mac.next().await,
        In::Text(Control::ControlLimited { retry_ms: 100, .. })
    ));
    h.shutdown().await;
}

#[tokio::test]
async fn a_full_queue_drops_frames_not_the_device() {
    let h = harness_with(|c| c.queue = 4).await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut phone = login(&h, &p).await;
    let mut mac = login(&h, &m).await;
    // The phone has its welcome and the Mac's presence: nothing text is queued for it.
    assert_eq!(
        phone.next().await,
        In::Text(Control::Presence {
            peer: m.id,
            online: true
        })
    );

    h.gate.close();
    for n in 0..5u8 {
        mac.frame(p.id, &[n]).await;
    }
    h.metric_reaches("relay_frames_dropped_total", 1).await;
    assert_eq!(h.metric("relay_frames_routed_total").await, 4);
    h.gate.open();
    for n in 0..4u8 {
        assert_eq!(phone.next().await, frame_from(m.id, &[n]));
    }
    // The phone stayed online: the next frame routes.
    mac.frame(p.id, &[5]).await;
    assert_eq!(phone.next().await, frame_from(m.id, &[5]));

    // A full queue on a text message drops the device.
    h.gate.close();
    for n in 6..10u8 {
        mac.frame(p.id, &[n]).await;
    }
    h.metric_reaches("relay_frames_routed_total", 9).await;
    mac.rehandshake(p.id).await;
    h.metric_reaches("relay_rehandshakes_dropped_total", 1)
        .await;
    h.gate.open();
    for n in 6..10u8 {
        assert_eq!(phone.next().await, frame_from(m.id, &[n]));
    }
    assert!(
        matches!(phone.next().await, In::Ended | In::Closed(..)),
        "the phone stayed connected"
    );
    assert_eq!(
        mac.next().await,
        In::Text(Control::Presence {
            peer: p.id,
            online: false
        })
    );
    h.shutdown().await;
}

/// The two cases of a pair change landing while a peer-task read is held. P's unpair
/// returns `refresh [M]` only, so only M's set can stop the frame.
#[tokio::test]
async fn a_change_made_during_a_held_read_wins() {
    for case in [1, 2] {
        let h = harness().await;
        let (m, p, q, p2) = (
            key(Role::Mac),
            key(Role::Phone),
            key(Role::Mac),
            key(Role::Phone),
        );
        h.pair(pid(1), &m, &p);
        h.pair(pid(2), &q, &p);
        h.register(&p2);
        let mut phone = login(&h, &p).await;
        let mut sentinel = login(&h, &q).await;

        let mac = if case == 1 {
            // (1) M's `Join` read is held.
            let n = h.store.count("peers_of");
            let held = h.store.hold_nth("peers_of", n + 1);
            let url = h.url();
            let mk = m.clone();
            let joining = tokio::spawn(async move { login_url(&url, &mk).await });
            held.started().await;
            Err((joining, held))
        } else {
            // (2) M's `Refresh` read, from a message that stored M-P2, is held.
            let mut mac = login(&h, &m).await;
            let n = h.store.count("peers_of");
            let held = h.store.hold_nth("peers_of", n + 1);
            mac.text(msg(
                "test_pair",
                json!({ "peer": b64(&p2.id.0), "pair_id": b64(&[5; 16]), "refresh": keys(&[m.id]) }),
            ))
            .await;
            held.started().await;
            Ok((mac, held))
        };
        let before = h.requests();
        phone
            .text(msg(
                "test_unpair",
                json!({ "pair_id": b64(&pid(1).0), "refresh": keys(&[m.id]) }),
            ))
            .await;
        h.requests_reach(before + 1).await;
        let mut mac = match mac {
            Err((joining, held)) => {
                held.release();
                timeout(WAIT, joining).await.unwrap().unwrap()
            }
            Ok((mac, held)) => {
                held.release();
                mac
            }
        };
        round_trip(&h, &mut phone).await;

        mac.frame(p.id, b"must not arrive").await;
        round_trip(&h, &mut mac).await; // handled before the other connection's sentinel
        sentinel.frame(p.id, b"sentinel").await;
        assert_eq!(
            phone.next_skipping_presence().await,
            frame_from(q.id, b"sentinel"),
            "case {case}"
        );
        h.shutdown().await;
    }
}

#[tokio::test]
async fn routing_needs_both_sets_to_name_the_pair() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    let (qp, qm) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    h.pair(pid(2), &qp, &p);
    h.pair(pid(3), &m, &qm);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    let mut to_phone = login(&h, &qp).await;
    let mut to_mac = login(&h, &qm).await;

    // The handler deletes M-P but returns `refresh [P]` only: M's set still names P.
    mac.text(msg(
        "test_unpair",
        json!({ "pair_id": b64(&pid(1).0), "refresh": keys(&[p.id]) }),
    ))
    .await;
    round_trip(&h, &mut mac).await;

    mac.frame(p.id, b"no").await;
    mac.rehandshake(p.id).await;
    round_trip(&h, &mut mac).await; // handled before the other connection's sentinel
    to_phone.frame(p.id, b"sentinel").await;
    assert_eq!(
        phone.next_skipping_presence().await,
        frame_from(qp.id, b"sentinel")
    );
    phone.frame(m.id, b"no").await;
    phone.rehandshake(m.id).await;
    round_trip(&h, &mut phone).await;
    to_mac.frame(m.id, b"sentinel").await;
    assert_eq!(
        mac.next_skipping_presence().await,
        frame_from(qm.id, b"sentinel")
    );
    assert_eq!(h.metric("relay_frames_dropped_total").await, 2);
    assert_eq!(h.metric("relay_rehandshakes_dropped_total").await, 2);
    h.shutdown().await;
}

/// 7b strips nothing on cleanup: the returning key's own set refuses the route.
#[tokio::test]
async fn a_key_deleted_by_cleanup_is_unreachable_when_it_returns() {
    for held_join in [false, true] {
        let h = harness().await;
        let (m, p, q) = (key(Role::Mac), key(Role::Phone), key(Role::Mac));
        h.register(&m);
        h.register(&q);
        h.store
            .register(&p.id, Role::Phone, h.now() - CLEANUP_AGE_MS)
            .unwrap();
        h.store
            .insert_pair(&pair_record(pid(1), m.id, p.id, h.now()))
            .unwrap();
        let mut q_dev = login(&h, &q).await;

        let (mut mac, phone) = if held_join {
            // M's `Join` read is held across the cleanup and P's return.
            let n = h.store.count("peers_of");
            let held = h.store.hold_nth("peers_of", n + 1);
            let (url, mk) = (h.url(), m.clone());
            let joining = tokio::spawn(async move { login_url(&url, &mk).await });
            held.started().await;
            let counts = h.relay().run_cleanup().await;
            assert_eq!(counts.deleted, vec![p.id], "the stale phone is deleted");
            let (url, pk) = (h.url(), p.clone());
            let before = h.requests();
            let returning = tokio::spawn(async move { connect_via(&url, &pk, None).await });
            h.requests_reach(before + 1).await;
            held.release();
            let mac = timeout(WAIT, joining).await.unwrap().unwrap();
            let (phone, welcome) = timeout(WAIT, returning).await.unwrap().unwrap();
            assert_eq!(
                welcome,
                In::Text(Control::Welcome {
                    pairs: vec![],
                    online: vec![]
                })
            );
            (mac, phone)
        } else {
            let mac = login(&h, &m).await;
            let counts = h.relay().run_cleanup().await;
            assert_eq!(counts.deleted, vec![p.id], "the stale phone is deleted");
            let (phone, welcome) = connect(&h, &p).await;
            assert_eq!(
                welcome,
                In::Text(Control::Welcome {
                    pairs: vec![],
                    online: vec![]
                })
            );
            (mac, phone)
        };
        let mut phone = phone;
        // Q pairs with the returned P, so a sentinel can reach it.
        q_dev
            .text(msg(
                "test_pair",
                json!({ "peer": b64(&p.id.0), "pair_id": b64(&pid(2).0), "refresh": keys(&[q.id, p.id]) }),
            ))
            .await;
        round_trip(&h, &mut q_dev).await;

        mac.frame(p.id, b"must not arrive").await;
        round_trip(&h, &mut mac).await; // handled before the other connection's sentinel
        q_dev.frame(p.id, b"sentinel").await;
        assert_eq!(
            phone.next_skipping_presence().await,
            frame_from(q.id, b"sentinel"),
            "held join: {held_join}"
        );
        h.shutdown().await;
    }
}

#[tokio::test]
async fn a_late_leave_after_replacement_keeps_routing() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut first = login(&h, &p).await;
    assert!(matches!(
        mac.next().await,
        In::Text(Control::Presence { online: true, .. })
    ));
    let touches = h.store.count("touch");

    let mut second = login(&h, &p).await;
    assert_eq!(first.next().await, In::Closed(4409, "replaced".into()));
    // The old connection's leave runs after the new welcome: one touch, one on_leave.
    h.until("the late leave", |h| {
        h.handler.leaves_of(p.id) == vec![false] && h.store.count("touch") == touches + 1
    })
    .await;
    assert_eq!(
        mac.next().await,
        In::Text(Control::Presence {
            peer: p.id,
            online: false
        })
    );
    assert_eq!(
        mac.next().await,
        In::Text(Control::Presence {
            peer: p.id,
            online: true
        })
    );
    // No offline after the replacement's online, and the new connection routes.
    second.frame(m.id, b"after").await;
    assert_eq!(mac.next().await, frame_from(p.id, b"after"));
    mac.frame(p.id, b"back").await;
    assert_eq!(second.next().await, frame_from(m.id, b"back"));
    assert_eq!(h.metric("relay_replaced_total").await, 1);
    h.shutdown().await;
}

#[tokio::test]
async fn a_failed_peer_read_closes_1011() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    let (qp, qm) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    h.pair(pid(2), &qp, &p);
    h.pair(pid(3), &m, &qm);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    let mut q_phone_side = login(&h, &qp).await;
    let mut q_mac_side = login(&h, &qm).await;

    // Only the `Refresh` after P's unpair fails its read.
    let n = h.store.count("peers_of");
    h.store.fail_nth("peers_of", n + 1);
    phone
        .text(msg(
            "test_unpair",
            json!({ "pair_id": b64(&pid(1).0), "refresh": keys(&[m.id, p.id]) }),
        ))
        .await;
    assert_eq!(
        mac.next_skipping_presence().await,
        In::Closed(1011, "internal_error".into())
    );
    assert_eq!(
        phone.next_skipping_presence().await,
        In::Closed(1011, "internal_error".into())
    );
    // Their leaves' reads succeed, so Q sees each go offline.
    assert_eq!(q_mac_side.next_skipping_offline_of(m.id).await, Some(m.id));
    assert_eq!(
        q_phone_side.next_skipping_offline_of(p.id).await,
        Some(p.id)
    );

    // A failed `Join` read: 1011, no welcome, and its `Leave` does nothing.
    h.until("both leaves", |h| {
        !h.handler.leaves_of(m.id).is_empty() && !h.handler.leaves_of(p.id).is_empty()
    })
    .await;
    barrier(&h, &mut q_mac_side).await;
    let (touches, leaves) = (h.store.count("touch"), h.handler.leave_count());
    let n = h.store.count("peers_of");
    h.store.fail_nth("peers_of", n + 1);
    let before = h.requests();
    let (_x, heard) = connect(&h, &key(Role::Phone)).await;
    assert_eq!(heard, In::Closed(1011, "internal_error".into()));
    h.requests_reach(before + 2).await; // its Join and its Leave
    barrier(&h, &mut q_mac_side).await;
    assert_eq!(
        h.store.count("touch"),
        touches,
        "the failed join's leave touched"
    );
    assert_eq!(
        h.handler.leave_count(),
        leaves,
        "the failed join's leave ran on_leave"
    );
    h.shutdown().await;
}

impl Dev {
    /// Reads until a `presence {who, online: false}`, skipping other presence; returns
    /// `who`, or `None` if something else came first.
    async fn next_skipping_offline_of(&mut self, who: DeviceKey) -> Option<DeviceKey> {
        loop {
            match self.next().await {
                In::Text(Control::Presence {
                    peer,
                    online: false,
                }) if peer == who => return Some(peer),
                In::Text(Control::Presence { .. }) => continue,
                _ => return None,
            }
        }
    }
}

/// Writers' rule 3, proved through the `Refresh` itself.
#[tokio::test]
async fn a_failed_handler_call_still_refreshes_the_sender() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let _mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;

    let leaves = h.handler.leave_count();
    let n = h.store.count("peers_of");
    let held = h.store.hold_nth("peers_of", n + 1);
    let before = h.requests();
    phone
        .text(msg("test_panic", json!({ "pair_id": b64(&pid(1).0) })))
        .await;
    held.started().await;
    // A `Leave` step calls `on_leave` before `peers_of` in one store call: had P closed
    // first, the held read would be its leave's, and `on_leave` would have run.
    assert_eq!(
        h.handler.leave_count(),
        leaves,
        "the held read is a leave's"
    );
    assert_eq!(
        h.requests(),
        before + 1,
        "the Refresh [P] is not the request"
    );
    assert!(
        !matches!(
            phone.poll(Duration::from_millis(50)).await,
            Some(In::Closed(..))
        ),
        "P closed before its Refresh"
    );
    held.release();
    assert_eq!(
        phone.next_skipping_presence().await,
        In::Closed(1011, "internal_error".into())
    );
    h.shutdown().await;
}

/// Writers' rule 3, the leave half, for `Err` and for a panic (under `catch_unwind`).
#[tokio::test]
async fn a_failed_replaced_leave_still_refreshes_the_current_connection() {
    for fail in [Fail::Err, Fail::Panic] {
        let h = harness().await;
        let (m, p, q) = (key(Role::Mac), key(Role::Phone), key(Role::Phone));
        h.pair(pid(1), &m, &p);
        h.register(&q);
        let mut old = login(&h, &m).await;
        let _phone = login(&h, &p).await;
        let mut q_dev = login(&h, &q).await;
        h.handler.plan_leave(LeavePlan {
            who: Some(m.id),
            current: Some(false),
            delete: Some(pid(1)),
            fail: Some(fail),
            ..LeavePlan::default()
        });

        let base = h.store.count("peers_of");
        let mut mac = login(&h, &m).await;
        assert_eq!(
            old.next_skipping_presence().await,
            In::Closed(4409, "replaced".into())
        );
        h.until("the replaced leave", |h| {
            h.handler.leaves_of(m.id) == vec![false]
        })
        .await;
        // Q's `Refresh [Q]` queues behind the running `Leave` step, re-reading only Q.
        barrier(&h, &mut q_dev).await;
        // M's Join read, Q's read, then the leave's own two: the fan-out read (which
        // runs even after a failed `on_leave`) and the re-read of the current M.
        assert_eq!(
            h.store.count("peers_of") - base,
            2 + 2,
            "{fail:?}: the leave's reads"
        );

        let (dropped, routed) = (
            h.metric("relay_frames_dropped_total").await,
            h.metric("relay_frames_routed_total").await,
        );
        mac.frame(p.id, b"must not route").await;
        h.metric_reaches("relay_frames_dropped_total", dropped + 1)
            .await;
        assert_eq!(h.metric("relay_frames_routed_total").await, routed);
        h.shutdown().await;
    }
}

#[tokio::test]
async fn handler_messages_wait_for_their_refresh() {
    let h = harness().await;
    let (m, p, q) = (key(Role::Mac), key(Role::Phone), key(Role::Mac));
    h.register(&m);
    h.pair(pid(2), &q, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    let mut q_dev = login(&h, &q).await;

    let n = h.store.count("peers_of");
    let held = h.store.hold_nth("peers_of", n + 1);
    mac.text(msg(
        "test_pair",
        json!({
            "peer": b64(&p.id.0),
            "pair_id": b64(&pid(1).0),
            "refresh": keys(&[m.id, p.id]),
            "to": b64(&p.id.0),
        }),
    ))
    .await;
    held.started().await;
    q_dev.frame(p.id, b"from q").await;
    assert_eq!(
        phone.next_skipping_presence().await,
        frame_from(q.id, b"from q"),
        "the handler's message came before its Refresh"
    );
    held.release();
    assert_eq!(
        phone.next_skipping_presence().await,
        In::Text(marker("test_paired"))
    );
    phone.routed(RoutedKind::Hs1, m.id, b"hs1").await;
    assert_eq!(
        mac.next_skipping_presence().await,
        In::Bin(Routed {
            kind: RoutedKind::Hs1,
            peer: p.id,
            body: b"hs1".to_vec()
        })
    );
    h.shutdown().await;
}

#[tokio::test]
async fn a_writer_waits_for_its_refresh() {
    let h = harness().await;
    let (m, q, p2) = (key(Role::Mac), key(Role::Mac), key(Role::Phone));
    h.register(&p2);
    let mut mac = login(&h, &m).await;
    let mut q_dev = login(&h, &q).await;

    let n = h.store.count("peers_of");
    let held = h.store.hold_nth("peers_of", n + 1);
    mac.text(msg(
        "test_pair",
        json!({ "peer": b64(&p2.id.0), "pair_id": b64(&pid(1).0), "refresh": keys(&[m.id]) }),
    ))
    .await;
    held.started().await;
    mac.text(msg("test_noop", json!({}))).await; // flushed to the socket
                                                 // No hook can show a correct relay has *not* read M's second message; the delay only
                                                 // gives a broken relay time to read and handle it.
    tokio::time::sleep(Duration::from_millis(200)).await;
    q_dev.text(msg("test_noop", json!({}))).await;
    h.until("Q's message", |h| {
        h.handler.handled_by(q.id, "test_noop") == 1
    })
    .await;
    assert_eq!(
        h.handler.handled_by(m.id, "test_noop"),
        0,
        "M's next message was handled before its Refresh"
    );
    held.release();
    h.until("M's message", |h| {
        h.handler.handled_by(m.id, "test_noop") == 1
    })
    .await;
    h.shutdown().await;
}

#[tokio::test]
async fn on_leave_is_told_whether_its_connection_was_current() {
    let h = harness().await;
    let (m, p, q) = (key(Role::Mac), key(Role::Phone), key(Role::Phone));
    let mut mac = login(&h, &m).await;
    let mut old = login(&h, &p).await;

    // A plain disconnect is current.
    let q_dev = login(&h, &q).await;
    q_dev.close().await;
    h.until("Q's leave", |h| h.handler.leaves_of(q.id) == vec![true])
        .await;

    // A replaced connection's leave isn't. Its `on_leave` stores M-P, tells M, and
    // returns `refresh [M, P]`: the new connection, joined before the pair existed,
    // routes over it once the leave's refresh is installed.
    h.handler.plan_leave(LeavePlan {
        who: Some(p.id),
        current: Some(false),
        insert: Some(pair_record(pid(1), m.id, p.id, h.now())),
        out: vec![(m.id, marker("test_left"))],
        refresh: vec![m.id, p.id],
        ..LeavePlan::default()
    });
    let mut new = login(&h, &p).await;
    assert_eq!(old.next().await, In::Closed(4409, "replaced".into()));
    h.until("P's replaced leave", |h| {
        h.handler.leaves_of(p.id) == vec![false]
    })
    .await;
    assert_eq!(mac.next().await, In::Text(marker("test_left")));
    new.frame(m.id, b"over the new pair").await;
    assert_eq!(mac.next().await, frame_from(p.id, b"over the new pair"));
    h.shutdown().await;
}

#[tokio::test]
async fn shutdown_during_a_held_login_read_finishes() {
    let mut h = harness().await;
    let m = key(Role::Mac);
    let n = h.store.count("peers_of");
    let held = h.store.hold_nth("peers_of", n + 1);
    let (url, mk) = (h.url(), m.clone());
    let _joining = tokio::spawn(async move { connect_via(&url, &mk, None).await });
    held.started().await;
    let touches = h.store.count("touch");
    let relay = h.relay.take().unwrap();
    let stopping = tokio::spawn(relay.shutdown());
    tokio::time::sleep(Duration::from_millis(100)).await;
    held.release();
    timeout(WAIT, stopping)
        .await
        .expect("shutdown returned in time")
        .unwrap();
    assert_eq!(
        h.store.count("touch"),
        touches + 1,
        "M's leave touched once"
    );
    assert_eq!(
        h.handler.leaves_of(m.id),
        vec![true],
        "M's on_leave ran once"
    );
}

#[tokio::test]
async fn rehandshake_counts_against_the_control_limit() {
    let h = harness().await;
    let (m, p, q) = (key(Role::Mac), key(Role::Phone), key(Role::Mac));
    h.pair(pid(1), &m, &p);
    h.pair(pid(2), &q, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    let mut q_dev = login(&h, &q).await;
    for _ in 0..30 {
        mac.text(msg("test_noop", json!({}))).await;
    }
    h.until("30 handled", |h| {
        h.handler.handled_by(m.id, "test_noop") == 30
    })
    .await;
    // The 31st control message, a `rehandshake`, is limited and not routed. (A refused
    // `rehandshake` is not re-sent: the Mac asks again at its next trigger.)
    mac.rehandshake(p.id).await;
    assert_eq!(
        mac.next_skipping_presence().await,
        In::Text(Control::ControlLimited {
            msg: "rehandshake".into(),
            slot: None,
            pair_id: None,
            peer: Some(p.id),
            retry_ms: 100
        })
    );
    q_dev.frame(p.id, b"sentinel").await;
    assert_eq!(
        phone.next_skipping_presence().await,
        frame_from(q.id, b"sentinel")
    );
    // No frame token was spent: the full burst of 100 is still there.
    for n in 0..101u8 {
        mac.frame(p.id, &[n]).await;
    }
    assert_eq!(
        mac.next_skipping_presence().await,
        In::Text(Control::RateLimited {
            peer: p.id,
            retry_ms: 50
        })
    );
    assert_eq!(h.metric("relay_frames_routed_total").await, 101);
    h.shutdown().await;
}

#[tokio::test]
async fn there_is_no_limit_before_login() {
    let h = harness().await;
    let mut sockets = Vec::new();
    for _ in 0..50 {
        // `open` asserts the challenge.
        sockets.push(open(&h.url(), None).await);
    }
    assert_eq!(sockets.len(), 50);
    h.shutdown().await;
}

#[tokio::test]
async fn a_pair_routes_after_refresh() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    let (qp, qm) = (key(Role::Mac), key(Role::Phone));
    h.register(&m);
    h.register(&p);
    h.pair(pid(2), &qp, &p);
    h.pair(pid(3), &m, &qm);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    let mut to_phone = login(&h, &qp).await;
    let mut to_mac = login(&h, &qm).await;

    async fn both_dropped(
        h: &H,
        mac: &mut Dev,
        phone: &mut Dev,
        to_phone: &mut Dev,
        to_mac: &mut Dev,
        what: &str,
    ) {
        mac.frame(phone.id, b"no").await;
        // Handled before the sentinel, which goes out on another connection.
        round_trip(h, mac).await;
        to_phone.frame(phone.id, b"sentinel").await;
        assert_eq!(
            phone.next_skipping_presence().await,
            frame_from(to_phone.id, b"sentinel"),
            "{what}"
        );
        phone.frame(mac.id, b"no").await;
        round_trip(h, phone).await;
        to_mac.frame(mac.id, b"sentinel").await;
        assert_eq!(
            mac.next_skipping_presence().await,
            frame_from(to_mac.id, b"sentinel"),
            "{what}"
        );
    }

    // Stored after login with no refresh: dropped.
    mac.text(msg(
        "test_pair",
        json!({ "peer": b64(&p.id.0), "pair_id": b64(&pid(1).0), "refresh": [] }),
    ))
    .await;
    round_trip(&h, &mut mac).await;
    both_dropped(
        &h,
        &mut mac,
        &mut phone,
        &mut to_phone,
        &mut to_mac,
        "no refresh",
    )
    .await;
    // Only one key refreshed: still dropped (the writers' rule).
    mac.text(msg("test_noop", json!({ "refresh": keys(&[m.id]) })))
        .await;
    round_trip(&h, &mut mac).await;
    both_dropped(
        &h,
        &mut mac,
        &mut phone,
        &mut to_phone,
        &mut to_mac,
        "one key",
    )
    .await;
    // Both keys: routes both ways.
    mac.text(msg("test_noop", json!({ "refresh": keys(&[m.id, p.id]) })))
        .await;
    round_trip(&h, &mut mac).await;
    mac.frame(p.id, b"yes").await;
    assert_eq!(
        phone.next_skipping_presence().await,
        frame_from(m.id, b"yes")
    );
    phone.frame(m.id, b"yes").await;
    assert_eq!(mac.next_skipping_presence().await, frame_from(p.id, b"yes"));
    h.shutdown().await;
}

#[tokio::test]
async fn routing_survives_a_held_store_lock() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;

    // A third login's `Join` read is held: the peer task is blocked inside a store call.
    let n = h.store.count("peers_of");
    let held = h.store.hold_nth("peers_of", n + 1);
    let (url, xk) = (h.url(), key(Role::Phone));
    let joining = tokio::spawn(async move { login_url(&url, &xk).await });
    held.started().await;

    mac.frame(p.id, b"one").await;
    assert_eq!(
        phone.next_skipping_presence().await,
        frame_from(m.id, b"one")
    );
    phone.frame(m.id, b"two").await;
    assert_eq!(mac.next_skipping_presence().await, frame_from(p.id, b"two"));
    mac.rehandshake(p.id).await;
    assert_eq!(
        phone.next_skipping_presence().await,
        In::Text(Control::Rehandshake { peer: m.id })
    );
    assert!(held.is_started() && !joining.is_finished());
    held.release();
    timeout(WAIT, joining).await.unwrap().unwrap();
    h.shutdown().await;
}

#[tokio::test]
async fn on_login_messages_come_before_welcome_and_on_leave_runs_once() {
    let h = harness().await;
    *h.handler.on_login.lock().unwrap() = vec![marker("test_first"), marker("test_second")];
    let m = key(Role::Mac);
    let (mut mac, first) = connect(&h, &m).await;
    assert_eq!(first, In::Text(marker("test_first")));
    assert_eq!(mac.next().await, In::Text(marker("test_second")));
    assert!(matches!(
        mac.next().await,
        In::Text(Control::Welcome { .. })
    ));
    assert_eq!(h.handler.logins.load(Ordering::SeqCst), 1);
    mac.close().await;
    h.until("the leave", |h| h.handler.leaves_of(m.id).len() == 1)
        .await;
    // A later round trip on the peer task: still once.
    *h.handler.on_login.lock().unwrap() = vec![];
    let mut other = login(&h, &key(Role::Phone)).await;
    barrier(&h, &mut other).await;
    assert_eq!(h.handler.leaves_of(m.id), vec![true]);
    h.shutdown().await;
}

#[tokio::test]
async fn unreadable_messages_are_counted_and_unanswered() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;

    mac.text("not json").await;
    mac.text("{\"v\":2,\"t\":\"pair_status\"}").await;
    mac.text("{\"v\":1,\"t\":\"rehandshake\",\"peer\":\"AAAA\"}")
        .await;
    mac.ws.send(Message::binary(vec![9, 9, 9])).await.unwrap();
    let mut wrong_type = vec![7];
    wrong_type.extend_from_slice(&p.id.0);
    mac.ws.send(Message::binary(wrong_type)).await.unwrap();
    h.metric_reaches("relay_unreadable_total", 5).await;
    // No answer: the next thing the Mac hears is the phone's frame.
    phone.frame(m.id, b"sentinel").await;
    assert_eq!(
        mac.next_skipping_presence().await,
        frame_from(p.id, b"sentinel")
    );
    // The two bad binary messages each spent a frame token: 98 of 100 are left.
    for n in 0..99u8 {
        mac.frame(p.id, &[n]).await;
    }
    assert_eq!(
        mac.next().await,
        In::Text(Control::RateLimited {
            peer: p.id,
            retry_ms: 50
        })
    );
    assert_eq!(h.metric("relay_frames_routed_total").await, 1 + 98);
    // The three unreadable texts each spent a control token before their head was read:
    // of 30, 27 readable messages are handled and the 28th is limited.
    for _ in 0..28 {
        mac.text(msg("test_noop", json!({}))).await;
    }
    assert_eq!(
        mac.next().await,
        In::Text(Control::ControlLimited {
            msg: "test_noop".into(),
            slot: None,
            pair_id: None,
            peer: None,
            retry_ms: 100
        })
    );
    assert_eq!(h.handler.handled_by(m.id, "test_noop"), 27);
    h.shutdown().await;
}

#[tokio::test]
async fn a_new_key_token_is_spent_when_register_fails() {
    let h = harness().await;
    h.store.fail("register");
    let (_dev, heard) = connect(&h, &key(Role::Phone)).await;
    assert_eq!(heard, In::Closed(1011, "internal_error".into()));
    h.store.heal("register");
    for n in 0..20 {
        let (dev, heard) = connect(&h, &key(Role::Phone)).await;
        if n < 19 {
            assert!(
                matches!(heard, In::Text(Control::Welcome { .. })),
                "key {n}: {heard:?}"
            );
            dev.close().await;
        } else {
            assert_eq!(
                heard,
                In::Closed(4429, "too_many_new_keys".into()),
                "key {n}"
            );
        }
    }
    h.shutdown().await;
}

#[tokio::test]
async fn a_login_after_login_is_ignored_and_counted() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;

    mac.text(login_text(&m, &[0; 32])).await;
    h.metric_reaches("relay_ignored_total", 1).await;
    phone.frame(m.id, b"sentinel").await;
    assert_eq!(
        mac.next_skipping_presence().await,
        frame_from(p.id, b"sentinel"),
        "the relay answered a second login"
    );

    // A later login spends a control token: 29 handled, a login, then one more.
    h.clock.advance(Duration::from_secs(3));
    for _ in 0..29 {
        mac.text(msg("test_noop", json!({}))).await;
    }
    h.until("29 handled", |h| {
        h.handler.handled_by(m.id, "test_noop") == 29
    })
    .await;
    mac.text(login_text(&m, &[1; 32])).await;
    mac.text(msg("test_noop", json!({}))).await;
    assert_eq!(
        mac.next().await,
        In::Text(Control::ControlLimited {
            msg: "test_noop".into(),
            slot: None,
            pair_id: None,
            peer: None,
            retry_ms: 100
        })
    );
    assert_eq!(h.metric("relay_ignored_total").await, 2);
    assert_eq!(
        h.handler.handled_t("login"),
        0,
        "a login reached the handler"
    );
    h.shutdown().await;
}

/// Routing needs the sender's entry to be current for the sender's connection. With
/// the writer gate closed, a replaced connection can't take its 4409 off its queue, so
/// it is still reading; its frames are dropped.
#[tokio::test]
async fn a_replaced_connection_routes_nothing() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    let mut old = login(&h, &p).await;
    assert!(matches!(
        mac.next().await,
        In::Text(Control::Presence { online: true, .. })
    ));

    h.gate.close();
    let (mut ws, c) = open(&h.url(), None).await;
    ws.send(Message::text(login_text(&p, &c))).await.unwrap();
    h.metric_reaches("relay_replaced_total", 1).await;
    let (dropped, routed) = (
        h.metric("relay_frames_dropped_total").await,
        h.metric("relay_frames_routed_total").await,
    );
    old.frame(m.id, b"from the replaced connection").await;
    h.metric_reaches("relay_frames_dropped_total", dropped + 1)
        .await;
    assert_eq!(h.metric("relay_frames_routed_total").await, routed);
    h.gate.open();
    assert_eq!(old.next().await, In::Closed(4409, "replaced".into()));
    h.shutdown().await;
}

/// An entry whose refresh read failed is closing: its set routes nothing, even while its
/// connection is still reading (the writer gate holds back its 1011).
#[tokio::test]
async fn a_closing_entry_routes_nothing() {
    let h = harness().await;
    let (m, p, qm) = (key(Role::Mac), key(Role::Phone), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    h.pair(pid(3), &m, &qm);
    let mut mac = login(&h, &m).await;
    let mut phone = login(&h, &p).await;
    let mut q_dev = login(&h, &qm).await;
    // Drain the presences, so the gate holds back only what follows.
    assert!(matches!(
        mac.next().await,
        In::Text(Control::Presence { online: true, .. })
    ));
    assert!(matches!(
        mac.next().await,
        In::Text(Control::Presence { online: true, .. })
    ));

    h.gate.close();
    let n = h.store.count("peers_of");
    h.store.fail_nth("peers_of", n + 1);
    phone
        .text(msg(
            "test_unpair",
            json!({ "pair_id": b64(&pid(1).0), "refresh": keys(&[m.id]) }),
        ))
        .await;
    round_trip(&h, &mut phone).await;
    let (dropped, routed) = (
        h.metric("relay_frames_dropped_total").await,
        h.metric("relay_frames_routed_total").await,
    );
    mac.frame(qm.id, b"from a closing entry").await;
    h.metric_reaches("relay_frames_dropped_total", dropped + 1)
        .await;
    assert_eq!(h.metric("relay_frames_routed_total").await, routed);
    // A later Refresh naming M doesn't re-read a closing entry: still dropped.
    let reads = h.store.count("peers_of");
    phone
        .text(msg("test_noop", json!({ "refresh": keys(&[m.id]) })))
        .await;
    round_trip(&h, &mut phone).await;
    assert_eq!(
        h.store.count("peers_of"),
        reads,
        "a closing entry was re-read"
    );
    mac.frame(qm.id, b"still closing").await;
    h.metric_reaches("relay_frames_dropped_total", dropped + 2)
        .await;
    assert_eq!(h.metric("relay_frames_routed_total").await, routed);
    h.gate.open();
    assert_eq!(mac.next().await, In::Closed(1011, "internal_error".into()));
    assert_eq!(
        q_dev.next_skipping_offline_of(m.id).await,
        Some(m.id),
        "Q heard something before M's offline"
    );
    h.shutdown().await;
}

/// The owner's 1009 rule covers every message over 64 KiB, so also one over the
/// WebSocket layer's own 128 KiB limit, which that layer refuses: after login it is still
/// closed 1009, not dropped.
#[tokio::test]
async fn a_message_over_128_kib_after_login_is_closed_1009() {
    let h = harness().await;
    let (m, p) = (key(Role::Mac), key(Role::Phone));
    h.pair(pid(1), &m, &p);
    let mut mac = login(&h, &m).await;
    mac.frame(p.id, &vec![0x11; 129 * 1024]).await;
    assert_eq!(
        mac.next_skipping_presence().await,
        In::Closed(1009, "message_too_big".into())
    );
    let mut phone = login(&h, &p).await;
    phone.text(format!("\"{}\"", "x".repeat(129 * 1024))).await;
    assert_eq!(
        phone.next_skipping_presence().await,
        In::Closed(1009, "message_too_big".into())
    );
    h.shutdown().await;
}

/// Before login too: closed 1009, not 4401, and not counted as a refused login.
#[tokio::test]
async fn a_message_over_128_kib_before_login_is_closed_1009() {
    let h = harness().await;
    for binary in [false, true] {
        let (mut ws, _) = open(&h.url(), None).await;
        let big = vec![b'x'; 129 * 1024];
        let msg = if binary {
            Message::binary(big)
        } else {
            Message::text(String::from_utf8(big).unwrap())
        };
        let _ = ws.send(msg).await;
        let mut dev = Dev {
            ws,
            id: Bytes([0; 32]),
        };
        assert_eq!(
            dev.next().await,
            In::Closed(1009, "message_too_big".into()),
            "binary: {binary}"
        );
    }
    assert_eq!(h.metric("relay_logins_total{result=\"refused\"}").await, 0);
    h.shutdown().await;
}

//! The relay: WebSocket I/O around `relay-core`'s decisions, with storage behind
//! `relay_core::Store`.
//!
//! Per connection: send `challenge`, wait for `login`, ask `relay-core` to check it,
//! admit it over the stored role, take a new-key token if the key is new, register it,
//! ask the `ControlHandler` for its login messages, then join it through the peer task,
//! which sends `welcome` and tells paired peers. Then route frames and `rehandshake`,
//! hand other control messages to the handler, and ping until the socket closes or stops
//! answering. A refused login is closed with 4401 `login_refused` and nothing else; a
//! refused new key with 4429 `too_many_new_keys`; a login that hits a store error with
//! 1011 and no `welcome`; a replaced connection with 4409 `replaced`; and a message over
//! 64 KiB with 1009, before login too.
//!
//! Every store call runs off the async workers (`StoreHandle::call`). Every limit is
//! checked before any store call. Routing reads `Live` under a short lock and never waits
//! on the peer task or the store (ADR 0006). Logs and `/metrics` carry only counts and
//! error codes, never keys, ids, IPs, tokens or message contents.

pub mod log;
pub mod metrics;
mod peers;
pub mod store;

use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use relay_core::{
    admit, cleanup_cutoff, verify_login, Admit, Challenge, CleanupCounts, Clock, ConnId,
    ControlHandler, ControlLimiter, FrameLimiter, Identity, IgnoreControl, Limits, LoginError,
    NewKeyLimiter, Outbound, Presence, Store, StoreError, SystemClock,
};
use relay_protocol::{Control, ControlHead, DeviceKey, Routed};
use tokio::sync::mpsc::error::TrySendError;
use tokio::sync::{mpsc, oneshot, watch, Notify};
use tokio::task::JoinHandle;
use tokio::time::{interval, interval_at, timeout, timeout_at, Instant, MissedTickBehavior};

pub use log::{LogEvent, LogSink, StderrLog};
pub use metrics::Counters;
pub use store::SqliteStore;

use peers::{Entry, Request};

/// The close code for a refused login.
pub const LOGIN_REFUSED_CODE: u16 = 4401;
/// The close reason for a refused login.
pub const LOGIN_REFUSED_REASON: &str = "login_refused";
/// The close code for a login that hit a store error.
pub const STORE_ERROR_CODE: u16 = 1011;
/// The close reason for a login that hit a store error.
pub const STORE_ERROR_REASON: &str = "internal_error";
/// The close code for a connection replaced by a newer login of the same device.
pub const REPLACED_CODE: u16 = 4409;
/// The close reason for a replaced connection.
pub const REPLACED_REASON: &str = "replaced";
/// The close code for a new key refused by the per-IP limit.
pub const TOO_MANY_NEW_KEYS_CODE: u16 = 4429;
/// The close reason for a new key refused by the per-IP limit.
pub const TOO_MANY_NEW_KEYS_REASON: &str = "too_many_new_keys";
/// The close code for a WebSocket message over 64 KiB.
pub const TOO_BIG_CODE: u16 = 1009;
/// The close reason for a WebSocket message over 64 KiB.
pub const TOO_BIG_REASON: &str = "message_too_big";

/// Where the relay reads a connection's IP, for the new-key limit.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ClientIp {
    /// The socket's peer address (the default).
    #[default]
    Socket,
    /// The `Fly-Client-IP` header, which Fly's proxy sets; the socket address when the
    /// header is missing or isn't an IP.
    FlyClientIp,
}

/// A gate in front of every connection's writer, for tests only: while it is closed, no
/// connection takes anything off its queue, so a queue of `queue` items fills exactly.
/// Open by default.
#[doc(hidden)]
#[derive(Clone)]
pub struct WriterGate(Arc<watch::Sender<bool>>);

impl WriterGate {
    pub fn new() -> Self {
        WriterGate(Arc::new(watch::channel(true).0))
    }

    pub fn close(&self) {
        self.0.send_replace(false);
    }

    pub fn open(&self) {
        self.0.send_replace(true);
    }
}

impl Default for WriterGate {
    fn default() -> Self {
        Self::new()
    }
}

/// How the relay runs.
#[derive(Clone)]
pub struct Config {
    /// Where to listen; port 0 picks a free one.
    pub listen: SocketAddr,
    /// Host names a login may be signed for.
    pub hosts: Vec<String>,
    /// How often to ping each device (15 s by default).
    pub ping_interval: Duration,
    /// How long a device may go without a pong before it counts as gone (30 s by
    /// default). Also bounds the wait for `login`.
    pub ping_timeout: Duration,
    /// Devices, roles, pairs and push tokens.
    pub store: Arc<dyn Store>,
    /// Where the relay reads the time.
    pub clock: Arc<dyn Clock>,
    /// Where log lines go.
    pub log: Arc<dyn LogSink>,
    /// The Bearer token `/metrics` needs. Without one, `/metrics` answers 404.
    pub metrics_token: Option<String>,
    /// How often the 90-day cleanup runs (1 h by default). It runs first one interval
    /// after start.
    pub cleanup_interval: Duration,
    /// The frame, control, slot and new-key limits (the spec's by default).
    pub limits: Limits,
    /// Where a connection's IP comes from, for the new-key limit.
    pub client_ip: ClientIp,
    /// What handles the control messages the relay doesn't (story 5a's pairing). By
    /// default every one is ignored.
    pub control: Arc<dyn ControlHandler>,
    /// How many messages may wait for one device (192 by default). A full queue drops a
    /// frame, or the device on a text message or close.
    pub queue: usize,
    /// Tests only: holds every writer while closed.
    #[doc(hidden)]
    pub writer_gate: WriterGate,
}

impl Config {
    /// A config with the spec's ping times (every 15 s, gone after 30 s) and limits, the
    /// system clock, logs on stderr, no `/metrics`, an hourly cleanup, the socket's IP,
    /// no control handler and a queue of 192.
    pub fn new(listen: SocketAddr, hosts: Vec<String>, store: Arc<dyn Store>) -> Self {
        Config {
            listen,
            hosts,
            ping_interval: Duration::from_secs(15),
            ping_timeout: Duration::from_secs(30),
            store,
            clock: Arc::new(SystemClock),
            log: Arc::new(StderrLog),
            metrics_token: None,
            cleanup_interval: Duration::from_secs(60 * 60),
            limits: Limits::default(),
            client_ip: ClientIp::Socket,
            control: Arc::new(IgnoreControl),
            queue: DEFAULT_QUEUE,
            writer_gate: WriterGate::new(),
        }
    }
}

/// The spec's limit on one WebSocket message, of either kind, the 33-byte envelope
/// header included.
pub const MAX_MESSAGE: usize = 64 * 1024;

/// What the WebSocket layer itself accepts, so a message just over `MAX_MESSAGE` still
/// reaches the relay and is closed with 1009.
const SOCKET_LIMIT: usize = 128 * 1024;

/// How many messages may wait for one device by default.
pub const DEFAULT_QUEUE: usize = 192;

/// The store, called off the async workers: each call runs on `spawn_blocking`, so a
/// held store lock never blocks a tokio worker. Each call is counted until its blocking
/// work ends, even if the caller is cancelled, so `Relay::shutdown` can wait for it.
#[derive(Clone)]
pub struct StoreHandle {
    store: Arc<dyn Store>,
    tasks: Arc<Tracker>,
}

impl StoreHandle {
    pub fn new(store: Arc<dyn Store>) -> Self {
        Self::tracked(store, Arc::new(Tracker::default()))
    }

    fn tracked(store: Arc<dyn Store>, tasks: Arc<Tracker>) -> Self {
        StoreHandle { store, tasks }
    }

    /// Runs `f` on the store, on a blocking thread.
    pub async fn call<T, F>(&self, f: F) -> Result<T, StoreError>
    where
        F: FnOnce(&dyn Store) -> Result<T, StoreError> + Send + 'static,
        T: Send + 'static,
    {
        let store = self.store.clone();
        let busy = self.tasks.enter();
        let work = move || {
            let result = f(&*store);
            // The store reference goes before the count, so a relay that has shut down
            // holds none.
            drop(store);
            drop(busy);
            result
        };
        match tokio::task::spawn_blocking(work).await {
            Ok(result) => result,
            Err(_) => Err(StoreError::Failed("store_task")),
        }
    }
}

/// One item on a device's queue.
pub(crate) enum Outgoing {
    /// A control message. On a full queue it drops the device.
    Text(Control),
    /// A routed envelope. On a full queue it is dropped and counted.
    Binary(Vec<u8>),
    /// Close the connection with this code and reason, after what is queued before it.
    Close(u16, &'static str),
}

/// The live state every connection shares. One lock, so presence, the senders it fans
/// out to and the peer sets routing reads never disagree. Only the peer task writes
/// presence and the sets (ADR 0006).
#[derive(Default)]
struct Live {
    presence: Presence,
    senders: HashMap<(DeviceKey, ConnId), mpsc::Sender<Outgoing>>,
    peers: HashMap<DeviceKey, Entry>,
}

impl Live {
    /// Queues each message for its recipient. A recipient whose queue is full (it
    /// stopped reading) loses its sender, so its loop ends and its leave runs.
    fn deliver(&mut self, out: Vec<Outbound>, log: &dyn LogSink) {
        for (to, msg) in out {
            let Some(conn) = self.presence.conn_of(&to) else {
                continue;
            };
            let Some(tx) = self.senders.get(&(to, conn)) else {
                continue;
            };
            match tx.try_send(Outgoing::Text(msg)) {
                Ok(()) => {}
                Err(TrySendError::Full(_)) => {
                    log.log(LogEvent::QueueFull);
                    self.senders.remove(&(to, conn));
                }
                Err(TrySendError::Closed(_)) => {
                    self.senders.remove(&(to, conn));
                }
            }
        }
    }

    fn online(&self) -> usize {
        self.presence.online_ids().len()
    }

    /// `to`'s connection and sender, if a frame from `from` (on `from_conn`) may reach
    /// it: `from`'s entry is current for `from_conn`, both entries have a set, each set
    /// names the other key, and `to` has a sender. No await, no store call.
    fn route(
        &self,
        from: &DeviceKey,
        from_conn: ConnId,
        to: &DeviceKey,
    ) -> Option<(ConnId, mpsc::Sender<Outgoing>)> {
        let mine = self.peers.get(from)?;
        if mine.conn != from_conn {
            return None;
        }
        let theirs = self.peers.get(to)?;
        let names = |set: &Option<Vec<_>>, key: &DeviceKey| {
            set.as_ref()
                .is_some_and(|s: &Vec<relay_protocol::PairInfo>| {
                    s.iter().any(|p| p.peer_id == *key)
                })
        };
        if !names(&mine.set, to) || !names(&theirs.set, from) {
            return None;
        }
        let tx = self.senders.get(&(*to, theirs.conn))?;
        Some((theirs.conn, tx.clone()))
    }
}

/// Counts the relay's running connections, leaves and store calls, so `shutdown` can
/// wait for them.
#[derive(Default)]
struct Tracker {
    running: Mutex<usize>,
    idle: Notify,
}

/// One running task, counted until dropped.
pub(crate) struct Busy(Arc<Tracker>);

impl Tracker {
    fn enter(self: &Arc<Self>) -> Busy {
        *self.running.lock().unwrap_or_else(PoisonError::into_inner) += 1;
        Busy(self.clone())
    }

    async fn idle(&self) {
        loop {
            let notified = self.idle.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if *self.running.lock().unwrap_or_else(PoisonError::into_inner) == 0 {
                return;
            }
            notified.await;
        }
    }
}

impl Drop for Busy {
    fn drop(&mut self) {
        let mut running = self
            .0
            .running
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        *running -= 1;
        if *running == 0 {
            self.0.idle.notify_waiters();
        }
    }
}

/// The limiters, in memory. Each is asked before any store call.
struct Limiters {
    frames: Mutex<FrameLimiter>,
    control: Mutex<ControlLimiter>,
    new_keys: Mutex<NewKeyLimiter>,
}

impl Limiters {
    fn new(limits: &Limits) -> Self {
        Limiters {
            frames: Mutex::new(FrameLimiter::new(limits)),
            control: Mutex::new(ControlLimiter::new(limits)),
            new_keys: Mutex::new(NewKeyLimiter::new(limits)),
        }
    }

    fn prune(&self, now: u64) {
        lock(&self.frames).prune(now);
        lock(&self.control).prune(now);
        lock(&self.new_keys).prune(now);
    }
}

/// Locks a mutex; a panic elsewhere while it was held doesn't stop the relay.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

struct Hub {
    config: Config,
    store: StoreHandle,
    live: Mutex<Live>,
    next_conn: AtomicU64,
    counters: Counters,
    tasks: Arc<Tracker>,
    limiters: Limiters,
    /// The peer task's requests.
    peer_tx: mpsc::UnboundedSender<Request>,
    /// Requests sent to the peer task, ever (tests only).
    peer_requests: AtomicU64,
    /// Set by `Relay::abort`: leaves do nothing, as after a crash.
    aborted: AtomicBool,
    /// Turns true when the relay stops.
    stop: watch::Receiver<bool>,
}

impl Hub {
    /// The shared state; a panic elsewhere while it was held doesn't stop the relay.
    fn live(&self) -> MutexGuard<'_, Live> {
        lock(&self.live)
    }

    fn log(&self, event: LogEvent) {
        self.config.log.log(event);
    }

    fn aborted(&self) -> bool {
        self.aborted.load(Ordering::SeqCst)
    }

    /// Queues a request for the peer task. False if the task has ended.
    fn request(&self, request: Request) -> bool {
        self.peer_requests.fetch_add(1, Ordering::SeqCst);
        self.peer_tx.send(request).is_ok()
    }

    /// Asks the peer task to re-read `keys` and install their sets, then deliver `out`,
    /// and waits until it has. False if the task has ended.
    async fn refresh(&self, keys: Vec<DeviceKey>, out: Vec<Outbound>) -> bool {
        let (reply, done) = oneshot::channel();
        if !self.request(Request::Refresh { keys, out, reply }) {
            return false;
        }
        done.await.is_ok()
    }

    /// Prunes the limiters, touches every online device, then deletes the devices unseen
    /// for 90 days with their pairs and push tokens. Sends nothing: peers reconcile at
    /// `welcome`, and routing needs both ends' sets to agree (ADR 0006).
    async fn run_cleanup(&self) -> CleanupCounts {
        let now = self.config.clock.now_ms();
        self.limiters.prune(now);
        let Some(cutoff) = cleanup_cutoff(now) else {
            return CleanupCounts::default();
        };
        let online = self.live().presence.online_ids();
        match self
            .store
            .call(move |s| s.cleanup(now, cutoff, &online))
            .await
        {
            Ok(counts) => {
                Counters::add(&self.counters.cleanup_deleted_devices, counts.devices);
                self.log(LogEvent::Cleanup {
                    touched: counts.touched,
                    devices: counts.devices,
                    pairs: counts.pairs,
                    push_tokens: counts.push_tokens,
                });
                counts
            }
            Err(e) => {
                self.log(LogEvent::CleanupStoreError { code: e.code() });
                CleanupCounts::default()
            }
        }
    }
}

/// Refuses settings the relay can't run with.
fn check_config(config: &Config) -> std::io::Result<()> {
    let invalid = |msg: &str| Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, msg));
    if config.ping_interval.is_zero() || config.ping_interval >= config.ping_timeout {
        return invalid("ping_interval must be above zero and below ping_timeout");
    }
    if config.cleanup_interval.is_zero() {
        return invalid("cleanup_interval must be above zero");
    }
    if config.queue == 0 {
        return invalid("queue must be above zero");
    }
    let l = &config.limits;
    if [
        l.frames_per_sec,
        l.frame_burst,
        l.control_per_sec,
        l.control_burst,
    ]
    .contains(&0)
        || l.slots_per_hour == 0
        || l.new_keys_per_hour == 0
    {
        return invalid("every limit must be above zero");
    }
    Ok(())
}

/// Resolves once the relay is told to stop; never, if its `Relay` is dropped instead.
async fn stopped(stop: &mut watch::Receiver<bool>) {
    if stop.wait_for(|s| *s).await.is_err() {
        std::future::pending::<()>().await;
    }
}

/// A running relay.
pub struct Relay {
    /// The address it bound.
    pub addr: SocketAddr,
    hub: Arc<Hub>,
    stop: watch::Sender<bool>,
    server: JoinHandle<std::io::Result<()>>,
    cleanup: JoinHandle<()>,
    peers: JoinHandle<()>,
}

impl Relay {
    /// Runs the cleanup now, as its timer would.
    pub async fn run_cleanup(&self) -> CleanupCounts {
        self.hub.run_cleanup().await
    }

    /// How many requests have been sent to the peer task, ever. Tests only: it shows a
    /// request is queued even while the task is held inside a store call.
    #[doc(hidden)]
    pub fn peer_requests_received(&self) -> u64 {
        self.hub.peer_requests.load(Ordering::SeqCst)
    }

    /// Stops cleanly, in this order: stop accepting; close every connection; wait for
    /// each leave, a running cleanup, and every store call still running (a cancelled
    /// login's included) to finish; stop the peer task; then drop the relay's last
    /// reference to the store.
    pub async fn shutdown(self) {
        let _ = self.stop.send(true);
        let _ = self.server.await;
        let _ = self.cleanup.await;
        self.hub.tasks.idle().await;
        self.peers.abort();
        let _ = self.peers.await;
        drop(self.hub);
    }

    /// Stops as a crash would: no leave runs, so nothing is touched or told.
    pub fn abort(self) {
        self.hub.aborted.store(true, Ordering::SeqCst);
        let _ = self.stop.send(true);
        self.server.abort();
        self.cleanup.abort();
        self.peers.abort();
    }

    /// Waits until the server stops, which it does only on a fatal error, or until the
    /// peer task ends, which is an error too.
    pub async fn wait(mut self) -> std::io::Result<()> {
        tokio::select! {
            result = &mut self.server => match result {
                Ok(result) => result,
                Err(_) => Err(std::io::Error::other("server task ended")),
            },
            _ = &mut self.peers => Err(std::io::Error::other("peer task ended")),
        }
    }
}

/// Starts the relay: the HTTP server, the peer task and the cleanup timer.
pub async fn serve(config: Config) -> std::io::Result<Relay> {
    check_config(&config)?;
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let addr = listener.local_addr()?;
    let (stop_tx, stop_rx) = watch::channel(false);
    let tasks = Arc::new(Tracker::default());
    let (peer_tx, peer_rx) = mpsc::unbounded_channel();
    let hub = Arc::new(Hub {
        store: StoreHandle::tracked(config.store.clone(), tasks.clone()),
        limiters: Limiters::new(&config.limits),
        config,
        live: Mutex::new(Live::default()),
        next_conn: AtomicU64::new(1),
        counters: Counters::default(),
        tasks,
        peer_tx,
        peer_requests: AtomicU64::new(0),
        aborted: AtomicBool::new(false),
        stop: stop_rx.clone(),
    });
    let peers = tokio::spawn(peers::run(hub.clone(), peer_rx));
    let app = Router::new()
        .route("/", get(upgrade))
        .route("/health", get(health))
        .route("/metrics", get(metrics_page))
        .with_state(hub.clone());
    let log = hub.config.log.clone();
    let mut stop = stop_rx;
    let server = tokio::spawn(async move {
        let result = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move { stopped(&mut stop).await })
        .await;
        if result.is_err() {
            log.log(LogEvent::ServeError);
        }
        result
    });
    let cleanup = tokio::spawn(cleanup_timer(hub.clone()));
    Ok(Relay {
        addr,
        hub,
        stop: stop_tx,
        server,
        cleanup,
        peers,
    })
}

/// Runs the cleanup one interval after start, then every interval, until the relay
/// stops. A run in progress finishes first.
async fn cleanup_timer(hub: Arc<Hub>) {
    let every = hub.config.cleanup_interval;
    let mut ticker = interval_at(Instant::now() + every, every);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut stop = hub.stop.clone();
    loop {
        tokio::select! {
            _ = stopped(&mut stop) => return,
            _ = ticker.tick() => {
                hub.run_cleanup().await;
            }
        }
    }
}

async fn health() -> &'static str {
    "ok"
}

/// `/metrics`: 404 when no token is configured, 401 without it, else the counts.
async fn metrics_page(State(hub): State<Arc<Hub>>, headers: HeaderMap) -> Response {
    let Some(token) = &hub.config.metrics_token else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let given = headers.get(header::AUTHORIZATION).map(|v| v.as_bytes());
    if !metrics::authorized(given, token) {
        return (
            StatusCode::UNAUTHORIZED,
            [(header::WWW_AUTHENTICATE, "Bearer")],
        )
            .into_response();
    }
    let counts = match hub.store.call(|s| s.counts()).await {
        Ok(counts) => counts,
        Err(e) => {
            hub.log(LogEvent::MetricsStoreError { code: e.code() });
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    };
    let online = hub.live().online();
    (
        [(header::CONTENT_TYPE, "text/plain; version=0.0.4")],
        metrics::render(&hub.counters, online, &counts),
    )
        .into_response()
}

/// The IP a connection counts under for the new-key limit.
fn client_ip(source: ClientIp, headers: &HeaderMap, socket: SocketAddr) -> IpAddr {
    let header = match source {
        ClientIp::Socket => None,
        ClientIp::FlyClientIp => headers
            .get("fly-client-ip")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<IpAddr>().ok()),
    };
    header.unwrap_or(socket.ip())
}

async fn upgrade(
    ws: WebSocketUpgrade,
    ConnectInfo(socket_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    State(hub): State<Arc<Hub>>,
) -> impl IntoResponse {
    let ip = client_ip(hub.config.client_ip, &headers, socket_addr);
    ws.max_message_size(SOCKET_LIMIT)
        .max_frame_size(SOCKET_LIMIT)
        .on_upgrade(move |socket| async move {
            let busy = hub.tasks.enter();
            let mut stop = hub.stop.clone();
            // Stopping drops the connection, and with it its leave guard.
            tokio::select! {
                _ = connection(socket, hub.clone(), ip) => {}
                _ = stopped(&mut stop) => {}
            }
            // The hub goes before the count, so a relay that has shut down holds none.
            drop(hub);
            drop(busy);
        })
}

/// Sends a close frame with `code` and `reason`.
async fn close(socket: &mut WebSocket, code: u16, reason: &'static str) {
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code,
            reason: reason.into(),
        })))
        .await;
}

async fn refuse(hub: &Hub, mut socket: WebSocket, code: &'static str) {
    Counters::bump(&hub.counters.logins_refused);
    hub.log(LogEvent::LoginRefused { code });
    close(&mut socket, LOGIN_REFUSED_CODE, LOGIN_REFUSED_REASON).await;
}

async fn store_failed(hub: &Hub, mut socket: WebSocket, e: StoreError) {
    hub.log(LogEvent::LoginStoreError { code: e.code() });
    close(&mut socket, STORE_ERROR_CODE, STORE_ERROR_REASON).await;
}

/// Whether a read failed because the message was over the WebSocket layer's own limit
/// (`SOCKET_LIMIT`). Such a message is over 64 KiB too, so it is closed 1009 like any other.
fn too_big(e: &axum::Error) -> bool {
    let inner = std::error::Error::source(e).and_then(|s| s.downcast_ref::<tungstenite::Error>());
    matches!(inner, Some(tungstenite::Error::Capacity(_)))
}

/// What came instead of the challenge's answer.
enum First {
    Login(Control),
    NotLogin,
    TooBig,
}

/// Waits for the first text frame and reads it as a control message. Anything else,
/// including a message of an unknown type, is not a login; a message over 64 KiB is
/// too big.
async fn read_login(socket: &mut WebSocket) -> First {
    loop {
        match socket.recv().await {
            Some(Ok(Message::Text(text))) if text.len() > MAX_MESSAGE => return First::TooBig,
            Some(Ok(Message::Binary(bytes))) if bytes.len() > MAX_MESSAGE => return First::TooBig,
            Some(Ok(Message::Text(text))) => {
                return match Control::from_json(&text) {
                    Ok(login) => First::Login(login),
                    Err(_) => First::NotLogin,
                }
            }
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => continue,
            Some(Err(e)) if too_big(&e) => return First::TooBig,
            _ => return First::NotLogin,
        }
    }
}

/// Runs when a logged-in connection ends, however it ends (return, panic or a dropped
/// future): removes its sender, then asks the peer task for its leave. It is created
/// before the connection's `Join` is sent, so its `Leave` is always queued after its
/// `Join`. After `Relay::abort` it does nothing.
struct Leave {
    hub: Arc<Hub>,
    who: Identity,
    conn: ConnId,
}

impl Drop for Leave {
    fn drop(&mut self) {
        if self.hub.aborted() {
            return;
        }
        let (id, conn) = (self.who.id, self.conn);
        self.hub.live().senders.remove(&(id, conn));
        let busy = self.hub.tasks.enter();
        // An unbounded send needs no await. If the task has ended, the request (and its
        // `Busy`) is dropped here.
        self.hub.request(Request::Leave {
            who: self.who,
            conn,
            busy,
        });
    }
}

async fn connection(mut socket: WebSocket, hub: Arc<Hub>, ip: IpAddr) {
    let mut challenge = Challenge::new();
    if socket
        .send(Message::Text(challenge.message().to_json().into()))
        .await
        .is_err()
    {
        return;
    }

    let login = match timeout(hub.config.ping_timeout, read_login(&mut socket)).await {
        Ok(First::Login(login)) => login,
        Ok(First::TooBig) => return close(&mut socket, TOO_BIG_CODE, TOO_BIG_REASON).await,
        Ok(First::NotLogin) => return refuse(&hub, socket, LoginError::NotLogin.code()).await,
        Err(_) => return refuse(&hub, socket, "login_timeout").await,
    };
    let who = match verify_login(&mut challenge, &login, &hub.config.hosts) {
        Ok(who) => who,
        Err(e) => return refuse(&hub, socket, e.code()).await,
    };

    let id = who.id;
    let stored = match hub.store.call(move |s| s.device(&id)).await {
        Ok(stored) => stored,
        Err(e) => return store_failed(&hub, socket, e).await,
    };
    match admit(stored.map(|d| d.role), &who) {
        Ok(Admit::Known) => {}
        // A new key spends a token before `register`, even if `register` then fails.
        Ok(Admit::New) => {
            let now = hub.config.clock.now_ms();
            if lock(&hub.limiters.new_keys).take(ip, now).is_err() {
                Counters::bump(&hub.counters.new_keys_refused);
                hub.log(LogEvent::LoginRefused {
                    code: TOO_MANY_NEW_KEYS_REASON,
                });
                return close(
                    &mut socket,
                    TOO_MANY_NEW_KEYS_CODE,
                    TOO_MANY_NEW_KEYS_REASON,
                )
                .await;
            }
        }
        Err(e) => return refuse(&hub, socket, e.code()).await,
    }
    let (role, now) = (who.role, hub.config.clock.now_ms());
    match hub.store.call(move |s| s.register(&id, role, now)).await {
        Ok(_) => {}
        Err(StoreError::RoleConflict) => {
            return refuse(&hub, socket, LoginError::RoleConflict.code()).await
        }
        Err(e) => return store_failed(&hub, socket, e).await,
    }
    let handler = hub.config.control.clone();
    let on_login = match hub.store.call(move |s| Ok(handler.on_login(s, &who))).await {
        Ok(msgs) => msgs,
        Err(e) => return store_failed(&hub, socket, e).await,
    };

    let conn = hub.next_conn.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::channel::<Outgoing>(hub.config.queue);
    // Created before the `Join` is sent, with no await between, so the `Leave` always
    // follows the `Join` on the peer task's queue.
    let _leave = Leave {
        hub: hub.clone(),
        who,
        conn,
    };
    let (reply, joined) = oneshot::channel();
    let sent = hub.request(Request::Join {
        who,
        conn,
        tx,
        on_login,
        reply,
    });
    match (sent, joined.await) {
        (true, Ok(Ok(()))) => {}
        (_, Ok(Err(e))) => return store_failed(&hub, socket, e).await,
        _ => return store_failed(&hub, socket, StoreError::Failed("peer_task")).await,
    }
    Counters::bump(&hub.counters.logins_ok);
    hub.log(LogEvent::LoginOk {
        online: hub.live().online(),
    });

    let timeout_after = hub.config.ping_timeout;
    let mut deadline = Instant::now() + timeout_after;
    let gone = tokio::time::sleep_until(deadline);
    tokio::pin!(gone);
    let mut ticker = interval(hub.config.ping_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    ticker.tick().await;
    let mut gate = hub.config.writer_gate.0.subscribe();
    loop {
        // Each step is chosen by the `select!`; what it does runs in the body below, so
        // nothing but the relay stopping can cancel a handler call and its `Refresh`.
        let step = tokio::select! {
            msg = next_out(&mut gate, &mut rx) => Step::Out(msg),
            incoming = socket.recv() => Step::In(incoming),
            // No pong for the whole timeout: the device has gone.
            _ = &mut gone => break,
            _ = ticker.tick() => Step::Ping,
        };
        let outgoing = match step {
            Step::Ping => Message::Ping(Vec::new().into()),
            Step::Out(None) => break,
            Step::Out(Some(Outgoing::Text(msg))) => Message::Text(msg.to_json().into()),
            Step::Out(Some(Outgoing::Binary(bytes))) => Message::Binary(bytes.into()),
            Step::Out(Some(Outgoing::Close(code, reason))) => {
                let _ = timeout_at(deadline, close(&mut socket, code, reason)).await;
                break;
            }
            Step::In(incoming) => {
                let msg = match incoming {
                    Some(Ok(msg)) => msg,
                    Some(Err(e)) if too_big(&e) => {
                        let _ =
                            timeout_at(deadline, close(&mut socket, TOO_BIG_CODE, TOO_BIG_REASON))
                                .await;
                        break;
                    }
                    None | Some(Err(_)) => break,
                };
                let action = match msg {
                    Message::Pong(_) => {
                        deadline = Instant::now() + timeout_after;
                        gone.as_mut().reset(deadline);
                        continue;
                    }
                    Message::Close(_) => break,
                    Message::Text(text) if text.len() > MAX_MESSAGE => Action::TooBig,
                    Message::Binary(bytes) if bytes.len() > MAX_MESSAGE => Action::TooBig,
                    Message::Text(text) => on_text(&hub, &who, conn, text.to_string()).await,
                    Message::Binary(bytes) => on_binary(&hub, &who, conn, &bytes),
                    Message::Ping(_) => continue,
                };
                match action {
                    Action::None => continue,
                    Action::Answer(msg) => Message::Text(msg.to_json().into()),
                    Action::TooBig => {
                        let _ =
                            timeout_at(deadline, close(&mut socket, TOO_BIG_CODE, TOO_BIG_REASON))
                                .await;
                        break;
                    }
                    Action::StoreError => {
                        let _ = timeout_at(
                            deadline,
                            close(&mut socket, STORE_ERROR_CODE, STORE_ERROR_REASON),
                        )
                        .await;
                        break;
                    }
                }
            }
        };
        // Every send is bounded by the deadline, so a device that stopped reading can't
        // stall the loop past its timeout.
        match timeout_at(deadline, socket.send(outgoing)).await {
            Ok(Ok(())) => {}
            Ok(Err(_)) | Err(_) => break,
        }
    }
}

/// The next item off a device's queue, taken only while the writer gate is open. A
/// gate closed while the writer is waiting is seen before any item is taken.
async fn next_out(
    gate: &mut watch::Receiver<bool>,
    rx: &mut mpsc::Receiver<Outgoing>,
) -> Option<Outgoing> {
    loop {
        if gate.wait_for(|open| *open).await.is_err() {
            return rx.recv().await;
        }
        tokio::select! {
            biased;
            changed = gate.changed() => {
                if changed.is_err() {
                    return rx.recv().await;
                }
            }
            msg = rx.recv() => return msg,
        }
    }
}

/// What one turn of a connection's loop picked.
enum Step {
    Out(Option<Outgoing>),
    In(Option<Result<Message, axum::Error>>),
    Ping,
}

/// What a device's own message calls for.
enum Action {
    /// Nothing goes back.
    None,
    /// A `rate_limited` or `control_limited` answer to the sender.
    Answer(Control),
    /// Close with 1009.
    TooBig,
    /// Close with 1011.
    StoreError,
}

/// A text message after login: a control token first, before reading the head and
/// before any store call; then a later `login` is ignored, a `rehandshake` is routed,
/// and anything else goes to the control handler.
async fn on_text(hub: &Hub, who: &Identity, conn: ConnId, text: String) -> Action {
    let now = hub.config.clock.now_ms();
    let taken = lock(&hub.limiters.control).take(who.id, now);
    let Some(head) = ControlHead::read(&text) else {
        Counters::bump(&hub.counters.unreadable);
        return Action::None;
    };
    if let Err(retry_ms) = taken {
        Counters::bump(&hub.counters.control_limited);
        return Action::Answer(Control::ControlLimited {
            msg: head.t,
            slot: head.slot,
            pair_id: head.pair_id,
            peer: head.peer,
            retry_ms,
        });
    }
    match head.t.as_str() {
        "login" => {
            Counters::bump(&hub.counters.ignored);
            Action::None
        }
        "rehandshake" => {
            let Some(to) = head.peer else {
                Counters::bump(&hub.counters.unreadable);
                return Action::None;
            };
            let routed = route_text(hub, who.id, conn, to, Control::Rehandshake { peer: who.id });
            Counters::bump(if routed {
                &hub.counters.rehandshakes_routed
            } else {
                &hub.counters.rehandshakes_dropped
            });
            Action::None
        }
        _ => handle(hub, who, head, text, now).await,
    }
}

/// Hands a control message to the handler. A non-empty `refresh` is installed by the
/// peer task before `out` is delivered and before the next message is read; a failed
/// call refreshes the sender, then closes it with 1011 (writers' rule 3, ADR 0006).
async fn handle(hub: &Hub, who: &Identity, head: ControlHead, text: String, now: u64) -> Action {
    let handler = hub.config.control.clone();
    let w = *who;
    let result = hub
        .store
        .call(move |s| handler.control(s, &w, &head, &text, now))
        .await;
    match result {
        Ok(outcome) if outcome.refresh.is_empty() => {
            hub.live().deliver(outcome.out, &*hub.config.log);
            Action::None
        }
        Ok(outcome) => {
            if hub.refresh(outcome.refresh, outcome.out).await {
                Action::None
            } else {
                Action::StoreError
            }
        }
        Err(e) => {
            hub.log(LogEvent::ControlStoreError { code: e.code() });
            hub.refresh(vec![who.id], Vec::new()).await;
            Action::StoreError
        }
    }
}

/// Routes a text message to `to` if both ends' sets name each other. A full queue drops
/// the recipient, as any text message does.
fn route_text(hub: &Hub, from: DeviceKey, conn: ConnId, to: DeviceKey, msg: Control) -> bool {
    let mut live = hub.live();
    let Some((to_conn, tx)) = live.route(&from, conn, &to) else {
        return false;
    };
    match tx.try_send(Outgoing::Text(msg)) {
        Ok(()) => true,
        Err(TrySendError::Full(_)) => {
            hub.log(LogEvent::QueueFull);
            live.senders.remove(&(to, to_conn));
            false
        }
        Err(TrySendError::Closed(_)) => false,
    }
}

/// A binary message after login: a frame token first (every binary message spends one,
/// even an unreadable one), then route it with the peer rewritten to the sender.
fn on_binary(hub: &Hub, who: &Identity, conn: ConnId, bytes: &[u8]) -> Action {
    let now = hub.config.clock.now_ms();
    let taken = lock(&hub.limiters.frames).take(who.id, now);
    let Some(routed) = Routed::parse(bytes) else {
        Counters::bump(&hub.counters.unreadable);
        return Action::None;
    };
    if let Err(retry_ms) = taken {
        Counters::bump(&hub.counters.rate_limited);
        return Action::Answer(Control::RateLimited {
            peer: routed.peer,
            retry_ms,
        });
    }
    let to = routed.peer;
    let bytes = routed.with_peer(who.id).encode();
    // The check and the send happen under one hold of the lock, as in `route_text`, so
    // no peer-task step can change the sets between them.
    let delivered = {
        let live = hub.live();
        match live.route(&who.id, conn, &to) {
            Some((_, tx)) => tx.try_send(Outgoing::Binary(bytes)).is_ok(),
            None => false,
        }
    };
    Counters::bump(if delivered {
        &hub.counters.frames_routed
    } else {
        &hub.counters.frames_dropped
    });
    Action::None
}

#[cfg(test)]
mod tests {
    use super::*;
    use relay_core::store::CLEANUP_AGE_MS;
    use relay_core::ManualClock;
    use relay_protocol::Role;

    fn store() -> (tempfile::TempDir, Arc<SqliteStore>) {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(SqliteStore::open(&dir.path().join("relay.db")).unwrap());
        (dir, store)
    }

    fn config(store: Arc<dyn Store>, interval_ms: u64, timeout_ms: u64) -> Config {
        let mut c = Config::new(
            "127.0.0.1:0".parse().unwrap(),
            vec!["localhost".into()],
            store,
        );
        c.ping_interval = Duration::from_millis(interval_ms);
        c.ping_timeout = Duration::from_millis(timeout_ms);
        c
    }

    #[tokio::test]
    async fn ping_settings_must_be_positive_and_ordered() {
        let (_dir, store) = store();
        for (interval_ms, timeout_ms) in [(0, 1000), (1000, 1000), (2000, 1000), (0, 0)] {
            let err = serve(config(store.clone(), interval_ms, timeout_ms))
                .await
                .err();
            assert_eq!(
                err.map(|e| e.kind()),
                Some(std::io::ErrorKind::InvalidInput),
                "{interval_ms} ms / {timeout_ms} ms"
            );
        }
        assert!(serve(config(store.clone(), 100, 1000)).await.is_ok());
        assert!(serve(Config::new(
            "127.0.0.1:0".parse().unwrap(),
            vec!["localhost".into()],
            store,
        ))
        .await
        .is_ok());
    }

    #[tokio::test]
    async fn the_cleanup_interval_must_be_positive_and_defaults_to_an_hour() {
        let (_dir, store) = store();
        let mut c = config(store, 100, 1000);
        assert_eq!(c.cleanup_interval, Duration::from_secs(3600));
        c.cleanup_interval = Duration::ZERO;
        assert_eq!(
            serve(c).await.err().map(|e| e.kind()),
            Some(std::io::ErrorKind::InvalidInput)
        );
    }

    /// A store that records, when its last reference goes, how many tasks the tracker
    /// still counts. Every method is the wrapped store's.
    struct DropProbe {
        inner: SqliteStore,
        tracker: Arc<Tracker>,
        running_at_drop: Arc<Mutex<Option<usize>>>,
    }

    impl Drop for DropProbe {
        fn drop(&mut self) {
            *self.running_at_drop.lock().unwrap() = Some(*self.tracker.running.lock().unwrap());
        }
    }

    impl relay_core::PairDirectory for DropProbe {
        fn peers_of(&self, id: &DeviceKey) -> Result<Vec<relay_protocol::PairInfo>, StoreError> {
            self.inner.peers_of(id)
        }
    }

    impl Store for DropProbe {
        fn device(&self, id: &DeviceKey) -> Result<Option<relay_core::DeviceRecord>, StoreError> {
            self.inner.device(id)
        }
        fn register(
            &self,
            id: &DeviceKey,
            role: Role,
            now: u64,
        ) -> Result<relay_core::Registered, StoreError> {
            self.inner.register(id, role, now)
        }
        fn touch(&self, id: &DeviceKey, now: u64) -> Result<bool, StoreError> {
            self.inner.touch(id, now)
        }
        fn insert_pair(&self, pair: &relay_core::PairRecord) -> Result<(), StoreError> {
            self.inner.insert_pair(pair)
        }
        fn pair(
            &self,
            id: &relay_protocol::PairId,
        ) -> Result<Option<relay_core::PairRecord>, StoreError> {
            self.inner.pair(id)
        }
        fn set_acked(&self, id: &relay_protocol::PairId) -> Result<bool, StoreError> {
            self.inner.set_acked(id)
        }
        fn delete_pair(&self, id: &relay_protocol::PairId) -> Result<bool, StoreError> {
            self.inner.delete_pair(id)
        }
        fn put_push_token(
            &self,
            phone: &DeviceKey,
            token: &str,
            env: &str,
            now: u64,
        ) -> Result<(), StoreError> {
            self.inner.put_push_token(phone, token, env, now)
        }
        fn cleanup(
            &self,
            now: u64,
            cutoff: u64,
            online: &[DeviceKey],
        ) -> Result<CleanupCounts, StoreError> {
            self.inner.cleanup(now, cutoff, online)
        }
        fn counts(&self) -> Result<relay_core::StoreCounts, StoreError> {
            self.inner.counts()
        }
    }

    /// 7a's deferred gap, closed in 7b: `StoreHandle::call` drops its store reference
    /// before its count, so when `shutdown` sees the tracker idle the relay holds no
    /// store. The call's handle is dropped while the call runs, so the call holds the
    /// last reference; the store's `Drop` must still see the call counted.
    #[tokio::test]
    async fn a_store_call_drops_the_store_before_its_count() {
        let (dir, _) = store();
        let tracker = Arc::new(Tracker::default());
        let running_at_drop = Arc::new(Mutex::new(None));
        let probe = Arc::new(DropProbe {
            inner: SqliteStore::open(&dir.path().join("probe.db")).unwrap(),
            tracker: tracker.clone(),
            running_at_drop: running_at_drop.clone(),
        });
        let handle = StoreHandle::tracked(probe, tracker.clone());
        let (started_tx, started_rx) = oneshot::channel();
        let (go_tx, go_rx) = std::sync::mpsc::channel::<()>();
        let call = tokio::spawn(async move {
            handle
                .call(move |s| {
                    let _ = started_tx.send(());
                    let _ = go_rx.recv();
                    s.counts()
                })
                .await
        });
        started_rx.await.unwrap();
        // The handle goes with the task; the blocking call keeps running.
        call.abort();
        let _ = call.await;
        go_tx.send(()).unwrap();
        tracker.idle().await;
        assert_eq!(
            *running_at_drop.lock().unwrap(),
            Some(1),
            "the call's count went before its store reference"
        );
    }

    #[test]
    fn the_client_ip_comes_from_the_socket_or_fly_client_ip() {
        let socket: SocketAddr = "127.0.0.1:5000".parse().unwrap();
        let mut forged = HeaderMap::new();
        forged.insert("fly-client-ip", "203.0.113.9".parse().unwrap());
        // Socket mode ignores the header.
        assert_eq!(client_ip(ClientIp::Socket, &forged, socket), socket.ip());
        assert_eq!(
            client_ip(ClientIp::FlyClientIp, &forged, socket),
            "203.0.113.9".parse::<IpAddr>().unwrap()
        );
        // IPv6, and a header that isn't an IP, which falls back to the socket.
        let mut v6 = HeaderMap::new();
        v6.insert("Fly-Client-IP", " 2001:db8::7 ".parse().unwrap());
        assert_eq!(
            client_ip(ClientIp::FlyClientIp, &v6, socket),
            "2001:db8::7".parse::<IpAddr>().unwrap()
        );
        let mut junk = HeaderMap::new();
        junk.insert("fly-client-ip", "not-an-ip".parse().unwrap());
        assert_eq!(client_ip(ClientIp::FlyClientIp, &junk, socket), socket.ip());
        assert_eq!(
            client_ip(ClientIp::FlyClientIp, &HeaderMap::new(), socket),
            socket.ip()
        );
    }

    #[tokio::test]
    async fn the_queue_defaults_to_192_and_limits_to_the_specs() {
        let (_dir, store) = store();
        let c = config(store.clone(), 100, 1000);
        assert_eq!(c.queue, 192);
        assert_eq!(c.limits, Limits::default());
        assert_eq!(c.client_ip, ClientIp::Socket);
        let mut zero = config(store.clone(), 100, 1000);
        zero.queue = 0;
        assert!(serve(zero).await.is_err());
        let mut no_limit = config(store, 100, 1000);
        no_limit.limits.frame_burst = 0;
        assert!(serve(no_limit).await.is_err());
    }

    #[tokio::test]
    async fn cleanup_runs_on_its_timer_first_one_interval_after_start() {
        let (_dir, store) = store();
        let clock = Arc::new(ManualClock::new());
        let stale = relay_protocol::Bytes([1; 32]);
        store
            .register(&stale, Role::Phone, clock.now_ms() - CLEANUP_AGE_MS)
            .unwrap();
        let mut c = config(store.clone(), 100, 1000);
        c.clock = clock;
        c.cleanup_interval = Duration::from_millis(400);
        let relay = serve(c).await.unwrap();

        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(store.device(&stale).unwrap().is_some(), "ran at start");
        tokio::time::sleep(Duration::from_millis(500)).await;
        assert!(store.device(&stale).unwrap().is_none(), "never ran");
        relay.shutdown().await;
    }
}

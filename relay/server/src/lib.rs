//! The relay: WebSocket I/O around `relay-core`'s decisions, with storage behind
//! `relay_core::Store`.
//!
//! Per connection: send `challenge`, wait for `login`, ask `relay-core` to check it,
//! admit it over the stored role, register it, send `welcome`, tell paired peers, then
//! ping until the socket closes or stops answering. A refused login is closed with 4401
//! `login_refused` and nothing else; a login that hits a store error is closed with 1011
//! and gets no `welcome`. Messages are limited to 64 KiB, before login too.
//!
//! Every store call runs off the async workers (`StoreHandle::call`). Logs and
//! `/metrics` carry only counts and error codes, never keys, ids, IPs, tokens or
//! message contents.

pub mod log;
pub mod metrics;
pub mod store;

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use relay_core::{
    admit, cleanup_cutoff, verify_login, Challenge, CleanupCounts, Clock, ConnId, LoginError,
    Outbound, Presence, Store, StoreError, SystemClock,
};
use relay_protocol::{Control, DeviceKey};
use tokio::sync::{mpsc, watch, Notify};
use tokio::task::JoinHandle;
use tokio::time::{interval, interval_at, timeout, timeout_at, Instant, MissedTickBehavior};

pub use log::{LogEvent, LogSink, StderrLog};
pub use metrics::Counters;
pub use store::SqliteStore;

/// The close code for a refused login.
pub const LOGIN_REFUSED_CODE: u16 = 4401;
/// The close reason for a refused login.
pub const LOGIN_REFUSED_REASON: &str = "login_refused";
/// The close code for a login that hit a store error.
pub const STORE_ERROR_CODE: u16 = 1011;
/// The close reason for a login that hit a store error.
pub const STORE_ERROR_REASON: &str = "internal_error";

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
}

impl Config {
    /// A config with the spec's ping times (every 15 s, gone after 30 s), the system
    /// clock, logs on stderr, no `/metrics`, and an hourly cleanup.
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
        }
    }
}

/// The spec's limit on one WebSocket message, of either kind.
pub const MAX_MESSAGE: usize = 64 * 1024;

/// How many messages may wait for one device before it counts as stuck and is dropped.
const QUEUE: usize = 64;

/// The store, called off the async workers: each call runs on `spawn_blocking`, so a
/// held store lock never blocks a tokio worker.
#[derive(Clone)]
pub struct StoreHandle {
    store: Arc<dyn Store>,
}

impl StoreHandle {
    pub fn new(store: Arc<dyn Store>) -> Self {
        StoreHandle { store }
    }

    /// Runs `f` on the store, on a blocking thread.
    pub async fn call<T, F>(&self, f: F) -> Result<T, StoreError>
    where
        F: FnOnce(&dyn Store) -> Result<T, StoreError> + Send + 'static,
        T: Send + 'static,
    {
        let store = self.store.clone();
        match tokio::task::spawn_blocking(move || f(&*store)).await {
            Ok(result) => result,
            Err(_) => Err(StoreError::Failed("store_task")),
        }
    }
}

/// The live state every connection shares. One lock, so presence and the senders it
/// fans out to never disagree.
#[derive(Default)]
struct Live {
    presence: Presence,
    senders: HashMap<(DeviceKey, ConnId), mpsc::Sender<Control>>,
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
            if tx.try_send(msg).is_err() {
                log.log(LogEvent::QueueFull);
                self.senders.remove(&(to, conn));
            }
        }
    }

    fn online(&self) -> usize {
        self.presence.online_ids().len()
    }
}

/// Counts the relay's running connections and leaves, so `shutdown` can wait for them.
#[derive(Default)]
struct Tracker {
    running: Mutex<usize>,
    idle: Notify,
}

/// One running task, counted until dropped.
struct Busy(Arc<Tracker>);

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

struct Hub {
    config: Config,
    store: StoreHandle,
    live: Mutex<Live>,
    next_conn: AtomicU64,
    counters: Counters,
    tasks: Arc<Tracker>,
    /// Set by `Relay::abort`: leaves do nothing, as after a crash.
    aborted: AtomicBool,
    /// Turns true when the relay stops.
    stop: watch::Receiver<bool>,
}

impl Hub {
    /// The shared state; a panic elsewhere while it was held doesn't stop the relay.
    fn live(&self) -> MutexGuard<'_, Live> {
        self.live.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn log(&self, event: LogEvent) {
        self.config.log.log(event);
    }

    fn aborted(&self) -> bool {
        self.aborted.load(Ordering::SeqCst)
    }

    /// Touches every online device, then deletes the devices unseen for 90 days with
    /// their pairs and push tokens. Sends nothing: peers reconcile at `welcome`.
    async fn run_cleanup(&self) -> CleanupCounts {
        let now = self.config.clock.now_ms();
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
}

impl Relay {
    /// Runs the cleanup now, as its timer would.
    pub async fn run_cleanup(&self) -> CleanupCounts {
        self.hub.run_cleanup().await
    }

    /// Stops cleanly, in this order: stop accepting; close every connection; wait for
    /// each leave's store work (and a running cleanup) to finish; then drop the store.
    pub async fn shutdown(self) {
        let _ = self.stop.send(true);
        let _ = self.server.await;
        let _ = self.cleanup.await;
        self.hub.tasks.idle().await;
        drop(self.hub);
    }

    /// Stops as a crash would: no leave runs, so nothing is touched or told.
    pub fn abort(self) {
        self.hub.aborted.store(true, Ordering::SeqCst);
        let _ = self.stop.send(true);
        self.server.abort();
        self.cleanup.abort();
    }

    /// Waits until the server stops, which it does only on a fatal error.
    pub async fn wait(self) -> std::io::Result<()> {
        match self.server.await {
            Ok(result) => result,
            Err(_) => Err(std::io::Error::other("server task ended")),
        }
    }
}

/// Starts the relay: the HTTP server and the cleanup timer.
pub async fn serve(config: Config) -> std::io::Result<Relay> {
    check_config(&config)?;
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let addr = listener.local_addr()?;
    let (stop_tx, stop_rx) = watch::channel(false);
    let hub = Arc::new(Hub {
        store: StoreHandle::new(config.store.clone()),
        config,
        live: Mutex::new(Live::default()),
        next_conn: AtomicU64::new(1),
        counters: Counters::default(),
        tasks: Arc::new(Tracker::default()),
        aborted: AtomicBool::new(false),
        stop: stop_rx.clone(),
    });
    let app = Router::new()
        .route("/", get(upgrade))
        .route("/health", get(health))
        .route("/metrics", get(metrics_page))
        .with_state(hub.clone());
    let log = hub.config.log.clone();
    let mut stop = stop_rx;
    let server = tokio::spawn(async move {
        let result = axum::serve(listener, app)
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

async fn upgrade(ws: WebSocketUpgrade, State(hub): State<Arc<Hub>>) -> impl IntoResponse {
    ws.max_message_size(MAX_MESSAGE)
        .max_frame_size(MAX_MESSAGE)
        .on_upgrade(move |socket| async move {
            let _busy = hub.tasks.enter();
            let mut stop = hub.stop.clone();
            // Stopping drops the connection, and with it its leave guard.
            tokio::select! {
                _ = connection(socket, hub.clone()) => {}
                _ = stopped(&mut stop) => {}
            }
        })
}

async fn refuse(hub: &Hub, mut socket: WebSocket, code: &'static str) {
    Counters::bump(&hub.counters.logins_refused);
    hub.log(LogEvent::LoginRefused { code });
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: LOGIN_REFUSED_CODE,
            reason: LOGIN_REFUSED_REASON.into(),
        })))
        .await;
}

async fn store_failed(hub: &Hub, mut socket: WebSocket, e: StoreError) {
    hub.log(LogEvent::LoginStoreError { code: e.code() });
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: STORE_ERROR_CODE,
            reason: STORE_ERROR_REASON.into(),
        })))
        .await;
}

/// Waits for the first text frame and reads it as a control message. Anything else,
/// including a message of an unknown type, is not a login.
async fn read_login(socket: &mut WebSocket) -> Option<Control> {
    loop {
        match socket.recv().await? {
            Ok(Message::Text(text)) => return Control::from_json(&text).ok(),
            Ok(Message::Ping(_) | Message::Pong(_)) => continue,
            _ => return None,
        }
    }
}

/// Runs when a logged-in connection ends, however it ends (return, panic or a dropped
/// future): removes its sender, then, off the async workers, touches the device and
/// tells its current peers it left. After `Relay::abort` it does nothing.
struct Leave {
    hub: Arc<Hub>,
    id: DeviceKey,
    conn: ConnId,
}

impl Drop for Leave {
    fn drop(&mut self) {
        let hub = self.hub.clone();
        if hub.aborted() {
            return;
        }
        let (id, conn) = (self.id, self.conn);
        hub.live().senders.remove(&(id, conn));
        let Ok(runtime) = tokio::runtime::Handle::try_current() else {
            return;
        };
        let busy = hub.tasks.enter();
        runtime.spawn(async move {
            let _busy = busy;
            if hub.aborted() {
                return;
            }
            let now = hub.config.clock.now_ms();
            // Pairs can change while a device is online, so its peers are asked again.
            let (touched, peers) = match hub
                .store
                .call(move |s| Ok((s.touch(&id, now), s.peers_of(&id))))
                .await
            {
                Ok(both) => both,
                Err(e) => (Err(e), Err(e)),
            };
            if hub.aborted() {
                return;
            }
            if let Err(e) = touched {
                hub.log(LogEvent::LeaveStoreError { code: e.code() });
            }
            let peers = peers.unwrap_or_else(|e| {
                hub.log(LogEvent::LeaveStoreError { code: e.code() });
                Vec::new()
            });
            // Presence is cleared whatever the store said; without peers, nobody is told.
            let mut live = hub.live();
            let out = live.presence.leave(id, conn, &peers);
            live.deliver(out, &*hub.config.log);
            let online = live.online();
            drop(live);
            hub.log(LogEvent::DeviceLeft { online });
        });
    }
}

async fn connection(mut socket: WebSocket, hub: Arc<Hub>) {
    let mut challenge = Challenge::new();
    if socket
        .send(Message::Text(challenge.message().to_json().into()))
        .await
        .is_err()
    {
        return;
    }

    let login = match timeout(hub.config.ping_timeout, read_login(&mut socket)).await {
        Ok(Some(login)) => login,
        Ok(None) => return refuse(&hub, socket, LoginError::NotLogin.code()).await,
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
    if let Err(e) = admit(stored.map(|d| d.role), &who) {
        return refuse(&hub, socket, e.code()).await;
    }
    let (role, now) = (who.role, hub.config.clock.now_ms());
    match hub.store.call(move |s| s.register(&id, role, now)).await {
        Ok(_) => {}
        Err(StoreError::RoleConflict) => {
            return refuse(&hub, socket, LoginError::RoleConflict.code()).await
        }
        Err(e) => return store_failed(&hub, socket, e).await,
    }
    let peers = match hub.store.call(move |s| s.peers_of(&id)).await {
        Ok(peers) => peers,
        Err(e) => return store_failed(&hub, socket, e).await,
    };

    let conn = hub.next_conn.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::channel::<Control>(QUEUE);
    let online = {
        let mut live = hub.live();
        // The welcome is queued first, so it reaches the device before any presence.
        // The queue is new, so it has room.
        let _ = tx.try_send(live.presence.welcome(peers.clone()));
        // One live connection per device: dropping the old sender ends the old loop.
        if let Some(old) = live.presence.conn_of(&id) {
            live.senders.remove(&(id, old));
        }
        live.senders.insert((id, conn), tx);
        let out = live.presence.login(id, conn, &peers);
        live.deliver(out, &*hub.config.log);
        live.online()
    };
    Counters::bump(&hub.counters.logins_ok);
    hub.log(LogEvent::LoginOk { online });
    let _leave = Leave {
        hub: hub.clone(),
        id,
        conn,
    };

    let timeout_after = hub.config.ping_timeout;
    let mut deadline = Instant::now() + timeout_after;
    let gone = tokio::time::sleep_until(deadline);
    tokio::pin!(gone);
    let mut ticker = interval(hub.config.ping_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    ticker.tick().await;
    loop {
        // Every send is bounded by the deadline, so a device that stopped reading
        // can't stall the loop past its timeout.
        let outgoing = tokio::select! {
            msg = rx.recv() => match msg {
                Some(msg) => Message::Text(msg.to_json().into()),
                // A newer login replaced this connection, or its queue filled up.
                None => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Pong(_))) => {
                    deadline = Instant::now() + timeout_after;
                    gone.as_mut().reset(deadline);
                    continue;
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                // After login a device sends nothing the relay acts on yet; a second
                // login or a message of an unknown type is ignored.
                Some(Ok(_)) => continue,
            },
            // No pong for the whole timeout: the device has gone.
            _ = &mut gone => break,
            _ = ticker.tick() => Message::Ping(Vec::new().into()),
        };
        match timeout_at(deadline, socket.send(outgoing)).await {
            Ok(Ok(())) => {}
            Ok(Err(_)) | Err(_) => break,
        }
    }
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

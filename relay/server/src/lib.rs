//! The relay: WebSocket I/O around `relay-core`'s decisions.
//!
//! Per connection: send `challenge`, wait for `login`, ask `relay-core` to check it,
//! send `welcome`, tell paired peers, then ping until the socket closes or stops
//! answering. A refused login is closed with 4401 `login_refused` and nothing else.
//! Messages are limited to 64 KiB, before login too.
//! Only counts and error codes are logged, never message contents.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use axum::routing::get;
use axum::Router;
use relay_core::{
    verify_login, Challenge, ConnId, DeviceRoles, LoginError, Outbound, PairDirectory, Presence,
};
use relay_protocol::{Control, DeviceKey};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio::time::{interval, timeout, timeout_at, Instant, MissedTickBehavior};

/// The close code for a refused login.
pub const LOGIN_REFUSED_CODE: u16 = 4401;
/// The close reason for a refused login.
pub const LOGIN_REFUSED_REASON: &str = "login_refused";

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
    /// Who is paired with whom.
    pub pairs: Arc<dyn PairDirectory>,
}

impl Config {
    /// A config with the spec's ping times: every 15 s, gone after 30 s.
    pub fn new(listen: SocketAddr, hosts: Vec<String>, pairs: Arc<dyn PairDirectory>) -> Self {
        Config {
            listen,
            hosts,
            ping_interval: Duration::from_secs(15),
            ping_timeout: Duration::from_secs(30),
            pairs,
        }
    }
}

/// The spec's limit on one WebSocket message, of either kind.
pub const MAX_MESSAGE: usize = 64 * 1024;

/// How many messages may wait for one device before it counts as stuck and is dropped.
const QUEUE: usize = 64;

/// The live state every connection shares. One lock, so presence and the senders it
/// fans out to never disagree.
#[derive(Default)]
struct Live {
    roles: DeviceRoles,
    presence: Presence,
    senders: HashMap<(DeviceKey, ConnId), mpsc::Sender<Control>>,
}

impl Live {
    /// Queues each message for its recipient. A recipient whose queue is full (it
    /// stopped reading) loses its sender, so its loop ends and its leave runs.
    fn deliver(&mut self, out: Vec<Outbound>) {
        for (to, msg) in out {
            let Some(conn) = self.presence.conn_of(&to) else {
                continue;
            };
            let Some(tx) = self.senders.get(&(to, conn)) else {
                continue;
            };
            if tx.try_send(msg).is_err() {
                eprintln!("relay: dropping a device whose queue is full");
                self.senders.remove(&(to, conn));
            }
        }
    }
}

struct Hub {
    config: Config,
    live: Mutex<Live>,
    next_conn: AtomicU64,
}

impl Hub {
    /// The shared state; a panic elsewhere while it was held doesn't stop the relay.
    fn live(&self) -> MutexGuard<'_, Live> {
        self.live.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Refuses ping settings the loop can't run with.
fn check_ping(config: &Config) -> std::io::Result<()> {
    let ok = !config.ping_interval.is_zero() && config.ping_interval < config.ping_timeout;
    if ok {
        Ok(())
    } else {
        Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "ping_interval must be above zero and below ping_timeout",
        ))
    }
}

/// Starts the relay. Returns the address it bound and the task serving it, which ends
/// only on a fatal error.
pub async fn serve(
    config: Config,
) -> std::io::Result<(SocketAddr, JoinHandle<std::io::Result<()>>)> {
    check_ping(&config)?;
    let listener = tokio::net::TcpListener::bind(config.listen).await?;
    let addr = listener.local_addr()?;
    let hub = Arc::new(Hub {
        config,
        live: Mutex::new(Live::default()),
        next_conn: AtomicU64::new(1),
    });
    let app = Router::new()
        .route("/", get(upgrade))
        .route("/health", get(health))
        .with_state(hub);
    let handle = tokio::spawn(async move {
        let result = axum::serve(listener, app).await;
        if let Err(e) = &result {
            eprintln!("relay: serve error: {}", e.kind());
        }
        result
    });
    Ok((addr, handle))
}

async fn health() -> &'static str {
    "ok"
}

async fn upgrade(ws: WebSocketUpgrade, State(hub): State<Arc<Hub>>) -> impl IntoResponse {
    ws.max_message_size(MAX_MESSAGE)
        .max_frame_size(MAX_MESSAGE)
        .on_upgrade(move |socket| connection(socket, hub))
}

async fn refuse(mut socket: WebSocket, code: &str) {
    eprintln!("relay: login refused: {code}");
    let _ = socket
        .send(Message::Close(Some(CloseFrame {
            code: LOGIN_REFUSED_CODE,
            reason: LOGIN_REFUSED_REASON.into(),
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
/// future): removes its sender and tells its current peers it left.
struct Leave {
    hub: Arc<Hub>,
    id: DeviceKey,
    conn: ConnId,
}

impl Drop for Leave {
    fn drop(&mut self) {
        // Pairs can change while a device is online, so its peers are asked again.
        let peers = self.hub.config.pairs.peers_of(&self.id);
        let mut live = self.hub.live();
        live.senders.remove(&(self.id, self.conn));
        let out = live.presence.leave(self.id, self.conn, &peers);
        live.deliver(out);
        let online = live.senders.len();
        drop(live);
        eprintln!("relay: device left, {online} online");
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
        Ok(None) => return refuse(socket, LoginError::NotLogin.code()).await,
        Err(_) => return refuse(socket, "login_timeout").await,
    };
    let who = match verify_login(&mut challenge, &login, &hub.config.hosts) {
        Ok(who) => who,
        Err(e) => return refuse(socket, e.code()).await,
    };

    let conn = hub.next_conn.fetch_add(1, Ordering::Relaxed);
    let peers = hub.config.pairs.peers_of(&who.id);
    let (tx, mut rx) = mpsc::channel::<Control>(QUEUE);
    let admitted = {
        let mut live = hub.live();
        match live.roles.admit(&who) {
            Err(e) => Err(e),
            Ok(()) => {
                // The welcome is queued first, so it reaches the device before any
                // presence. The queue is new, so it has room.
                let _ = tx.try_send(live.presence.welcome(peers.clone()));
                // One live connection per device: dropping the old sender ends the old
                // loop.
                if let Some(old) = live.presence.conn_of(&who.id) {
                    live.senders.remove(&(who.id, old));
                }
                live.senders.insert((who.id, conn), tx);
                let out = live.presence.login(who.id, conn, &peers);
                live.deliver(out);
                Ok(live.senders.len())
            }
        }
    };
    let _leave = match admitted {
        Ok(online) => {
            eprintln!("relay: login ok, {online} online");
            Leave {
                hub: hub.clone(),
                id: who.id,
                conn,
            }
        }
        Err(e) => return refuse(socket, e.code()).await,
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
    use relay_core::InMemoryPairs;

    fn config(interval_ms: u64, timeout_ms: u64) -> Config {
        let mut c = Config::new(
            "127.0.0.1:0".parse().unwrap(),
            vec!["localhost".into()],
            Arc::new(InMemoryPairs::new()),
        );
        c.ping_interval = Duration::from_millis(interval_ms);
        c.ping_timeout = Duration::from_millis(timeout_ms);
        c
    }

    #[tokio::test]
    async fn ping_settings_must_be_positive_and_ordered() {
        for (interval_ms, timeout_ms) in [(0, 1000), (1000, 1000), (2000, 1000), (0, 0)] {
            let err = serve(config(interval_ms, timeout_ms)).await.err();
            assert_eq!(
                err.map(|e| e.kind()),
                Some(std::io::ErrorKind::InvalidInput),
                "{interval_ms} ms / {timeout_ms} ms"
            );
        }
        assert!(serve(config(100, 1000)).await.is_ok());
        assert!(serve(Config::new(
            "127.0.0.1:0".parse().unwrap(),
            vec!["localhost".into()],
            Arc::new(InMemoryPairs::new()),
        ))
        .await
        .is_ok());
    }
}

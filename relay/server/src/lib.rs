//! The relay: WebSocket I/O around `relay-core`'s decisions.
//!
//! Per connection: send `challenge`, wait for `login`, ask `relay-core` to check it,
//! send `welcome`, tell paired peers, then ping until the socket closes or stops
//! answering. A refused login is closed with 4401 `login_refused` and nothing else.
//! Only counts and error codes are logged, never message contents.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
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
use tokio::time::{interval, timeout, Instant, MissedTickBehavior};

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

/// The live state every connection shares. One lock, so presence and the senders it
/// fans out to never disagree.
#[derive(Default)]
struct Live {
    roles: DeviceRoles,
    presence: Presence,
    senders: HashMap<(DeviceKey, ConnId), mpsc::UnboundedSender<Control>>,
}

struct Hub {
    config: Config,
    live: Mutex<Live>,
    next_conn: AtomicU64,
}

impl Hub {
    fn deliver(live: &Live, out: Vec<Outbound>) {
        for (to, msg) in out {
            if let Some(conn) = live.presence.conn_of(&to) {
                if let Some(tx) = live.senders.get(&(to, conn)) {
                    let _ = tx.send(msg);
                }
            }
        }
    }
}

/// Starts the relay. Returns the address it bound and the task serving it.
pub async fn serve(config: Config) -> std::io::Result<(SocketAddr, JoinHandle<()>)> {
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
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("relay: serve error: {}", e.kind());
        }
    });
    Ok((addr, handle))
}

async fn health() -> &'static str {
    "ok"
}

async fn upgrade(ws: WebSocketUpgrade, State(hub): State<Arc<Hub>>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| connection(socket, hub))
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

/// Waits for the first text frame and reads it as a control message.
async fn read_login(socket: &mut WebSocket) -> Option<Control> {
    loop {
        match socket.recv().await? {
            Ok(Message::Text(text)) => return Control::from_json(&text).ok(),
            Ok(Message::Ping(_) | Message::Pong(_)) => continue,
            _ => return None,
        }
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
    let (tx, mut rx) = mpsc::unbounded_channel::<Control>();
    let admitted = {
        let mut live = hub.live.lock().unwrap();
        if let Err(e) = live.roles.admit(&who) {
            Err(e)
        } else {
            // The welcome is queued first, so it reaches the device before any presence.
            let welcome = live.presence.welcome(peers.clone());
            let _ = tx.send(welcome);
            // One live connection per device: dropping the old sender ends the old loop.
            if let Some(old) = live.presence.conn_of(&who.id) {
                live.senders.remove(&(who.id, old));
            }
            live.senders.insert((who.id, conn), tx);
            let out = live.presence.login(who.id, conn, &peers);
            Hub::deliver(&live, out);
            Ok(online_count(&live))
        }
    };
    match admitted {
        Ok(online) => eprintln!("relay: login ok, {online} online"),
        Err(e) => return refuse(socket, e.code()).await,
    }

    let timeout_after = hub.config.ping_timeout;
    let gone = tokio::time::sleep_until(Instant::now() + timeout_after);
    tokio::pin!(gone);
    let mut ticker = interval(hub.config.ping_interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    ticker.tick().await;
    loop {
        tokio::select! {
            msg = rx.recv() => {
                // None: a newer login replaced this connection.
                let Some(msg) = msg else { break };
                if socket.send(Message::Text(msg.to_json().into())).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Pong(_))) => gone.as_mut().reset(Instant::now() + timeout_after),
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => {}
            },
            // No pong for the whole timeout: the device has gone.
            _ = &mut gone => break,
            _ = ticker.tick() => {
                if socket.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }

    let mut live = hub.live.lock().unwrap();
    live.senders.remove(&(who.id, conn));
    let out = live.presence.leave(who.id, conn, &peers);
    Hub::deliver(&live, out);
    let online = online_count(&live);
    drop(live);
    eprintln!("relay: device left, {online} online");
}

fn online_count(live: &Live) -> usize {
    live.senders.len()
}

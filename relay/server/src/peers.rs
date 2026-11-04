//! The peer task (story 7b, ADR 0006): one tokio task that alone writes each online
//! device's peer set, its presence and its sender in `Live`. (Two exceptions only ever
//! remove a sender: `Live::deliver` on a full queue, and `Leave::drop`.)
//!
//! Requests come on one unbounded channel and are handled one at a time, in arrival
//! order. Each request's store work runs inside its own step, through
//! `StoreHandle::call`, before the next request starts. So a pair change whose
//! `Refresh` is queued after its write has committed is always re-read after any read
//! made before that write, and installed after it.

use std::collections::HashSet;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::Arc;

use relay_core::{ConnId, ControlOutcome, Identity, Outbound, StoreError};
use relay_protocol::{Control, DeviceKey, PairInfo};
use tokio::sync::{mpsc, oneshot};

use crate::{
    Busy, Counters, Hub, Live, LogEvent, Outgoing, REPLACED_CODE, REPLACED_REASON,
    STORE_ERROR_CODE, STORE_ERROR_REASON,
};

/// One online device's routing entry: the connection it belongs to, and the device's
/// pairs as last read. `None` means the entry is closing after a failed read, and routes
/// nothing. An entry exists only once its set has been installed.
pub(crate) struct Entry {
    pub(crate) conn: ConnId,
    pub(crate) set: Option<Vec<PairInfo>>,
}

/// What the peer task is asked to do.
pub(crate) enum Request {
    /// A login: read its pairs, then install it, replacing an older connection.
    Join {
        who: Identity,
        conn: ConnId,
        tx: mpsc::Sender<Outgoing>,
        on_login: Vec<Control>,
        reply: oneshot::Sender<Result<(), StoreError>>,
    },
    /// Re-read these keys' sets after a pair write, install them, then deliver `out`.
    Refresh {
        keys: Vec<DeviceKey>,
        out: Vec<Outbound>,
        reply: oneshot::Sender<()>,
    },
    /// A connection ended. Its `Busy` is held until its `touch` has been written.
    Leave {
        who: Identity,
        conn: ConnId,
        busy: Busy,
    },
}

/// Runs until the relay stops it, handling one request at a time.
pub(crate) async fn run(hub: Arc<Hub>, mut requests: mpsc::UnboundedReceiver<Request>) {
    // The connections this task has joined and not yet seen leave.
    let mut joined: HashSet<ConnId> = HashSet::new();
    while let Some(request) = requests.recv().await {
        if hub.aborted() {
            return;
        }
        match request {
            Request::Join {
                who,
                conn,
                tx,
                on_login,
                reply,
            } => {
                let result = join(&hub, who, conn, tx, on_login).await;
                if result.is_ok() {
                    joined.insert(conn);
                }
                let _ = reply.send(result);
            }
            Request::Refresh { keys, out, reply } => {
                let read = read_sets(&hub, keys).await;
                {
                    let mut live = hub.live();
                    let closed = install(&mut live, read, &hub);
                    deliver_except(&mut live, out, &closed, &hub);
                }
                let _ = reply.send(());
            }
            Request::Leave { who, conn, busy } => {
                if joined.remove(&conn) {
                    leave(&hub, who, conn).await;
                }
                drop(busy);
            }
        }
    }
}

async fn join(
    hub: &Hub,
    who: Identity,
    conn: ConnId,
    tx: mpsc::Sender<Outgoing>,
    on_login: Vec<Control>,
) -> Result<(), StoreError> {
    let id = who.id;
    let peers = hub.store.call(move |s| s.peers_of(&id)).await?;
    let mut live = hub.live();
    // One live connection per device: the older one is told why, then loses its sender,
    // so its loop ends once it has sent the close (a full queue just loses the close).
    if let Some(old) = live.presence.conn_of(&id) {
        if let Some(old_tx) = live.senders.remove(&(id, old)) {
            let _ = old_tx.try_send(Outgoing::Close(REPLACED_CODE, REPLACED_REASON));
        }
        Counters::bump(&hub.counters.replaced);
    }
    live.senders.insert((id, conn), tx.clone());
    // The queue is new: the `on_login` messages, then the `welcome`, then anything else.
    for msg in on_login {
        let _ = tx.try_send(Outgoing::Text(msg));
    }
    let _ = tx.try_send(Outgoing::Text(live.presence.welcome(peers.clone())));
    // Peers see offline then online on a replacement, from the read just made.
    let out = live.presence.login(id, conn, &peers);
    live.deliver(out, &*hub.config.log);
    live.peers.insert(
        id,
        Entry {
            conn,
            set: Some(peers),
        },
    );
    Ok(())
}

/// Reads the sets of every key that has a live entry, in one store call. Any read error
/// fails the whole read.
async fn read_sets(hub: &Hub, keys: Vec<DeviceKey>) -> SetRead {
    let keys: Vec<DeviceKey> = {
        let live = hub.live();
        let mut seen = HashSet::new();
        keys.into_iter()
            .filter(|k| seen.insert(*k))
            .filter(|k| matches!(live.peers.get(k), Some(Entry { set: Some(_), .. })))
            .collect()
    };
    if keys.is_empty() {
        return SetRead {
            keys,
            sets: Ok(Vec::new()),
        };
    }
    let wanted = keys.clone();
    let sets = hub
        .store
        .call(move |s| {
            wanted
                .iter()
                .map(|k| s.peers_of(k).map(|set| (*k, set)))
                .collect::<Result<Vec<_>, _>>()
        })
        .await;
    SetRead { keys, sets }
}

struct SetRead {
    /// The keys read (those with a live entry).
    keys: Vec<DeviceKey>,
    sets: Result<Vec<(DeviceKey, Vec<PairInfo>)>, StoreError>,
}

/// Installs a read's sets. A failed read closes every device it was reading with 1011
/// and makes its set unroutable, in this same step; those devices are returned.
fn install(live: &mut Live, read: SetRead, hub: &Hub) -> HashSet<DeviceKey> {
    let mut closed = HashSet::new();
    match read.sets {
        Ok(sets) => {
            for (key, set) in sets {
                if let Some(entry) = live.peers.get_mut(&key) {
                    entry.set = Some(set);
                }
            }
        }
        Err(e) => {
            hub.log(LogEvent::RefreshStoreError { code: e.code() });
            for key in read.keys {
                let Some(entry) = live.peers.get_mut(&key) else {
                    continue;
                };
                entry.set = None;
                let conn = entry.conn;
                if let Some(tx) = live.senders.remove(&(key, conn)) {
                    let _ = tx.try_send(Outgoing::Close(STORE_ERROR_CODE, STORE_ERROR_REASON));
                }
                closed.insert(key);
            }
        }
    }
    closed
}

/// Delivers a handler's messages, except to devices this step has just closed.
fn deliver_except(live: &mut Live, out: Vec<Outbound>, closed: &HashSet<DeviceKey>, hub: &Hub) {
    let out: Vec<Outbound> = out
        .into_iter()
        .filter(|(to, _)| !closed.contains(to))
        .collect();
    live.deliver(out, &*hub.config.log);
}

/// A joined connection's leave, in ADR 0006's order:
/// 1. one store call: `on_leave` (under `catch_unwind`), then `peers_of` for the fan-out,
///    each result kept apart;
/// 2. a second store call for `on_leave`'s `refresh`, plus the current connection's set
///    when a replaced connection's `on_leave` failed (writers' rule 3);
/// 3. one lock step: presence and its fan-out, the refreshed sets, `on_leave`'s `out`,
///    and the entry's removal if this connection is still current;
/// 4. a separate `touch`, whose failure is only logged.
async fn leave(hub: &Hub, who: Identity, conn: ConnId) {
    let id = who.id;
    let now = hub.config.clock.now_ms();
    let current = hub.live().presence.conn_of(&id) == Some(conn);

    let handler = hub.config.control.clone();
    let first = hub
        .store
        .call(move |s| {
            let left = catch_unwind(AssertUnwindSafe(|| handler.on_leave(s, &who, current)))
                .unwrap_or(Err(StoreError::Failed("handler_panic")));
            let peers = s.peers_of(&who.id);
            Ok((left, peers))
        })
        .await;
    let (left, peers) = match first {
        Ok(both) => both,
        Err(e) => (Err(e), Err(e)),
    };
    if hub.aborted() {
        return;
    }
    if let Err(e) = &left {
        hub.log(LogEvent::LeaveStoreError { code: e.code() });
    }
    if let Err(e) = &peers {
        hub.log(LogEvent::LeaveStoreError { code: e.code() });
    }

    let (out, refresh) = match left {
        Ok(ControlOutcome { out, refresh }) => (out, refresh),
        Err(_) => {
            // Writers' rule 3, the leave half: a failed `on_leave` may have committed a
            // write involving this key, so a newer connection of it is re-read.
            let newer = hub.live().presence.conn_of(&id).is_some_and(|c| c != conn);
            (Vec::new(), if newer { vec![id] } else { Vec::new() })
        }
    };
    let read = read_sets(hub, refresh).await;
    if hub.aborted() {
        return;
    }

    let online = {
        let mut live = hub.live();
        // Presence is cleared whatever the store said; without peers, nobody is told.
        let fan_out = match &peers {
            Ok(peers) => live.presence.leave(id, conn, peers),
            Err(_) => {
                live.presence.leave(id, conn, &[]);
                Vec::new()
            }
        };
        live.deliver(fan_out, &*hub.config.log);
        let closed = install(&mut live, read, hub);
        deliver_except(&mut live, out, &closed, hub);
        if live.peers.get(&id).is_some_and(|e| e.conn == conn) {
            live.peers.remove(&id);
        }
        live.online()
    };
    hub.log(LogEvent::DeviceLeft { online });

    if hub.aborted() {
        return;
    }
    if let Err(e) = hub.store.call(move |s| s.touch(&id, now)).await {
        hub.log(LogEvent::LeaveStoreError { code: e.code() });
    }
}

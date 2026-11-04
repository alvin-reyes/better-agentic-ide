//! The seam story 5a's pairing plugs into (story 7b): what the relay does with a
//! control message it doesn't handle itself, at login and at leave.
//!
//! The server calls every method from inside one `StoreHandle::call`, so off the async
//! workers and outside the `Live` lock, and passes the relay's own store in. A handler
//! holds no store of its own.
//!
//! **The writers' rule (ADR 0006).** Every pair write a handler makes follows these:
//! 1. A call that adds or removes a pair returns both of that pair's keys in `refresh`.
//!    The server re-reads their peer sets, after the write has committed, before it
//!    delivers `out` or reads the sender's next message.
//! 2. A call writes only pairs that include the key of the device whose message (or
//!    login, or leave) it is handling.
//! 3. If a call fails (`Err`, or a panic), the server re-reads the sender's peer set and
//!    closes it with 1011, so a write that committed before the failure still reaches
//!    routing. At leave, a failed replaced connection's `on_leave` re-reads the current
//!    connection's set.
//! 4. `on_login` writes no pairs.
//! 5. `on_leave` returns its own `refresh`.

use relay_protocol::{Control, ControlHead, DeviceKey};

use crate::{Identity, Outbound, Store, StoreError};

/// What a handler call wants done.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ControlOutcome {
    /// Messages for online devices. A message for an offline device is dropped.
    pub out: Vec<Outbound>,
    /// The keys whose peer sets must be re-read: both keys of every pair this call
    /// added or removed (the writers' rule).
    pub refresh: Vec<DeviceKey>,
}

/// Handles what the relay doesn't: story 5a's pairing messages. Every method is
/// synchronous and is called with the relay's store, off the async workers.
pub trait ControlHandler: Send + Sync {
    /// After `register`, before the device's `welcome`: its messages are queued ahead of
    /// the `welcome` (5a re-sends `paired` here). It writes no pairs.
    fn on_login(&self, store: &dyn Store, who: &Identity) -> Vec<Control>;

    /// A control message the relay doesn't handle itself, after the control limit let
    /// it through. `head` is what the relay read of `text`; `now` is Unix ms.
    fn control(
        &self,
        store: &dyn Store,
        who: &Identity,
        head: &ControlHead,
        text: &str,
        now: u64,
    ) -> Result<ControlOutcome, StoreError>;

    /// Once for each connection the relay joined, a replaced one included, when it
    /// ends. `current` is false when a newer connection of the same key had replaced it
    /// (story 5a ends a Mac's pairing slot only on a current connection's leave). It
    /// runs under `catch_unwind`: a panic counts as a failed `on_leave`.
    fn on_leave(
        &self,
        store: &dyn Store,
        who: &Identity,
        current: bool,
    ) -> Result<ControlOutcome, StoreError>;
}

/// The default handler: sends nothing and changes nothing, so every pairing message is
/// ignored until story 5a.
#[derive(Clone, Copy, Debug, Default)]
pub struct IgnoreControl;

impl ControlHandler for IgnoreControl {
    fn on_login(&self, _store: &dyn Store, _who: &Identity) -> Vec<Control> {
        Vec::new()
    }

    fn control(
        &self,
        _store: &dyn Store,
        _who: &Identity,
        _head: &ControlHead,
        _text: &str,
        _now: u64,
    ) -> Result<ControlOutcome, StoreError> {
        Ok(ControlOutcome::default())
    }

    fn on_leave(
        &self,
        _store: &dyn Store,
        _who: &Identity,
        _current: bool,
    ) -> Result<ControlOutcome, StoreError> {
        Ok(ControlOutcome::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CleanupCounts, DeviceRecord, PairDirectory, PairRecord, Registered};
    use relay_protocol::{Bytes, PairId, PairInfo, Role};

    /// A store that refuses every call: the default handler must not touch it.
    struct NoStore;

    impl PairDirectory for NoStore {
        fn peers_of(&self, _: &DeviceKey) -> Result<Vec<PairInfo>, StoreError> {
            panic!("touched the store")
        }
    }

    impl Store for NoStore {
        fn device(&self, _: &DeviceKey) -> Result<Option<DeviceRecord>, StoreError> {
            panic!("touched the store")
        }
        fn register(&self, _: &DeviceKey, _: Role, _: u64) -> Result<Registered, StoreError> {
            panic!("touched the store")
        }
        fn touch(&self, _: &DeviceKey, _: u64) -> Result<bool, StoreError> {
            panic!("touched the store")
        }
        fn insert_pair(&self, _: &PairRecord) -> Result<(), StoreError> {
            panic!("touched the store")
        }
        fn pair(&self, _: &PairId) -> Result<Option<PairRecord>, StoreError> {
            panic!("touched the store")
        }
        fn set_acked(&self, _: &PairId) -> Result<bool, StoreError> {
            panic!("touched the store")
        }
        fn delete_pair(&self, _: &PairId) -> Result<bool, StoreError> {
            panic!("touched the store")
        }
        fn put_push_token(
            &self,
            _: &DeviceKey,
            _: &str,
            _: &str,
            _: u64,
        ) -> Result<(), StoreError> {
            panic!("touched the store")
        }
        fn cleanup(&self, _: u64, _: u64, _: &[DeviceKey]) -> Result<CleanupCounts, StoreError> {
            panic!("touched the store")
        }
        fn counts(&self) -> Result<crate::StoreCounts, StoreError> {
            panic!("touched the store")
        }
    }

    #[test]
    fn the_default_handler_ignores_everything_and_touches_no_store() {
        let who = Identity {
            id: Bytes([1; 32]),
            role: Role::Mac,
        };
        let h: &dyn ControlHandler = &IgnoreControl;
        assert!(h.on_login(&NoStore, &who).is_empty());
        let head = ControlHead::read("{\"v\":1,\"t\":\"unpair\"}").unwrap();
        assert_eq!(
            h.control(&NoStore, &who, &head, "{}", 0),
            Ok(ControlOutcome::default())
        );
        for current in [true, false] {
            assert_eq!(
                h.on_leave(&NoStore, &who, current),
                Ok(ControlOutcome::default())
            );
        }
    }
}

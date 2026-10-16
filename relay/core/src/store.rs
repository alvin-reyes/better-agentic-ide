//! The storage contract: what the relay keeps on disk, as a trait. `relay-server`
//! implements it on SQLite; this crate holds only the decisions made over it (admission
//! over the stored role, the cleanup cutoff), as pure code.

use relay_protocol::{Bytes, DeviceKey, PairId, Role};

use crate::{Identity, LoginError, PairDirectory};

/// Devices unseen for this long are deleted, with their pairs and push tokens.
pub const CLEANUP_AGE_MS: u64 = 90 * 24 * 60 * 60 * 1000;

/// A store failure. Carries only a code, so it can be logged.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StoreError {
    /// `register` found the key stored with the other role.
    RoleConflict,
    /// The store couldn't do the call. The code says roughly why.
    Failed(&'static str),
}

impl StoreError {
    /// A short code for the relay's log.
    pub fn code(self) -> &'static str {
        match self {
            StoreError::RoleConflict => "role_conflict",
            StoreError::Failed(code) => code,
        }
    }
}

/// A stored device.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DeviceRecord {
    pub id: DeviceKey,
    pub role: Role,
    pub first_seen: u64,
    pub last_seen: u64,
}

/// What `register` did.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Registered {
    /// The key was stored for the first time.
    pub new: bool,
}

/// A stored pair. Times are Unix ms.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PairRecord {
    pub pair_id: PairId,
    pub mac: DeviceKey,
    pub phone: DeviceKey,
    pub mac_static: Bytes<32>,
    pub phone_static: Bytes<32>,
    pub slot: Bytes<16>,
    pub paired_at: u64,
    pub sig_m: Bytes<64>,
    pub acked: bool,
}

/// What one cleanup did.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CleanupCounts {
    /// Online devices whose `last_seen` was moved to now first.
    pub touched: u64,
    /// Devices deleted.
    pub devices: u64,
    /// Pairs deleted with them.
    pub pairs: u64,
    /// Push tokens deleted with them.
    pub push_tokens: u64,
    /// The deleted devices' keys.
    pub deleted: Vec<DeviceKey>,
    /// The deleted pairs' ids, read in the same transaction as each batch's delete.
    pub deleted_pairs: Vec<PairId>,
}

/// How much the store holds, for `/metrics`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct StoreCounts {
    pub devices: u64,
    pub pairs: u64,
    pub pairs_acked: u64,
    pub push_tokens: u64,
}

/// The relay's storage. Every call is short and synchronous; the server makes each one
/// off its async workers. Story 5a extends it with what pairing needs.
pub trait Store: PairDirectory + Send + Sync {
    /// The stored device, if any.
    fn device(&self, id: &DeviceKey) -> Result<Option<DeviceRecord>, StoreError>;

    /// Stores a login, in one atomic step: a new key gets `role`, `first_seen` and
    /// `last_seen` = `now`; a known key gets `last_seen` = `now`. A key stored with the
    /// other role is refused with `RoleConflict` and left as it was.
    fn register(&self, id: &DeviceKey, role: Role, now: u64) -> Result<Registered, StoreError>;

    /// Sets `last_seen` = `now`. False if the device isn't stored.
    fn touch(&self, id: &DeviceKey, now: u64) -> Result<bool, StoreError>;

    /// Stores a pair. Both devices must be stored.
    fn insert_pair(&self, pair: &PairRecord) -> Result<(), StoreError>;

    /// The stored pair, if any.
    fn pair(&self, pair_id: &PairId) -> Result<Option<PairRecord>, StoreError>;

    /// Marks a pair acked. False if the pair isn't stored.
    fn set_acked(&self, pair_id: &PairId) -> Result<bool, StoreError>;

    /// Deletes a pair. False if the pair isn't stored.
    fn delete_pair(&self, pair_id: &PairId) -> Result<bool, StoreError>;

    /// Stores a phone's push token, replacing any earlier one: one per phone.
    fn put_push_token(
        &self,
        phone: &DeviceKey,
        token: &str,
        env: &str,
        now: u64,
    ) -> Result<(), StoreError>;

    /// Touches every `online` device to `now`, then deletes every other device with
    /// `last_seen <= cutoff`, with its pairs and push tokens, in batches.
    fn cleanup(
        &self,
        now: u64,
        cutoff: u64,
        online: &[DeviceKey],
    ) -> Result<CleanupCounts, StoreError>;

    /// How much the store holds.
    fn counts(&self) -> Result<StoreCounts, StoreError>;
}

/// How a login stands against the stored role.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Admit {
    /// The key is stored with this role.
    Known,
    /// The key isn't stored yet.
    New,
}

/// Admits a verified login over the role stored for its key (`None` if the key isn't
/// stored). A key's role is fixed the first time it logs in.
pub fn admit(stored_role: Option<Role>, who: &Identity) -> Result<Admit, LoginError> {
    match stored_role {
        None => Ok(Admit::New),
        Some(role) if role == who.role => Ok(Admit::Known),
        Some(_) => Err(LoginError::RoleConflict),
    }
}

/// The `last_seen` at or below which a device is deleted at `now`: 90 days ago,
/// inclusive. `None`, meaning delete nothing, while `now` is under 90 days.
pub fn cleanup_cutoff(now: u64) -> Option<u64> {
    now.checked_sub(CLEANUP_AGE_MS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn who(seed: u8, role: Role) -> Identity {
        Identity {
            id: Bytes([seed; 32]),
            role,
        }
    }

    #[test]
    fn a_new_key_is_admitted_as_new() {
        assert_eq!(admit(None, &who(1, Role::Phone)), Ok(Admit::New));
        assert_eq!(admit(None, &who(1, Role::Mac)), Ok(Admit::New));
    }

    #[test]
    fn a_known_key_with_its_role_is_admitted() {
        assert_eq!(
            admit(Some(Role::Phone), &who(1, Role::Phone)),
            Ok(Admit::Known)
        );
        assert_eq!(admit(Some(Role::Mac), &who(1, Role::Mac)), Ok(Admit::Known));
    }

    #[test]
    fn a_key_logging_in_with_the_other_role_is_refused() {
        assert_eq!(
            admit(Some(Role::Phone), &who(1, Role::Mac)),
            Err(LoginError::RoleConflict)
        );
        assert_eq!(
            admit(Some(Role::Mac), &who(1, Role::Phone)),
            Err(LoginError::RoleConflict)
        );
    }

    #[test]
    fn cleanup_cutoff_is_none_before_90_days() {
        assert_eq!(cleanup_cutoff(0), None);
        assert_eq!(cleanup_cutoff(CLEANUP_AGE_MS - 1), None);
        assert_eq!(cleanup_cutoff(CLEANUP_AGE_MS), Some(0));
        assert_eq!(cleanup_cutoff(CLEANUP_AGE_MS + 5), Some(5));
    }

    #[test]
    fn cleanup_cutoff_is_90_days_back() {
        let now = crate::clock::MANUAL_CLOCK_START_MS;
        assert_eq!(cleanup_cutoff(now), Some(now - 7_776_000_000));
        assert_eq!(CLEANUP_AGE_MS, 7_776_000_000);
    }

    #[test]
    fn store_errors_have_log_codes() {
        assert_eq!(StoreError::RoleConflict.code(), "role_conflict");
        assert_eq!(StoreError::Failed("busy").code(), "busy");
    }
}

//! The pairing and session state machines and the snapshot builder, free of Tauri.
//!
//! Story 2: login, the role registry, the pair directory and presence. All of it is
//! pure: `relay-server` does the I/O and asks this crate for every decision.
//!
//! Story 4: the Noise session machines and their store traits (`session`).

mod session;

pub use session::{
    next_counter_value, Hs1Counters, LastSent, MacAction, MacSessions, MemoryHs1Counters,
    MemoryLastSent, MemoryPairedStatics, PairedStatics, PhoneAction, PhoneSession, SendError,
    StoreError, Trigger, HANGING_MS, MAX_OUTSTANDING, MAX_SESSION_AGE_MS, OUTSTANDING_TTL_MS,
    RESTART_WINDOW_MS, RETRY_MS,
};

use std::collections::HashMap;
use std::sync::Mutex;

use ed25519_dalek::{Signature, VerifyingKey};
use rand::RngCore;
use relay_protocol::{enc, Bytes, Control, DeviceKey, PairId, PairInfo, Role, LOGIN_LABEL};

/// The Noise pattern, as `relay-protocol` names it.
pub fn noise_pattern() -> &'static str {
    relay_protocol::NOISE_PATTERN
}

/// A connection's login challenge: 32 random bytes, good for one login check.
#[derive(Debug)]
pub struct Challenge {
    bytes: [u8; 32],
    used: bool,
}

impl Challenge {
    /// A fresh challenge from the OS random source.
    pub fn new() -> Self {
        let mut bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut bytes);
        Challenge { bytes, used: false }
    }

    /// The bytes to send as `challenge {c}`.
    pub fn bytes(&self) -> [u8; 32] {
        self.bytes
    }

    /// The `challenge` control message for this challenge.
    pub fn message(&self) -> Control {
        Control::Challenge {
            c: Bytes(self.bytes),
        }
    }
}

impl Default for Challenge {
    fn default() -> Self {
        Self::new()
    }
}

/// A device that has proved it holds its identity key.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Identity {
    pub id: DeviceKey,
    pub role: Role,
}

/// Why a login was refused. The relay logs the code and tells the client nothing more
/// than `login_refused`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoginError {
    /// The message after the challenge was not a `login`.
    NotLogin,
    /// This connection's challenge was already spent.
    ChallengeUsed,
    /// `id` is not a valid Ed25519 public key.
    BadKey,
    /// The signature doesn't verify for any configured host.
    BadSignature,
    /// The key was first registered with the other role.
    RoleConflict,
}

impl LoginError {
    /// A short code for the relay's log.
    pub fn code(self) -> &'static str {
        match self {
            LoginError::NotLogin => "not_login",
            LoginError::ChallengeUsed => "challenge_used",
            LoginError::BadKey => "bad_key",
            LoginError::BadSignature => "bad_signature",
            LoginError::RoleConflict => "role_conflict",
        }
    }
}

/// The host name as a login signs it: lower-cased, with an IPv6 literal's surrounding
/// `[` `]` removed and one trailing dot dropped. The client applies it to the host it
/// dialled, and the relay to each configured host before comparing.
pub fn signed_host(host: &str) -> String {
    let host = host
        .strip_prefix('[')
        .and_then(|h| h.strip_suffix(']'))
        .unwrap_or(host);
    let host = host.strip_suffix('.').unwrap_or(host);
    host.to_ascii_lowercase()
}

/// The bytes a device signs to log in: `enc(LOGIN_LABEL, c, host, role)`.
pub fn login_message(challenge: &[u8; 32], host: &str, role: Role) -> Vec<u8> {
    enc(
        LOGIN_LABEL,
        &[challenge, host.as_bytes(), role.as_str().as_bytes()],
    )
}

/// Checks a `login` against this connection's challenge and the relay's host names.
/// The challenge is spent by the first call, whatever its outcome.
pub fn verify_login(
    challenge: &mut Challenge,
    login: &Control,
    hosts: &[String],
) -> Result<Identity, LoginError> {
    if challenge.used {
        return Err(LoginError::ChallengeUsed);
    }
    challenge.used = true;
    let Control::Login { id, role, sig } = login else {
        return Err(LoginError::NotLogin);
    };
    let key = VerifyingKey::from_bytes(&id.0).map_err(|_| LoginError::BadKey)?;
    let sig = Signature::from_bytes(&sig.0);
    let ok = hosts.iter().any(|host| {
        key.verify_strict(
            &login_message(&challenge.bytes, &signed_host(host), *role),
            &sig,
        )
        .is_ok()
    });
    if !ok {
        return Err(LoginError::BadSignature);
    }
    Ok(Identity {
        id: *id,
        role: *role,
    })
}

/// Each key's role, fixed the first time the key logs in. Held in memory until story 7.
#[derive(Debug, Default)]
pub struct DeviceRoles {
    roles: HashMap<DeviceKey, Role>,
}

impl DeviceRoles {
    pub fn new() -> Self {
        Self::default()
    }

    /// Registers a first login's role, or refuses a login with the other role.
    pub fn admit(&mut self, who: &Identity) -> Result<(), LoginError> {
        match self.roles.get(&who.id) {
            Some(role) if *role != who.role => Err(LoginError::RoleConflict),
            Some(_) => Ok(()),
            None => {
                self.roles.insert(who.id, who.role);
                Ok(())
            }
        }
    }
}

/// Where the relay learns who is paired with whom. Story 7 adds the SQLite one.
pub trait PairDirectory: Send + Sync {
    /// Every pair `id` is in, each seen from `id`'s side.
    fn peers_of(&self, id: &DeviceKey) -> Vec<PairInfo>;
}

/// Pairs held in memory, seeded by hand until pairing (story 5a) exists.
#[derive(Debug, Default)]
pub struct InMemoryPairs {
    pairs: Mutex<Vec<(PairId, DeviceKey, DeviceKey)>>,
}

impl InMemoryPairs {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a pair between a Mac key and a phone key.
    pub fn add(&self, pair_id: PairId, mac: DeviceKey, phone: DeviceKey) {
        self.pairs.lock().unwrap().push((pair_id, mac, phone));
    }
}

impl PairDirectory for InMemoryPairs {
    fn peers_of(&self, id: &DeviceKey) -> Vec<PairInfo> {
        self.pairs
            .lock()
            .unwrap()
            .iter()
            .filter_map(|(pair_id, mac, phone)| {
                if mac == id {
                    Some(PairInfo {
                        pair_id: *pair_id,
                        peer_id: *phone,
                        peer_role: Role::Phone,
                    })
                } else if phone == id {
                    Some(PairInfo {
                        pair_id: *pair_id,
                        peer_id: *mac,
                        peer_role: Role::Mac,
                    })
                } else {
                    None
                }
            })
            .collect()
    }
}

/// Identifies one live connection, so a stale socket's close can't take down its
/// replacement.
pub type ConnId = u64;

/// A message for one online device.
pub type Outbound = (DeviceKey, Control);

/// Which devices are online, and the presence messages each change produces.
#[derive(Debug, Default)]
pub struct Presence {
    online: HashMap<DeviceKey, ConnId>,
}

impl Presence {
    pub fn new() -> Self {
        Self::default()
    }

    /// Whether `id` has a live connection.
    pub fn is_online(&self, id: &DeviceKey) -> bool {
        self.online.contains_key(id)
    }

    /// The connection `id` is live on, if any.
    pub fn conn_of(&self, id: &DeviceKey) -> Option<ConnId> {
        self.online.get(id).copied()
    }

    /// The `welcome` for a device that just logged in, listing its pairs and which of
    /// those peers are online.
    pub fn welcome(&self, pairs: Vec<PairInfo>) -> Control {
        let mut online: Vec<DeviceKey> = Vec::new();
        for p in &pairs {
            if self.is_online(&p.peer_id) && !online.contains(&p.peer_id) {
                online.push(p.peer_id);
            }
        }
        Control::Welcome { pairs, online }
    }

    /// `id` logged in on `conn`. Its online peers are told; if it was already online
    /// on another connection, that one is replaced and its peers see offline first.
    pub fn login(&mut self, id: DeviceKey, conn: ConnId, peers: &[PairInfo]) -> Vec<Outbound> {
        let mut out = Vec::new();
        if self.online.insert(id, conn).is_some() {
            out.extend(self.fan_out(id, false, peers));
        }
        out.extend(self.fan_out(id, true, peers));
        out
    }

    /// `id`'s connection `conn` closed or timed out. Ignored if `conn` was already
    /// replaced by a newer login.
    pub fn leave(&mut self, id: DeviceKey, conn: ConnId, peers: &[PairInfo]) -> Vec<Outbound> {
        if self.online.get(&id) != Some(&conn) {
            return Vec::new();
        }
        self.online.remove(&id);
        self.fan_out(id, false, peers)
    }

    fn fan_out(&self, id: DeviceKey, online: bool, peers: &[PairInfo]) -> Vec<Outbound> {
        let mut out: Vec<Outbound> = Vec::new();
        for p in peers {
            if self.is_online(&p.peer_id) && !out.iter().any(|(to, _)| *to == p.peer_id) {
                out.push((p.peer_id, Control::Presence { peer: id, online }));
            }
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn reaches_protocol_by_path() {
        assert_eq!(noise_pattern(), relay_protocol::NOISE_PATTERN);
    }

    fn key(seed: u8) -> SigningKey {
        SigningKey::from_bytes(&[seed; 32])
    }

    fn id_of(k: &SigningKey) -> DeviceKey {
        Bytes(k.verifying_key().to_bytes())
    }

    fn login(k: &SigningKey, c: &Challenge, host: &str, role: Role) -> Control {
        let sig = k.sign(&login_message(&c.bytes(), host, role));
        Control::Login {
            id: id_of(k),
            role,
            sig: Bytes(sig.to_bytes()),
        }
    }

    fn hosts() -> Vec<String> {
        vec!["relay.fly.dev".into(), "localhost".into()]
    }

    #[test]
    fn challenges_are_fresh() {
        assert_ne!(Challenge::new().bytes(), Challenge::new().bytes());
    }

    #[test]
    fn login_message_is_enc_of_challenge_host_and_role() {
        let c = [7u8; 32];
        assert_eq!(
            login_message(&c, "localhost", Role::Phone),
            enc(LOGIN_LABEL, &[&c, b"localhost", b"phone"])
        );
    }

    #[test]
    fn a_good_login_is_accepted_for_any_configured_host() {
        let k = key(1);
        for host in hosts() {
            let mut c = Challenge::new();
            let msg = login(&k, &c, &host, Role::Mac);
            assert_eq!(
                verify_login(&mut c, &msg, &hosts()),
                Ok(Identity {
                    id: id_of(&k),
                    role: Role::Mac
                })
            );
        }
    }

    #[test]
    fn the_signed_host_is_lower_cased_without_brackets() {
        assert_eq!(signed_host("Relay.Fly.Dev"), "relay.fly.dev");
        assert_eq!(signed_host("[::1]"), "::1");
        assert_eq!(signed_host("[FE80::1]"), "fe80::1");
        assert_eq!(signed_host("localhost"), "localhost");
        assert_eq!(signed_host("relay.fly.dev."), "relay.fly.dev");
        assert_eq!(signed_host("Relay.Fly.Dev."), "relay.fly.dev");
    }

    #[test]
    fn configured_hosts_are_compared_lower_cased() {
        let k = key(1);
        let mut c = Challenge::new();
        let msg = login(&k, &c, "relay.fly.dev", Role::Mac);
        assert!(verify_login(&mut c, &msg, &["Relay.Fly.Dev".to_string()]).is_ok());
    }

    #[test]
    fn a_login_signed_for_a_trailing_dot_host_is_accepted() {
        let mut c = Challenge::new();
        let msg = login(&key(1), &c, &signed_host("relay.fly.dev."), Role::Mac);
        assert!(verify_login(&mut c, &msg, &["relay.fly.dev".to_string()]).is_ok());
    }

    #[test]
    fn an_id_that_is_not_a_curve_point_is_refused() {
        // y = 2 has no x on Ed25519, so these bytes don't decompress.
        let mut id = [0u8; 32];
        id[0] = 2;
        let mut c = Challenge::new();
        let msg = Control::Login {
            id: Bytes(id),
            role: Role::Mac,
            sig: Bytes([0; 64]),
        };
        assert_eq!(
            verify_login(&mut c, &msg, &hosts()),
            Err(LoginError::BadKey)
        );
    }

    #[test]
    fn a_wrong_signature_is_refused() {
        let mut c = Challenge::new();
        let Control::Login { role, sig, .. } = login(&key(1), &c, "localhost", Role::Mac) else {
            unreachable!()
        };
        let forged = Control::Login {
            id: id_of(&key(2)),
            role,
            sig,
        };
        assert_eq!(
            verify_login(&mut c, &forged, &hosts()),
            Err(LoginError::BadSignature)
        );
    }

    #[test]
    fn a_signature_over_another_role_is_refused() {
        let mut c = Challenge::new();
        let Control::Login { id, sig, .. } = login(&key(1), &c, "localhost", Role::Mac) else {
            unreachable!()
        };
        let msg = Control::Login {
            id,
            role: Role::Phone,
            sig,
        };
        assert_eq!(
            verify_login(&mut c, &msg, &hosts()),
            Err(LoginError::BadSignature)
        );
    }

    #[test]
    fn a_login_for_another_host_is_refused() {
        let mut c = Challenge::new();
        let msg = login(&key(1), &c, "evil.example", Role::Phone);
        assert_eq!(
            verify_login(&mut c, &msg, &hosts()),
            Err(LoginError::BadSignature)
        );
    }

    #[test]
    fn a_challenge_is_good_for_one_login() {
        let k = key(1);
        let mut c = Challenge::new();
        let msg = login(&k, &c, "localhost", Role::Phone);
        assert!(verify_login(&mut c, &msg, &hosts()).is_ok());
        assert_eq!(
            verify_login(&mut c, &msg, &hosts()),
            Err(LoginError::ChallengeUsed)
        );
    }

    #[test]
    fn a_login_replayed_against_a_new_challenge_is_refused() {
        let k = key(1);
        let first = Challenge::new();
        let msg = login(&k, &first, "localhost", Role::Phone);
        let mut second = Challenge::new();
        assert_eq!(
            verify_login(&mut second, &msg, &hosts()),
            Err(LoginError::BadSignature)
        );
    }

    #[test]
    fn a_message_other_than_login_is_refused() {
        let mut c = Challenge::new();
        let msg = Control::Presence {
            peer: Bytes([0; 32]),
            online: true,
        };
        assert_eq!(
            verify_login(&mut c, &msg, &hosts()),
            Err(LoginError::NotLogin)
        );
    }

    #[test]
    fn a_role_is_fixed_on_first_login() {
        let mut roles = DeviceRoles::new();
        let id = id_of(&key(1));
        assert_eq!(
            roles.admit(&Identity {
                id,
                role: Role::Phone
            }),
            Ok(())
        );
        assert_eq!(
            roles.admit(&Identity {
                id,
                role: Role::Phone
            }),
            Ok(())
        );
        assert_eq!(
            roles.admit(&Identity {
                id,
                role: Role::Mac
            }),
            Err(LoginError::RoleConflict)
        );
        let other = id_of(&key(2));
        assert_eq!(
            roles.admit(&Identity {
                id: other,
                role: Role::Mac
            }),
            Ok(())
        );
    }

    #[test]
    fn the_in_memory_directory_lists_pairs_from_each_side() {
        let (mac, phone, stranger) = (Bytes([1; 32]), Bytes([2; 32]), Bytes([3; 32]));
        let dir = InMemoryPairs::new();
        dir.add(Bytes([9; 16]), mac, phone);
        assert_eq!(
            dir.peers_of(&mac),
            vec![PairInfo {
                pair_id: Bytes([9; 16]),
                peer_id: phone,
                peer_role: Role::Phone
            }]
        );
        assert_eq!(
            dir.peers_of(&phone),
            vec![PairInfo {
                pair_id: Bytes([9; 16]),
                peer_id: mac,
                peer_role: Role::Mac
            }]
        );
        assert!(dir.peers_of(&stranger).is_empty());
    }

    fn presence(peer: DeviceKey, online: bool) -> Control {
        Control::Presence { peer, online }
    }

    #[test]
    fn presence_goes_only_to_online_paired_peers() {
        let (mac, phone, stranger) = (Bytes([1; 32]), Bytes([2; 32]), Bytes([3; 32]));
        let dir = InMemoryPairs::new();
        dir.add(Bytes([9; 16]), mac, phone);
        let mut p = Presence::new();

        // The Mac logs in first: its peer is offline, so nobody is told.
        assert!(p.login(mac, 1, &dir.peers_of(&mac)).is_empty());
        // An unpaired key logs in: nobody is paired with it.
        assert!(p.login(stranger, 2, &dir.peers_of(&stranger)).is_empty());
        // The phone's welcome lists the Mac online, and the Mac hears about the phone.
        match p.welcome(dir.peers_of(&phone)) {
            Control::Welcome { online, .. } => assert_eq!(online, vec![mac]),
            other => panic!("{other:?}"),
        }
        assert_eq!(
            p.login(phone, 3, &dir.peers_of(&phone)),
            vec![(mac, presence(phone, true))]
        );
        // The stranger leaves: nobody is told.
        assert!(p.leave(stranger, 2, &dir.peers_of(&stranger)).is_empty());
        // The phone leaves: the Mac is told.
        assert_eq!(
            p.leave(phone, 3, &dir.peers_of(&phone)),
            vec![(mac, presence(phone, false))]
        );
        assert!(!p.is_online(&phone));
    }

    #[test]
    fn a_new_login_replaces_the_old_and_its_close_is_ignored() {
        let (mac, phone) = (Bytes([1; 32]), Bytes([2; 32]));
        let dir = InMemoryPairs::new();
        dir.add(Bytes([9; 16]), mac, phone);
        let mut p = Presence::new();
        p.login(mac, 1, &dir.peers_of(&mac));
        p.login(phone, 2, &dir.peers_of(&phone));

        assert_eq!(
            p.login(phone, 3, &dir.peers_of(&phone)),
            vec![(mac, presence(phone, false)), (mac, presence(phone, true))]
        );
        assert!(p.leave(phone, 2, &dir.peers_of(&phone)).is_empty());
        assert_eq!(p.conn_of(&phone), Some(3));
    }

    #[test]
    fn presence_reaches_every_paired_peer() {
        let (mac, phone_a, phone_b) = (Bytes([1; 32]), Bytes([2; 32]), Bytes([3; 32]));
        let dir = InMemoryPairs::new();
        dir.add(Bytes([8; 16]), mac, phone_a);
        dir.add(Bytes([9; 16]), mac, phone_b);
        let mut p = Presence::new();
        p.login(phone_a, 1, &dir.peers_of(&phone_a));
        p.login(phone_b, 2, &dir.peers_of(&phone_b));

        assert_eq!(
            p.login(mac, 3, &dir.peers_of(&mac)),
            vec![
                (phone_a, presence(mac, true)),
                (phone_b, presence(mac, true))
            ]
        );
        assert_eq!(
            p.leave(mac, 3, &dir.peers_of(&mac)),
            vec![
                (phone_a, presence(mac, false)),
                (phone_b, presence(mac, false))
            ]
        );
    }

    #[test]
    fn two_pairs_with_the_same_peer_are_told_once() {
        let (mac, phone) = (Bytes([1; 32]), Bytes([2; 32]));
        let dir = InMemoryPairs::new();
        dir.add(Bytes([8; 16]), mac, phone);
        dir.add(Bytes([9; 16]), mac, phone);
        let mut p = Presence::new();
        p.login(mac, 1, &dir.peers_of(&mac));

        match p.welcome(dir.peers_of(&phone)) {
            Control::Welcome { pairs, online } => {
                assert_eq!(pairs.len(), 2);
                assert_eq!(online, vec![mac]);
            }
            other => panic!("{other:?}"),
        }
        assert_eq!(
            p.login(phone, 2, &dir.peers_of(&phone)),
            vec![(mac, presence(phone, true))]
        );
    }
}

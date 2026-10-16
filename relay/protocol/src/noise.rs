//! The Noise IK session: `Noise_IK_25519_ChaChaPoly_SHA256` on `snow`, the phone as
//! initiator. The prologue is `enc(NOISE_LABEL, I_M, I_P)`; `hs1`'s payload is an
//! 8-byte big-endian counter and `hs2`'s is empty. A frame body is
//! `session_id(8) || u64be(nonce) || ciphertext`, the session id being the first 8
//! bytes of the handshake hash.

use crate::enc::enc;
use crate::labels::NOISE_LABEL;
use crate::{DeviceKey, NOISE_PATTERN};
use curve25519_dalek::montgomery::MontgomeryPoint;
use rand::rngs::OsRng;
use rand::RngCore;

/// Bytes on the wire for one hs1: `e(32) || s(32+16) || counter(8+16)`.
pub const HS1_LEN: usize = 104;
/// Bytes on the wire for one hs2: `e(32) || tag(16)` (empty payload).
pub const HS2_LEN: usize = 48;
/// The session id: the first 8 bytes of the handshake hash.
pub const SESSION_ID_LEN: usize = 8;
/// The largest plaintext a frame carries.
pub const MAX_PLAINTEXT: usize = 60_000;
/// Nonces are below this on both sides; a sender never uses it.
pub const NONCE_CEILING: u64 = 1 << 32;
/// The largest `hs1` counter (2^53 − 1, so TypeScript needs no BigInt).
pub const MAX_COUNTER: u64 = (1 << 53) - 1;

const TAG_LEN: usize = 16;
/// The smallest frame body: session id, nonce and an empty plaintext's tag.
const MIN_FRAME: usize = SESSION_ID_LEN + 8 + TAG_LEN;
/// The largest frame body: a full plaintext's.
const MAX_FRAME: usize = MIN_FRAME + MAX_PLAINTEXT;

fn params() -> snow::params::NoiseParams {
    NOISE_PATTERN
        .parse()
        .expect("the pattern is a valid Noise name")
}

// --- The raw layer ---------------------------------------------------------------

/// Which side a raw handshake plays; the initiator knows the responder's static.
#[derive(Clone, Copy, Debug)]
pub(crate) enum RawRole {
    Initiator { remote_static: [u8; 32] },
    Responder,
}

/// An IK handshake with any prologue and payloads: the public wrappers below, and the
/// cacophony vector test, drive it. Crate-private.
pub(crate) struct RawHandshake {
    state: snow::HandshakeState,
}

/// Builds the raw handshake for `role`, with an optional fixed ephemeral secret (test
/// vectors only).
pub(crate) fn handshake_raw(
    role: RawRole,
    prologue: &[u8],
    local_secret: &[u8; 32],
    fixed_ephemeral: Option<[u8; 32]>,
) -> RawHandshake {
    let builder = snow::Builder::new(params())
        .prologue(prologue)
        .expect("one prologue")
        .local_private_key(local_secret)
        .expect("one local key");
    let builder = match &fixed_ephemeral {
        Some(e) => builder.fixed_ephemeral_key_for_testing_only(e),
        None => builder,
    };
    let state = match &role {
        RawRole::Initiator { remote_static } => builder
            .remote_public_key(remote_static)
            .expect("one remote key")
            .build_initiator(),
        RawRole::Responder => builder.build_responder(),
    }
    .expect("the default resolver supports the pattern");
    RawHandshake { state }
}

impl RawHandshake {
    /// Writes the next handshake message carrying `payload`.
    pub(crate) fn write(&mut self, payload: &[u8]) -> Vec<u8> {
        let mut buf = vec![0u8; 96 + payload.len() + 2 * TAG_LEN];
        let n = self
            .state
            .write_message(payload, &mut buf)
            .expect("a handshake message this size writes");
        buf.truncate(n);
        buf
    }

    /// Reads the next handshake message, returning its payload. A failed read leaves
    /// the handshake as it was.
    #[cfg(test)]
    pub(crate) fn read(&mut self, msg: &[u8]) -> Result<Vec<u8>, snow::Error> {
        let mut buf = vec![0u8; msg.len()];
        let n = self.state.read_message(msg, &mut buf)?;
        buf.truncate(n);
        Ok(buf)
    }

    /// Reads the next message into a payload buffer of exactly `max` bytes, so a longer
    /// payload fails inside `snow` (and the state rolls back).
    fn read_into(&mut self, msg: &[u8], max: usize) -> Result<Vec<u8>, snow::Error> {
        let mut buf = vec![0u8; max];
        let n = self.state.read_message(msg, &mut buf)?;
        buf.truncate(n);
        Ok(buf)
    }

    pub(crate) fn handshake_hash(&self) -> Vec<u8> {
        self.state.get_handshake_hash().to_vec()
    }

    fn remote_static(&self) -> Option<[u8; 32]> {
        self.state.get_remote_static()?.try_into().ok()
    }

    pub(crate) fn into_transport(self) -> RawTransport {
        RawTransport {
            state: self
                .state
                .into_stateless_transport_mode()
                .expect("the handshake is finished"),
        }
    }
}

/// `snow`'s stateless transport: each message under an explicit nonce.
pub(crate) struct RawTransport {
    state: snow::StatelessTransportState,
}

impl RawTransport {
    pub(crate) fn encrypt(&self, nonce: u64, plaintext: &[u8]) -> Vec<u8> {
        let mut buf = vec![0u8; plaintext.len() + TAG_LEN];
        let n = self
            .state
            .write_message(nonce, plaintext, &mut buf)
            .expect("a frame this size seals");
        buf.truncate(n);
        buf
    }

    pub(crate) fn decrypt(&self, nonce: u64, ciphertext: &[u8]) -> Option<Vec<u8>> {
        let mut buf = vec![0u8; ciphertext.len()];
        let n = self.state.read_message(nonce, ciphertext, &mut buf).ok()?;
        buf.truncate(n);
        Some(buf)
    }
}

// --- Keys and the prologue ------------------------------------------------------------

/// A device's static X25519 key `S`.
#[derive(Clone)]
pub struct StaticKeypair {
    secret: [u8; 32],
    public: [u8; 32],
}

impl StaticKeypair {
    /// A fresh key from the OS random source.
    pub fn generate() -> Self {
        let mut secret = [0u8; 32];
        OsRng.fill_bytes(&mut secret);
        Self::from_secret(secret)
    }

    /// The key whose secret is `secret` (clamped when used, as X25519 does).
    pub fn from_secret(secret: [u8; 32]) -> Self {
        let public = MontgomeryPoint::mul_base_clamped(secret).to_bytes();
        StaticKeypair { secret, public }
    }

    pub fn public(&self) -> [u8; 32] {
        self.public
    }

    /// The secret, for the key store.
    pub fn secret(&self) -> &[u8; 32] {
        &self.secret
    }
}

impl std::fmt::Debug for StaticKeypair {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StaticKeypair")
            .field("public", &self.public)
            .finish_non_exhaustive()
    }
}

/// The prologue both sides mix in: `enc(NOISE_LABEL, I_M, I_P)`.
pub fn noise_prologue(i_m: &DeviceKey, i_p: &DeviceKey) -> Vec<u8> {
    enc(NOISE_LABEL, &[&i_m.0, &i_p.0])
}

/// The low-order rule: a remote key is refused when X25519 of it with the local
/// static secret is all zeros. `snow` computes DH with the same call.
pub(crate) fn is_low_order(local: &StaticKeypair, remote: &[u8; 32]) -> bool {
    MontgomeryPoint(*remote)
        .mul_clamped(local.secret)
        .to_bytes()
        == [0u8; 32]
}

fn first_32(msg: &[u8]) -> Option<[u8; 32]> {
    msg.get(..32)?.try_into().ok()
}

/// Why a handshake message was refused. The Mac answers none of them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HandshakeError {
    /// `hs1` isn't 104 bytes or `hs2` isn't 48.
    Length,
    /// A remote `e` or `s` (or the Mac's static, to `Initiator::start`) is low order.
    LowOrder,
    /// The message doesn't decrypt: tampered, another prologue, another static.
    Decrypt,
    /// A counter above `MAX_COUNTER`.
    CounterRange,
    /// `finish` after the handshake already completed.
    Finished,
}

impl std::fmt::Display for HandshakeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            HandshakeError::Length => "wrong handshake message length",
            HandshakeError::LowOrder => "low-order key",
            HandshakeError::Decrypt => "handshake message does not decrypt",
            HandshakeError::CounterRange => "counter above 2^53 - 1",
            HandshakeError::Finished => "handshake already finished",
        })
    }
}

impl std::error::Error for HandshakeError {}

// --- The phone side -------------------------------------------------------------------

/// The phone's half of one handshake, between `hs1` and `hs2`.
pub struct Initiator {
    raw: Option<RawHandshake>,
    own: StaticKeypair,
    counter: u64,
}

impl Initiator {
    /// Starts a handshake to the Mac `i_m` whose static is `mac_static`, returning
    /// `hs1`. Refuses a low-order Mac static and a counter above `MAX_COUNTER`.
    pub fn start(
        own: &StaticKeypair,
        i_m: &DeviceKey,
        i_p: &DeviceKey,
        mac_static: &[u8; 32],
        counter: u64,
    ) -> Result<(Initiator, Vec<u8>), HandshakeError> {
        Self::start_with(own, i_m, i_p, mac_static, counter, None)
    }

    /// `start` with a fixed ephemeral secret. Crate-private: vectors only.
    pub(crate) fn start_with(
        own: &StaticKeypair,
        i_m: &DeviceKey,
        i_p: &DeviceKey,
        mac_static: &[u8; 32],
        counter: u64,
        fixed_ephemeral: Option<[u8; 32]>,
    ) -> Result<(Initiator, Vec<u8>), HandshakeError> {
        if counter > MAX_COUNTER {
            return Err(HandshakeError::CounterRange);
        }
        if is_low_order(own, mac_static) {
            return Err(HandshakeError::LowOrder);
        }
        let mut raw = handshake_raw(
            RawRole::Initiator {
                remote_static: *mac_static,
            },
            &noise_prologue(i_m, i_p),
            &own.secret,
            fixed_ephemeral,
        );
        let hs1 = raw.write(&counter.to_be_bytes());
        debug_assert_eq!(hs1.len(), HS1_LEN);
        let init = Initiator {
            raw: Some(raw),
            own: own.clone(),
            counter,
        };
        Ok((init, hs1))
    }

    /// The counter this handshake's `hs1` carries.
    pub fn counter(&self) -> u64 {
        self.counter
    }

    /// Reads `hs2`. Anything but exactly 48 bytes, a low-order `e`, or a message that
    /// doesn't decrypt is refused, and the handshake stays usable for the right `hs2`.
    pub fn finish(&mut self, hs2: &[u8]) -> Result<Session, HandshakeError> {
        let raw = self.raw.as_mut().ok_or(HandshakeError::Finished)?;
        if hs2.len() != HS2_LEN {
            return Err(HandshakeError::Length);
        }
        let e = first_32(hs2).ok_or(HandshakeError::Length)?;
        if is_low_order(&self.own, &e) {
            return Err(HandshakeError::LowOrder);
        }
        // A 0-byte payload buffer: a non-empty payload fails inside snow, which then
        // rolls its state back.
        raw.read_into(hs2, 0).map_err(|_| HandshakeError::Decrypt)?;
        let raw = self.raw.take().expect("checked above");
        Ok(Session::new(raw))
    }
}

impl std::fmt::Debug for Initiator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Initiator")
            .field("counter", &self.counter)
            .field("finished", &self.raw.is_none())
            .finish()
    }
}

// --- The Mac side ---------------------------------------------------------------------

/// An `hs1` that decrypted, before the Mac's own checks (pairing, counter) decide.
pub struct Hs1Read {
    raw: RawHandshake,
    remote_static: [u8; 32],
    counter: u64,
}

/// Reads an `hs1` that the relay says came from `sender_i_p`. Refuses any length but
/// 104 bytes, a low-order `e` or `s`, a message that doesn't decrypt (another
/// prologue, another Mac's static) and a counter above `MAX_COUNTER`.
pub fn read_hs1(
    own: &StaticKeypair,
    i_m: &DeviceKey,
    sender_i_p: &DeviceKey,
    hs1: &[u8],
) -> Result<Hs1Read, HandshakeError> {
    read_hs1_with(own, i_m, sender_i_p, hs1, None)
}

/// `read_hs1` with a fixed ephemeral secret for the reply. Crate-private: vectors only.
pub(crate) fn read_hs1_with(
    own: &StaticKeypair,
    i_m: &DeviceKey,
    sender_i_p: &DeviceKey,
    hs1: &[u8],
    fixed_ephemeral: Option<[u8; 32]>,
) -> Result<Hs1Read, HandshakeError> {
    if hs1.len() != HS1_LEN {
        return Err(HandshakeError::Length);
    }
    let e = first_32(hs1).ok_or(HandshakeError::Length)?;
    if is_low_order(own, &e) {
        return Err(HandshakeError::LowOrder);
    }
    let mut raw = handshake_raw(
        RawRole::Responder,
        &noise_prologue(i_m, sender_i_p),
        &own.secret,
        fixed_ephemeral,
    );
    let payload = raw.read_into(hs1, 8).map_err(|_| HandshakeError::Decrypt)?;
    let payload: [u8; 8] = payload.try_into().map_err(|_| HandshakeError::Length)?;
    let remote_static = raw.remote_static().ok_or(HandshakeError::Decrypt)?;
    // snow completes a read with a low-order s; the rule refuses it here, and this
    // responder state is dropped, never reused.
    if is_low_order(own, &remote_static) {
        return Err(HandshakeError::LowOrder);
    }
    let counter = u64::from_be_bytes(payload);
    if counter > MAX_COUNTER {
        return Err(HandshakeError::CounterRange);
    }
    Ok(Hs1Read {
        raw,
        remote_static,
        counter,
    })
}

impl Hs1Read {
    /// The phone's static `S_P`, which the Mac checks against its pairs.
    pub fn remote_static(&self) -> [u8; 32] {
        self.remote_static
    }

    /// The counter, which the Mac checks against the last it accepted.
    pub fn counter(&self) -> u64 {
        self.counter
    }

    /// Writes `hs2` (empty payload) and opens the session.
    pub fn reply(mut self) -> (Vec<u8>, Session) {
        let hs2 = self.raw.write(&[]);
        debug_assert_eq!(hs2.len(), HS2_LEN);
        (hs2, Session::new(self.raw))
    }
}

impl std::fmt::Debug for Hs1Read {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Hs1Read")
            .field("counter", &self.counter)
            .finish_non_exhaustive()
    }
}

// --- Transport frames -----------------------------------------------------------------

/// Why `seal` refused a plaintext. Neither uses up a nonce.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FrameError {
    /// Over `MAX_PLAINTEXT` bytes.
    TooLarge,
    /// The send nonce reached `NONCE_CEILING`.
    Ceiling,
}

impl std::fmt::Display for FrameError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            FrameError::TooLarge => "plaintext over 60,000 bytes",
            FrameError::Ceiling => "send nonce at 2^32",
        })
    }
}

impl std::error::Error for FrameError {}

/// What `open` made of a frame body.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Opened {
    /// A new frame: its plaintext.
    Accept(Vec<u8>),
    /// Another session's frame, or a replayed or lower nonce: drop it silently.
    Drop,
    /// A frame for this session that fails: drop it and restart the session.
    Bad,
}

/// One live session: a stateless transport, this side's next send nonce and the last
/// nonce it accepted.
pub struct Session {
    id: [u8; SESSION_ID_LEN],
    transport: RawTransport,
    send_nonce: u64,
    last_recv: Option<u64>,
}

impl Session {
    fn new(raw: RawHandshake) -> Self {
        let hash = raw.handshake_hash();
        let id = hash[..SESSION_ID_LEN].try_into().expect("a 32-byte hash");
        Session {
            id,
            transport: raw.into_transport(),
            send_nonce: 0,
            last_recv: None,
        }
    }

    /// The first 8 bytes of the handshake hash.
    pub fn id(&self) -> [u8; SESSION_ID_LEN] {
        self.id
    }

    /// The nonce the next `seal` uses.
    pub fn send_nonce(&self) -> u64 {
        self.send_nonce
    }

    /// The last nonce `open` accepted, if any.
    pub fn last_recv(&self) -> Option<u64> {
        self.last_recv
    }

    /// Seals a frame body: `session_id || u64be(nonce) || ciphertext`.
    pub fn seal(&mut self, plaintext: &[u8]) -> Result<Vec<u8>, FrameError> {
        if plaintext.len() > MAX_PLAINTEXT {
            return Err(FrameError::TooLarge);
        }
        if self.send_nonce >= NONCE_CEILING {
            return Err(FrameError::Ceiling);
        }
        let nonce = self.send_nonce;
        let mut body = self.id.to_vec();
        body.extend_from_slice(&nonce.to_be_bytes());
        body.extend(self.transport.encrypt(nonce, plaintext));
        self.send_nonce += 1;
        Ok(body)
    }

    /// Opens a frame body. In order: under 8 bytes or another session's id is `Drop`;
    /// this session's id on a body under 32 or over 60,032 bytes is `Bad`; a nonce not
    /// above the last accepted is `Drop`, not decrypted; a nonce of 2^32 or more, or a
    /// failed decrypt, is `Bad`. Last-accepted moves only on `Accept`.
    pub fn open(&mut self, body: &[u8]) -> Opened {
        if body.len() < SESSION_ID_LEN || body[..SESSION_ID_LEN] != self.id {
            return Opened::Drop;
        }
        if !(MIN_FRAME..=MAX_FRAME).contains(&body.len()) {
            return Opened::Bad;
        }
        let nonce = u64::from_be_bytes(
            body[SESSION_ID_LEN..SESSION_ID_LEN + 8]
                .try_into()
                .expect("8 bytes"),
        );
        if self.last_recv.is_some_and(|last| nonce <= last) {
            return Opened::Drop;
        }
        if nonce >= NONCE_CEILING {
            return Opened::Bad;
        }
        match self.transport.decrypt(nonce, &body[SESSION_ID_LEN + 8..]) {
            Some(plain) => {
                self.last_recv = Some(nonce);
                Opened::Accept(plain)
            }
            None => Opened::Bad,
        }
    }

    /// Presets the send nonce and last-accepted. Test-only: vectors and tests.
    #[cfg(test)]
    pub(crate) fn preset(&mut self, send_nonce: u64, last_recv: Option<u64>) {
        self.send_nonce = send_nonce;
        self.last_recv = last_recv;
    }
}

impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session")
            .field("id", &self.id)
            .field("send_nonce", &self.send_nonce)
            .field("last_recv", &self.last_recv)
            .finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Bytes, Routed};

    fn pair() -> (Session, Session) {
        let (phone, mac) = (StaticKeypair::generate(), StaticKeypair::generate());
        let (i_m, i_p) = (Bytes([1; 32]), Bytes([2; 32]));
        let (mut init, hs1) = Initiator::start(&phone, &i_m, &i_p, &mac.public(), 7).unwrap();
        let read = read_hs1(&mac, &i_m, &i_p, &hs1).unwrap();
        assert_eq!(read.counter(), 7);
        let (hs2, m) = read.reply();
        (init.finish(&hs2).unwrap(), m)
    }

    #[test]
    fn a_handshake_with_random_keys_opens_frames_both_ways() {
        let (mut p, mut m) = pair();
        assert_eq!(p.id(), m.id());
        let body = p.seal(b"hello").unwrap();
        assert_eq!(m.open(&body), Opened::Accept(b"hello".to_vec()));
        let body = m.seal(b"back").unwrap();
        assert_eq!(p.open(&body), Opened::Accept(b"back".to_vec()));
    }

    #[test]
    fn nonce_2_pow_32_is_refused_on_send_and_on_receive() {
        let (mut p, mut m) = pair();
        p.preset(NONCE_CEILING - 1, None);
        let last = p.seal(b"x").unwrap();
        assert_eq!(p.seal(b"x"), Err(FrameError::Ceiling));
        assert_eq!(p.send_nonce(), NONCE_CEILING);
        assert_eq!(m.open(&last), Opened::Accept(b"x".to_vec()));
        assert_eq!(m.last_recv(), Some(NONCE_CEILING - 1));

        // A frame at 2^32, sealed under the real key, is still refused.
        let (mut p, mut m) = pair();
        let mut body = p.id().to_vec();
        body.extend_from_slice(&NONCE_CEILING.to_be_bytes());
        body.extend(p.transport.encrypt(NONCE_CEILING, b"x"));
        assert_eq!(m.open(&body), Opened::Bad);
        assert_eq!(m.last_recv(), None);
        p.preset(0, None);
        assert_eq!(
            m.open(&p.seal(b"y").unwrap()),
            Opened::Accept(b"y".to_vec())
        );
    }

    #[test]
    fn a_60001_byte_plaintext_is_refused_and_uses_no_nonce() {
        let (mut p, mut m) = pair();
        assert_eq!(
            p.seal(&vec![0; MAX_PLAINTEXT + 1]),
            Err(FrameError::TooLarge)
        );
        assert_eq!(p.send_nonce(), 0);
        let body = p.seal(&vec![0; MAX_PLAINTEXT]).unwrap();
        assert_eq!(body.len(), MAX_FRAME);
        let envelope = Routed {
            kind: crate::RoutedKind::Frame,
            peer: Bytes([1; 32]),
            body: body.clone(),
        }
        .encode();
        assert!(envelope.len() <= 65_536, "{}", envelope.len());
        assert_eq!(m.open(&body), Opened::Accept(vec![0; MAX_PLAINTEXT]));
    }

    #[test]
    fn a_low_order_mac_static_is_refused_by_start() {
        let phone = StaticKeypair::generate();
        let got = Initiator::start(&phone, &Bytes([1; 32]), &Bytes([2; 32]), &[0; 32], 0);
        assert!(matches!(got, Err(HandshakeError::LowOrder)));
    }

    #[test]
    fn a_counter_above_2_pow_53_minus_1_is_refused_by_start() {
        let (phone, mac) = (StaticKeypair::generate(), StaticKeypair::generate());
        let start =
            |c| Initiator::start(&phone, &Bytes([1; 32]), &Bytes([2; 32]), &mac.public(), c);
        assert!(start(MAX_COUNTER).is_ok());
        assert!(matches!(
            start(MAX_COUNTER + 1),
            Err(HandshakeError::CounterRange)
        ));
    }

    #[test]
    fn finish_after_completion_is_refused() {
        let (phone, mac) = (StaticKeypair::generate(), StaticKeypair::generate());
        let (i_m, i_p) = (Bytes([1; 32]), Bytes([2; 32]));
        let (mut init, hs1) = Initiator::start(&phone, &i_m, &i_p, &mac.public(), 0).unwrap();
        let (hs2, _) = read_hs1(&mac, &i_m, &i_p, &hs1).unwrap().reply();
        assert!(init.finish(&hs2).is_ok());
        assert!(matches!(init.finish(&hs2), Err(HandshakeError::Finished)));
    }

    #[test]
    fn random_bodies_never_panic() {
        let (_, mut m) = pair();
        let id = m.id();
        let mut rng = OsRng;
        for i in 0..2_000 {
            let len = (rng.next_u32() % 200) as usize;
            let mut body = vec![0u8; len];
            rng.fill_bytes(&mut body);
            // Half carry the session's id, so they reach the later checks.
            if i % 2 == 0 && len >= SESSION_ID_LEN {
                body[..SESSION_ID_LEN].copy_from_slice(&id);
            }
            let got = m.open(&body);
            assert_ne!(got, Opened::Accept(vec![]));
            let _ = Routed::parse(&body);
        }
    }
}

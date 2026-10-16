//! Pairing seals: XChaCha20-Poly1305 under a direction's key, the label inside
//! the plaintext. `sealed = nonce(24) || ciphertext || tag(16)`, empty AAD.

use crate::enc::{dec, enc};
use crate::labels::{PAIR_MAC_TO_PHONE_INFO, PAIR_PHONE_TO_MAC_INFO};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use hkdf::Hkdf;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

/// The nonce's length, at the front of every seal.
pub const NONCE_LEN: usize = 24;
/// The Poly1305 tag's length, at the end of every seal.
pub const TAG_LEN: usize = 16;

/// The two pairing keys, each 32 bytes of HKDF-SHA256 output.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PairKeys {
    /// `k_pm`, phone to Mac: `info = PAIR_PHONE_TO_MAC_INFO`.
    pub pm: [u8; 32],
    /// `k_mp`, Mac to phone: `info = PAIR_MAC_TO_PHONE_INFO`.
    pub mp: [u8; 32],
}

/// `k_pm` and `k_mp` from the QR code's secret `s` and its `slot`.
pub fn pair_keys(s: &[u8; 32], slot: &[u8; 16]) -> PairKeys {
    let hk = Hkdf::<Sha256>::new(Some(slot), s);
    let mut keys = PairKeys {
        pm: [0; 32],
        mp: [0; 32],
    };
    hk.expand(PAIR_PHONE_TO_MAC_INFO.as_bytes(), &mut keys.pm)
        .expect("32 bytes is a valid HKDF-SHA256 length");
    hk.expand(PAIR_MAC_TO_PHONE_INFO.as_bytes(), &mut keys.mp)
        .expect("32 bytes is a valid HKDF-SHA256 length");
    keys
}

/// Seals `enc(label, fields)` under `key` with the given nonce. Tests and vectors
/// only; real seals take a random nonce from `seal`.
pub fn seal_with_nonce(
    key: &[u8; 32],
    nonce: &[u8; NONCE_LEN],
    label: &str,
    fields: &[&[u8]],
) -> Vec<u8> {
    let body = XChaCha20Poly1305::new(key.into())
        .encrypt(XNonce::from_slice(nonce), enc(label, fields).as_slice())
        .expect("XChaCha20-Poly1305 seals any message this size");
    let mut out = nonce.to_vec();
    out.extend(body);
    out
}

/// Seals `enc(label, fields)` under `key` with a random 24-byte nonce.
pub fn seal(key: &[u8; 32], label: &str, fields: &[&[u8]]) -> Vec<u8> {
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);
    seal_with_nonce(key, &nonce, label, fields)
}

/// Opens a seal: it must decrypt under `key`, and its plaintext must be
/// `enc(label, ...)` with exactly `n_fields` fields.
pub fn open(key: &[u8; 32], sealed: &[u8], label: &str, n_fields: usize) -> Option<Vec<Vec<u8>>> {
    if sealed.len() < NONCE_LEN + TAG_LEN {
        return None;
    }
    let (nonce, body) = sealed.split_at(NONCE_LEN);
    let plain = XChaCha20Poly1305::new(key.into())
        .decrypt(XNonce::from_slice(nonce), body)
        .ok()?;
    let fields = dec(label, &plain)?;
    if fields.len() != n_fields {
        return None;
    }
    Some(fields.into_iter().map(<[u8]>::to_vec).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::labels::PAIR_COMMIT_LABEL;

    const KEYS: PairKeys = PairKeys {
        pm: [1; 32],
        mp: [2; 32],
    };

    #[test]
    fn a_random_seal_round_trips_with_a_fresh_nonce() {
        let a = seal(&KEYS.pm, PAIR_COMMIT_LABEL, &[b"h"]);
        let b = seal(&KEYS.pm, PAIR_COMMIT_LABEL, &[b"h"]);
        assert_eq!(
            a.len(),
            NONCE_LEN + PAIR_COMMIT_LABEL.len() + 4 + 1 + TAG_LEN
        );
        assert_ne!(a[..NONCE_LEN], b[..NONCE_LEN]);
        assert_eq!(
            open(&KEYS.pm, &a, PAIR_COMMIT_LABEL, 1),
            Some(vec![b"h".to_vec()])
        );
        assert_eq!(
            open(&KEYS.pm, &b, PAIR_COMMIT_LABEL, 1),
            Some(vec![b"h".to_vec()])
        );
    }

    #[test]
    fn the_other_direction_cannot_open() {
        let sealed = seal(&KEYS.pm, PAIR_COMMIT_LABEL, &[b"h"]);
        assert_eq!(open(&KEYS.mp, &sealed, PAIR_COMMIT_LABEL, 1), None);
    }

    #[test]
    fn any_flipped_byte_is_refused() {
        let sealed = seal_with_nonce(&KEYS.pm, &[3; NONCE_LEN], PAIR_COMMIT_LABEL, &[b"h"]);
        for i in 0..sealed.len() {
            let mut bad = sealed.clone();
            bad[i] ^= 0x01;
            assert_eq!(open(&KEYS.pm, &bad, PAIR_COMMIT_LABEL, 1), None, "byte {i}");
        }
    }

    #[test]
    fn short_seals_are_refused() {
        let sealed = seal_with_nonce(&KEYS.pm, &[3; NONCE_LEN], PAIR_COMMIT_LABEL, &[b"h"]);
        for n in 0..sealed.len() {
            assert_eq!(
                open(&KEYS.pm, &sealed[..n], PAIR_COMMIT_LABEL, 1),
                None,
                "length {n}"
            );
        }
        assert_eq!(open(&KEYS.pm, &[0; 39], PAIR_COMMIT_LABEL, 0), None);
    }

    #[test]
    fn the_two_keys_differ() {
        let keys = pair_keys(&[5; 32], &[6; 16]);
        assert_ne!(keys.pm, keys.mp);
        assert_ne!(keys, pair_keys(&[5; 32], &[7; 16]));
    }
}

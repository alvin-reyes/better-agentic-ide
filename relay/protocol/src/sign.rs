//! Ed25519 signatures over `enc(label, fields)`.

use crate::enc::enc;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

/// `Sign(key, enc(label, fields))`. Deterministic.
pub fn sign(key: &SigningKey, label: &str, fields: &[&[u8]]) -> [u8; 64] {
    key.sign(&enc(label, fields)).to_bytes()
}

/// Checks `sig` over `enc(label, fields)` with `verify_strict`: a small-order or
/// non-canonical key, a small-order `R` and `S >= L` are all refused.
pub fn verify(id: &[u8; 32], label: &str, fields: &[&[u8]], sig: &[u8; 64]) -> bool {
    let Ok(key) = VerifyingKey::from_bytes(id) else {
        return false;
    };
    key.verify_strict(&enc(label, fields), &Signature::from_bytes(sig))
        .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_signature_checks_only_over_its_own_fields() {
        let key = SigningKey::from_bytes(&[1; 32]);
        let id = key.verifying_key().to_bytes();
        let sig = sign(&key, "ade-remote/v1/login", &[b"a", b"b"]);
        assert!(verify(&id, "ade-remote/v1/login", &[b"a", b"b"], &sig));
        assert!(!verify(&id, "ade-remote/v1/login", &[b"ab"], &sig));
        let mut bad = sig;
        bad[0] ^= 1;
        assert!(!verify(&id, "ade-remote/v1/login", &[b"a", b"b"], &bad));
    }

    #[test]
    fn a_key_that_is_no_point_is_refused() {
        // y = 2 is not on the curve.
        let mut id = [0u8; 32];
        id[0] = 2;
        assert!(!verify(&id, "l", &[], &[0; 64]));
    }
}

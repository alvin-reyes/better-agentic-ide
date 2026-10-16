//! Ed25519 signatures over `enc(label, fields)`.

use crate::enc::enc;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};

/// `Sign(key, enc(label, fields))`. Deterministic.
pub fn sign(key: &SigningKey, label: &str, fields: &[&[u8]]) -> [u8; 64] {
    key.sign(&enc(label, fields)).to_bytes()
}

/// Checks `sig` over `enc(label, fields)`. Refused: an `id` that is no point, or
/// whose point doesn't compress back to the same 32 bytes (a non-canonical
/// encoding, such as y >= p); then, by `verify_strict`, a small-order `id` or `R`,
/// an `R` that doesn't decode or isn't canonical, and `S >= L`.
pub fn verify(id: &[u8; 32], label: &str, fields: &[&[u8]], sig: &[u8; 64]) -> bool {
    let Some(key) = canonical_key(id) else {
        return false;
    };
    key.verify_strict(&enc(label, fields), &Signature::from_bytes(sig))
        .is_ok()
}

/// The key, only if `id` is its canonical encoding. dalek decodes y >= p as
/// y - p; noble's `zip215: false` refuses it, and so does this.
fn canonical_key(id: &[u8; 32]) -> Option<VerifyingKey> {
    let key = VerifyingKey::from_bytes(id).ok()?;
    (key.to_edwards().compress().to_bytes() == *id).then_some(key)
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

    /// y = p + 3, little-endian: the point with y = 3 (large order), encoded non-canonically.
    fn y_is_p_plus_3() -> [u8; 32] {
        let mut id = [0xff; 32];
        id[0] = 0xf0;
        id[31] = 0x7f;
        id
    }

    #[test]
    fn a_non_canonical_key_is_refused_by_the_canonical_check() {
        // dalek alone decodes it (to the point with y = 3), so the check is what refuses it.
        let lax = VerifyingKey::from_bytes(&y_is_p_plus_3()).expect("dalek decodes y >= p");
        let mut three = [0u8; 32];
        three[0] = 3;
        assert_eq!(lax.to_edwards().compress().to_bytes(), three);
        assert!(canonical_key(&y_is_p_plus_3()).is_none());
        assert!(canonical_key(&three).is_some());
        assert!(!verify(&y_is_p_plus_3(), "l", &[], &[0; 64]));
    }

    #[test]
    fn a_key_that_is_no_point_is_refused() {
        // y = 2 is not on the curve.
        let mut id = [0u8; 32];
        id[0] = 2;
        assert!(!verify(&id, "l", &[], &[0; 64]));
    }
}

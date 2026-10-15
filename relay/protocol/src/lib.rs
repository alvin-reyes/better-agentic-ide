//! Wire encodings, labels, pairing seals and Noise wiring for ADE's phone remote.

/// The Noise pattern the phone and the Mac speak.
pub const NOISE_PATTERN: &str = "Noise_IK_25519_ChaChaPoly_SHA256";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_noise_pattern() {
        assert_eq!(NOISE_PATTERN, "Noise_IK_25519_ChaChaPoly_SHA256");
    }
}

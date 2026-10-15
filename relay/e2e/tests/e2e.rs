//! The end-to-end test. Story 2 replaces the placeholder with login and presence.

#[test]
fn e2e_placeholder() {
    assert_eq!(
        relay_core::noise_pattern(),
        "Noise_IK_25519_ChaChaPoly_SHA256"
    );
}

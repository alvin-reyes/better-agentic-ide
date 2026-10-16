//! The labels: every `enc` label and HKDF `info` string the protocol uses. Each
//! starts with `ade-remote/v1/`, and no two are equal.

/// Signs a login: `enc(LOGIN_LABEL, c, host, role)`.
pub const LOGIN_LABEL: &str = "ade-remote/v1/login";
/// Reserved for the Noise session (story 4). Nothing uses it yet.
pub const NOISE_LABEL: &str = "ade-remote/v1/noise";
/// HKDF `info` for `k_pm`, the phone-to-Mac pairing key. Not an `enc` label.
pub const PAIR_PHONE_TO_MAC_INFO: &str = "ade-remote/v1/pair/phone-to-mac";
/// HKDF `info` for `k_mp`, the Mac-to-phone pairing key. Not an `enc` label.
pub const PAIR_MAC_TO_PHONE_INFO: &str = "ade-remote/v1/pair/mac-to-phone";
/// Seals `pair_commit`: `enc(PAIR_COMMIT_LABEL, H)`.
pub const PAIR_COMMIT_LABEL: &str = "ade-remote/v1/pair/commit";
/// Hashed into `H`: `enc(PAIR_COMMIT_HASH_LABEL, I_P, S_P, name, N_P)`.
pub const PAIR_COMMIT_HASH_LABEL: &str = "ade-remote/v1/pair/commit-hash";
/// Seals `pair_nonce`: `enc(PAIR_NONCE_LABEL, N_M)`.
pub const PAIR_NONCE_LABEL: &str = "ade-remote/v1/pair/nonce";
/// Seals `pair_reveal`: `enc(PAIR_REVEAL_LABEL, I_P, S_P, name, N_P, sig_P)`.
pub const PAIR_REVEAL_LABEL: &str = "ade-remote/v1/pair/reveal";
/// Signs `sig_P`: `enc(PAIR_PHONE_SIG_LABEL, slot, I_M, S_M, I_P, S_P)`.
pub const PAIR_PHONE_SIG_LABEL: &str = "ade-remote/v1/pair/phone-sig";
/// Hashed into the 6-digit code.
pub const PAIR_SAS_LABEL: &str = "ade-remote/v1/pair/sas";
/// The pair record `R`, signed by the Mac.
pub const PAIR_RECORD_LABEL: &str = "ade-remote/v1/pair/record";

/// All eleven, in the order `labels.json` lists them.
pub const ALL_LABELS: [&str; 11] = [
    LOGIN_LABEL,
    NOISE_LABEL,
    PAIR_PHONE_TO_MAC_INFO,
    PAIR_MAC_TO_PHONE_INFO,
    PAIR_COMMIT_LABEL,
    PAIR_COMMIT_HASH_LABEL,
    PAIR_NONCE_LABEL,
    PAIR_REVEAL_LABEL,
    PAIR_PHONE_SIG_LABEL,
    PAIR_SAS_LABEL,
    PAIR_RECORD_LABEL,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_are_distinct_and_versioned() {
        for (i, a) in ALL_LABELS.iter().enumerate() {
            assert!(a.starts_with("ade-remote/v1/"), "{a}");
            assert!(a.is_ascii());
            for b in &ALL_LABELS[i + 1..] {
                assert_ne!(a, b);
            }
        }
    }
}

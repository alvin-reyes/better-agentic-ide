// The labels: every enc label and HKDF info string the protocol uses. Each starts
// with "ade-remote/v1/", and no two are equal. The same table as
// relay_protocol's labels and vectors/labels.json.

/** Signs a login: `enc(LOGIN_LABEL, c, host, role)`. */
export const LOGIN_LABEL = "ade-remote/v1/login";
/** Reserved for the Noise session (story 4). Nothing uses it yet. */
export const NOISE_LABEL = "ade-remote/v1/noise";
/** HKDF info for `k_pm`, the phone-to-Mac pairing key. Not an enc label. */
export const PAIR_PHONE_TO_MAC_INFO = "ade-remote/v1/pair/phone-to-mac";
/** HKDF info for `k_mp`, the Mac-to-phone pairing key. Not an enc label. */
export const PAIR_MAC_TO_PHONE_INFO = "ade-remote/v1/pair/mac-to-phone";
/** Seals `pair_commit`: `enc(PAIR_COMMIT_LABEL, H)`. */
export const PAIR_COMMIT_LABEL = "ade-remote/v1/pair/commit";
/** Hashed into `H`: `enc(PAIR_COMMIT_HASH_LABEL, I_P, S_P, name, N_P)`. */
export const PAIR_COMMIT_HASH_LABEL = "ade-remote/v1/pair/commit-hash";
/** Seals `pair_nonce`: `enc(PAIR_NONCE_LABEL, N_M)`. */
export const PAIR_NONCE_LABEL = "ade-remote/v1/pair/nonce";
/** Seals `pair_reveal`: `enc(PAIR_REVEAL_LABEL, I_P, S_P, name, N_P, sig_P)`. */
export const PAIR_REVEAL_LABEL = "ade-remote/v1/pair/reveal";
/** Signs `sig_P`: `enc(PAIR_PHONE_SIG_LABEL, slot, I_M, S_M, I_P, S_P)`. */
export const PAIR_PHONE_SIG_LABEL = "ade-remote/v1/pair/phone-sig";
/** Hashed into the 6-digit code. */
export const PAIR_SAS_LABEL = "ade-remote/v1/pair/sas";
/** The pair record `R`, signed by the Mac. */
export const PAIR_RECORD_LABEL = "ade-remote/v1/pair/record";

/** All eleven, in the order vectors/labels.json lists them. */
export const ALL_LABELS = [
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
] as const;

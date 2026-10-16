// Pairing seals: XChaCha20-Poly1305 under a direction's key, the label inside the
// plaintext. sealed = nonce(24) || ciphertext || tag(16), empty AAD.
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes, expectLength, randomBytes, utf8Encode } from "./bytes";
import { dec, enc } from "./enc";
import { PAIR_MAC_TO_PHONE_INFO, PAIR_PHONE_TO_MAC_INFO } from "./labels";

/** The nonce's length, at the front of every seal. */
export const NONCE_LEN = 24;
/** The Poly1305 tag's length, at the end of every seal. */
export const TAG_LEN = 16;

/** The two pairing keys, each 32 bytes of HKDF-SHA256 output. */
export interface PairKeys {
  /** `k_pm`, phone to Mac. */
  pm: Uint8Array;
  /** `k_mp`, Mac to phone. */
  mp: Uint8Array;
}

/** `k_pm` and `k_mp` from the QR code's 32-byte secret `s` and its 16-byte `slot`.
 *  Throws a RangeError on any other length. */
export function pairKeys(s: Uint8Array, slot: Uint8Array): PairKeys {
  expectLength(s, 32, "s");
  expectLength(slot, 16, "slot");
  return {
    pm: hkdf(sha256, s, slot, utf8Encode(PAIR_PHONE_TO_MAC_INFO), 32),
    mp: hkdf(sha256, s, slot, utf8Encode(PAIR_MAC_TO_PHONE_INFO), 32),
  };
}

/** Seals `enc(label, fields)` under `key` with the given nonce. Not exported from
 *  the package: only `seal` (with a random nonce) and the tests call it. */
export function sealWithNonce(key: Uint8Array, nonce: Uint8Array, label: string, fields: Uint8Array[]): Uint8Array {
  return concatBytes(nonce, xchacha20poly1305(key, nonce).encrypt(enc(label, fields)));
}

/** Seals `enc(label, fields)` under `key` with a random 24-byte nonce. */
export function seal(key: Uint8Array, label: string, fields: Uint8Array[]): Uint8Array {
  return sealWithNonce(key, randomBytes(NONCE_LEN), label, fields);
}

/** Opens a seal: it must decrypt under `key`, and its plaintext must be
 *  `enc(label, ...)` with exactly `nFields` fields. Null otherwise. */
export function open(key: Uint8Array, sealed: Uint8Array, label: string, nFields: number): Uint8Array[] | null {
  if (sealed.length < NONCE_LEN + TAG_LEN) return null;
  let plain: Uint8Array;
  try {
    plain = xchacha20poly1305(key, sealed.subarray(0, NONCE_LEN)).decrypt(sealed.subarray(NONCE_LEN));
  } catch {
    return null;
  }
  const fields = dec(label, plain);
  return fields && fields.length === nFields ? fields : null;
}

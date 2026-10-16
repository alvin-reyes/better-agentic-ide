// Ed25519 signatures over enc(label, fields).
import { ed25519 } from "@noble/curves/ed25519";
import { enc } from "./enc";

/** `Sign(seed, enc(label, fields))`, with the 32-byte Ed25519 seed. Deterministic. */
export function sign(seed: Uint8Array, label: string, fields: Uint8Array[]): Uint8Array {
  return ed25519.sign(enc(label, fields), seed);
}

/** Checks `sig` over `enc(label, fields)` with `zip215: false` (RFC 8032 strict):
 *  a small-order or non-canonical key and `S >= L` are refused, as Rust's
 *  verify_strict refuses them. */
export function verify(id: Uint8Array, label: string, fields: Uint8Array[], sig: Uint8Array): boolean {
  try {
    return ed25519.verify(sig, enc(label, fields), id, { zip215: false });
  } catch {
    return false;
  }
}

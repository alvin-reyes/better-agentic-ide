// The 6-digit code both sides show (pairing step 7).
import { sha256 } from "@noble/hashes/sha2";
import { enc } from "./enc";
import { PAIR_SAS_LABEL } from "./labels";

/** Everything the code is computed over, in enc order. */
export interface SasInputs {
  slot: Uint8Array;
  iM: Uint8Array;
  sM: Uint8Array;
  iP: Uint8Array;
  sP: Uint8Array;
  nM: Uint8Array;
  nP: Uint8Array;
  s: Uint8Array;
}

/** `SHA-256(enc(PAIR_SAS_LABEL, slot, I_M, S_M, I_P, S_P, N_M, N_P, s))`, its first
 *  8 bytes a big-endian u64, modulo 10^6, as 6 digits. No BigInt (Hermes-safe):
 *  with hi and lo the u32 halves, ((hi % 1e6) * (2^32 % 1e6) + lo) % 1e6. */
export function sasCode(i: SasInputs): string {
  const d = sha256(enc(PAIR_SAS_LABEL, [i.slot, i.iM, i.sM, i.iP, i.sP, i.nM, i.nP, i.s]));
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const code = ((hi % 1e6) * 967296 + lo) % 1e6;
  return String(code).padStart(6, "0");
}

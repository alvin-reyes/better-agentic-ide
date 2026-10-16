// ADE's phone-remote protocol. Randomness comes only from
// globalThis.crypto.getRandomValues; this package never imports a polyfill.
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";

/** The Noise pattern the phone and the Mac speak. */
export const NOISE_PATTERN = "Noise_IK_25519_ChaChaPoly_SHA256";

/** The primitives NOISE_PATTERN names, taken from the @noble peer dependencies. */
export const suite = { dh: x25519, cipher: chacha20poly1305, hash: sha256 } as const;

export * from "./bytes";
export * from "./enc";
export * from "./labels";
export * from "./names";
export * from "./qr";
export * from "./sas";
export * from "./seal";
export * from "./sign";

// ADE's phone-remote protocol. Randomness comes only from
// globalThis.crypto.getRandomValues; this package never imports a polyfill.
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";

/** The primitives NOISE_PATTERN names, taken from the @noble peer dependencies. */
export const suite = { dh: x25519, cipher: chacha20poly1305, hash: sha256 } as const;

export * from "./bytes";
export * from "./enc";
export {
  MAX_PLAINTEXT,
  NONCE_CEILING,
  SESSION_ID_LEN,
  encodeRouted,
  parseRouted,
  type Opened,
  type Routed,
  type RoutedKind,
  type Session,
} from "./frame";
export * from "./labels";
export * from "./names";
export {
  HS1_LEN,
  HS2_LEN,
  MAX_COUNTER,
  NOISE_PATTERN,
  generateStaticKeypair,
  noisePrologue,
  startHandshake,
  staticFromSecret,
  type Initiator,
  type StaticKeypair,
} from "./noise";
export * from "./qr";
export * from "./sas";
export { NONCE_LEN, TAG_LEN, open, pairKeys, seal, type PairKeys } from "./seal";
export {
  CounterAllocator,
  HANGING_MS,
  MAX_OUTSTANDING,
  MAX_SESSION_AGE_MS,
  OUTSTANDING_TTL_MS,
  PhoneSession,
  RESTART_WINDOW_MS,
  RETRY_MS,
  memoryLastSentStore,
  nextCounterValue,
  type LastSentStore,
  type PhoneAction,
  type Trigger,
} from "./session";
export * from "./sign";

// Transport frames and the binary envelope. A frame body is
// session_id(8) || u64be(nonce) || ciphertext, the ciphertext ChaCha20-Poly1305 under
// the direction's key with the Noise nonce 0x00000000 || u64le(nonce) and empty AAD.
// Nonces are numbers below 2^32, written and read as two u32 halves: no BigInt, so it
// runs the same on Hermes.
import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { concatBytes, expectLength } from "./bytes";

/** The session id: the first 8 bytes of the handshake hash. */
export const SESSION_ID_LEN = 8;
/** The largest plaintext a frame carries. */
export const MAX_PLAINTEXT = 60000;
/** Nonces are below this on both sides; a sender never uses it. */
export const NONCE_CEILING = 2 ** 32;

const TAG_LEN = 16;
/** The smallest frame body: session id, nonce and an empty plaintext's tag. */
const MIN_FRAME = SESSION_ID_LEN + 8 + TAG_LEN;
/** The largest frame body: a full plaintext's. */
const MAX_FRAME = MIN_FRAME + MAX_PLAINTEXT;

/** Eight big-endian bytes of a safe non-negative integer, as two u32 halves. */
export function u64be(n: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(n / 2 ** 32));
  view.setUint32(4, n % 2 ** 32);
  return out;
}

/** The Noise ChaChaPoly nonce: four zero bytes, then the counter little-endian. */
function noiseNonce(n: number): Uint8Array {
  const out = new Uint8Array(12);
  const view = new DataView(out.buffer);
  view.setUint32(4, n % 2 ** 32, true);
  view.setUint32(8, Math.floor(n / 2 ** 32), true);
  return out;
}

/** A Noise CipherState whose nonce the caller passes explicitly. */
export class CipherState {
  private readonly key: Uint8Array;

  constructor(key: Uint8Array) {
    expectLength(key, 32, "cipher key");
    this.key = key.slice();
  }

  encrypt(n: number, ad: Uint8Array, plaintext: Uint8Array): Uint8Array {
    return chacha20poly1305(this.key, noiseNonce(n), ad).encrypt(plaintext);
  }

  /** The plaintext, or null if the tag doesn't check. */
  decrypt(n: number, ad: Uint8Array, ciphertext: Uint8Array): Uint8Array | null {
    if (ciphertext.length < TAG_LEN) return null;
    try {
      return chacha20poly1305(this.key, noiseNonce(n), ad).decrypt(ciphertext);
    } catch {
      return null;
    }
  }
}

/** What `open` made of a frame body. */
export type Opened = { kind: "accept"; plaintext: Uint8Array } | { kind: "drop" } | { kind: "bad" };

/** One live session. Its state is private; it comes only from a completed handshake. */
export interface Session {
  /** The first 8 bytes of the handshake hash. */
  readonly id: Uint8Array;
  /** The nonce the next `seal` uses. */
  readonly sendNonce: number;
  /** The last nonce `open` accepted, or null. */
  readonly lastRecv: number | null;
  /** Seals a frame body. Throws a RangeError over 60,000 bytes; at the nonce ceiling
   *  it refuses with `ceiling`. Neither uses up a nonce. */
  seal(plaintext: Uint8Array): { ok: true; body: Uint8Array } | { ok: false; error: "ceiling" };
  /** Opens a frame body. In order: under 8 bytes or another session's id is `drop`;
   *  this session's id on a body under 32 or over 60,032 bytes is `bad`; a nonce not
   *  above the last accepted is `drop`, not decrypted; a nonce of 2^32 or more, or a
   *  failed decrypt, is `bad`. Last-accepted moves only on `accept`. Never throws. */
  open(body: Uint8Array): Opened;
}

const presets = new WeakMap<Session, (sendNonce: number, lastRecv: number | null) => void>();

/** A session from a completed handshake. Not exported from the package. */
export function createSession(id: Uint8Array, sendKey: Uint8Array, recvKey: Uint8Array): Session {
  expectLength(id, SESSION_ID_LEN, "session id");
  const sid = id.slice();
  const send = new CipherState(sendKey);
  const recv = new CipherState(recvKey);
  const none = new Uint8Array(0);
  let sendNonce = 0;
  let lastRecv: number | null = null;

  const session: Session = {
    get id() {
      return sid.slice();
    },
    get sendNonce() {
      return sendNonce;
    },
    get lastRecv() {
      return lastRecv;
    },
    seal(plaintext) {
      if (plaintext.length > MAX_PLAINTEXT) {
        throw new RangeError(`a plaintext is at most ${MAX_PLAINTEXT} bytes, not ${plaintext.length}`);
      }
      if (sendNonce >= NONCE_CEILING) return { ok: false, error: "ceiling" };
      const nonce = sendNonce;
      const body = concatBytes(sid, u64be(nonce), send.encrypt(nonce, none, plaintext));
      sendNonce = nonce + 1;
      return { ok: true, body };
    },
    open(body) {
      if (body.length < SESSION_ID_LEN) return { kind: "drop" };
      for (let i = 0; i < SESSION_ID_LEN; i++) if (body[i] !== sid[i]) return { kind: "drop" };
      if (body.length < MIN_FRAME || body.length > MAX_FRAME) return { kind: "bad" };
      const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
      const hi = view.getUint32(SESSION_ID_LEN);
      const lo = view.getUint32(SESSION_ID_LEN + 4);
      // hi > 0 is a nonce of 2^32 or more, which is above any last-accepted.
      if (hi === 0 && lastRecv !== null && lo <= lastRecv) return { kind: "drop" };
      if (hi !== 0) return { kind: "bad" };
      const plaintext = recv.decrypt(lo, none, body.subarray(SESSION_ID_LEN + 8));
      if (!plaintext) return { kind: "bad" };
      lastRecv = lo;
      return { kind: "accept", plaintext };
    },
  };
  presets.set(session, (s, r) => {
    sendNonce = s;
    lastRecv = r;
  });
  return session;
}

/** Presets a session's send nonce and last-accepted. Test hook: not exported from the
 *  package. */
export function presetNonces(session: Session, sendNonce: number, lastRecv: number | null): void {
  const set = presets.get(session);
  if (!set) throw new Error("not a session");
  set(sendNonce, lastRecv);
}

// --- The binary envelope ------------------------------------------------------------

/** The envelope's type byte: 1 hs1, 2 hs2, 3 frame. */
export type RoutedKind = 1 | 2 | 3;

/** One binary WebSocket message: `u8 type || 32-byte peer identity key || body`. The
 *  peer is the recipient when a device sends, and the sender when the relay delivers. */
export interface Routed {
  kind: RoutedKind;
  peer: Uint8Array;
  body: Uint8Array;
}

const HEADER_LEN = 33;

/** The envelope's bytes. Throws a RangeError for a peer that isn't 32 bytes or a kind
 *  other than 1, 2, 3. */
export function encodeRouted(routed: Routed): Uint8Array {
  expectLength(routed.peer, 32, "peer");
  if (routed.kind !== 1 && routed.kind !== 2 && routed.kind !== 3) {
    throw new RangeError(`envelope kind must be 1, 2 or 3, not ${routed.kind}`);
  }
  return concatBytes(Uint8Array.of(routed.kind), routed.peer, routed.body);
}

/** Reads an envelope: null under 33 bytes or for a type other than 1, 2, 3. */
export function parseRouted(bytes: Uint8Array): Routed | null {
  if (bytes.length < HEADER_LEN) return null;
  const kind = bytes[0];
  if (kind !== 1 && kind !== 2 && kind !== 3) return null;
  return { kind, peer: bytes.slice(1, HEADER_LEN), body: bytes.slice(HEADER_LEN) };
}

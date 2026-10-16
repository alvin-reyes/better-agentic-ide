// Noise_IK_25519_ChaChaPoly_SHA256, hand-rolled on the @noble peers, with the phone
// as initiator. The prologue is enc(NOISE_LABEL, I_M, I_P); hs1's payload is an
// 8-byte big-endian counter and hs2's is empty. Pinned to cacophony's IK vector, the
// node:crypto oracle in vectors/generate.mjs, and the same vectors as Rust's snow.
import { x25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { concatBytes, expectLength, fromHex, randomBytes, utf8Encode } from "./bytes";
import { enc } from "./enc";
import { CipherState, createSession, u64be, type Session } from "./frame";
import { NOISE_LABEL } from "./labels";

/** The Noise pattern the phone and the Mac speak. */
export const NOISE_PATTERN = "Noise_IK_25519_ChaChaPoly_SHA256";
/** Bytes on the wire for one hs1: e(32) || s(32+16) || counter(8+16). */
export const HS1_LEN = 104;
/** Bytes on the wire for one hs2: e(32) || tag(16), an empty payload. */
export const HS2_LEN = 48;
/** The largest hs1 counter, 2^53 - 1, so no BigInt is needed. */
export const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

const TAG_LEN = 16;
const EMPTY = new Uint8Array(0);

/** A device's static X25519 key S. */
export interface StaticKeypair {
  secret: Uint8Array;
  public: Uint8Array;
}

/** The key whose 32-byte secret is `secret` (clamped when used, as X25519 does). */
export function staticFromSecret(secret: Uint8Array): StaticKeypair {
  expectLength(secret, 32, "static secret");
  return { secret: secret.slice(), public: x25519.getPublicKey(secret) };
}

/** A fresh static key from globalThis.crypto.getRandomValues. */
export function generateStaticKeypair(): StaticKeypair {
  return staticFromSecret(randomBytes(32));
}

/** The prologue both sides mix in: enc(NOISE_LABEL, I_M, I_P). */
export function noisePrologue(iM: Uint8Array, iP: Uint8Array): Uint8Array {
  expectLength(iM, 32, "I_M");
  expectLength(iP, 32, "I_P");
  return enc(NOISE_LABEL, [iM, iP]);
}

// --- The low-order rule -------------------------------------------------------------
//
// A remote key is refused when X25519 of it with the local secret is all zeros. For
// every clamped secret that is exactly the u-values of order dividing 8: 0, 1, p-1 and
// the two order-8 points, in any encoding (the top bit masked, and p or p+1 for 0 or 1).
// It is checked here explicitly, never by catching noble's throw.

const LOW_ORDER = [
  "0000000000000000000000000000000000000000000000000000000000000000",
  "0100000000000000000000000000000000000000000000000000000000000000",
  "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
  "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
  "5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157",
].map(fromHex);

/** Whether `u` (32 bytes) is a low-order X25519 key, by the rule above. Not exported
 *  from the package. */
export function isLowOrder(u: Uint8Array): boolean {
  expectLength(u, 32, "X25519 key");
  const v = u.slice();
  v[31] &= 0x7f;
  // Reduce mod p = 2^255 - 19: a masked value at or above p is p + (0..18).
  let atLeastP = v[31] === 0x7f && v[0] >= 0xed;
  for (let i = 1; atLeastP && i < 31; i++) atLeastP = v[i] === 0xff;
  if (atLeastP) {
    v.fill(0);
    v[0] = u[0] - 0xed;
  }
  return LOW_ORDER.some((w) => w.every((b, i) => b === v[i]));
}

// --- The symmetric state ----------------------------------------------------------------

/** Noise's HKDF with two outputs. */
function hkdf2(ck: Uint8Array, ikm: Uint8Array): [Uint8Array, Uint8Array] {
  const temp = hmac(sha256, ck, ikm);
  const one = hmac(sha256, temp, Uint8Array.of(1));
  return [one, hmac(sha256, temp, concatBytes(one, Uint8Array.of(2)))];
}

class SymmetricState {
  h: Uint8Array;
  ck: Uint8Array;
  k: CipherState | null = null;
  n = 0;

  constructor(prologue?: Uint8Array) {
    // The protocol name is exactly 32 bytes, so h starts as the name itself.
    this.h = utf8Encode(NOISE_PATTERN);
    this.ck = this.h;
    if (prologue) this.mixHash(prologue);
  }

  clone(): SymmetricState {
    const s = new SymmetricState();
    s.h = this.h;
    s.ck = this.ck;
    s.k = this.k;
    s.n = this.n;
    return s;
  }

  mixHash(data: Uint8Array): void {
    this.h = sha256(concatBytes(this.h, data));
  }

  mixKey(ikm: Uint8Array): void {
    const [ck, k] = hkdf2(this.ck, ikm);
    this.ck = ck;
    this.k = new CipherState(k);
    this.n = 0;
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const c = this.k ? this.k.encrypt(this.n++, this.h, plaintext) : plaintext.slice();
    this.mixHash(c);
    return c;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array | null {
    let p: Uint8Array | null = ciphertext.slice();
    if (this.k) {
      p = this.k.decrypt(this.n, this.h, ciphertext);
      if (!p) return null;
      this.n++;
    }
    this.mixHash(ciphertext);
    return p;
  }

  split(): [Uint8Array, Uint8Array] {
    return hkdf2(this.ck, EMPTY);
  }
}

// --- The raw layer ----------------------------------------------------------------------

/** The two directions' keys, initiator to responder first. */
export interface Transport {
  encrypt(nonce: number, plaintext: Uint8Array): Uint8Array;
  decrypt(nonce: number, ciphertext: Uint8Array): Uint8Array | null;
}

/** An IK handshake with any prologue and payloads. Not exported from the package: the
 *  wrappers below and the cacophony test drive it. */
export interface RawHandshake {
  /** Writes the next message carrying `payload`. */
  write(payload: Uint8Array): Uint8Array;
  /** Reads the next message, returning its payload, or null; a failed read leaves the
   *  handshake as it was. A low-order remote e or s fails it. */
  read(message: Uint8Array): Uint8Array | null;
  handshakeHash(): Uint8Array;
  remoteStatic(): Uint8Array | null;
  /** The send and receive keys, once both messages have passed. */
  keys(): { send: Uint8Array; recv: Uint8Array };
  transport(): Transport;
}

export interface RawOptions {
  initiator: boolean;
  prologue: Uint8Array;
  localSecret: Uint8Array;
  /** The responder's static: required of the initiator. */
  remoteStatic?: Uint8Array;
  /** A fixed ephemeral secret, for vectors only. */
  fixedEphemeral?: Uint8Array;
}

export function handshakeRaw(o: RawOptions): RawHandshake {
  const s = staticFromSecret(o.localSecret);
  const e = staticFromSecret(o.fixedEphemeral ?? randomBytes(32));
  let rs: Uint8Array | null = null;
  let re: Uint8Array | null = null;
  let sym = new SymmetricState(o.prologue);
  if (o.initiator) {
    if (!o.remoteStatic) throw new Error("an initiator needs the responder's static");
    expectLength(o.remoteStatic, 32, "remote static");
    rs = o.remoteStatic.slice();
    sym.mixHash(rs);
  } else {
    sym.mixHash(s.public);
  }
  let step = 0;
  const dh = (secret: Uint8Array, pub: Uint8Array) => x25519.getSharedSecret(secret, pub);

  const write = (payload: Uint8Array): Uint8Array => {
    if (step === 0 && o.initiator) {
      // -> e, es, s, ss
      sym.mixHash(e.public);
      sym.mixKey(dh(e.secret, rs!));
      const sCt = sym.encryptAndHash(s.public);
      sym.mixKey(dh(s.secret, rs!));
      step = 1;
      return concatBytes(e.public, sCt, sym.encryptAndHash(payload));
    }
    if (step === 1 && !o.initiator) {
      // <- e, ee, se
      sym.mixHash(e.public);
      sym.mixKey(dh(e.secret, re!));
      sym.mixKey(dh(e.secret, rs!));
      step = 2;
      return concatBytes(e.public, sym.encryptAndHash(payload));
    }
    throw new Error("not this side's turn to write");
  };

  const read = (message: Uint8Array): Uint8Array | null => {
    const next = sym.clone();
    if (step === 0 && !o.initiator) {
      if (message.length < 32 + 32 + TAG_LEN + TAG_LEN) return null;
      const remoteE = message.slice(0, 32);
      if (isLowOrder(remoteE)) return null;
      next.mixHash(remoteE);
      next.mixKey(dh(s.secret, remoteE));
      const remoteS = next.decryptAndHash(message.subarray(32, 80));
      if (!remoteS || isLowOrder(remoteS)) return null;
      next.mixKey(dh(s.secret, remoteS));
      const payload = next.decryptAndHash(message.subarray(80));
      if (!payload) return null;
      [sym, re, rs, step] = [next, remoteE, remoteS, 1];
      return payload;
    }
    if (step === 1 && o.initiator) {
      if (message.length < 32 + TAG_LEN) return null;
      const remoteE = message.slice(0, 32);
      if (isLowOrder(remoteE)) return null;
      next.mixHash(remoteE);
      next.mixKey(dh(e.secret, remoteE));
      next.mixKey(dh(s.secret, remoteE));
      const payload = next.decryptAndHash(message.subarray(32));
      if (!payload) return null;
      [sym, re, step] = [next, remoteE, 2];
      return payload;
    }
    return null;
  };

  const keys = () => {
    if (step !== 2) throw new Error("the handshake is not finished");
    const [k1, k2] = sym.split();
    return o.initiator ? { send: k1, recv: k2 } : { send: k2, recv: k1 };
  };

  return {
    write,
    read,
    handshakeHash: () => sym.h.slice(),
    remoteStatic: () => rs && rs.slice(),
    keys,
    transport() {
      const k = keys();
      const send = new CipherState(k.send);
      const recv = new CipherState(k.recv);
      return {
        encrypt: (n, p) => send.encrypt(n, EMPTY, p),
        decrypt: (n, c) => recv.decrypt(n, EMPTY, c),
      };
    },
  };
}

function sessionOf(raw: RawHandshake): Session {
  const k = raw.keys();
  return createSession(raw.handshakeHash().subarray(0, 8), k.send, k.recv);
}

function checkCounter(counter: number): void {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError(`a counter is an integer from 0 to 2^53 - 1, not ${counter}`);
  }
}

// --- The phone side ---------------------------------------------------------------------

/** The phone's half of one handshake, between hs1 and hs2. */
export interface Initiator {
  /** The 104-byte hs1 to send. */
  readonly hs1: Uint8Array;
  /** The counter hs1 carries. */
  readonly counter: number;
  /** Reads hs2: a Session, or null for anything but the right 48 bytes (a low-order e,
   *  another handshake's, tampered); the handshake stays usable after a null. */
  finish(hs2: Uint8Array): Session | null;
}

/** Starts a handshake to the Mac `iM` whose static is `macStatic`. Throws a RangeError
 *  for a wrong-length key or a counter outside 0..2^53-1, and an Error for a low-order
 *  Mac static. */
export function startHandshake(
  own: StaticKeypair,
  iM: Uint8Array,
  iP: Uint8Array,
  macStatic: Uint8Array,
  counter: number,
): Initiator {
  return startHandshakeWith(own, iM, iP, macStatic, counter);
}

/** `startHandshake` with a fixed ephemeral secret. Test hook: not exported from the
 *  package. */
export function startHandshakeWith(
  own: StaticKeypair,
  iM: Uint8Array,
  iP: Uint8Array,
  macStatic: Uint8Array,
  counter: number,
  fixedEphemeral?: Uint8Array,
): Initiator {
  expectLength(own.secret, 32, "static secret");
  expectLength(macStatic, 32, "Mac static");
  checkCounter(counter);
  const prologue = noisePrologue(iM, iP);
  if (isLowOrder(macStatic)) throw new Error("low-order Mac static");
  const raw = handshakeRaw({ initiator: true, prologue, localSecret: own.secret, remoteStatic: macStatic, fixedEphemeral });
  const hs1 = raw.write(u64be(counter));
  let done = false;
  return {
    hs1,
    counter,
    finish(hs2) {
      if (done || hs2.length !== HS2_LEN) return null;
      // The 48-byte length means an empty payload; read checks the low-order e first.
      if (!raw.read(hs2)) return null;
      done = true;
      return sessionOf(raw);
    },
  };
}

// --- The Mac side (the TypeScript responder, for tests only) ----------------------------

/** An hs1 that decrypted, before the Mac's own checks. */
export interface Hs1Read {
  readonly remoteStatic: Uint8Array;
  readonly counter: number;
  reply(): { hs2: Uint8Array; session: Session; handshakeHash: Uint8Array };
}

/** Reads an hs1 from `senderIP`: null for any length but 104, a low-order e or s, a
 *  message that doesn't decrypt, or a counter above 2^53 - 1. Not exported from the
 *  package: the app is never the responder. */
export function readHs1(own: StaticKeypair, iM: Uint8Array, senderIP: Uint8Array, hs1: Uint8Array): Hs1Read | null {
  return readHs1With(own, iM, senderIP, hs1);
}

/** `readHs1` with a fixed ephemeral secret for the reply. Test hook. */
export function readHs1With(
  own: StaticKeypair,
  iM: Uint8Array,
  senderIP: Uint8Array,
  hs1: Uint8Array,
  fixedEphemeral?: Uint8Array,
): Hs1Read | null {
  const prologue = noisePrologue(iM, senderIP);
  if (hs1.length !== HS1_LEN) return null;
  const raw = handshakeRaw({ initiator: false, prologue, localSecret: own.secret, fixedEphemeral });
  const payload = raw.read(hs1);
  if (!payload || payload.length !== 8) return null;
  const view = new DataView(payload.buffer, payload.byteOffset, 8);
  const hi = view.getUint32(0);
  if (hi >= 2 ** 21) return null;
  const counter = hi * 2 ** 32 + view.getUint32(4);
  const remoteStatic = raw.remoteStatic()!;
  let replied = false;
  return {
    remoteStatic,
    counter,
    reply() {
      if (replied) throw new Error("already replied");
      replied = true;
      const hs2 = raw.write(EMPTY);
      return { hs2, session: sessionOf(raw), handshakeHash: raw.handshakeHash() };
    },
  };
}

#!/usr/bin/env node
// Writes the crypto vectors (enc, labels, signatures, seals, sas, noise) that the Rust
// and TypeScript suites both read. It uses node:crypto only, so the expected
// values come from neither library under test. It checks itself against the
// published vectors first (RFC 5869 case 1, RFC 8032 test 1, HChaCha20 and
// XChaCha20-Poly1305 from draft-irtf-cfrg-xchacha) and writes those in as anchors.
//
//   node packages/protocol/vectors/generate.mjs           writes the files
//   node packages/protocol/vectors/generate.mjs --check   writes nothing; exits 1 on drift
//   node packages/protocol/vectors/generate.mjs --differential   IK cases on stdin, digests out
//
// noise.json comes from a Noise IK oracle on node:crypto, which first reproduces
// cacophony-ik.json (an excerpt of cacophony's vectors, its digest pinned below).
//
// names.json, qr.json and schedule.json are written by hand from the spec, not here.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => Buffer.from(s, "hex");
const ascii = (s) => Buffer.from(s, "ascii");

function assertEq(got, want, what) {
  if (got !== want) throw new Error(`${what}: got ${got}, want ${want}`);
}

// --- The labels, as the spec lists them -------------------------------------

const PREFIX = "ade-remote/v1/";
const LABELS = [
  ["LOGIN_LABEL", "login", "enc"],
  ["NOISE_LABEL", "noise", "enc"],
  ["PAIR_PHONE_TO_MAC_INFO", "pair/phone-to-mac", "hkdf_info"],
  ["PAIR_MAC_TO_PHONE_INFO", "pair/mac-to-phone", "hkdf_info"],
  ["PAIR_COMMIT_LABEL", "pair/commit", "enc"],
  ["PAIR_COMMIT_HASH_LABEL", "pair/commit-hash", "enc"],
  ["PAIR_NONCE_LABEL", "pair/nonce", "enc"],
  ["PAIR_REVEAL_LABEL", "pair/reveal", "enc"],
  ["PAIR_PHONE_SIG_LABEL", "pair/phone-sig", "enc"],
  ["PAIR_SAS_LABEL", "pair/sas", "enc"],
  ["PAIR_RECORD_LABEL", "pair/record", "enc"],
].map(([constant, suffix, use]) => ({ constant, value: PREFIX + suffix, use }));
const label = (constant) => LABELS.find((l) => l.constant === constant).value;

// --- Fixed inputs -------------------------------------------------------------

/** n fixed bytes named by `tag`: SHA-256 output, repeated as needed. */
function fixed(tag, n) {
  const out = [];
  for (let i = 0; out.length < n; i++) {
    out.push(...crypto.createHash("sha256").update(`ade-vectors/${tag}/${i}`).digest());
  }
  return Buffer.from(out.slice(0, n));
}

// --- enc ----------------------------------------------------------------------

function enc(lbl, fields) {
  const parts = [ascii(lbl)];
  for (const f of fields) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(f.length);
    parts.push(len, Buffer.from(f));
  }
  return Buffer.concat(parts);
}

// --- Ed25519 ------------------------------------------------------------------

const PKCS8_PREFIX = unhex("302e020100300506032b657004220420");
const SPKI_PREFIX = unhex("302a300506032b6570032100");
const privateKey = (seed) =>
  crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: "der", type: "pkcs8" });
const publicOf = (seed) =>
  crypto.createPublicKey(privateKey(seed)).export({ format: "der", type: "spki" }).subarray(-32);
const ed25519Sign = (seed, msg) => crypto.sign(null, msg, privateKey(seed));
const ed25519Verify = (pub, msg, sig) =>
  crypto.verify(
    null,
    msg,
    crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, pub]), format: "der", type: "spki" }),
    sig,
  );

// --- HKDF ---------------------------------------------------------------------

const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

// --- XChaCha20-Poly1305 from Node's chacha20 and chacha20-poly1305 -------------

const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]; // "expand 32-byte k"

/** HChaCha20: one keystream block of chacha20 with the 16-byte nonce as its
 *  counter-and-nonce words, minus the initial state's constant and nonce words. */
function hchacha20(key, nonce16) {
  const c = crypto.createCipheriv("chacha20", key, nonce16);
  const block = Buffer.concat([c.update(Buffer.alloc(64)), c.final()]);
  const out = Buffer.alloc(32);
  for (let i = 0; i < 4; i++) {
    out.writeUInt32LE((block.readUInt32LE(4 * i) - SIGMA[i]) >>> 0, 4 * i);
    const w = 12 + i;
    out.writeUInt32LE((block.readUInt32LE(4 * w) - nonce16.readUInt32LE(4 * i)) >>> 0, 16 + 4 * i);
  }
  return out;
}

function xchachaEncrypt(key, nonce24, plain, aad = Buffer.alloc(0)) {
  const sub = hchacha20(key, nonce24.subarray(0, 16));
  const nonce12 = Buffer.concat([Buffer.alloc(4), nonce24.subarray(16, 24)]);
  const c = crypto.createCipheriv("chacha20-poly1305", sub, nonce12, { authTagLength: 16 });
  c.setAAD(aad, { plaintextLength: plain.length });
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([body, c.getAuthTag()]);
}

function xchachaDecrypt(key, nonce24, sealed) {
  const sub = hchacha20(key, nonce24.subarray(0, 16));
  const nonce12 = Buffer.concat([Buffer.alloc(4), nonce24.subarray(16, 24)]);
  const d = crypto.createDecipheriv("chacha20-poly1305", sub, nonce12, { authTagLength: 16 });
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}

// --- Anchors: the published vectors this generator must reproduce --------------

const ANCHORS = {
  rfc5869_case1: {
    ikm: "0b".repeat(22),
    salt: "000102030405060708090a0b0c",
    info: "f0f1f2f3f4f5f6f7f8f9",
    length: 42,
    okm: "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
  },
  rfc8032_test1: {
    seed: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
    public: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    message: "",
    sig:
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  xchacha_hchacha20_2_2_1: {
    key: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    nonce: "000000090000004a0000000031415927",
    subkey: "82413b4227b27bfed30e42508a877d73a0f9e4d58a74a853c12ec41326d3ecdc",
  },
  xchacha_aead_a_3_1: {
    key: "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f",
    nonce: "404142434445464748494a4b4c4d4e4f5051525354555657",
    aad: "50515253c0c1c2c3c4c5c6c7",
    plaintext: hex(
      ascii(
        "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
      ),
    ),
    ciphertext:
      "bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b4522f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3fff921f9664c97637da9768812f615c68b13b52e",
    tag: "c0875924c1c7987947deafd8780acf49",
  },
};

function checkAnchors() {
  const h = ANCHORS.rfc5869_case1;
  assertEq(hex(hkdf(unhex(h.ikm), unhex(h.salt), unhex(h.info), h.length)), h.okm, "RFC 5869 case 1");

  const e = ANCHORS.rfc8032_test1;
  assertEq(hex(publicOf(unhex(e.seed))), e.public, "RFC 8032 test 1 public key");
  assertEq(hex(ed25519Sign(unhex(e.seed), unhex(e.message))), e.sig, "RFC 8032 test 1 signature");

  const c = ANCHORS.xchacha_hchacha20_2_2_1;
  assertEq(hex(hchacha20(unhex(c.key), unhex(c.nonce))), c.subkey, "HChaCha20 2.2.1");

  const x = ANCHORS.xchacha_aead_a_3_1;
  const sealed = xchachaEncrypt(unhex(x.key), unhex(x.nonce), unhex(x.plaintext), unhex(x.aad));
  assertEq(hex(sealed), x.ciphertext + x.tag, "XChaCha20-Poly1305 A.3.1");
}

// --- The files ------------------------------------------------------------------

function encFile() {
  const cases = [
    {
      // Story 2's own unit test case.
      label: "ade-remote/v1/x",
      fields: ["6162", "", "ffffff"],
    },
    { label: label("PAIR_SAS_LABEL"), fields: [] },
    {
      label: label("LOGIN_LABEL"),
      fields: [hex(fixed("enc-login-c", 32)), hex(ascii("relay.example.com")), hex(ascii("phone"))],
    },
    { label: label("PAIR_RECORD_LABEL"), fields: [hex(fixed("enc-big", 300)), "00"] },
  ].map((c) => ({ ...c, out: hex(enc(c.label, c.fields.map(unhex))) }));

  const commit = label("PAIR_COMMIT_LABEL");
  const commitHash = label("PAIR_COMMIT_HASH_LABEL");
  const good = hex(enc(commit, [unhex("aabb")]));
  const decRefused = [
    { why: "another label", label: label("PAIR_NONCE_LABEL"), bytes: good },
    { why: "a label that is a prefix of the one used", label: commit, bytes: hex(enc(commitHash, [unhex("aabb")])) },
    { why: "the longer label over the shorter", label: commitHash, bytes: good },
    { why: "a trailing byte", label: commit, bytes: good + "00" },
    { why: "a field shorter than its length", label: commit, bytes: good.slice(0, -2) },
    { why: "a cut-off length", label: commit, bytes: hex(ascii(commit)) + "0000" },
    { why: "the label alone, cut short", label: commit, bytes: hex(ascii(commit)).slice(0, -2) },
  ];
  const decOk = [
    { label: commit, bytes: hex(ascii(commit)), fields: [] },
    { label: commit, bytes: good, fields: ["aabb"] },
    { label: commit, bytes: hex(enc(commit, [Buffer.alloc(0), unhex("01")])), fields: ["", "01"] },
  ];
  return { cases, dec: decOk, dec_refused: decRefused };
}

function signaturesFile() {
  const seed = fixed("sig-seed", 32);
  const pub = publicOf(seed);
  const fields = [fixed("sig-c", 32), ascii("relay.example.com"), ascii("phone")];
  const cases = LABELS.map(({ value }) => {
    const msg = enc(value, fields);
    const sig = ed25519Sign(seed, msg);
    if (!ed25519Verify(pub, msg, sig)) throw new Error(`signature under ${value} fails`);
    return { label: value, seed: hex(seed), public: hex(pub), fields: fields.map(hex), message: hex(msg), sig: hex(sig) };
  });

  // Signatures a strict verifier refuses. Each label is login, fields as above.
  const lbl = label("LOGIN_LABEL");
  const msg = enc(lbl, fields);
  const identity = "01" + "00".repeat(31);
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;
  const good = ed25519Sign(seed, msg);
  const s = BigInt("0x" + hex(Buffer.from(good.subarray(32)).reverse()));
  const sPlusL = Buffer.from((s + L).toString(16).padStart(64, "0"), "hex").reverse();
  const p = (1n << 255n) - 19n;
  const yIsPPlusOne = Buffer.from((p + 1n).toString(16).padStart(64, "0"), "hex").reverse();
  const yIsPPlusThree = Buffer.from((p + 3n).toString(16).padStart(64, "0"), "hex").reverse();
  const refused = [
    {
      why: "small-order A (the identity), with R the identity and S = 0, which a cofactorless or lax check accepts",
      public: identity,
      sig: identity + "00".repeat(32),
    },
    {
      why: "S >= L: a good signature with L added to S",
      public: hex(pub),
      sig: hex(good.subarray(0, 32)) + hex(sPlusL),
    },
    {
      why: "non-canonical A, y = p + 1 (which reduces to the identity), with R the identity and S = 0",
      public: hex(yIsPPlusOne),
      sig: identity + "00".repeat(32),
    },
    {
      // y = 3 is a point of large order, so only the encoding is wrong. Nobody knows
      // its private key, so no signature can check under it, canonical or not; the
      // case pins that both languages refuse the key itself, and Rust's unit test
      // shows its canonical check is what refuses it.
      why: "non-canonical A, y = p + 3 (a large-order point whose canonical y is 3), with a good signature's R and S",
      public: hex(yIsPPlusThree),
      sig: hex(good),
    },
  ].map((r) => ({ label: lbl, fields: fields.map(hex), ...r }));
  return { anchors: { rfc8032_test1: ANCHORS.rfc8032_test1 }, cases, refused };
}

function sealsFile() {
  const s = fixed("seal-s", 32);
  const slot = fixed("seal-slot", 16);
  const pm = hkdf(s, slot, ascii(label("PAIR_PHONE_TO_MAC_INFO")), 32);
  const mp = hkdf(s, slot, ascii(label("PAIR_MAC_TO_PHONE_INFO")), 32);
  const keys = [{ s: hex(s), slot: hex(slot), pm: hex(pm), mp: hex(mp) }];

  const messages = [
    ["pm", "PAIR_COMMIT_LABEL", [fixed("seal-H", 32)]],
    ["mp", "PAIR_NONCE_LABEL", [fixed("seal-N_M", 32)]],
    [
      "pm",
      "PAIR_REVEAL_LABEL",
      [fixed("seal-I_P", 32), fixed("seal-S_P", 32), Buffer.from("Alvin’s iPhone", "utf8"), fixed("seal-N_P", 32), fixed("seal-sig_P", 64)],
    ],
  ];
  const cases = messages.map(([dir, constant, fields], i) => {
    const key = dir === "pm" ? pm : mp;
    const nonce = fixed(`seal-nonce-${i}`, 24);
    const plain = enc(label(constant), fields);
    const sealed = Buffer.concat([nonce, xchachaEncrypt(key, nonce, plain)]);
    if (!xchachaDecrypt(key, nonce, sealed.subarray(24)).equals(plain)) throw new Error("seal round trip");
    return {
      direction: dir,
      key: hex(key),
      label: label(constant),
      fields: fields.map(hex),
      nonce: hex(nonce),
      sealed: hex(sealed),
    };
  });
  return {
    anchors: {
      rfc5869_case1: ANCHORS.rfc5869_case1,
      xchacha_hchacha20_2_2_1: ANCHORS.xchacha_hchacha20_2_2_1,
      xchacha_aead_a_3_1: ANCHORS.xchacha_aead_a_3_1,
    },
    keys,
    cases,
  };
}

function sas(inputs) {
  const order = ["slot", "i_m", "s_m", "i_p", "s_p", "n_m", "n_p", "s"];
  const digest = crypto
    .createHash("sha256")
    .update(enc(label("PAIR_SAS_LABEL"), order.map((k) => unhex(inputs[k]))))
    .digest();
  const code = (digest.readBigUInt64BE(0) % 1000000n).toString().padStart(6, "0");
  return { ...inputs, digest: hex(digest), code };
}

function sasFile() {
  const base = {
    slot: hex(fixed("sas-slot", 16)),
    i_m: hex(fixed("sas-I_M", 32)),
    s_m: hex(fixed("sas-S_M", 32)),
    i_p: hex(fixed("sas-I_P", 32)),
    s_p: hex(fixed("sas-S_P", 32)),
    n_m: hex(fixed("sas-N_M", 32)),
    n_p: "",
    s: hex(fixed("sas-s", 32)),
  };
  // Search N_P for a code under 100000, so the leading zero is pinned.
  let low;
  for (let i = 0; !low; i++) {
    const c = sas({ ...base, n_p: hex(fixed(`sas-N_P-${i}`, 32)) });
    if (Number(c.code) < 100000) low = c;
  }
  const strip = ({ digest: _d, code: _c, ...inputs }) => inputs;
  const otherIP = sas({ ...strip(low), i_p: hex(fixed("sas-I_P-other", 32)) });
  const otherSP = sas({ ...strip(low), s_p: hex(fixed("sas-S_P-other", 32)) });
  for (const c of [otherIP, otherSP]) if (c.code === low.code) throw new Error("SAS codes collide");
  return {
    cases: [
      { why: "a code under 100000 keeps its leading zero", ...low },
      { why: "the first case with another I_P", ...otherIP },
      { why: "the first case with another S_P", ...otherSP },
    ],
  };
}

// --- Noise IK oracle on node:crypto (story 4) -------------------------------------
//
// A third Noise implementation, independent of snow and of @noble: X25519 through
// raw-key DER, chacha20-poly1305 with the Noise nonce 0x00000000 || u64le(n), and
// HKDF over HMAC-SHA256. It must reproduce the cacophony IK vector first.

const PATTERN = "Noise_IK_25519_ChaChaPoly_SHA256";
const CACOPHONY_FILE = "cacophony-ik.json";
/** SHA-256 of cacophony-ik.json, the excerpt copied from cacophony's vectors. */
const CACOPHONY_SHA256 = "c477fb7eac61e4aaf6cf447571d02714409ea3fd946f220246548b08b6e78dfd";
const MAX_COUNTER = 2 ** 53 - 1;
const MAX_PLAINTEXT = 60000;

const sha256 = (d) => crypto.createHash("sha256").update(d).digest();
const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();

const X25519_PKCS8 = unhex("302e020100300506032b656e04220420");
const X25519_SPKI = unhex("302a300506032b656e032100");
const xPrivate = (secret) =>
  crypto.createPrivateKey({ key: Buffer.concat([X25519_PKCS8, secret]), format: "der", type: "pkcs8" });
const xPublicOf = (secret) =>
  crypto.createPublicKey(xPrivate(secret)).export({ format: "der", type: "spki" }).subarray(-32);

// The low-order u-values: 0, 1, p-1, the two order-8 points, the +p encodings below
// 2^255 (p and p+1), and each with the top bit set (which RFC 7748 masks).
const P = (1n << 255n) - 19n;
const ORDER8_A = 325606250916557431795983626356110631294008115727848805560023387167927233504n;
const ORDER8_B = 39382357235489614581723060781553021112529911719440698176882885853963445705823n;
const le32 = (n) => Buffer.from(n.toString(16).padStart(64, "0"), "hex").reverse();
const LOW_ORDER_BASE = [
  ["0", 0n],
  ["1", 1n],
  ["p-1", P - 1n],
  ["order-8 point a", ORDER8_A],
  ["order-8 point b", ORDER8_B],
  ["p, the +p encoding of 0", P],
  ["p+1, the +p encoding of 1", P + 1n],
];
const LOW_ORDER = [
  ...LOW_ORDER_BASE.map(([name, n]) => ({ name, u: le32(n) })),
  ...LOW_ORDER_BASE.map(([name, n]) => ({ name: `${name}, top bit set`, u: le32(n | (1n << 255n)) })),
];
const isLowOrder = (u) => {
  const n = BigInt("0x" + hex(Buffer.from(u).reverse())) & ((1n << 255n) - 1n);
  return [0n, 1n, P - 1n, ORDER8_A, ORDER8_B].includes(n % P);
};

/** X25519. An all-zero result (a low-order u) is returned as zeros, where node
 *  throws, and the throw is checked to agree with the low-order table. */
function x25519(secret, pub) {
  try {
    const out = crypto.diffieHellman({
      privateKey: xPrivate(secret),
      publicKey: crypto.createPublicKey({ key: Buffer.concat([X25519_SPKI, pub]), format: "der", type: "spki" }),
    });
    if (isLowOrder(pub)) throw new Error(`x25519 accepted low-order ${hex(pub)}`);
    return out;
  } catch (e) {
    if (!isLowOrder(pub)) throw e;
    return Buffer.alloc(32);
  }
}

const noiseNonce = (n) => {
  const b = Buffer.alloc(12);
  b.writeBigUInt64LE(BigInt(n), 4);
  return b;
};

function aeadEncrypt(key, n, ad, plain) {
  const c = crypto.createCipheriv("chacha20-poly1305", key, noiseNonce(n), { authTagLength: 16 });
  c.setAAD(ad, { plaintextLength: plain.length });
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}

/** HKDF as Noise defines it, two outputs. */
function hkdf2(ck, ikm) {
  const temp = hmac(ck, ikm);
  const one = hmac(temp, Buffer.from([1]));
  return [one, hmac(temp, Buffer.concat([one, Buffer.from([2])]))];
}

class SymmetricState {
  constructor(prologue) {
    // The protocol name is exactly 32 bytes, so h starts as the name itself.
    this.h = ascii(PATTERN);
    if (this.h.length !== 32) throw new Error("pattern name is not 32 bytes");
    this.ck = this.h;
    this.k = null;
    this.n = 0;
    this.mixHash(prologue);
  }
  mixHash(data) {
    this.h = sha256(Buffer.concat([this.h, data]));
  }
  mixKey(ikm) {
    [this.ck, this.k] = hkdf2(this.ck, ikm);
    this.n = 0;
  }
  encryptAndHash(plain) {
    const c = this.k ? aeadEncrypt(this.k, this.n++, this.h, plain) : Buffer.from(plain);
    this.mixHash(c);
    return c;
  }
}

/** One IK handshake, the oracle writing both messages. `t` overrides a wire key
 *  (e1, s1, e2) or a DH result (es, ss, ee, se), always as the reader computes it,
 *  for the refused and edge cases. k1 is initiator to responder, k2 the reverse. */
function ik({ prologue, iStatic, iEph, rStaticPub, rEph, payload1, payload2 = Buffer.alloc(0), t = {} }) {
  const sym = new SymmetricState(prologue);
  sym.mixHash(rStaticPub);
  const e1 = t.e1 ?? xPublicOf(iEph);
  sym.mixHash(e1);
  sym.mixKey(t.es ?? x25519(iEph, rStaticPub));
  const s1 = sym.encryptAndHash(t.s1 ?? xPublicOf(iStatic));
  sym.mixKey(t.ss ?? x25519(iStatic, rStaticPub));
  const hs1 = Buffer.concat([e1, s1, sym.encryptAndHash(payload1)]);
  const e2 = t.e2 ?? xPublicOf(rEph);
  sym.mixHash(e2);
  sym.mixKey(t.ee ?? x25519(rEph, xPublicOf(iEph)));
  sym.mixKey(t.se ?? x25519(rEph, xPublicOf(iStatic)));
  const hs2 = Buffer.concat([e2, sym.encryptAndHash(payload2)]);
  const [k1, k2] = hkdf2(sym.ck, Buffer.alloc(0));
  return { hs1, hs2, h: sym.h, k1, k2 };
}

function checkCacophony() {
  const raw = fs.readFileSync(path.join(DIR, CACOPHONY_FILE));
  assertEq(hex(sha256(raw)), CACOPHONY_SHA256, `${CACOPHONY_FILE} digest`);
  const v = JSON.parse(raw.toString("utf8")).vector;
  assertEq(v.protocol_name, PATTERN, "cacophony protocol name");
  assertEq(hex(xPublicOf(unhex(v.resp_static))), v.init_remote_static, "cacophony responder static");
  const out = ik({
    prologue: unhex(v.init_prologue),
    iStatic: unhex(v.init_static),
    iEph: unhex(v.init_ephemeral),
    rStaticPub: unhex(v.init_remote_static),
    rEph: unhex(v.resp_ephemeral),
    payload1: unhex(v.messages[0].payload),
    payload2: unhex(v.messages[1].payload),
  });
  assertEq(hex(out.hs1), v.messages[0].ciphertext, "cacophony hs1");
  assertEq(hex(out.hs2), v.messages[1].ciphertext, "cacophony hs2");
  assertEq(hex(out.h), v.handshake_hash, "cacophony handshake hash");
  v.messages.slice(2).forEach((m, i) => {
    const key = i % 2 === 0 ? out.k1 : out.k2;
    const got = aeadEncrypt(key, Math.floor(i / 2), Buffer.alloc(0), unhex(m.payload));
    assertEq(hex(got), m.ciphertext, `cacophony message ${i + 2}`);
  });
}

// --- noise.json -------------------------------------------------------------------

const noisePrologue = (iM, iP) => enc(label("NOISE_LABEL"), [iM, iP]);
const u64be = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
};
/** Every frame plaintext in the vectors: byte i is i % 251. */
const plaintextOf = (len) => Buffer.from(Array.from({ length: len }, (_, i) => i % 251));
const frameBody = (sid, key, nonce, plain) =>
  Buffer.concat([sid, u64be(nonce), aeadEncrypt(key, nonce, Buffer.alloc(0), plain)]);
const withTopBit = (b) => {
  const out = Buffer.from(b);
  out[31] |= 0x80;
  return out;
};
const flip = (b, i) => {
  const out = Buffer.from(b);
  out[i] ^= 0x01;
  return out;
};

function noiseKeys() {
  const key = (tag) => {
    const secret = fixed(tag, 32);
    return { secret, public: xPublicOf(secret) };
  };
  return {
    mac: key("noise-mac-static"),
    phone: key("noise-phone-static"),
    otherMac: key("noise-other-mac-static"),
    iM: fixed("noise-I_M", 32),
    iP: fixed("noise-I_P", 32),
    otherIP: fixed("noise-I_P-other", 32),
  };
}

/** A handshake between the file's phone and Mac with fixed ephemerals `i`. */
function noiseHandshake(K, counter, i, t = {}, extra = {}) {
  const iEph = fixed(`noise-phone-e-${i}`, 32);
  const rEph = fixed(`noise-mac-e-${i}`, 32);
  const out = ik({
    prologue: noisePrologue(K.iM, K.iP),
    iStatic: K.phone.secret,
    iEph,
    rStaticPub: K.mac.public,
    rEph,
    payload1: u64be(counter),
    t,
    ...extra,
  });
  return { ...out, iEph, rEph, sid: out.h.subarray(0, 8) };
}

function receiverScript(direction, hs, older) {
  const key = direction === "phone_to_mac" ? hs.k1 : hs.k2;
  const olderKey = direction === "phone_to_mac" ? older.k1 : older.k2;
  const sid = hs.sid;
  const other = flip(sid, 0);
  const good = (n, len = 3) => frameBody(sid, key, n, plaintextOf(len));
  const steps = [];
  let last = null;
  const step = (why, body, outcome, len) => {
    if (outcome === "accept") last = Number(body.readBigUInt64BE(8));
    const s = { why, outcome, last_recv: last };
    if (body.fill) s.body = hex(body);
    else s.body_fill = body;
    if (outcome === "accept") s.plaintext_len = len;
    steps.push(s);
  };
  step("an empty body", Buffer.alloc(0), "drop");
  step("7 bytes, under a session id", sid.subarray(0, 7), "drop");
  step("8 bytes: the current id alone", Buffer.from(sid), "bad");
  step("8 bytes: another session's id", Buffer.from(other), "drop");
  step("15 bytes on the current id", Buffer.concat([sid, Buffer.alloc(7)]), "bad");
  step("31 bytes on the current id", Buffer.concat([sid, u64be(0), Buffer.alloc(15)]), "bad");
  step("32 bytes on the current id that fail to decrypt", Buffer.concat([sid, u64be(0), Buffer.alloc(16)]), "bad");
  step("a 32-byte frame, empty plaintext, nonce 0", good(0, 0), "accept", 0);
  step("nonce 2 (a gap)", good(2), "accept", 3);
  step("nonce 2 again (a replay)", good(2), "drop");
  step("nonce 1 (lower)", good(1), "drop");
  step("nonce 5 (a gap)", good(5), "accept", 3);
  step(
    "a forged nonce 100 that fails to decrypt",
    Buffer.concat([sid, u64be(100), Buffer.alloc(20, 0xab)]),
    "bad",
  );
  step("nonce 6: the forged frame did not move last-accepted", good(6), "accept", 3);
  step("nonce 7 tampered", flip(good(7), 20), "bad");
  step("nonce 7, untampered", good(7), "accept", 3);
  step("nonce 2^32, which decrypts", frameBody(sid, key, 2 ** 32, plaintextOf(3)), "bad");
  step("nonce 2^64-1", Buffer.concat([sid, Buffer.alloc(8, 0xff), Buffer.alloc(16)]), "bad");
  step("60,033 bytes on the current id", { prefix: hex(sid), len: 60033 }, "bad");
  step("another session's id on a frame under the current keys", frameBody(other, key, 8, plaintextOf(3)), "drop");
  step("a frame from the older session", frameBody(older.sid, olderKey, 9, plaintextOf(3)), "drop");
  step("nonce 8, a full 60,000-byte plaintext (60,032 bytes)", good(8, MAX_PLAINTEXT), "accept", MAX_PLAINTEXT);
  step("nonce 2^32-1, the last a sender uses", good(2 ** 32 - 1), "accept", 3);
  return { direction, steps };
}

function noiseFile() {
  const K = noiseKeys();
  const counters = [0, 1760000000000, MAX_COUNTER];
  const hss = counters.map((c, i) => noiseHandshake(K, c, i));
  const handshakes = hss.map((o, i) => ({
    counter: counters[i],
    phone_ephemeral: hex(o.iEph),
    mac_ephemeral: hex(o.rEph),
    hs1: hex(o.hs1),
    hs2: hex(o.hs2),
    handshake_hash: hex(o.h),
    session_id: hex(o.sid),
  }));
  for (const o of hss) {
    if (o.hs1.length !== 104 || o.hs2.length !== 48) throw new Error("hs1/hs2 lengths");
  }

  const hs = hss[0];
  const frames = [];
  for (const direction of ["phone_to_mac", "mac_to_phone"]) {
    for (const nonce of [0, 1, 7]) {
      for (const len of [0, 1, MAX_PLAINTEXT]) {
        const body = frameBody(hs.sid, direction === "phone_to_mac" ? hs.k1 : hs.k2, nonce, plaintextOf(len));
        const f = { direction, nonce, plaintext_len: len, body_len: body.length };
        if (body.length <= 64) f.body = hex(body);
        else f.body_sha256 = hex(sha256(body));
        frames.push(f);
      }
    }
  }

  const firstFrame = frameBody(hs.sid, hs.k1, 0, plaintextOf(1));
  const envelopes = [
    { kind: 1, peer: hex(K.iM), body: hex(hs.hs1) },
    { kind: 2, peer: hex(K.iP), body: hex(hs.hs2) },
    { kind: 3, peer: hex(K.iM), body: hex(firstFrame) },
  ].map((e) => ({ ...e, bytes: hex(Buffer.concat([Buffer.from([e.kind]), unhex(e.peer), unhex(e.body)])) }));

  const sweep = Array.from({ length: 16 }, (_, i) => {
    const phone = fixed(`noise-sweep-${i}-phone`, 32);
    const mac = fixed(`noise-sweep-${i}-mac`, 32);
    const iEph = fixed(`noise-sweep-${i}-phone-e`, 32);
    const rEph = fixed(`noise-sweep-${i}-mac-e`, 32);
    const iM = fixed(`noise-sweep-${i}-I_M`, 32);
    const iP = fixed(`noise-sweep-${i}-I_P`, 32);
    const counter = i * 123456789013 + i;
    const o = ik({ prologue: noisePrologue(iM, iP), iStatic: phone, iEph, rStaticPub: xPublicOf(mac), rEph, payload1: u64be(counter) });
    const sid = o.h.subarray(0, 8);
    const lens = [(i * 61) % 300, (i * 97 + 5) % 300];
    return {
      phone_secret: hex(phone),
      mac_secret: hex(mac),
      phone_ephemeral: hex(iEph),
      mac_ephemeral: hex(rEph),
      i_m: hex(iM),
      i_p: hex(iP),
      counter,
      hs1: hex(o.hs1),
      hs2: hex(o.hs2),
      handshake_hash: hex(o.h),
      session_id: hex(sid),
      frames: [
        { direction: "phone_to_mac", nonce: i, plaintext_len: lens[0], body: hex(frameBody(sid, o.k1, i, plaintextOf(lens[0]))) },
        { direction: "mac_to_phone", nonce: i * 3 + 1, plaintext_len: lens[1], body: hex(frameBody(sid, o.k2, i * 3 + 1, plaintextOf(lens[1]))) },
      ],
    };
  });

  // hs1 the Mac must refuse at the crypto layer. The Mac's own key is `keys.mac`.
  const refusedHs1 = [];
  const hs1Case = (why, hs1, senderIP = K.iP) => refusedHs1.push({ why, layer: "crypto", sender_i_p: hex(senderIP), hs1: hex(hs1) });
  const viaPayload = (payload1) => noiseHandshake(K, 0, 0, {}, { payload1 }).hs1;
  hs1Case("a payload of 0 bytes", viaPayload(Buffer.alloc(0)));
  hs1Case("a payload of 9 bytes", viaPayload(Buffer.alloc(9, 1)));
  hs1Case("counter 2^53", viaPayload(u64be(2n ** 53n)));
  hs1Case("made by phone A, sent as phone B (prologue)", hs.hs1, K.otherIP);
  hs1Case("truncated to 103 bytes", hs.hs1.subarray(0, 103));
  hs1Case("truncated to 32 bytes", hs.hs1.subarray(0, 32));
  hs1Case("empty", Buffer.alloc(0));
  hs1Case("made for another Mac's static", noiseHandshake(K, 0, 0, {}, { rStaticPub: K.otherMac.public }).hs1);
  hs1Case("tampered", flip(hs.hs1, 50));
  for (const { name, u } of LOW_ORDER) {
    hs1Case(`a low-order e: ${name}`, noiseHandshake(K, 0, 0, { e1: u, es: x25519(K.mac.secret, u) }).hs1);
  }
  for (const { name, u } of LOW_ORDER) {
    hs1Case(`a low-order s: ${name}`, noiseHandshake(K, 0, 0, { s1: u, ss: x25519(K.mac.secret, u) }).hs1);
  }

  // hs2 the phone must refuse, each read by handshakes[0]'s initiator; the right hs2
  // still completes after each.
  const refusedHs2 = [];
  const hs2Case = (why, hs2) => refusedHs2.push({ why, layer: "crypto", hs2: hex(hs2) });
  hs2Case("a 1-byte payload (49 bytes)", noiseHandshake(K, 0, 0, {}, { payload2: Buffer.from([0]) }).hs2);
  hs2Case("tampered e", flip(hs.hs2, 3));
  hs2Case("tampered tag", flip(hs.hs2, 40));
  hs2Case("truncated to 47 bytes", hs.hs2.subarray(0, 47));
  hs2Case("empty", Buffer.alloc(0));
  hs2Case("for another handshake", hss[1].hs2);
  for (const { name, u } of LOW_ORDER) {
    const t = { e2: u, ee: x25519(hs.iEph, u), se: x25519(K.phone.secret, u) };
    hs2Case(`a low-order e: ${name}`, noiseHandshake(K, 0, 0, t).hs2);
  }

  // A high-bit e: the top bit is masked by X25519 but hashed as sent, so it completes.
  const hiE1 = withTopBit(xPublicOf(hs.iEph));
  const es = x25519(K.mac.secret, hiE1);
  if (!es.equals(x25519(hs.iEph, K.mac.public))) throw new Error("top bit not masked");
  const hi1 = noiseHandshake(K, 0, 0, { e1: hiE1, es });
  const hiE2 = withTopBit(xPublicOf(hs.rEph));
  const ee = x25519(hs.iEph, hiE2);
  const se = x25519(K.phone.secret, hiE2);
  if (!ee.equals(x25519(hs.rEph, xPublicOf(hs.iEph)))) throw new Error("top bit not masked");
  const hi2 = noiseHandshake(K, 0, 0, { e2: hiE2, ee, se });
  const highBit = [
    { why: "hs1 whose e has the top bit set", counter: 0, hs1: hex(hi1.hs1), hs2: hex(hi1.hs2), session_id: hex(hi1.sid) },
    { why: "hs2 whose e has the top bit set", counter: 0, hs1: hex(hi2.hs1), hs2: hex(hi2.hs2), session_id: hex(hi2.sid) },
  ];

  return {
    pattern: PATTERN,
    note:
      "Written by generate.mjs's node:crypto IK oracle, which reproduces cacophony-ik.json first. Frame plaintexts are byte i = i % 251. Handshakes use the phone's ephemeral phone_ephemeral and the Mac's mac_ephemeral.",
    keys: {
      mac_static_secret: hex(K.mac.secret),
      mac_static_public: hex(K.mac.public),
      phone_static_secret: hex(K.phone.secret),
      phone_static_public: hex(K.phone.public),
      other_mac_static_public: hex(K.otherMac.public),
      i_m: hex(K.iM),
      i_p: hex(K.iP),
      other_i_p: hex(K.otherIP),
    },
    prologue: hex(noisePrologue(K.iM, K.iP)),
    handshakes,
    frames,
    envelopes,
    sweep,
    low_order: LOW_ORDER.map(({ name, u }) => ({ name, u: hex(u) })),
    refused: { hs1: refusedHs1, hs2: refusedHs2 },
    high_bit_e: highBit,
    receiver_scripts: [receiverScript("phone_to_mac", hs, hss[1]), receiverScript("mac_to_phone", hs, hss[1])],
  };
}

/** --differential: JSON cases on stdin, one SHA-256 digest per case on stdout, of
 *  hs1 || hs2 || handshake hash || each frame body. */
function differential(cases) {
  return cases.map((c) => {
    const o = ik({
      prologue: noisePrologue(unhex(c.i_m), unhex(c.i_p)),
      iStatic: unhex(c.phone_secret),
      iEph: unhex(c.phone_ephemeral),
      rStaticPub: xPublicOf(unhex(c.mac_secret)),
      rEph: unhex(c.mac_ephemeral),
      payload1: u64be(c.counter),
    });
    const sid = o.h.subarray(0, 8);
    const parts = [o.hs1, o.hs2, o.h];
    for (const f of c.frames) {
      parts.push(frameBody(sid, f.direction === "phone_to_mac" ? o.k1 : o.k2, f.nonce, plaintextOf(f.plaintext_len)));
    }
    return hex(sha256(Buffer.concat(parts)));
  });
}

// --- Main -------------------------------------------------------------------------

checkAnchors();
checkCacophony();
if (process.argv.includes("--differential")) {
  const input = fs.readFileSync(0, "utf8");
  process.stdout.write(JSON.stringify(differential(JSON.parse(input))) + "\n");
  process.exit(0);
}
const files = {
  "enc.json": encFile(),
  "labels.json": { labels: LABELS },
  "signatures.json": signaturesFile(),
  "seals.json": sealsFile(),
  "sas.json": sasFile(),
  "noise.json": noiseFile(),
};

const check = process.argv.includes("--check");
let drift = false;
for (const [name, body] of Object.entries(files)) {
  const text = JSON.stringify(body, null, 2) + "\n";
  const file = path.join(DIR, name);
  if (check) {
    const now = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (now !== text) {
      console.error(`${name} differs from the generator's output`);
      drift = true;
    }
  } else {
    fs.writeFileSync(file, text);
    console.log(`wrote ${name}`);
  }
}
if (drift) process.exit(1);

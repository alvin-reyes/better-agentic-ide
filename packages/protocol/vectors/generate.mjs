#!/usr/bin/env node
// Writes the crypto vectors (enc, labels, signatures, seals, sas) that the Rust
// and TypeScript suites both read. It uses node:crypto only, so the expected
// values come from neither library under test. It checks itself against the
// published vectors first (RFC 5869 case 1, RFC 8032 test 1, HChaCha20 and
// XChaCha20-Poly1305 from draft-irtf-cfrg-xchacha) and writes those in as anchors.
//
//   node packages/protocol/vectors/generate.mjs           writes the files
//   node packages/protocol/vectors/generate.mjs --check   writes nothing; exits 1 on drift
//
// names.json and qr.json are written by hand from the spec, not here.
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

// --- Main -------------------------------------------------------------------------

checkAnchors();
const files = {
  "enc.json": encFile(),
  "labels.json": { labels: LABELS },
  "signatures.json": signaturesFile(),
  "seals.json": sealsFile(),
  "sas.json": sasFile(),
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

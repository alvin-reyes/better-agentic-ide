// @vitest-environment node
// The shared protocol vectors in packages/protocol/vectors/, which the Rust
// suite (relay/protocol/src/vectors.rs) reads too.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";
import {
  ALL_LABELS,
  LOGIN_LABEL,
  NOISE_LABEL,
  PAIR_COMMIT_HASH_LABEL,
  PAIR_COMMIT_LABEL,
  PAIR_MAC_TO_PHONE_INFO,
  PAIR_NONCE_LABEL,
  PAIR_PHONE_SIG_LABEL,
  PAIR_PHONE_TO_MAC_INFO,
  PAIR_RECORD_LABEL,
  PAIR_REVEAL_LABEL,
  PAIR_SAS_LABEL,
  NONCE_LEN,
  HS1_LEN,
  HS2_LEN,
  MAX_COUNTER,
  MAX_PLAINTEXT,
  NOISE_PATTERN,
  NONCE_CEILING,
  buildPairCode,
  concatBytes,
  encodeRouted,
  noisePrologue,
  parseRouted,
  randomBytes,
  startHandshake,
  staticFromSecret,
  cleanName,
  dec,
  enc,
  fromHex,
  nameFromBytes,
  open,
  pairKeys,
  parsePairCode,
  sasCode,
  seal,
  sign,
  toHex,
  utf8DecodeLossy,
  verify,
  type SasInputs,
} from "./index";
import * as protocol from "./index";
import { sealWithNonce } from "./seal";
import { presetNonces } from "./frame";
import { handshakeRaw, isLowOrder, readHs1, readHs1With, startHandshakeWith } from "./noise";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const vectorPath = (name: string) => fileURLToPath(new URL(`../vectors/${name}`, import.meta.url));
const load = (name: string): Json => JSON.parse(readFileSync(vectorPath(name), "utf8"));
const fields = (list: string[]) => list.map(fromHex);
const nodeSha256 = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());

describe("protocol vectors", () => {
  it("enc and dec", () => {
    const file = load("enc.json");
    expect(file.cases.length).toBeGreaterThanOrEqual(4);
    for (const c of file.cases) expect(toHex(enc(c.label, fields(c.fields)))).toBe(c.out);
    for (const c of file.dec) {
      expect(dec(c.label, fromHex(c.bytes))?.map(toHex)).toEqual(c.fields);
    }
    for (const c of file.dec_refused) expect(dec(c.label, fromHex(c.bytes)), c.why).toBeNull();
  });

  it("includes story 2's enc case", () => {
    const first = load("enc.json").cases[0];
    expect(first.label).toBe("ade-remote/v1/x");
    expect(first.out).toBe(toHex(new TextEncoder().encode("ade-remote/v1/x")) + "000000026162" + "00000000" + "00000003ffffff");
  });

  it("labels: the file is the spec's eleven, and the table equals it", () => {
    const spec = [
      "login",
      "noise",
      "pair/phone-to-mac",
      "pair/mac-to-phone",
      "pair/commit",
      "pair/commit-hash",
      "pair/nonce",
      "pair/reveal",
      "pair/phone-sig",
      "pair/sas",
      "pair/record",
    ].map((s) => "ade-remote/v1/" + s);
    const { labels } = load("labels.json");
    expect(labels.map((l: Json) => l.value)).toEqual(spec);
    expect([...ALL_LABELS]).toEqual(spec);
    const ours: Record<string, string> = {
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
    };
    expect(Object.keys(ours)).toEqual(labels.map((l: Json) => l.constant));
    for (const l of labels) {
      expect(ours[l.constant]).toBe(l.value);
      expect(l.use).toBe(l.constant.endsWith("_INFO") ? "hkdf_info" : "enc");
    }
  });

  it("signatures, and the refused ones", () => {
    const file = load("signatures.json");
    const anchor = file.anchors.rfc8032_test1;
    // enc("", no fields) is the empty message, so sign() reproduces RFC 8032 test 1.
    expect(toHex(ed25519.getPublicKey(fromHex(anchor.seed)))).toBe(anchor.public);
    expect(toHex(sign(fromHex(anchor.seed), "", []))).toBe(anchor.sig);
    expect(file.cases).toHaveLength(ALL_LABELS.length);
    for (const c of file.cases) {
      expect(toHex(enc(c.label, fields(c.fields)))).toBe(c.message);
      const sig = sign(fromHex(c.seed), c.label, fields(c.fields));
      expect(toHex(sig), c.label).toBe(c.sig);
      expect(verify(fromHex(c.public), c.label, fields(c.fields), sig)).toBe(true);
    }
    expect(file.refused).toHaveLength(4);
    for (const c of file.refused) {
      expect(verify(fromHex(c.public), c.label, fields(c.fields), fromHex(c.sig)), c.why).toBe(false);
    }
  });

  it("seals", () => {
    const file = load("seals.json");
    for (const k of file.keys) {
      const keys = pairKeys(fromHex(k.s), fromHex(k.slot));
      expect(toHex(keys.pm)).toBe(k.pm);
      expect(toHex(keys.mp)).toBe(k.mp);
    }
    expect(file.cases).toHaveLength(3);
    for (const c of file.cases) {
      const key = fromHex(c.key);
      const sealed = sealWithNonce(key, fromHex(c.nonce), c.label, fields(c.fields));
      expect(toHex(sealed), c.label).toBe(c.sealed);
      expect(open(key, sealed, c.label, c.fields.length)?.map(toHex)).toEqual(c.fields);
      expect(open(key, sealed, c.label, c.fields.length + 1)).toBeNull();
    }
  });

  const sasInputs = (c: Json): SasInputs => ({
    slot: fromHex(c.slot),
    iM: fromHex(c.i_m),
    sM: fromHex(c.s_m),
    iP: fromHex(c.i_p),
    sP: fromHex(c.s_p),
    nM: fromHex(c.n_m),
    nP: fromHex(c.n_p),
    s: fromHex(c.s),
  });

  it("the 6-digit code", () => {
    const { cases } = load("sas.json");
    expect(cases).toHaveLength(3);
    const codes = cases.map((c: Json) => {
      const code = sasCode(sasInputs(c));
      expect(code, c.why).toBe(c.code);
      return code;
    });
    expect(codes[0].startsWith("0")).toBe(true);
    expect(cases[1].i_p).not.toBe(cases[0].i_p);
    expect({ ...cases[1], i_p: 0, digest: 0, code: 0, why: 0 }).toEqual({ ...cases[0], i_p: 0, digest: 0, code: 0, why: 0 });
    expect(cases[2].s_p).not.toBe(cases[0].s_p);
    expect({ ...cases[2], s_p: 0, digest: 0, code: 0, why: 0 }).toEqual({ ...cases[0], s_p: 0, digest: 0, code: 0, why: 0 });
    expect(codes[1]).not.toBe(codes[0]);
    expect(codes[2]).not.toBe(codes[0]);
  });

  it("names", () => {
    const file = load("names.json");
    for (const c of file.strings) expect(cleanName(c.input), c.why).toBe(c.output);
    for (const c of file.bytes) expect(nameFromBytes(fromHex(c.input)), c.why).toBe(c.output);
    for (const c of file.lossy) expect(utf8DecodeLossy(fromHex(c.input)), c.input).toBe(c.output);
  });

  it("names: lone surrogates are removed (TypeScript only: Rust strings can't hold them)", () => {
    expect(cleanName("a\ud800b\udfffc\udc00")).toBe("abc");
    expect(cleanName("\ud83d")).toBe("");
    expect(cleanName("x😀\ud83d")).toBe("x😀");
  });

  const keysOf = (c: Json) => ({
    relay: c.relay,
    slot: fromHex(c.slot),
    id: fromHex(c.id),
    x: fromHex(c.x),
    s: fromHex(c.s),
  });

  it("QR codes parse to their fields and name, or their error", () => {
    for (const c of load("qr.json").parse) {
      const got = parsePairCode(c.code);
      if (c.ok) {
        expect(got.ok, c.why).toBe(true);
        if (!got.ok) continue;
        const v = got.value;
        expect(
          { relay: v.relay, slot: toHex(v.slot), id: toHex(v.id), x: toHex(v.x), s: toHex(v.s), name: v.name },
          c.why,
        ).toEqual(c.ok);
      } else {
        expect(got, c.why).toEqual({ ok: false, error: c.error });
      }
    }
  });

  it("QR codes: any relay scheme but wss:// is insecure_relay", () => {
    const insecure = load("qr.json").parse.filter((c: Json) => c.error === "insecure_relay");
    expect(insecure.length).toBeGreaterThanOrEqual(5);
    for (const c of insecure) expect(parsePairCode(c.code), c.why).toEqual({ ok: false, error: "insecure_relay" });
  });

  it("QR codes: the builder", () => {
    const file = load("qr.json");
    for (const c of file.build) {
      const built = buildPairCode({ ...keysOf(c), name: c.name });
      expect(built, c.why).toEqual({ ok: true, value: c.code });
      const parsed = parsePairCode(c.code);
      if (!parsed.ok) throw new Error(c.why);
      expect(parsed.value.name).toBe(c.parsed_name);
      expect(parsed.value.relay).toBe(c.relay);
      expect([parsed.value.slot, parsed.value.id, parsed.value.x, parsed.value.s].map(toHex)).toEqual([
        c.slot,
        c.id,
        c.x,
        c.s,
      ]);
    }
    for (const c of file.build_refused) {
      expect(buildPairCode({ ...keysOf(c), name: c.name }), c.why).toEqual({ ok: false, error: c.error });
    }
  });

  it("a signature and a seal made under each label fail under every other (11x10 each)", () => {
    const seed = new Uint8Array(32).fill(7);
    const id = publicKeyOf(seed);
    const key = new Uint8Array(32).fill(9);
    const f = [new TextEncoder().encode("field one"), new Uint8Array(32)];
    let checked = 0;
    for (const made of ALL_LABELS) {
      const sig = sign(seed, made, f);
      const sealed = seal(key, made, f);
      expect(verify(id, made, f, sig), made).toBe(true);
      expect(open(key, sealed, made, 2), made).not.toBeNull();
      for (const other of ALL_LABELS.filter((l) => l !== made)) {
        expect(verify(id, other, f, sig), `${made} under ${other}`).toBe(false);
        expect(open(key, sealed, other, 2), `${made} under ${other}`).toBeNull();
        checked++;
      }
    }
    expect(checked).toBe(110);
  });

  it("seal takes a fresh random nonce and round-trips", () => {
    const keys = pairKeys(new Uint8Array(32).fill(5), new Uint8Array(16).fill(6));
    const a = seal(keys.pm, PAIR_COMMIT_LABEL, [new Uint8Array([1])]);
    const b = seal(keys.pm, PAIR_COMMIT_LABEL, [new Uint8Array([1])]);
    expect(toHex(a.subarray(0, NONCE_LEN))).not.toBe(toHex(b.subarray(0, NONCE_LEN)));
    expect(open(keys.pm, a, PAIR_COMMIT_LABEL, 1)?.map(toHex)).toEqual(["01"]);
    expect(open(keys.mp, a, PAIR_COMMIT_LABEL, 1)).toBeNull();
    for (let i = 0; i < a.length; i++) {
      const bad = a.slice();
      bad[i] ^= 1;
      expect(open(keys.pm, bad, PAIR_COMMIT_LABEL, 1), `byte ${i}`).toBeNull();
    }
    for (let n = 0; n < 40; n++) expect(open(keys.pm, a.subarray(0, n), PAIR_COMMIT_LABEL, 0)).toBeNull();
  });

  it("generate.mjs --check: the committed crypto vectors match the node:crypto oracle", () => {
    const script = vectorPath("generate.mjs");
    const run = spawnSync(process.execPath, [script, "--check"], { encoding: "utf8" });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });
});

const publicKeyOf = (seed: Uint8Array) => ed25519.getPublicKey(seed);

describe("the package's surface", () => {
  it("does not export sealWithNonce: real seals take a random nonce", () => {
    expect("sealWithNonce" in protocol).toBe(false);
    expect(typeof protocol.seal).toBe("function");
  });

  it("exports none of the Noise test hooks, the raw layer or the responder", () => {
    for (const name of [
      "handshakeRaw",
      "startHandshakeWith",
      "readHs1",
      "readHs1With",
      "presetNonces",
      "createSession",
      "CipherState",
      "isLowOrder",
      "u64be",
      "phoneSessionWithLimits",
      "Scheduler",
    ]) {
      expect(name in protocol, name).toBe(false);
    }
    expect(typeof protocol.startHandshake).toBe("function");
    expect(typeof protocol.encodeRouted).toBe("function");
  });
});

describe("input lengths", () => {
  const ok = {
    relay: "wss://relay.example.com",
    slot: new Uint8Array(16),
    id: new Uint8Array(32),
    x: new Uint8Array(32),
    s: new Uint8Array(32),
    name: "Mac",
  };

  it("buildPairCode accepts the right lengths", () => {
    expect(buildPairCode(ok).ok).toBe(true);
  });

  it.each([
    ["slot", 15],
    ["slot", 32],
    ["id", 31],
    ["id", 33],
    ["x", 16],
    ["x", 0],
    ["s", 31],
    ["s", 64],
  ] as const)("buildPairCode throws on a %s of %i bytes", (field, len) => {
    expect(() => buildPairCode({ ...ok, [field]: new Uint8Array(len) })).toThrow(RangeError);
  });

  it("pairKeys throws unless s is 32 bytes and slot is 16", () => {
    expect(() => pairKeys(new Uint8Array(32), new Uint8Array(16))).not.toThrow();
    expect(() => pairKeys(new Uint8Array(31), new Uint8Array(16))).toThrow(RangeError);
    expect(() => pairKeys(new Uint8Array(33), new Uint8Array(16))).toThrow(RangeError);
    expect(() => pairKeys(new Uint8Array(32), new Uint8Array(15))).toThrow(RangeError);
    expect(() => pairKeys(new Uint8Array(32), new Uint8Array(32))).toThrow(RangeError);
  });
});

// --- Noise IK (story 4) -------------------------------------------------------------

/** Byte i is i % 251: every frame plaintext in noise.json. */
const plaintextOf = (len: number) => Uint8Array.from({ length: len }, (_, i) => i % 251);
const sha256Hex = (b: Uint8Array) => toHex(nodeSha256(b));

function noiseVectors() {
  const file = load("noise.json");
  const k = file.keys;
  const mac = staticFromSecret(fromHex(k.mac_static_secret));
  const phone = staticFromSecret(fromHex(k.phone_static_secret));
  const iM = fromHex(k.i_m);
  const iP = fromHex(k.i_p);
  const initiator = (i: number) => {
    const h = file.handshakes[i];
    return startHandshakeWith(phone, iM, iP, mac.public, h.counter, fromHex(h.phone_ephemeral));
  };
  const sessions = (i: number) => {
    const h = file.handshakes[i];
    const init = initiator(i);
    const read = readHs1With(mac, iM, iP, init.hs1, fromHex(h.mac_ephemeral));
    if (!read) throw new Error("hs1 refused");
    const { hs2, session: macSession } = read.reply();
    const phoneSession = init.finish(hs2);
    if (!phoneSession) throw new Error("hs2 refused");
    return { phone: phoneSession, mac: macSession };
  };
  return { file, mac, phone, iM, iP, initiator, sessions };
}

function scriptBody(step: Json): Uint8Array {
  if (step.body !== undefined) return fromHex(step.body);
  const out = new Uint8Array(step.body_fill.len);
  out.set(fromHex(step.body_fill.prefix));
  return out;
}

describe("Noise IK vectors", () => {
  it("cacophony's IK vector runs through the raw layer", () => {
    const v = load("cacophony-ik.json").vector;
    expect(v.protocol_name).toBe(NOISE_PATTERN);
    const msgs = v.messages;
    expect(msgs.length).toBe(6);
    const init = handshakeRaw({
      initiator: true,
      prologue: fromHex(v.init_prologue),
      localSecret: fromHex(v.init_static),
      remoteStatic: fromHex(v.init_remote_static),
      fixedEphemeral: fromHex(v.init_ephemeral),
    });
    const resp = handshakeRaw({
      initiator: false,
      prologue: fromHex(v.resp_prologue),
      localSecret: fromHex(v.resp_static),
      fixedEphemeral: fromHex(v.resp_ephemeral),
    });
    const hs1 = init.write(fromHex(msgs[0].payload));
    expect(toHex(hs1)).toBe(msgs[0].ciphertext);
    expect(hs1.length).toBe(112);
    expect(toHex(resp.read(hs1)!)).toBe(msgs[0].payload);
    const hs2 = resp.write(fromHex(msgs[1].payload));
    expect(toHex(hs2)).toBe(msgs[1].ciphertext);
    expect(hs2.length).toBe(63);
    expect(toHex(init.read(hs2)!)).toBe(msgs[1].payload);
    expect(toHex(init.handshakeHash())).toBe(v.handshake_hash);
    expect(toHex(resp.handshakeHash())).toBe(v.handshake_hash);
    const i = init.transport();
    const r = resp.transport();
    msgs.slice(2).forEach((m: Json, j: number) => {
      const [from, to] = j % 2 === 0 ? [i, r] : [r, i];
      const ct = from.encrypt(Math.floor(j / 2), fromHex(m.payload));
      expect(toHex(ct), `message ${j + 2}`).toBe(m.ciphertext);
      expect(toHex(to.decrypt(Math.floor(j / 2), ct)!)).toBe(m.payload);
    });
  });

  it("handshakes: hs1, hs2, handshake hash and session id", () => {
    const n = noiseVectors();
    expect(n.file.pattern).toBe(NOISE_PATTERN);
    expect(toHex(noisePrologue(n.iM, n.iP))).toBe(n.file.prologue);
    expect(toHex(n.mac.public)).toBe(n.file.keys.mac_static_public);
    expect(toHex(n.phone.public)).toBe(n.file.keys.phone_static_public);
    expect(n.file.handshakes.map((h: Json) => h.counter)).toEqual([0, 1760000000000, MAX_COUNTER]);
    n.file.handshakes.forEach((h: Json, i: number) => {
      const init = n.initiator(i);
      expect(toHex(init.hs1)).toBe(h.hs1);
      expect(init.hs1.length).toBe(HS1_LEN);
      expect(init.counter).toBe(h.counter);
      const read = readHs1With(n.mac, n.iM, n.iP, init.hs1, fromHex(h.mac_ephemeral))!;
      expect(read.counter).toBe(h.counter);
      expect(toHex(read.remoteStatic)).toBe(toHex(n.phone.public));
      const { hs2, session: mac } = read.reply();
      expect(toHex(hs2)).toBe(h.hs2);
      expect(hs2.length).toBe(HS2_LEN);
      const phone = init.finish(hs2)!;
      expect(toHex(phone.id)).toBe(h.session_id);
      expect(toHex(mac.id)).toBe(h.session_id);
      expect(h.handshake_hash.slice(0, 16)).toBe(h.session_id);
    });
  });

  it("frames both ways at nonces 0, 1, 7 with 0, 1 and 60,000-byte plaintexts", () => {
    const n = noiseVectors();
    const { phone, mac } = n.sessions(0);
    for (const f of n.file.frames) {
      const [from, to] = f.direction === "phone_to_mac" ? [phone, mac] : [mac, phone];
      presetNonces(from, f.nonce, null);
      const sealed = from.seal(plaintextOf(f.plaintext_len));
      if (!sealed.ok) throw new Error(sealed.error);
      expect(from.sendNonce).toBe(f.nonce + 1);
      expect(sealed.body.length).toBe(f.body_len);
      if (f.body !== undefined) expect(toHex(sealed.body)).toBe(f.body);
      else expect(sha256Hex(sealed.body)).toBe(f.body_sha256);
      presetNonces(to, 0, null);
      const got = to.open(sealed.body);
      expect(got.kind).toBe("accept");
      if (got.kind === "accept") expect(toHex(got.plaintext)).toBe(toHex(plaintextOf(f.plaintext_len)));
      expect(to.lastRecv).toBe(f.nonce);
    }
  });

  it("envelopes for each type", () => {
    const n = noiseVectors();
    for (const e of n.file.envelopes) {
      const routed = { kind: e.kind, peer: fromHex(e.peer), body: fromHex(e.body) };
      expect(toHex(encodeRouted(routed))).toBe(e.bytes);
      const parsed = parseRouted(fromHex(e.bytes))!;
      expect(parsed.kind).toBe(e.kind);
      expect(toHex(parsed.peer)).toBe(e.peer);
      expect(toHex(parsed.body)).toBe(e.body);
    }
  });

  it("the sweep of 16 transcripts", () => {
    const n = noiseVectors();
    expect(n.file.sweep.length).toBe(16);
    for (const c of n.file.sweep) {
      const phone = staticFromSecret(fromHex(c.phone_secret));
      const mac = staticFromSecret(fromHex(c.mac_secret));
      const iM = fromHex(c.i_m);
      const iP = fromHex(c.i_p);
      const init = startHandshakeWith(phone, iM, iP, mac.public, c.counter, fromHex(c.phone_ephemeral));
      expect(toHex(init.hs1)).toBe(c.hs1);
      const { hs2, session: m } = readHs1With(mac, iM, iP, init.hs1, fromHex(c.mac_ephemeral))!.reply();
      expect(toHex(hs2)).toBe(c.hs2);
      const p = init.finish(hs2)!;
      expect(toHex(p.id)).toBe(c.session_id);
      for (const f of c.frames) {
        const [from, to] = f.direction === "phone_to_mac" ? [p, m] : [m, p];
        presetNonces(from, f.nonce, null);
        const sealed = from.seal(plaintextOf(f.plaintext_len));
        if (!sealed.ok) throw new Error(sealed.error);
        expect(toHex(sealed.body)).toBe(f.body);
        expect(to.open(sealed.body).kind).toBe("accept");
      }
    }
  });

  it("every crypto-layer refused hs1 is refused", () => {
    const n = noiseVectors();
    expect(n.file.low_order.length).toBe(14);
    expect(n.file.refused.hs1.length).toBe(9 + 28);
    for (const c of n.file.refused.hs1) {
      expect(c.layer).toBe("crypto");
      expect(readHs1(n.mac, n.iM, fromHex(c.sender_i_p), fromHex(c.hs1)), c.why).toBeNull();
    }
  });

  it("every crypto-layer refused hs2 is refused, and the right hs2 still completes", () => {
    const n = noiseVectors();
    const good = fromHex(n.file.handshakes[0].hs2);
    expect(n.file.refused.hs2.length).toBe(6 + 14);
    for (const c of n.file.refused.hs2) {
      expect(c.layer).toBe("crypto");
      const init = n.initiator(0);
      expect(init.finish(fromHex(c.hs2)), c.why).toBeNull();
      expect(toHex(init.finish(good)!.id), c.why).toBe(n.file.handshakes[0].session_id);
    }
  });

  it("the low-order rule agrees with noble's all-zero X25519 output", () => {
    const n = noiseVectors();
    for (const { u } of n.file.low_order) {
      expect(isLowOrder(fromHex(u))).toBe(true);
      expect(() => x25519.getSharedSecret(n.mac.secret, fromHex(u))).toThrow();
      expect(() => startHandshake(n.phone, n.iM, n.iP, fromHex(u), 0)).toThrow(/low-order/);
    }
    for (let i = 0; i < 200; i++) {
      const u = randomBytes(32);
      expect(isLowOrder(u)).toBe(false);
      expect(() => x25519.getSharedSecret(n.mac.secret, u)).not.toThrow();
    }
    expect(isLowOrder(n.mac.public)).toBe(false);
  });

  it("an e with the top bit set completes, both ways", () => {
    const n = noiseVectors();
    const h0 = n.file.handshakes[0];
    const [a, b] = n.file.high_bit_e;
    const read = readHs1With(n.mac, n.iM, n.iP, fromHex(a.hs1), fromHex(h0.mac_ephemeral))!;
    const { hs2, session } = read.reply();
    expect(toHex(hs2)).toBe(a.hs2);
    expect(toHex(session.id)).toBe(a.session_id);
    const init = n.initiator(0);
    expect(toHex(init.hs1)).toBe(b.hs1);
    expect(toHex(init.finish(fromHex(b.hs2))!.id)).toBe(b.session_id);
  });

  it("receiver scripts: every frame row of the matrix", () => {
    const n = noiseVectors();
    expect(n.file.receiver_scripts.length).toBe(2);
    for (const script of n.file.receiver_scripts) {
      const { phone, mac } = n.sessions(0);
      const to = script.direction === "phone_to_mac" ? mac : phone;
      for (const step of script.steps) {
        const got = to.open(scriptBody(step));
        expect(got.kind, step.why).toBe(step.outcome);
        if (got.kind === "accept") expect(toHex(got.plaintext), step.why).toBe(toHex(plaintextOf(step.plaintext_len)));
        expect(to.lastRecv, step.why).toBe(step.last_recv);
      }
    }
  });

  it("AC6: nonces 0, 2, 2, 1, 5 give accept, accept, drop, drop, accept", () => {
    const n = noiseVectors();
    const { mac } = n.sessions(0);
    const { phone } = n.sessions(0);
    const outcomes = [0, 2, 2, 1, 5].map((nonce) => {
      presetNonces(phone, nonce, null);
      const sealed = phone.seal(plaintextOf(1));
      if (!sealed.ok) throw new Error(sealed.error);
      return mac.open(sealed.body).kind;
    });
    expect(outcomes).toEqual(["accept", "accept", "drop", "drop", "accept"]);
  });

  it("AC7: 60,001 bytes are refused with no nonce used; 60,000 seal into an envelope of at most 65,536", () => {
    const { phone, mac } = noiseVectors().sessions(0);
    expect(() => phone.seal(new Uint8Array(MAX_PLAINTEXT + 1))).toThrow(RangeError);
    expect(phone.sendNonce).toBe(0);
    const sealed = phone.seal(new Uint8Array(MAX_PLAINTEXT));
    if (!sealed.ok) throw new Error(sealed.error);
    const envelope = encodeRouted({ kind: 3, peer: new Uint8Array(32), body: sealed.body });
    expect(envelope.length).toBeLessThanOrEqual(65536);
    expect(mac.open(sealed.body).kind).toBe("accept");
  });

  it("the send nonce stops at 2^32 and a received nonce of 2^32 is bad", () => {
    const { phone, mac } = noiseVectors().sessions(0);
    presetNonces(phone, NONCE_CEILING - 1, null);
    const last = phone.seal(plaintextOf(1));
    if (!last.ok) throw new Error(last.error);
    expect(phone.seal(plaintextOf(1))).toEqual({ ok: false, error: "ceiling" });
    expect(phone.sendNonce).toBe(NONCE_CEILING);
    expect(mac.open(last.body).kind).toBe("accept");
    expect(mac.lastRecv).toBe(NONCE_CEILING - 1);
  });

  it("2,000 random bodies through open and parseRouted never throw", () => {
    const { mac } = noiseVectors().sessions(0);
    for (let i = 0; i < 2000; i++) {
      const body = randomBytes(i % 200);
      if (i % 2 === 0 && body.length >= 8) body.set(mac.id);
      expect(() => mac.open(body)).not.toThrow();
      expect(() => parseRouted(body)).not.toThrow();
    }
  });

  it("differential: 64 seeded random cases equal generate.mjs --differential", () => {
    // A small seeded generator, so a failure reproduces.
    let seed = 0x2545f491;
    const next = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return seed >>> 0;
    };
    const bytes = (n: number) => Uint8Array.from({ length: n }, () => next() & 0xff);
    const cases = Array.from({ length: 64 }, (_, i) => ({
      phone_secret: toHex(bytes(32)),
      mac_secret: toHex(bytes(32)),
      phone_ephemeral: toHex(bytes(32)),
      mac_ephemeral: toHex(bytes(32)),
      i_m: toHex(bytes(32)),
      i_p: toHex(bytes(32)),
      counter: i === 0 ? MAX_COUNTER : (next() % 2 ** 21) * 2 ** 32 + next(),
      frames: [
        { direction: "phone_to_mac", nonce: next() % 1000, plaintext_len: i === 1 ? MAX_PLAINTEXT : next() % 60001 },
        { direction: "mac_to_phone", nonce: i === 2 ? NONCE_CEILING - 1 : next() % 1000, plaintext_len: next() % 2000 },
      ],
    }));
    const ours = cases.map((c) => {
      const phone = staticFromSecret(fromHex(c.phone_secret));
      const mac = staticFromSecret(fromHex(c.mac_secret));
      const init = startHandshakeWith(phone, fromHex(c.i_m), fromHex(c.i_p), mac.public, c.counter, fromHex(c.phone_ephemeral));
      const read = readHs1With(mac, fromHex(c.i_m), fromHex(c.i_p), init.hs1, fromHex(c.mac_ephemeral))!;
      const { hs2, session: m, handshakeHash } = read.reply();
      const p = init.finish(hs2)!;
      const parts = [init.hs1, hs2, handshakeHash];
      for (const f of c.frames) {
        const from = f.direction === "phone_to_mac" ? p : m;
        presetNonces(from, f.nonce, null);
        const sealed = from.seal(plaintextOf(f.plaintext_len));
        if (!sealed.ok) throw new Error(sealed.error);
        parts.push(sealed.body);
      }
      return sha256Hex(concatBytes(...parts));
    });
    const run = spawnSync(process.execPath, [vectorPath("generate.mjs"), "--differential"], {
      input: JSON.stringify(cases),
      encoding: "utf8",
    });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual(ours);
  });
});

describe("Noise input checks", () => {
  const k = staticFromSecret(new Uint8Array(32).fill(1));
  const mac = staticFromSecret(new Uint8Array(32).fill(2));
  const id = new Uint8Array(32);

  it.each([
    ["the own secret", () => staticFromSecret(new Uint8Array(31))],
    ["I_M", () => startHandshake(k, new Uint8Array(31), id, mac.public, 0)],
    ["I_P", () => startHandshake(k, id, new Uint8Array(33), mac.public, 0)],
    ["the Mac's static", () => startHandshake(k, id, id, new Uint8Array(16), 0)],
    ["the prologue's I_M", () => noisePrologue(new Uint8Array(0), id)],
    ["an envelope's peer", () => encodeRouted({ kind: 1, peer: new Uint8Array(31), body: new Uint8Array(0) })],
  ])("a RangeError for a wrong-length %s", (_what, f) => {
    expect(f).toThrow(RangeError);
  });

  it.each([-1, 1.5, 2 ** 53, Number.NaN, Infinity])("a RangeError for counter %s", (c) => {
    expect(() => startHandshake(k, id, id, mac.public, c)).toThrow(RangeError);
  });

  it("accepts counter 2^53-1", () => {
    expect(startHandshake(k, id, id, mac.public, MAX_COUNTER).counter).toBe(MAX_COUNTER);
  });

  it("an envelope's kind must be 1, 2 or 3", () => {
    expect(() => encodeRouted({ kind: 4 as 1, peer: id, body: new Uint8Array(0) })).toThrow(RangeError);
    expect(parseRouted(new Uint8Array(32))).toBeNull();
    expect(parseRouted(concatBytes(Uint8Array.of(4), id))).toBeNull();
    expect(parseRouted(concatBytes(Uint8Array.of(3), id))?.body.length).toBe(0);
  });
});

// @vitest-environment node
// The shared protocol vectors in packages/protocol/vectors/, which the Rust
// suite (relay/protocol/src/vectors.rs) reads too.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ed25519 } from "@noble/curves/ed25519";
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
  buildPairCode,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const vectorPath = (name: string) => fileURLToPath(new URL(`../vectors/${name}`, import.meta.url));
const load = (name: string): Json => JSON.parse(readFileSync(vectorPath(name), "utf8"));
const fields = (list: string[]) => list.map(fromHex);

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

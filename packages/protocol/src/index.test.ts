import { describe, expect, it } from "vitest";
import { NOISE_PATTERN, suite } from "./index";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g)!, (h) => parseInt(h, 16));

describe("@ade/protocol", () => {
  it("names the Noise pattern", () => {
    expect(NOISE_PATTERN).toBe("Noise_IK_25519_ChaChaPoly_SHA256");
  });

  // Known answers, so each @noble peer is proven to resolve and run.
  it("wires X25519 (RFC 7748 section 6.1)", () => {
    const alicePriv = unhex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a");
    expect(hex(suite.dh.getPublicKey(alicePriv))).toBe(
      "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a",
    );
  });

  it("wires SHA-256", () => {
    expect(hex(suite.hash(new TextEncoder().encode("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("wires ChaCha20-Poly1305", () => {
    const key = new Uint8Array(32);
    const nonce = new Uint8Array(12);
    const plain = new TextEncoder().encode("ade");
    const sealed = suite.cipher(key, nonce).encrypt(plain);
    expect(sealed.length).toBe(plain.length + 16);
    expect(hex(suite.cipher(key, nonce).decrypt(sealed))).toBe(hex(plain));
  });
});

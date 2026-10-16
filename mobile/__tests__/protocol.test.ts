import {
  NOISE_PATTERN,
  PAIR_COMMIT_LABEL,
  fromHex,
  open,
  pairKeys,
  parsePairCode,
  sasCode,
  seal,
  suite,
  toHex,
} from "@ade/protocol";

// Proves Jest resolves the file: dependency, compiles its TypeScript, and finds
// its @noble peers in the app's node_modules.
describe("@ade/protocol from the app", () => {
  it("exports the Noise pattern", () => {
    expect(NOISE_PATTERN).toBe("Noise_IK_25519_ChaChaPoly_SHA256");
  });

  it("runs SHA-256 from its @noble peer", () => {
    const digest = suite.hash(Uint8Array.from([0x61, 0x62, 0x63])); // "abc"
    expect(Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  // One case each from the shared vectors (packages/protocol/vectors/qr.json and
  // sas.json), so the app's toolchain runs the same code as the vector tests.
  it("parses a pairing code", () => {
    const got = parsePairCode(
      "ade-pair://v1?relay=wss%3A%2F%2Frelay.example.com&slot=AAECAwQFBgcICQoLDA0ODw" +
        "&id=ERERERERERERERERERERERERERERERERERERERERERE&x=IiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiI" +
        "&s=MzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM&n=Alvin%E2%80%99s%20MacBook",
    );
    if (!got.ok) throw new Error(got.error);
    expect(got.value.relay).toBe("wss://relay.example.com");
    expect(toHex(got.value.slot)).toBe("000102030405060708090a0b0c0d0e0f");
    expect(got.value.name).toBe("Alvin\u2019s MacBook");
    expect(parsePairCode("ade-pair://v2?relay=x")).toEqual({ ok: false, error: "newer_version" });
  });

  it("computes the 6-digit code, leading zero kept", () => {
    expect(
      sasCode({
        slot: fromHex("f15f4e76b5bdb314cb41ca03156f1585"),
        iM: fromHex("6f7c3a78bac7cbf8b08cf1e464cabeb6d0588f370369384daeaaa32fa5dedcb6"),
        sM: fromHex("10647585c7932c92e3e952387b897204bd95c54a42a59ed4ebccb4709e848219"),
        iP: fromHex("bf1ac0cce71da6a8452a664823446d47fcf2e95a77e501b281dbe1406ac34bd5"),
        sP: fromHex("a4a1777db458117e062a966995cc749e2396a099866a808c63b4f069ea61ded4"),
        nM: fromHex("09390679a31193e567ca54d369758d3b5e61f7f29757bc33abcdae9ad64f2a69"),
        nP: fromHex("b4dcc067d48595ad5818b6183971f9eae64085653f0c5aea6e6ff2c823c0533f"),
        s: fromHex("10fc414c10446ef73121fa0d1f27e161a8a10388ce2e99cb93fd233a68c0bd09"),
      }),
    ).toBe("019793");
  });

  it("seals with a random nonce from getRandomValues, and opens", () => {
    const keys = pairKeys(new Uint8Array(32).fill(5), new Uint8Array(16).fill(6));
    const a = seal(keys.pm, PAIR_COMMIT_LABEL, [Uint8Array.from([1, 2, 3])]);
    const b = seal(keys.pm, PAIR_COMMIT_LABEL, [Uint8Array.from([1, 2, 3])]);
    expect(toHex(a.subarray(0, 24))).not.toBe(toHex(b.subarray(0, 24)));
    expect(open(keys.pm, a, PAIR_COMMIT_LABEL, 1)?.map(toHex)).toEqual(["010203"]);
    expect(open(keys.mp, a, PAIR_COMMIT_LABEL, 1)).toBeNull();
  });
});

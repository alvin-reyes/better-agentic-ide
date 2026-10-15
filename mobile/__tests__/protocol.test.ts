import { NOISE_PATTERN, suite } from "@ade/protocol";

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
});

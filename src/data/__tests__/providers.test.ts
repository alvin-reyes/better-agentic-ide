import { describe, it, expect } from "vitest";
import { PROVIDERS, binaryFor } from "../providers";

/**
 * The picker probes each provider by running `check_command_exists` against a
 * binary name. It used to pass the provider id, which holds for every provider
 * whose id is its command but not for DeepSeek: that is the claude binary
 * redirected at an Anthropic-compatible endpoint, so probing for `deepseek`
 * would report it missing on a machine where it works perfectly.
 */
describe("provider binaries", () => {
  it("probes deepseek as claude, because that is what it runs", () => {
    expect(binaryFor("deepseek")).toBe("claude");
  });

  it("probes every other provider as its own id", () => {
    for (const p of PROVIDERS) {
      if (p.id === "deepseek") continue;
      expect(binaryFor(p.id)).toBe(p.id);
    }
  });

  it("gives every provider a binary", () => {
    for (const p of PROVIDERS) expect(binaryFor(p.id)).toBeTruthy();
  });
});

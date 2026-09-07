import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DATA = resolve(__dirname, "..");

describe("legacy agent data is retired", () => {
  it("no longer ships agentProfiles.ts", () => {
    expect(existsSync(resolve(DATA, "agentProfiles.ts"))).toBe(false);
  });

  it("no longer ships bmadPersonas.ts", () => {
    expect(existsSync(resolve(DATA, "bmadPersonas.ts"))).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const SRC = resolve(__dirname, "../..");

/**
 * Directories held to the design invariants. Part 2 appends each surface
 * here as it is migrated, so the guarded area grows monotonically and a
 * migrated file can never regress.
 */
const MIGRATED_PATHS = ["components/ui"];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...filesUnder(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const guarded = MIGRATED_PATHS.flatMap((p) => filesUnder(resolve(SRC, p)));

describe("design invariants", () => {
  it("guards at least one file", () => {
    expect(guarded.length).toBeGreaterThan(0);
  });

  it("uses no inline fontSize literals", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      expect(
        /fontSize:\s*["'`]?\d/.test(source),
        `${file} contains an inline fontSize literal; use a --text-* token`
      ).toBe(false);
    }
  });

  it("uses no raw hex colours", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      const matches = source.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
      expect(
        matches.length,
        `${file} contains raw hex ${matches.join(", ")}; use a theme token`
      ).toBe(0);
    }
  });

  it("uses no onMouseEnter styling handlers", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      expect(
        source.includes("onMouseEnter"),
        `${file} styles on onMouseEnter; use a CSS :hover rule`
      ).toBe(false);
    }
  });
});

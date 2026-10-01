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

/**
 * Matches every hex colour form CSS and JSX accept: 3-digit shorthand
 * (#fff), 4-digit shorthand with alpha, 6-digit, and 8-digit with alpha.
 * The trailing lookahead does the work `\b` cannot — alpha digits are word
 * characters, so `#ffffffAA` never fires a word boundary after 6 digits.
 */
const HEX_COLOR = /#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g;

/**
 * Guarded file types. `.css` matters as much as `.tsx`: the primitives keep
 * their rules in components/ui/ui.css, and a raw hex there is exactly the
 * regression this guard exists to catch.
 */
const GUARDED_EXT = /\.(tsx?|css)$/;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...filesUnder(full));
    } else if (GUARDED_EXT.test(entry)) {
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

  it("guards the stylesheet alongside the components", () => {
    expect(guarded.some((f) => f.endsWith(".css"))).toBe(true);
  });

  it("matches every hex form, not just 6-digit", () => {
    expect("color: #fff".match(HEX_COLOR)?.length).toBe(1);
    expect("color: #ffffffAA".match(HEX_COLOR)?.length).toBe(1);
    expect("color: #1a2b3c".match(HEX_COLOR)?.length).toBe(1);
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
      const matches = source.match(HEX_COLOR) ?? [];
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

  it("uses no blanket transition: all", () => {
    for (const file of guarded) {
      const source = readFileSync(file, "utf8");
      expect(
        /transition:\s*all\b/.test(source),
        `${file} uses "transition: all"; list the properties that change`
      ).toBe(false);
    }
  });
});

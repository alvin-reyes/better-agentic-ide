import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BMAD_PARAGRAPH, BMAD_SHIPPED, bmadSection, bmadText } from "../src/lib/projectMethodology";

/**
 * Rust edits the BMAD paragraph of CLAUDE.md with texts only the frontend
 * holds. Its tests run over this fixture, which is what the app sends for
 * each version, so they see the paragraphs that shipped and not stand-ins
 * (src-tauri/src/projectsetup.rs reads it). A changed paragraph makes this
 * fail until the fixture is written again:
 *
 *   UPDATE_FIXTURES=1 npx vitest run scripts/bmadTextFixture.test.ts
 */
const FIXTURE = resolve(__dirname, "..", "src-tauri/src/fixtures/bmad-text.json");
const current = `${JSON.stringify({ v6: bmadText("v6"), v4: bmadText("v4") }, null, 2)}\n`;

describe("the BMAD paragraphs, as Rust's tests read them", () => {
  it("are the ones the app sends", () => {
    if (process.env.UPDATE_FIXTURES) writeFileSync(FIXTURE, current);
    expect(readFileSync(FIXTURE, "utf8").replace(/\r\n/g, "\n")).toBe(current);
  });

  it("hold each version's paragraph, every shipped text and their sections", () => {
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    for (const version of ["v6", "v4"] as const) {
      expect(fixture[version].paragraph).toBe(BMAD_PARAGRAPH[version]);
      expect(fixture[version].section).toBe(bmadSection(version));
      expect(fixture[version].paragraphs).toEqual(BMAD_SHIPPED);
      expect(fixture[version].sections).toHaveLength(BMAD_SHIPPED.length);
    }
  });
});

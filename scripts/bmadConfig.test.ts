import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BMAD_DEFAULTS, parseBmadConfig, gatesDir } from "../src/lib/bmadConfig";

const VENDORED = resolve(__dirname, "..", "src-tauri/resources/bmad/bmad-core/core-config.yaml");

describe("parseBmadConfig", () => {
  it("reads the vendored config BMAD actually ships", () => {
    const p = parseBmadConfig(readFileSync(VENDORED, "utf8"));
    expect(p.qaLocation).toBe("docs/qa");
    expect(p.prdFile).toBe("docs/prd.md");
    expect(p.prdSharded).toBe(true);
    expect(p.prdShardedLocation).toBe("docs/prd");
    expect(p.architectureFile).toBe("docs/architecture.md");
    expect(p.architectureSharded).toBe(true);
    expect(p.devStoryLocation).toBe("docs/stories");
    expect(p.usedDefaults).toBe(false);
  });

  it("honours a customised layout", () => {
    const p = parseBmadConfig(`qa:\n  qaLocation: quality\nprd:\n  prdFile: spec/prd.md\n  prdSharded: false\ndevStoryLocation: work/stories\n`);
    expect(p.qaLocation).toBe("quality");
    expect(p.prdFile).toBe("spec/prd.md");
    expect(p.prdSharded).toBe(false);
    expect(p.devStoryLocation).toBe("work/stories");
  });

  // Review Focus 1: every new project has no config yet.
  it("falls back to the documented defaults, and says so", () => {
    const p = parseBmadConfig(null);
    expect(p).toEqual({ ...BMAD_DEFAULTS, usedDefaults: true });
    expect(p.qaLocation).toBe("docs/qa");
  });

  it("fills in only what a partial config omits", () => {
    const p = parseBmadConfig("devStoryLocation: work/stories\n");
    expect(p.devStoryLocation).toBe("work/stories");
    expect(p.qaLocation).toBe("docs/qa");
    expect(p.usedDefaults).toBe(false);
  });

  it("puts gates under qaLocation, not at the root", () => {
    expect(gatesDir(parseBmadConfig(null))).toBe("docs/qa/gates");
    expect(gatesDir(parseBmadConfig("qa:\n  qaLocation: quality\n"))).toBe("quality/gates");
  });
});

describe("usedDefaults means the paths did not come from a config", () => {
  it("is true for an empty or unreadable config, not only a missing one", () => {
    // An empty file yields every default; reporting usedDefaults false would
    // tell the user their config supplied paths it never mentioned.
    expect(parseBmadConfig("").usedDefaults).toBe(true);
    expect(parseBmadConfig("# only a comment\n").usedDefaults).toBe(true);
  });

  it("reads the YAML spellings of true, not just the lowercase one", () => {
    // prdSharded: True and prdSharded: yes are valid YAML booleans.
    expect(parseBmadConfig("prd:\n  prdSharded: True\n").prdSharded).toBe(true);
    expect(parseBmadConfig("prd:\n  prdSharded: yes\n").prdSharded).toBe(true);
    expect(parseBmadConfig("prd:\n  prdSharded: no\n").prdSharded).toBe(false);
  });
});

describe("the same newline defect, in the config parser", () => {
  it("does not let an empty key swallow the next line", () => {
    const p = parseBmadConfig("prd:\n  prdFile:\n  prdSharded: false\n");
    expect(p.prdFile).toBe("docs/prd.md");
    expect(p.prdSharded).toBe(false);
  });

  it("keeps a # that is inside quotes", () => {
    expect(parseBmadConfig('prd:\n  prdFile: "docs/a#b/prd.md"\n').prdFile).toBe("docs/a#b/prd.md");
  });

  it("falls back rather than guessing false for an unrecognised boolean", () => {
    // prdSharded defaults to true; `maybe` is not false, it is unreadable.
    expect(parseBmadConfig("prd:\n  prdSharded: maybe\n").prdSharded).toBe(true);
  });

  it("says it used defaults when the config names no path at all", () => {
    // markdownExploder/slashPrefix exist in the vendored file but set no path.
    expect(parseBmadConfig("markdownExploder: true\nslashPrefix: BMad\n").usedDefaults).toBe(true);
  });
});

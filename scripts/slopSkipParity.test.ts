import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The slop rules have two implementations: `src/lib/slopCheck.ts`, used by the
 * app's "Check changes", and an awk program in the plugin's Stop hook. They
 * share `slop-patterns.tsv` for the rules themselves, but each carries its own
 * copy of the skip list — so the lists can drift apart silently, and a path
 * ignored in one would be flagged by the other on the same diff.
 *
 * This lives in scripts/ rather than src/ because it reads files: test files
 * under src/ have broken CI's typecheck before by importing node:fs.
 */
const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const ts = read("src/lib/slopCheck.ts");
const hook = read("claude-plugin/plugins/ade/scripts/slop-check.sh");

/** Directory names both implementations must ignore. */
const SKIPPED = ["node_modules", "vendor", "dist", "build", "target", "bmad-core"];

describe("the two slop implementations skip the same things", () => {
  it.each(SKIPPED)("both skip %s", (dir) => {
    expect(ts, `slopCheck.ts does not skip ${dir}`).toContain(dir);
    expect(hook, `slop-check.sh does not skip ${dir}`).toContain(dir);
  });

  it("both skip the vendored BMAD source, not just the installed copy", () => {
    // .bmad-core/ is where BMAD lands in a user's project; resources/bmad/ is
    // where this repo ships it from. Flagging either rewrites BMAD's prose,
    // which re-vendoring would undo.
    expect(ts).toMatch(/resources\\?\/bmad/);
    expect(hook).toMatch(/resources\\?\/bmad/);
  });

  it("both ignore the rules file itself", () => {
    // It lists the banned words by definition.
    expect(ts).toContain("slop-patterns");
    expect(hook).toContain("slop-patterns");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * shellQuote.test.ts runs real zsh and fish, and fails on CI when either is
 * missing (ADR 0008). The frontend job has to install them before the tests.
 */
const CI = readFileSync(resolve(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");

/** The text of one job, from its key to the next top-level job key. */
function job(name: string): string {
  const start = CI.indexOf(`\n  ${name}:\n`);
  expect(start, `no ${name} job`).toBeGreaterThan(-1);
  const rest = CI.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

describe("CI", () => {
  it("CI runs the real shells", () => {
    const frontend = job("frontend");
    const install = frontend.search(/apt-get install -y --no-install-recommends (fish zsh|zsh fish)\b/);
    const tests = frontend.indexOf("run: npm test");
    expect(install, "the frontend job installs fish and zsh").toBeGreaterThan(-1);
    expect(tests).toBeGreaterThan(-1);
    expect(install, "fish and zsh are installed before npm test").toBeLessThan(tests);
  });
});

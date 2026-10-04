import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The terminal asked for "JetBrains Mono" for a long time without shipping it.
 * On a machine that does not have it installed the stack fell all the way
 * through to generic `monospace`, so the terminal rendered in Menlo while the
 * UI rendered in a bundled Inter. It looked like the app had no typography.
 *
 * fontsource registers the family as "JetBrains Mono Variable", so naming
 * "JetBrains Mono" alone still misses even once the package is installed.
 * These assert the three things that have to agree.
 */
const REPO = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

describe("the mono font is actually shipped", () => {
  it("is a dependency, pinned", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    expect(deps["@fontsource-variable/jetbrains-mono"], "not a dependency").toBeTruthy();
  });

  it("is imported, so the build emits the woff2 files", () => {
    expect(read("src/main.tsx")).toContain('@fontsource-variable/jetbrains-mono');
  });

  it("every mono stack leads with the family fontsource registers", () => {
    // "JetBrains Mono" is not what gets registered; the Variable name is.
    expect(read("src/index.css")).toContain('--font-mono: "JetBrains Mono Variable"');
    expect(read("src/stores/settingsStore.ts")).toContain('"JetBrains Mono Variable"');
  });

  it("no stylesheet names the font without the Variable name first", () => {
    // One literal is allowed: the token definition, which lists both.
    const css = read("src/index.css");
    const literals = css.match(/"JetBrains Mono"(?!\s*Variable)/g) ?? [];
    const inToken = (css.match(/--font-mono:[^;]*"JetBrains Mono"/g) ?? []).length;
    expect(literals.length - inToken, "a stack names the font that is not registered").toBe(0);
  });

  it("the legacy saved stack is migrated, not inherited", () => {
    // Anyone running a build from before this shipped has the old string saved,
    // which names only fonts a stock machine lacks.
    const s = read("src/stores/settingsStore.ts");
    expect(s).toContain("LEGACY_MONO");
    expect(s).toMatch(/saved\.fontFamily === LEGACY_MONO/);
  });
});

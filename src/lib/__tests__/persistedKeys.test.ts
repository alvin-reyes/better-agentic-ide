import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * persistence.ts mirrors an allowlist of localStorage keys to disk, and disk is
 * the source of truth: a key missing from the list is never written to state/kv
 * and never restored. It then silently vanishes on a sync to another machine or
 * a snapshot restore.
 *
 * For the project-setup keys that is worse than losing a preference: the marks
 * recording "this project is already set up" and "the user undid setup, leave
 * it alone" are what stop autoProjectSetup re-scaffolding a project someone
 * deliberately cleaned out.
 *
 * So every persistent-looking key in src/lib and src/stores must be accounted
 * for — either persisted, or named here as deliberately per-machine.
 */
const SRC = resolve(__dirname, "../..");
const PERSISTENCE = readFileSync(resolve(SRC, "lib/persistence.ts"), "utf8");

/** Keys that are deliberately not synced, with the reason. */
const LOCAL_ONLY = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "__tests__") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** Every `"ade-…"` / `"better-terminal-…"` string literal assigned to a const. */
function declaredKeys(): { key: string; file: string }[] {
  const found: { key: string; file: string }[] = [];
  for (const f of [...walk(join(SRC, "lib")), ...walk(join(SRC, "stores"))]) {
    if (f.endsWith("persistence.ts")) continue;
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:KEY|key)\w*\s*=\s*"((?:ade|better-terminal)-[a-z0-9-]+)"/g)) {
      found.push({ key: m[1], file: f.slice(SRC.length + 1) });
    }
  }
  return found;
}

describe("persisted keys", () => {
  it("finds keys to check, so this test is not vacuous", () => {
    expect(declaredKeys().length).toBeGreaterThan(3);
  });

  it("persists every storage key, or lists it as deliberately local", () => {
    const missing = declaredKeys()
      .filter(({ key }) => !LOCAL_ONLY.has(key) && !PERSISTENCE.includes(`"${key}"`))
      .map(({ key, file }) => `${key} (${file})`);
    expect(missing, `not mirrored to disk: ${missing.join(", ")}`).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Hotfix 0.23.2: a `<style>` element React inserts at runtime is blocked in
 * the built app. index.html has an inline `<style>` (the splash), so Tauri's
 * codegen gives it a nonce (`tauri_utils::html::inject_nonce_token`) and, at
 * runtime, adds `'nonce-…'` to `style-src` (`tauri::manager::replace_csp_nonce`).
 * With a nonce in the directive, browsers ignore `'unsafe-inline'`, so the
 * element's rules never apply (v0.23.1's sub-terminal strip rendered as plain
 * text). Component CSS goes in a stylesheet Vite bundles, served from 'self'.
 */

const REPO = resolve(__dirname, "../../..");
const SRC = resolve(REPO, "src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sources(path);
    return /\.(tsx|jsx)$/.test(name) ? [path] : [];
  });
}

const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

describe("no component renders an inline <style> element", () => {
  it("no .tsx under src renders a <style> element", () => {
    const offenders = sources(SRC)
      .filter((path) => /<style[\s>]/.test(readFileSync(path, "utf8")))
      .map((path) => relative(REPO, path));
    expect(offenders, `inline <style> elements (blocked by the built app's CSP): ${offenders.join(", ")}`).toEqual([]);
  });

  it.each([
    ["src/components/SubTerminalStrip.tsx", "src/components/SubTerminalStrip.css", ["@keyframes subterm-spin", "@keyframes subterm-flash", ".subterm-strip {", ".subterm-entry[aria-selected=\"true\"]::after"]],
    ["src/components/BrowserTab.tsx", "src/components/BrowserTab.css", ["@keyframes loading-bar"]],
    ["src/components/RecordingControls.tsx", "src/components/RecordingControls.css", ["@keyframes recording-pulse"]],
  ])("%s imports its rules from a bundled stylesheet", (component, sheet, rules) => {
    const name = sheet.split("/").pop()!;
    expect(read(component)).toContain(`import "./${name}";`);
    const css = read(sheet);
    for (const rule of rules) expect(css).toContain(rule);
  });

  it("the CSP is not weakened to let them through", () => {
    const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
    const security = conf.app.security;
    expect(security.dangerousDisableAssetCspModification).toBeUndefined();
    expect(security.csp).toContain("style-src 'self' 'unsafe-inline';");
  });
});

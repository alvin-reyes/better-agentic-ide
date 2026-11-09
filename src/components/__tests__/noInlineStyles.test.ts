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
 *
 * Review finding M2, the root cause: the nonce exists only because of
 * index.html's inline `<style>`. Without one, `'unsafe-inline'` holds, and the
 * `<style>` elements libraries create at runtime (xterm 6's scrollbar and DOM
 * renderer, Monaco, mermaid, cytoscape, pdf.js) apply. So index.html holds no
 * `<style>` element and no `style` attribute; the splash links its CSS.
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

describe("index.html gives style-src no nonce", () => {
  const html = read("index.html");

  it("has no <style> element", () => {
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  it("has no inline style attribute", () => {
    expect(html).not.toMatch(/\sstyle\s*=/i);
  });

  it("links the splash's stylesheet, served from 'self', before any script", () => {
    const link = html.indexOf('<link rel="stylesheet" href="/splash.css" />');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(html.indexOf("</head>"));
    expect(link).toBeLessThan(html.indexOf("<script"));
    const css = read("public/splash.css");
    for (const rule of ["#splash {", "#splash.splash--out { opacity: 0; }", "@keyframes splash-draw", "@media (prefers-reduced-motion: reduce)"]) {
      expect(css).toContain(rule);
    }
  });
});

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

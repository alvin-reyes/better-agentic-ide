import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The Browser tab exists to open a URL — `addBrowserTab()` defaults to
 * http://localhost:3000 and BrowserTab assigns `iframe.src = url` for anything
 * the user types. `frame-src 'self'` blocks that, and a blocked frame fires
 * neither onLoad nor onError, so the pane sits until its 15s timeout and then
 * reports a generic failure. The CSP was null before it was hardened, so this
 * was a working feature silently broken.
 *
 * Allowing http/https frames is safe here because no untrusted content can
 * create a frame: sanitizeHtml forbids iframe, object and embed outright, so
 * every frame in the app is one the app itself wrote.
 */
const ROOT = resolve(__dirname, "..");
const CSP: string = JSON.parse(
  readFileSync(resolve(ROOT, "src-tauri/tauri.conf.json"), "utf8")
).app.security.csp ?? "";
const directive = (name: string) =>
  CSP.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `))?.slice(name.length + 1) ?? "";

describe("CSP lets the Browser tab load a page", () => {
  it("permits http and https frames", () => {
    const frame = directive("frame-src");
    expect(frame, "the Browser tab cannot load any site").toMatch(/\bhttps:/);
    expect(frame).toMatch(/\bhttp:/);
  });

  it("still refuses data: frames, so a framed PDF cannot come back", () => {
    expect(directive("frame-src")).not.toMatch(/data:/);
  });

  it("keeps object-src locked down", () => {
    expect(directive("object-src")).toBe("'none'");
  });

  it("relies on the sanitizer to keep untrusted frames out", () => {
    const san = readFileSync(resolve(ROOT, "src/lib/sanitizeHtml.ts"), "utf8");
    for (const tag of ["iframe", "object", "embed"]) expect(san).toContain(`"${tag}"`);
  });
});

/**
 * ollamaEndpoint is a free-text setting fetched straight from the webview.
 * Pinning connect-src to localhost:11434 meant anyone pointing ADE at another
 * port, or a GPU box on the LAN, had every request blocked by the app's own
 * policy — surfacing as "Ollama is down" rather than a fixable setting.
 *
 * Widening it costs little here: script-src has no 'unsafe-inline' and the
 * sanitizer strips scripts, so there is no injected code to exfiltrate with.
 */
describe("CSP lets a user-configured endpoint through", () => {
  it("does not pin connect-src to one Ollama host", () => {
    const connect = directive("connect-src");
    expect(connect).toMatch(/\bhttp:/);
    expect(connect).toMatch(/\bhttps:/);
  });

  it("still forbids inline script, which is what makes that safe", () => {
    expect(directive("script-src")).not.toMatch(/unsafe-inline/);
  });
});

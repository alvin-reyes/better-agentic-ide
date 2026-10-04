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

/**
 * Monaco is the reason a CDN was ever allowed: @monaco-editor/react fetches it
 * from cdn.jsdelivr.net unless told otherwise, and monacoSetup.ts tells it
 * otherwise with `loader.config({ monaco })` at module scope — evaluated before
 * the importing module's body, so no editor can mount before it runs.
 *
 * The URL constant still sits in the bundle, dead. The CSP allowance for it was
 * not dead: it let any script from that origin execute in a webview that owns
 * __TAURI_INTERNALS__, and through it create_pty.
 */
describe("script-src admits no remote origin", () => {
  it("allows no http(s) origin to supply script, style or font", () => {
    for (const name of ["script-src", "style-src", "font-src"]) {
      const value = directive(name);
      expect(value, `${name} is missing`).not.toBe("");
      expect(value, `${name} admits a remote origin: ${value}`).not.toMatch(/https?:\/\//);
    }
  });

  it("still forbids inline script, which is what the rest rests on", () => {
    expect(directive("script-src")).toContain("'self'");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    // And no eval either: Monaco was the only caller and it was shown not to
    // need one. script-src is now 'self' and nothing else.
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
    expect(directive("style-src")).toContain("'unsafe-inline'");
  });
});

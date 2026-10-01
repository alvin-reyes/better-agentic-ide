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

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const head = readFileSync(resolve(__dirname, "../docs/_includes/head.html"), "utf8");
const index = readFileSync(resolve(__dirname, "../docs/index.html"), "utf8");

const csp = /content="(default-src[^"]+)"/.exec(head)?.[1] ?? "";
const inlineScripts = (src: string) =>
  [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

/**
 * GitHub Pages serves no response headers of our choosing, so the policy lives
 * in a meta tag. That buys real protection only while the allowance stays
 * narrow: one inline script, named by hash.
 *
 * A hash is exact. Editing the pre-paint theme setter by a single byte stops it
 * executing, and because it runs before first paint, the page would render in
 * the wrong theme with nothing in the console that points at the cause. These
 * tests make that a failed build instead of a confusing bug report.
 */
describe("the site's content security policy", () => {
  it("names every inline script it ships by hash", () => {
    const scripts = [...inlineScripts(head), ...inlineScripts(index)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const body of scripts) {
      const h = createHash("sha256").update(body).digest("base64");
      expect(csp, `inline script not in the policy: ${body.trim().slice(0, 48)}`).toContain(`'sha256-${h}'`);
    }
  });

  it("keeps index.html free of inline script, so only one hash is ever needed", () => {
    expect(inlineScripts(index)).toEqual([]);
  });

  it("does not fall back to allowing inline script wholesale", () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("allows exactly the outside origins the page actually uses", () => {
    expect(csp).toContain("https://fonts.googleapis.com"); // stylesheet
    expect(csp).toContain("https://fonts.gstatic.com");    // font files
    expect(csp).toContain("https://api.github.com");       // release and repo stats
  });

  it("locks down the directives that have no legitimate use here", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("sets a referrer policy, which a meta tag can do where a header cannot", () => {
    expect(head).toMatch(/<meta name="referrer" content="strict-origin-when-cross-origin">/);
  });
});

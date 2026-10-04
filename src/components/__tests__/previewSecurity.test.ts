import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { markdownToHtml } from "../../lib/markdown";

/**
 * The pipeline PreviewPanel actually ships: MarkdownView renders every
 * document as sanitizeHtml(markdownToHtml(...)). PreviewPanel's own
 * hand-rolled escaper was retired in favour of it, so the invariants below
 * are asserted against the renderer that reaches the DOM.
 */
function render(md: string): string {
  return sanitizeHtml(markdownToHtml(md));
}

/**
 * The preview panel renders untrusted files — agent output, a README from a
 * cloned repo, a build artifact — inside the privileged Tauri webview, which
 * owns __TAURI_INTERNALS__ and through it create_pty/write_pty. Anything that
 * executes here executes as the user.
 */

const REPO = resolve(__dirname, "../../..");
const PANEL = readFileSync(resolve(REPO, "src/components/PreviewPanel.tsx"), "utf8");
const TAURI_CONF = JSON.parse(
  readFileSync(resolve(REPO, "src-tauri/tauri.conf.json"), "utf8")
);

/**
 * Assert on the parsed DOM, not on substrings. Escaped markup legitimately
 * still contains the text "onerror=" — what matters is that no element and no
 * event-handler attribute actually exists after the browser parses the output.
 */
function parse(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

function eventHandlerAttributes(host: HTMLElement): string[] {
  const found: string[] = [];
  for (const el of Array.from(host.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) found.push(`${el.tagName}[${attr.name}]`);
    }
  }
  return found;
}

describe("the preview renderer neutralizes untrusted input", () => {
  it("strips an img onerror payload but may keep the image", () => {
    const host = parse(render('<img src=x onerror="alert(1)">'));
    expect(eventHandlerAttributes(host)).toEqual([]);
    expect(host.querySelector("img")?.getAttribute("onerror") ?? null).toBe(null);
  });

  it("strips an svg onload payload", () => {
    const host = parse(render("<svg onload=alert(1)></svg>"));
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("removes a script tag", () => {
    const host = parse(render("<script>alert(1)</script>"));
    expect(host.querySelector("script")).toBe(null);
  });

  it("closes attribute breakout through a link target", () => {
    const host = parse(render('[click](" onmouseover="alert(1))'));
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("closes attribute breakout through a link label", () => {
    const host = parse(render("[<img src=x onerror=alert(1)>](https://example.com)"));
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("refuses a javascript: URL", () => {
    const host = parse(render("[click](javascript:alert(1))"));
    const hrefs = Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => /^\s*javascript:/i.test(h))).toBe(false);
  });

  it("refuses a data: URL that carries markup", () => {
    const host = parse(render("[click](data:text/html,<script>alert(1)</script>)"));
    const hrefs = Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => /^\s*data:text\/html/i.test(h))).toBe(false);
    expect(host.querySelector("script")).toBe(null);
  });

  it("does not emit raw HTML from inside inline code", () => {
    const host = parse(render("`<b>not bold</b>`"));
    const code = host.querySelector("code");
    expect(code?.querySelector("b") ?? null).toBe(null);
    expect(code?.textContent).toContain("<b>not bold</b>");
  });

  it("does not emit raw HTML from inside a fenced block", () => {
    const host = parse(render("```\n<b>x</b>\n```"));
    const code = host.querySelector("pre code");
    expect(code?.querySelector("b") ?? null).toBe(null);
    expect(code?.textContent).toContain("<b>x</b>");
  });

  it("drops embedding tags that could load remote content", () => {
    const host = parse(render('<iframe src="https://evil.test"></iframe><object data="x"></object>'));
    expect(host.querySelector("iframe")).toBe(null);
    expect(host.querySelector("object")).toBe(null);
  });
});

describe("the preview renderer still renders markdown", () => {
  it("renders bold, italic and headings", () => {
    expect(parse(render("**bold**")).querySelector("strong")?.textContent).toBe("bold");
    expect(parse(render("*italic*")).querySelector("em")?.textContent).toBe("italic");
    expect(parse(render("# Title")).querySelector("h1")?.textContent).toBe("Title");
  });

  it("renders an http link with its href intact", () => {
    const a = parse(render("[Example](https://example.com/a?b=1)")).querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://example.com/a?b=1");
    expect(a?.textContent).toBe("Example");
  });

  it("renders a relative link", () => {
    const a = parse(render("[doc](./README.md)")).querySelector("a");
    expect(a?.getAttribute("href")).toBe("./README.md");
  });

  it("renders list items and code fences", () => {
    expect(parse(render("- one\n- two")).querySelectorAll("li").length).toBe(2);
    const code = parse(render("```js\nconst a = 1;\n```")).querySelector("pre code");
    expect(code?.className).toContain("language-js");
  });
});

describe("html preview iframe is a real sandbox", () => {
  it("does not combine allow-scripts with allow-same-origin", () => {
    const sandbox = /sandbox="([^"]*)"/.exec(PANEL)?.[1] ?? "";
    const both =
      sandbox.includes("allow-scripts") && sandbox.includes("allow-same-origin");
    expect(
      both,
      `sandbox="${sandbox}" is a documented no-op: together these two tokens let ` +
        "the framed page reach the embedder and remove its own sandbox attribute."
    ).toBe(false);
  });
});

describe("the webview has a content security policy", () => {
  it("does not ship csp: null", () => {
    expect(
      TAURI_CONF.app?.security?.csp,
      "tauri.conf.json sets no CSP, so nothing constrains script execution in the " +
        "privileged webview if an escape is ever found."
    ).toBeTruthy();
  });

  it("does not allow unsafe-inline in script-src", () => {
    const csp: string = TAURI_CONF.app?.security?.csp ?? "";
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
    expect(
      scriptSrc.includes("unsafe-inline"),
      "'unsafe-inline' in script-src would re-enable exactly the injected-markup " +
        "execution the markdown escaping exists to prevent."
    ).toBe(false);
  });

  it("locks down object-src, base-uri and form-action", () => {
    const csp: string = TAURI_CONF.app?.security?.csp ?? "";
    expect(csp.includes("object-src 'none'")).toBe(true);
    expect(csp.includes("base-uri 'self'")).toBe(true);
    expect(csp.includes("form-action 'none'")).toBe(true);
  });

  /**
   * script-src carried 'unsafe-eval' and cdn.jsdelivr.net for one reason:
   * `@monaco-editor/react` fetches Monaco from jsDelivr unless told otherwise,
   * and its AMD loader evaluates code.
   *
   * Monaco is self-hosted now — monacoSetup.ts calls `loader.config({ monaco })`
   * at module scope, and MonacoWrapper imports it, so it runs before any editor
   * can mount. The CDN allowance is gone with it.
   *
   * This test used to look for `loader.config(` in MonacoWrapper.tsx alone, so
   * once the call moved into the module MonacoWrapper imports it concluded
   * Monaco was still CDN-loaded and demanded the allowance stay. It follows the
   * import now.
   *
   * 'unsafe-eval' is gone too, and that half was settled by running it rather
   * than reading it: the bundled MonacoWrapper was mounted under this exact
   * policy with 'unsafe-eval' removed, and it rendered, tokenised, and produced
   * a TypeScript diagnostic from its language worker with no violation raised.
   * The worker was the part in doubt — it is where a `new Function` would be.
   */
  it("keeps the CDN allowance tied to Monaco still being CDN-loaded", () => {
    const csp: string = TAURI_CONF.app?.security?.csp ?? "";
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
    const cspAllowsCdn = scriptSrc.includes("cdn.jsdelivr.net");
    const cspAllowsEval = scriptSrc.includes("unsafe-eval");

    // Follow the import: the call lives in the module MonacoWrapper pulls in.
    const editorDir = resolve(REPO, "src/components/editor");
    const sources = readdirSync(editorDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
      .map((f) => readFileSync(resolve(editorDir, f), "utf8"));
    const loaderConfigured = sources.some((s) => /loader\.config\(/.test(s));
    const usesMonaco = sources.some((s) => /@monaco-editor\/react/.test(s));
    const monacoIsCdnLoaded = usesMonaco && !loaderConfigured;

    expect(loaderConfigured, "no loader.config() anywhere in src/components/editor").toBe(true);

    if (monacoIsCdnLoaded) {
      // Still CDN-loaded: the allowance has to stay or the editor cannot load.
      expect(cspAllowsCdn).toBe(true);
    } else {
      expect(
        cspAllowsCdn,
        "Monaco is self-hosted, so cdn.jsdelivr.net has no reason to be in script-src."
      ).toBe(false);
      expect(
        cspAllowsEval,
        "Monaco was shown to work without 'unsafe-eval'; putting it back needs a reason"
      ).toBe(false);
    }
  });
});

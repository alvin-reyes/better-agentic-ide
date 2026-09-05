import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderMarkdown } from "../PreviewPanel";

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

describe("renderMarkdown escapes untrusted input", () => {
  it("neutralizes a raw img onerror payload", () => {
    const host = parse(renderMarkdown('<img src=x onerror="alert(1)">'));
    expect(host.querySelector("img")).toBe(null);
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("neutralizes a raw svg onload payload", () => {
    const host = parse(renderMarkdown("<svg onload=alert(1)></svg>"));
    expect(host.querySelector("svg")).toBe(null);
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("neutralizes a script tag", () => {
    const html = renderMarkdown("<script>alert(1)</script>");
    expect(html.includes("<script")).toBe(false);
  });

  it("closes attribute breakout through a link target", () => {
    const host = parse(renderMarkdown('[click](" onmouseover="alert(1))'));
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("closes attribute breakout through a link label", () => {
    const host = parse(
      renderMarkdown("[<img src=x onerror=alert(1)>](https://example.com)")
    );
    expect(host.querySelector("img")).toBe(null);
    expect(eventHandlerAttributes(host)).toEqual([]);
  });

  it("refuses a javascript: URL", () => {
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html.toLowerCase().includes("javascript:")).toBe(false);
  });

  it("refuses a data: URL", () => {
    const html = renderMarkdown("[click](data:text/html,<script>alert(1)</script>)");
    expect(html.toLowerCase().includes("data:text/html")).toBe(false);
  });

  it("escapes the single quote, which attribute payloads use", () => {
    const html = renderMarkdown("it's <b>bold</b>");
    expect(html.includes("<b>")).toBe(false);
    expect(html.includes("&#39;")).toBe(true);
  });

  it("escapes raw HTML inside inline code rather than emitting it", () => {
    const html = renderMarkdown("`<b>not bold</b>`");
    expect(html.includes("<b>")).toBe(false);
    expect(html.includes("&lt;b&gt;")).toBe(true);
  });

  it("escapes fenced code content exactly once", () => {
    const html = renderMarkdown("```\n<b>x</b>\n```");
    expect(html.includes("&lt;b&gt;")).toBe(true);
    expect(html.includes("&amp;lt;")).toBe(false);
  });
});

describe("renderMarkdown still renders markdown", () => {
  it("renders bold, italic and headings", () => {
    expect(renderMarkdown("**bold**").includes("<strong>bold</strong>")).toBe(true);
    expect(renderMarkdown("*italic*").includes("<em>italic</em>")).toBe(true);
    expect(renderMarkdown("# Title").includes("<h1")).toBe(true);
  });

  it("renders an http link with its href intact", () => {
    const html = renderMarkdown("[Example](https://example.com/a?b=1)");
    expect(html.includes('href="https://example.com/a?b=1"')).toBe(true);
    expect(html.includes(">Example</a>")).toBe(true);
  });

  it("renders a relative link", () => {
    expect(renderMarkdown("[doc](./README.md)").includes('href="./README.md"')).toBe(true);
  });

  it("renders list items and code fences", () => {
    expect(renderMarkdown("- one\n- two").includes("<li")).toBe(true);
    expect(renderMarkdown("```js\nconst a = 1;\n```").includes("language-js")).toBe(true);
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
   * script-src currently carries 'unsafe-eval' and allows cdn.jsdelivr.net.
   * Both exist for one reason: `@monaco-editor/react` is used with no
   * `loader.config()`, so Monaco is fetched from jsDelivr at runtime and its
   * AMD loader evaluates code. Neither is wanted.
   *
   * Self-hosting Monaco removes both, and also stops the app executing several
   * megabytes of third-party JavaScript from a CDN and makes the editor work
   * offline. This test documents the coupling so the CSP is tightened at the
   * same time, rather than the allowance quietly outliving its cause.
   */
  it("keeps the CDN allowance tied to Monaco still being CDN-loaded", () => {
    const csp: string = TAURI_CONF.app?.security?.csp ?? "";
    const scriptSrc = /script-src([^;]*)/.exec(csp)?.[1] ?? "";
    const cspAllowsCdn = scriptSrc.includes("cdn.jsdelivr.net");
    const cspAllowsEval = scriptSrc.includes("unsafe-eval");

    const wrapper = readFileSync(
      resolve(REPO, "src/components/editor/MonacoWrapper.tsx"),
      "utf8"
    );
    const loaderConfigured =
      /loader\.config\(/.test(wrapper) || /@monaco-editor\/loader/.test(wrapper);
    const monacoIsCdnLoaded =
      /@monaco-editor\/react/.test(wrapper) && !loaderConfigured;

    if (!monacoIsCdnLoaded) {
      expect(
        cspAllowsCdn || cspAllowsEval,
        "Monaco is self-hosted now, so drop 'unsafe-eval' and cdn.jsdelivr.net " +
          "from script-src — they only existed to support the CDN loader."
      ).toBe(false);
    } else {
      expect(cspAllowsCdn).toBe(true);
    }
  });
});

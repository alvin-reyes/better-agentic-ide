import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../sanitizeHtml";

describe("sanitizeHtml", () => {
  it("strips script tags", () => {
    expect(sanitizeHtml('<p>hi</p><script>window.__TAURI_INTERNALS__.invoke("write_pty")</script>'))
      .toBe("<p>hi</p>");
  });

  it("strips event-handler attributes", () => {
    const out = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toContain("onerror");
  });

  it("drops javascript: links but keeps safe ones", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toContain('href="https://example.com"');
  });

  it("keeps ordinary markdown output", () => {
    const html = "<h1>Title</h1><table><tr><td>a</td></tr></table><pre><code>x</code></pre>";
    expect(sanitizeHtml(html)).toContain("<h1>Title</h1>");
    expect(sanitizeHtml(html)).toContain("<td>a</td>");
  });

  it("removes iframes", () => {
    expect(sanitizeHtml('<iframe src="https://evil"></iframe>')).toBe("");
  });
});

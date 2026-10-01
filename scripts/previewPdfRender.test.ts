import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The preview panel renders a PDF inside the privileged webview, under the CSP
 * in tauri.conf.json. That CSP sets `frame-src 'self'` and `object-src 'none'`,
 * so a `data:` URL handed to an <iframe>, <embed> or <object> is blocked and the
 * panel shows nothing at all — no error, just an empty pane.
 *
 * PDFs must therefore render through pdf.js (PdfView/BinaryView), which draws to
 * a canvas and needs no frame or object source. That is already the choice the
 * file tab makes, and PdfView's own comment gives the other reason: WebKitGTK
 * ships no built-in PDF viewer, so an <embed> leaves PDFs blank on Linux too.
 */
const ROOT = resolve(__dirname, "..");
const PANEL = readFileSync(resolve(ROOT, "src/components/PreviewPanel.tsx"), "utf8");
const CSP: string = JSON.parse(
  readFileSync(resolve(ROOT, "src-tauri/tauri.conf.json"), "utf8")
).app.security.csp ?? "";

/** Directive value from the CSP, e.g. "frame-src" -> "'self'". */
function directive(name: string): string {
  const found = CSP.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  return found ? found.slice(name.length + 1) : "";
}

describe("the preview panel renders PDFs the CSP actually permits", () => {
  it("does not frame or embed a data: URL", () => {
    for (const tag of ["iframe", "embed", "object"]) {
      const re = new RegExp(`<${tag}[^>]*src=\\{dataUrl\\}`, "s");
      expect(
        re.test(PANEL),
        `<${tag} src={dataUrl}> is blocked by frame-src/object-src and renders an empty pane`
      ).toBe(false);
    }
  });

  it("renders the PDF through pdf.js instead", () => {
    expect(
      /PdfView|BinaryView/.test(PANEL),
      "the panel should reuse the pdf.js viewer the file tab already uses"
    ).toBe(true);
  });

  it("keeps frame-src and object-src locked down, so the fix cannot regress by loosening them", () => {
    expect(directive("frame-src")).not.toMatch(/data:/);
    expect(directive("object-src")).toBe("'none'");
  });
});

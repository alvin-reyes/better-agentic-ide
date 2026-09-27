import { describe, it, expect } from "vitest";
import { fileExt, viewerKind, isBinaryKind, hasRenderedView, imageMime } from "../viewerKind";

describe("fileExt", () => {
  it("lowercases the extension", () => {
    expect(fileExt("/a/B/Report.PDF")).toBe("pdf");
  });
  it("treats dotfiles as having no extension", () => {
    expect(fileExt("/repo/.gitignore")).toBe("");
  });
  it("uses the file name, not a dotted directory", () => {
    expect(fileExt("/repo/v1.2/Makefile")).toBe("");
  });
});

describe("viewerKind", () => {
  it.each([
    ["/x/a.pdf", "pdf"],
    ["/x/a.docx", "docx"],
    ["/x/a.png", "image"],
    ["/x/a.svg", "image"],
    ["/x/README.md", "markdown"],
    ["/x/notes.markdown", "markdown"],
    ["/x/index.html", "html"],
    ["/x/index.htm", "html"],
    ["/x/main.rs", "text"],
    ["/x/old.doc", "text"],
    ["/x/Dockerfile", "text"],
  ])("%s -> %s", (path, kind) => {
    expect(viewerKind(path)).toBe(kind);
  });
});

describe("kind helpers", () => {
  it("marks only byte-rendered kinds as binary", () => {
    expect(["pdf", "docx", "image"].every((k) => isBinaryKind(k as never))).toBe(true);
    expect(isBinaryKind("markdown")).toBe(false);
    expect(isBinaryKind("text")).toBe(false);
  });
  it("gives markdown and html a rendered view", () => {
    expect(hasRenderedView("markdown")).toBe(true);
    expect(hasRenderedView("html")).toBe(true);
    expect(hasRenderedView("text")).toBe(false);
  });
  it("maps image MIME types", () => {
    expect(imageMime("/a.JPG")).toBe("image/jpeg");
    expect(imageMime("/a.unknown")).toBe("application/octet-stream");
  });
});

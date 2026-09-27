import { describe, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}) }));
import { dirname, resolveDocPath, isExternalUrl, isAbsoluteUrl, headingSlug } from "../docLinks";

describe("resolveDocPath", () => {
  it("resolves relative references against the document's folder", () => {
    expect(resolveDocPath("/p/docs", "shot.png")).toBe("/p/docs/shot.png");
    expect(resolveDocPath("/p/docs", "./img/a.png")).toBe("/p/docs/img/a.png");
    expect(resolveDocPath("/p/docs", "../README.md#usage")).toBe("/p/README.md");
    expect(resolveDocPath("/p/docs", "my%20shot.png?raw=1")).toBe("/p/docs/my shot.png");
    expect(resolveDocPath("/p/docs", "/abs/file.md")).toBe("/abs/file.md");
  });
  it("never climbs above the root", () => {
    expect(resolveDocPath("/p", "../../../x")).toBe("/x");
  });
});

describe("helpers", () => {
  it("dirname", () => {
    expect(dirname("/a/b/c.md")).toBe("/a/b");
    expect(dirname("/c.md")).toBe("/");
  });
  it("classifies URLs", () => {
    expect(isExternalUrl("https://x.dev")).toBe(true);
    expect(isExternalUrl("mailto:a@b.c")).toBe(true);
    expect(isExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAbsoluteUrl("data:image/png;base64,AA")).toBe(true);
    expect(isAbsoluteUrl("docs/a.png")).toBe(false);
  });
  it("slugs headings like GitHub", () => {
    expect(headingSlug("Guide Title")).toBe("guide-title");
    expect(headingSlug("What's new in v2.0?")).toBe("whats-new-in-v20");
  });
});

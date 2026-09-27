import { describe, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { findPathCandidates, opensInPreview } from "../terminalFileLinks";

const paths = (t: string) => findPathCandidates(t).map((c) => c.path);

describe("findPathCandidates", () => {
  it("finds paths in Claude Code tool output", () => {
    expect(paths("⏺ Write(docs/plan.md)")).toEqual(["docs/plan.md"]);
    expect(paths("  ⎿  Wrote 42 lines to src/components/App.tsx")).toContain("src/components/App.tsx");
    expect(paths("Update(/Users/me/proj/README.md)")).toEqual(["/Users/me/proj/README.md"]);
  });
  it("strips :line:col and trailing punctuation, keeps the offsets", () => {
    const text = "error in src/App.tsx:42:7.";
    const [c] = findPathCandidates(text);
    expect(c.path).toBe("src/App.tsx");
    expect(text.slice(c.start, c.end)).toBe("src/App.tsx");
    expect(paths("see `report.pdf`, then ./out/chart.png!")).toEqual(["report.pdf", "./out/chart.png"]);
    expect(paths("~/notes/today.md")).toEqual(["~/notes/today.md"]);
  });
  it("ignores URLs, flags, numbers and plain words", () => {
    expect(paths("https://example.com/a.md --output=x 3.14 v0.15.0 hello world")).toEqual([]);
  });
  it("keeps extension-less paths with a folder", () => {
    expect(paths("edited docker/Dockerfile")).toEqual(["docker/Dockerfile"]);
  });
});

describe("opensInPreview", () => {
  it("documents and images go to the preview; code and docx to a tab", () => {
    expect(opensInPreview("/a/plan.md")).toBe(true);
    expect(opensInPreview("/a/r.PDF")).toBe(true);
    expect(opensInPreview("/a/shot.png")).toBe(true);
    expect(opensInPreview("/a/App.tsx")).toBe(false);
    expect(opensInPreview("/a/spec.docx")).toBe(false);
  });
});

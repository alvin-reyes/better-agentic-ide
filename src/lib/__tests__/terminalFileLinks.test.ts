import { describe, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { findPathCandidates, stitchRows } from "../terminalFileLinks";

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

describe("stitchRows", () => {
  // The exact shape Claude Code wrote at 60 columns: it breaks a long path
  // itself (carriage return, cursor down, two spaces of indent), so the
  // terminal sees two unrelated rows, not one soft-wrapped line.
  const rows = [
    { text: "  /Users/me/demo/_bmad-output/initiative-s ", wrapped: false },
    { text: "  hop/brainstorm-pricing/brainstorm-pricing.md", wrapped: false },
    { text: "", wrapped: false },
  ];

  it("joins a path Claude Code broke across rows, and maps its ends back to cells", () => {
    const { text, toCell } = stitchRows(rows);
    const c = findPathCandidates(text).find((p) => p.path.endsWith("brainstorm-pricing.md"));
    expect(c?.path).toBe("/Users/me/demo/_bmad-output/initiative-shop/brainstorm-pricing/brainstorm-pricing.md");
    expect(toCell(c!.start)).toEqual({ x: 3, row: 0 });
    expect(toCell(c!.end - 1)).toEqual({ x: 46, row: 1 });
  });

  it("joins soft-wrapped rows as they are, without dropping characters", () => {
    const { text } = stitchRows([{ text: "docs/a", wrapped: false }, { text: "  b.md", wrapped: true }]);
    expect(text).toBe("docs/a  b.md");
  });

  it("does not join across a blank row or onto a row that starts with a bullet", () => {
    expect(paths(stitchRows([{ text: "see docs/", wrapped: false }, { text: "", wrapped: false }, { text: "a.md", wrapped: false }]).text)).not.toContain("docs/a.md");
    expect(paths(stitchRows([{ text: "Wrote docs/a.md", wrapped: false }, { text: "⏺ next.md", wrapped: false }]).text)).toEqual(["docs/a.md", "next.md"]);
  });
});

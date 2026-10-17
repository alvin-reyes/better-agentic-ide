import { describe, it, expect, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { findPathCandidates, registerFileLinks, stitchRows } from "../terminalFileLinks";

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
  it("keeps the line and column of a path:line link", () => {
    const [full] = findPathCandidates("src/App.tsx:42:7");
    expect(full.path).toBe("src/App.tsx");
    expect(full.line).toBe(42);
    expect(full.col).toBe(7);
    const [lineOnly] = findPathCandidates("a.ts:9");
    expect(lineOnly.path).toBe("a.ts");
    expect(lineOnly.line).toBe(9);
    expect(lineOnly.col).toBeUndefined();
    const [plain] = findPathCandidates("a.ts");
    expect(plain.path).toBe("a.ts");
    expect(plain.line).toBeUndefined();
    expect(plain.col).toBeUndefined();
    // Trailing punctuation around the suffix, and the offsets, as before.
    const text = "error in src/App.tsx:42:7.";
    const [c] = findPathCandidates(text);
    expect({ path: c.path, line: c.line, col: c.col }).toEqual({ path: "src/App.tsx", line: 42, col: 7 });
    expect(text.slice(c.start, c.end)).toBe("src/App.tsx");
  });
  it("ignores URLs, flags, numbers and plain words", () => {
    expect(paths("https://example.com/a.md --output=x 3.14 v0.15.0 hello world")).toEqual([]);
  });
  it("keeps extension-less paths with a folder", () => {
    expect(paths("edited docker/Dockerfile")).toEqual(["docker/Dockerfile"]);
  });
});

describe("registerFileLinks", () => {
  /** A terminal with one row of text, enough for the link provider. */
  function fakeTerminal(row: string) {
    let provider: ILinkProvider | null = null;
    const line = { isWrapped: false, translateToString: () => row };
    const term = {
      buffer: { active: { length: 1, getLine: (i: number) => (i === 0 ? line : undefined) } },
      registerLinkProvider: (p: ILinkProvider) => { provider = p; return { dispose() {} }; },
    } as unknown as Terminal;
    const links = () => new Promise<ILink[] | undefined>((r) => provider!.provideLinks(1, r));
    return { term, links };
  }

  it("a clicked link carries its line", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string, args?: unknown) =>
      cmd === "resolve_file_paths" ? (args as { paths: string[] }).paths.map((p) => `/r/${p}`) : null);
    const open = vi.fn();
    const { term, links } = fakeTerminal("error in src/App.tsx:42:7 and lib/b.ts:9 and c.md");
    registerFileLinks(term, async () => "/r", open);
    const found = await links();
    expect(found?.map((l) => l.text)).toEqual(["src/App.tsx", "lib/b.ts", "c.md"]);
    found![0].activate(new MouseEvent("click"), found![0].text);
    found![1].activate(new MouseEvent("click"), found![1].text);
    found![2].activate(new MouseEvent("click"), found![2].text);
    expect(open.mock.calls[0]).toEqual(["/r/src/App.tsx", { line: 42, col: 7 }]);
    expect(open.mock.calls[1][0]).toBe("/r/lib/b.ts");
    expect(open.mock.calls[1][1]).toEqual({ line: 9 });
    expect(open.mock.calls[1][1]).not.toHaveProperty("col");
    expect(open.mock.calls[2]).toEqual(["/r/c.md", {}]);
    expect(open.mock.calls[2][1]).not.toHaveProperty("line");
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

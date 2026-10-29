import { describe, it, expect, vi } from "vitest";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { findPathCandidates, opensInPreview, registerFileLinks, stitchRows } from "../terminalFileLinks";

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

describe("opensInPreview", () => {
  it("documents and images go to the preview; code and docx to a tab", () => {
    expect(opensInPreview("/a/plan.md")).toBe(true);
    expect(opensInPreview("/a/r.PDF")).toBe(true);
    expect(opensInPreview("/a/shot.png")).toBe(true);
    expect(opensInPreview("/a/App.tsx")).toBe(false);
    expect(opensInPreview("/a/spec.docx")).toBe(false);
  });
});

/**
 * A terminal with just what the link provider reads: rows of text by 0-based
 * buffer row, the viewport's top row, and the provider it registers.
 */
function linkTerminal(rows: Record<number, string>) {
  const view = { viewportY: 100 };
  let provider: ILinkProvider | undefined;
  const term = {
    buffer: {
      active: {
        length: 400,
        get viewportY() {
          return view.viewportY;
        },
        getLine: (y: number) => (y in rows ? { isWrapped: false, translateToString: () => rows[y] } : undefined),
      },
    },
    registerLinkProvider: (p: ILinkProvider) => {
      provider = p;
      return { dispose: () => {} };
    },
  } as unknown as Terminal;
  // xterm's lineNumber is 1-based.
  const provide = (lineNumber: number) => new Promise<ILink[] | undefined>((done) => provider!.provideLinks(lineNumber, done));
  return { term, view, provide };
}

/** resolve_file_paths answering every path as existing under /proj. */
const resolveAll = () =>
  vi.mocked(invoke).mockImplementation(async (_cmd: string, args?: unknown) => (args as { paths: string[] }).paths.map((p) => `/proj/${p}`));

const preview = () => ({ enter: vi.fn(), leave: vi.fn(), dismiss: vi.fn() });
const pointerAt = (clientX: number, clientY: number, buttons = 0) => new MouseEvent("mousemove", { clientX, clientY, buttons });

describe("registerFileLinks", () => {
  it("link keys survive a scrollback trim", async () => {
    resolveAll();
    const keyOf = async (rows: Record<number, string>, row: number, viewportY: number) => {
      const t = linkTerminal(rows);
      const p = preview();
      registerFileLinks(t.term, async () => "/proj", vi.fn(), p);
      t.view.viewportY = viewportY;
      const [link] = (await t.provide(row + 1)) ?? [];
      link.hover?.(pointerAt(1, 1), link.text);
      return p.enter.mock.calls[0][0].key as string;
    };
    // Buffer row 120 with the view at 100; after a trim the same text is at
    // row 119 with the view at 99: the same row on screen, the same key.
    const before = await keyOf({ 120: "Wrote src/trim.ts" }, 120, 100);
    const trimmed = await keyOf({ 119: "Wrote src/trim.ts" }, 119, 99);
    expect(trimmed).toBe(before);
    // The text really moved: same buffer row, the view one lower.
    const moved = await keyOf({ 120: "Wrote src/trim.ts" }, 120, 101);
    expect(moved).not.toBe(before);

    // The view changes while the resolve is pending: the key keeps the value
    // read at the start of provideLinks.
    let answer: ((v: (string | null)[]) => void) | undefined;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise((done) => (answer = done as typeof answer)));
    const t = linkTerminal({ 120: "Wrote src/pending.ts" });
    const p = preview();
    registerFileLinks(t.term, async () => "/proj", vi.fn(), p);
    const links = t.provide(121);
    await vi.waitFor(() => expect(answer).toBeDefined());
    t.view.viewportY = 99;
    answer!(["/proj/src/pending.ts"]);
    const [link] = (await links) ?? [];
    link.hover?.(pointerAt(1, 1), link.text);
    expect(p.enter.mock.calls[0][0].key).toBe("/proj/src/pending.ts\u00007,20-20,20");
  });

  it("links drive the hover preview and still open on click", async () => {
    resolveAll();
    const t = linkTerminal({ 120: "Wrote src/keys.ts" });
    const p = preview();
    const open = vi.fn();
    registerFileLinks(t.term, async () => "/proj", open, p);
    const [link] = (await t.provide(121)) ?? [];
    const key = "/proj/src/keys.ts\u00007,20-17,20";

    link.hover!(pointerAt(40, 50, 0), link.text);
    expect(p.enter).toHaveBeenCalledWith({ abs: "/proj/src/keys.ts", key }, { x: 40, y: 50, buttons: 0 });
    link.hover!(pointerAt(41, 52, 1), link.text);
    expect(p.enter).toHaveBeenLastCalledWith({ abs: "/proj/src/keys.ts", key }, { x: 41, y: 52, buttons: 1 });
    link.leave!(pointerAt(40, 50), link.text);
    expect(p.leave).toHaveBeenCalledWith(key);

    // A click closes the card and still opens the file.
    link.activate(pointerAt(40, 50), link.text);
    expect(p.dismiss).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("/proj/src/keys.ts");
    expect(p.dismiss.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);

    // Without a preview, links are as they were: no hover, no leave.
    const plain = linkTerminal({ 120: "Wrote src/keys.ts" });
    const openPlain = vi.fn();
    registerFileLinks(plain.term, async () => "/proj", openPlain);
    const [bare] = (await plain.provide(121)) ?? [];
    expect(bare.hover).toBeUndefined();
    expect(bare.leave).toBeUndefined();
    bare.activate(pointerAt(1, 1), bare.text);
    expect(openPlain).toHaveBeenCalledWith("/proj/src/keys.ts");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

type Handler = (args: Record<string, unknown>) => unknown;
const h = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  channels: [] as { onmessage: ((e: unknown) => void) | null }[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => (h.handlers[cmd] ? h.handlers[cmd](args) : null)),
  Channel: class {
    onmessage: ((e: unknown) => void) | null = null;
    constructor() { h.channels.push(this); }
  },
}));
vi.mock("@monaco-editor/react", () => import("../editor/__tests__/monacoStub"));
vi.mock("../editor/monacoSetup", () => ({}));
vi.mock("../viewer/BinaryView", () => ({
  default: ({ path }: { path: string }) => <div data-testid="binary-view" data-path={path} />,
}));

import { invoke } from "@tauri-apps/api/core";
import { stub } from "../editor/__tests__/monacoStub";
import PreviewPanel from "../PreviewPanel";
import CodeView from "../viewer/CodeView";
import { useTabStore } from "../../stores/tabStore";

const MiB = 1024 * 1024;
const head = (text: string, over: Partial<{ size: number; truncated: boolean; binary: boolean; lossy: boolean }> = {}) =>
  ({ text, size: text.length, truncated: false, binary: false, lossy: false, ...over });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function openInPanel(path: string) {
  act(() => {
    const { activeTabId, setPreviewPath } = useTabStore.getState();
    setPreviewPath(activeTabId, path);
  });
}

function statusWith(text: string) {
  const el = screen.getByText(text, { exact: false });
  const status = el.closest('[role="status"]');
  expect(status, `"${text}" is not in a role="status" element`).not.toBeNull();
  expect(status?.getAttribute("aria-live")).toBe("polite");
  return status;
}

/**
 * The module specifiers of every value import, multi-line ones included;
 * `import type` is erased at build time, so it doesn't count.
 */
export function staticImportSpecifiers(src: string): string[] {
  const out: string[] = [];
  const re = /^\s*import\s+(type\s+)?(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) if (!m[1]) out.push(m[2]);
  return out;
}

const calls = (cmd: string) => vi.mocked(invoke).mock.calls.filter((c) => c[0] === cmd);

beforeEach(() => {
  stub.reset();
  h.handlers = {};
  h.channels = [];
  vi.mocked(invoke).mockClear();
  useTabStore.setState({ tabs: [], activeTabId: "" });
  useTabStore.getState().addTab();
});

describe("code in the side panel", () => {
  it("shows source files in a read-only editor", async () => {
    h.handlers.read_text_head = async () => head("export const a = 1;\n");
    openInPanel("/r/src/App.tsx");
    const { container } = render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    expect(calls("read_text_head")).toEqual([["read_text_head", { path: "/r/src/App.tsx", maxBytes: 2097152 }]]);
    const last = stub.renders[stub.renders.length - 1];
    expect(last.language).toBe("typescript");
    expect((last.options as Record<string, unknown>).ariaLabel).toBe("App.tsx, read-only");
    expect((last.options as Record<string, unknown>).readOnly).toBe(true);
    expect(stub.editors[0].getValue()).toBe("export const a = 1;\n");
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.getByText("CODE")).toBeTruthy();
  });

  it("Monaco loads lazily", () => {
    const src = readFileSync(resolve(__dirname, "../PreviewPanel.tsx"), "utf8");
    const specifiers = staticImportSpecifiers(src);
    expect(specifiers).toContain("./viewer/BinaryView");
    for (const spec of specifiers) {
      expect(spec).not.toMatch(/CodeView|MonacoWrapper|monaco-editor|@monaco-editor\/react/);
    }
    expect(src).toMatch(/lazy\(\(\) => import\("\.\/viewer\/CodeView"\)\)/);
  });

  it("large, lossy and binary files", async () => {
    h.handlers.read_text_head = async () => head("x".repeat(100), { size: Math.round(48.3 * MiB), truncated: true });
    openInPanel("/r/big.log");
    const { unmount } = render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    statusWith("Showing the first 2.0 MB of 48.3 MB.");
    statusWith("Too large to open in a tab");
    expect(screen.queryByRole("button", { name: "Open in tab" })).toBeNull();
    unmount();

    stub.reset();
    h.handlers.read_text_head = async () => head("caf�", { lossy: true });
    openInPanel("/r/latin1.txt");
    const second = render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    statusWith("Not UTF-8 text, can't be edited in a tab");
    expect(screen.queryByRole("button", { name: "Open in tab" })).toBeNull();
    second.unmount();

    stub.reset();
    h.handlers.read_text_head = async () => head("", { size: Math.round(3.2 * MiB), binary: true });
    openInPanel("/r/a.zip");
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByText("Binary file (3.2 MB), not shown.");
    statusWith("Binary file (3.2 MB), not shown.");
    expect(screen.queryByTestId("monaco-stub")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open in tab" })).toBeNull();
  });

  it("opens the file in a tab", async () => {
    h.handlers.read_text_head = async () => head("fn main() {}\n");
    openInPanel("/r/src/main.rs");
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    fireEvent.click(screen.getByRole("button", { name: "Open in tab" }));
    const tabs = useTabStore.getState().tabs;
    const editor = tabs.find((t) => t.type === "editor");
    expect(editor?.editorFilePath).toBe("/r/src/main.rs");
    expect(useTabStore.getState().activeTabId).toBe(editor?.id);
  });

  it("a file that can't be read says so", async () => {
    h.handlers.read_text_head = async () => { throw "Not a regular file: /r/fifo.ts"; };
    openInPanel("/r/fifo.ts");
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByText("Can't open fifo.ts: Not a regular file: /r/fifo.ts");
    statusWith("Can't open fifo.ts: Not a regular file: /r/fifo.ts");
    expect(screen.queryByTestId("monaco-stub")).toBeNull();
  });

  it("each kind gets its viewer", async () => {
    h.handlers.read_file = async ({ path }) => (String(path).endsWith(".md") ? "# Hello" : "<p>page</p>");
    const { container } = render(<PreviewPanel onClose={vi.fn()} />);

    for (const p of ["/r/doc.pdf", "/r/spec.docx", "/r/shot.png"]) {
      openInPanel(p);
      expect((await screen.findByTestId("binary-view")).getAttribute("data-path")).toBe(p);
    }
    openInPanel("/r/plan.md");
    await waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Hello"));
    openInPanel("/r/page.html");
    await waitFor(() => expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>page</p>"));
    expect(container.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(calls("read_text_head")).toEqual([]);

    const src = readFileSync(resolve(__dirname, "../PreviewPanel.tsx"), "utf8");
    expect(src).not.toContain("detectMode");
    expect(src).toMatch(/import \{[^}]*\bviewerKind\b[^}]*\} from "\.\.\/lib\/viewerKind"/);
  });

  it("a stale read never wins", async () => {
    const a = deferred<ReturnType<typeof head>>();
    const b = deferred<ReturnType<typeof head>>();
    h.handlers.read_text_head = ({ path }) => (path === "/r/A.ts" ? a.promise : b.promise);
    openInPanel("/r/A.ts");
    render(<PreviewPanel onClose={vi.fn()} />);
    openInPanel("/r/B.ts");
    await act(async () => { b.resolve(head("B text")); });
    await screen.findByTestId("monaco-stub");
    await act(async () => { a.resolve(head("A text")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // B is still on screen: the late result for A neither shows nor blanks it.
    expect(screen.getByTestId("monaco-stub")).toBeTruthy();
    expect(stub.editors.map((e) => e.getValue())).toEqual(["B text"]);
    expect(stub.renders.some((p) => p.defaultValue === "A text")).toBe(false);
    expect(stub.editors[0].calls).not.toContain("setValue");
  });

  it("finds a multi-line import", () => {
    const src = 'import {\n  a,\n  b,\n} from "../editor/MonacoWrapper";\nimport type { X } from "monaco-editor";\nimport "./side-effect";\n';
    expect(staticImportSpecifiers(src)).toEqual(["../editor/MonacoWrapper", "./side-effect"]);
  });

  it("an older read of the same file never overwrites a newer one", async () => {
    const reads: { path: string; d: ReturnType<typeof deferred<ReturnType<typeof head>>> }[] = [];
    h.handlers.read_text_head = ({ path }) => {
      const d = deferred<ReturnType<typeof head>>();
      reads.push({ path: String(path), d });
      return d.promise;
    };
    openInPanel("/r/A.ts");
    render(<PreviewPanel onClose={vi.fn()} />);
    openInPanel("/r/B.ts");
    openInPanel("/r/A.ts");
    expect(reads.map((r) => r.path)).toEqual(["/r/A.ts", "/r/B.ts", "/r/A.ts"]);
    await act(async () => { reads[2].d.resolve(head("A new")); });
    await screen.findByTestId("monaco-stub");
    await act(async () => { reads[0].d.resolve(head("A old")); });
    await act(async () => { reads[1].d.resolve(head("B text")); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(stub.editors.map((e) => e.getValue())).toEqual(["A new"]);
    expect(stub.editors[0].calls).not.toContain("setValue");
  });

  it("documents stay live", async () => {
    let version = 1;
    h.handlers.read_file = async () => `# v${version}`;
    h.handlers.watch_directory = async () => 7;
    openInPanel("/r/docs/plan.md");
    const { container } = render(<PreviewPanel onClose={vi.fn()} />);
    await waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("v1"));
    expect(calls("watch_directory")).toHaveLength(1);
    version = 2;
    await act(async () => { h.channels[0].onmessage?.({ type: "changed", path: "/r/docs/plan.md" }); });
    await waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("v2"));
  });
});

describe("go to line from path:line", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");
  const activeTab = () => {
    const s = useTabStore.getState();
    return s.tabs.find((t) => t.id === s.activeTabId)!;
  };
  function openAt(path: string, line: number, col?: number) {
    act(() => {
      const { activeTabId, setPreviewPath } = useTabStore.getState();
      setPreviewPath(activeTabId, path, col === undefined ? { line } : { line, col });
    });
  }

  it("a path:line link to another file lands in that file", async () => {
    const b = deferred<ReturnType<typeof head>>();
    let bVersion = 0;
    h.handlers.read_text_head = ({ path }) => {
      if (path === "/r/A.ts") return Promise.resolve(head(lines(500)));
      bVersion += 1;
      return bVersion === 1 ? b.promise : Promise.resolve(head(lines(401)));
    };
    h.handlers.watch_directory = async () => 7;
    stub.asyncMount = true;
    openInPanel("/r/A.ts");
    render(<PreviewPanel onClose={vi.fn()} />);
    await waitFor(() => expect(stub.editors).toHaveLength(1));
    const a = stub.editors[0];
    expect(a.getValue()).toBe(lines(500));

    openAt("/r/B.ts", 300);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // B's text hasn't arrived: nobody reveals, and A never does.
    expect(stub.editors).toHaveLength(1);
    expect(activeTab().previewReveal).toMatchObject({ path: "/r/B.ts", line: 300 });

    await act(async () => { b.resolve(head(lines(400))); });
    await waitFor(() => expect(stub.editors).toHaveLength(2));
    const bEd = stub.editors[1];
    expect(bEd.getValue()).toBe(lines(400));
    expect(bEd.positions).toEqual([{ lineNumber: 300, column: 1 }]);
    expect(bEd.revealed).toEqual([300]);
    expect(a.calls).not.toContain("setPosition");
    expect(a.calls).not.toContain("revealLineInCenter");
    // Applied, so cleared on the tab; the panel file stays.
    expect(activeTab().previewReveal).toBeFalsy();
    expect(activeTab().previewPath).toBe("/r/B.ts");
    // A reveal never takes focus.
    expect(bEd.focusCount).toBe(0);

    // A live reload of B keeps the place and does not reveal again.
    const watch = h.channels[h.channels.length - 1];
    await act(async () => { watch.onmessage?.({ type: "changed", path: "/r/B.ts" }); });
    await waitFor(() => expect(bEd.getValue()).toBe(lines(401)));
    expect(bEd.revealed).toEqual([300]);
    expect(bEd.position).toEqual({ lineNumber: 300, column: 1 });

    // Clicking another line of the same file moves there, in the same editor.
    openAt("/r/B.ts", 12, 4);
    await waitFor(() => expect(bEd.revealed).toEqual([300, 12]));
    expect(bEd.positions[1]).toEqual({ lineNumber: 12, column: 4 });
    expect(stub.editors).toHaveLength(2);
  });

  it("CodeView hands its editor only a reveal for its own file", () => {
    const onRevealed = vi.fn();
    const props = { path: "/r/A.ts", head: head(lines(500)), focusOnMount: false, onOpenInTab: vi.fn(), onRevealed };
    const { rerender } = render(<CodeView {...props} reveal={{ path: "/r/B.ts", line: 300, nonce: 1 }} />);
    const ed = stub.editors[0];
    expect(ed.calls).not.toContain("setPosition");
    expect(ed.calls).not.toContain("revealLineInCenter");
    expect(onRevealed).not.toHaveBeenCalled();
    rerender(<CodeView {...props} reveal={{ path: "/r/A.ts", line: 300, nonce: 2 }} />);
    expect(ed.positions).toEqual([{ lineNumber: 300, column: 1 }]);
    expect(onRevealed.mock.calls).toEqual([[2]]);
  });

  it("a line past the truncated part says so", async () => {
    h.handlers.read_text_head = async () => head(lines(1000), { size: 48 * MiB, truncated: true });
    openAt("/r/big.log", 5000);
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    statusWith("Line 5000 is past the part shown (first 2.0 MB)");
    const ed = stub.editors[0];
    expect(ed.positions).toEqual([{ lineNumber: 1000, column: 1 }]);
    expect(ed.revealed).toEqual([1000]);
    // Still said after the reveal was applied and cleared.
    expect(activeTab().previewReveal).toBeFalsy();
    expect(screen.getByText("Line 5000 is past the part shown (first 2.0 MB)", { exact: false })).toBeTruthy();

    // A line inside the part shown: no such message.
    openAt("/r/big.log", 10);
    await waitFor(() => expect(ed.revealed).toEqual([1000, 10]));
    expect(screen.queryByText("is past the part shown", { exact: false })).toBeNull();
  });

  it("the last shown line of a truncated file is not past it; the next one is", async () => {
    h.handlers.read_text_head = async () => head(lines(1000), { size: 48 * MiB, truncated: true });
    openAt("/r/big.log", 1000);
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    expect(stub.editors[0].revealed).toEqual([1000]);
    expect(screen.queryByText("is past the part shown", { exact: false })).toBeNull();
    openAt("/r/big.log", 1001);
    await waitFor(() => expect(stub.editors[0].revealed).toEqual([1000, 1000]));
    statusWith("Line 1001 is past the part shown (first 2.0 MB)");
  });

  it("a whole file that grows past 2 MiB does not claim an earlier line is past the part shown", async () => {
    let big = false;
    h.handlers.read_text_head = async () => (big ? head(lines(40000), { size: 3 * MiB, truncated: true }) : head(lines(1000)));
    h.handlers.watch_directory = async () => 7;
    openAt("/r/app.log", 5000);
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    expect(stub.editors[0].positions).toEqual([{ lineNumber: 1000, column: 1 }]);
    big = true;
    const watch = h.channels[h.channels.length - 1];
    await act(async () => { watch.onmessage?.({ type: "changed", path: "/r/app.log" }); });
    await waitFor(() => expect(stub.editors[0].getValue()).toBe(lines(40000)));
    expect(screen.queryByText("is past the part shown", { exact: false })).toBeNull();
  });

  it("a line past the end of a whole file goes to the last line without a message", async () => {
    h.handlers.read_text_head = async () => head(lines(20));
    openAt("/r/small.ts", 999);
    render(<PreviewPanel onClose={vi.fn()} />);
    await screen.findByTestId("monaco-stub");
    expect(stub.editors[0].positions).toEqual([{ lineNumber: 20, column: 1 }]);
    expect(screen.queryByText("is past the part shown", { exact: false })).toBeNull();
  });

  it("rendered views ignore the line", async () => {
    h.handlers.read_file = async ({ path }) => (String(path).endsWith(".md") ? "# Hello" : "<p>page</p>");
    const { container } = render(<PreviewPanel onClose={vi.fn()} />);
    openAt("/r/plan.md", 10);
    await waitFor(() => expect(container.querySelector("h1")?.textContent).toBe("Hello"));
    openAt("/r/page.html", 10, 2);
    await waitFor(() => expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toBe("<p>page</p>"));
    openAt("/r/doc.pdf", 3);
    expect((await screen.findByTestId("binary-view")).getAttribute("data-path")).toBe("/r/doc.pdf");
    expect(screen.queryByTestId("monaco-stub")).toBeNull();
    expect(stub.editors).toHaveLength(0);
    expect(calls("read_text_head")).toEqual([]);
  });

  it("a remount does not re-apply an old reveal", async () => {
    h.handlers.read_text_head = async () => head(lines(100));
    openAt("/r/A.ts", 42);
    const tabA = useTabStore.getState().activeTabId;
    render(<PreviewPanel onClose={vi.fn()} />);
    await waitFor(() => expect(stub.editors[0]?.revealed).toEqual([42]));
    expect(activeTab().previewReveal).toBeFalsy();

    // Tab B (no panel file), then back to A: A's editor is made again.
    act(() => { useTabStore.getState().addTab(); });
    await waitFor(() => expect(screen.queryByTestId("monaco-stub")).toBeNull());
    act(() => { useTabStore.getState().setActiveTab(tabA); });
    await waitFor(() => expect(stub.editors).toHaveLength(2));
    expect(stub.editors[1].getValue()).toBe(lines(100));
    expect(stub.editors[1].calls).not.toContain("setPosition");
    expect(stub.editors[1].revealed).toEqual([]);
  });

  it("closing and reopening the panel does not jump again", async () => {
    h.handlers.read_text_head = async () => head(lines(100));
    openAt("/r/A.ts", 42);
    const first = render(<PreviewPanel onClose={vi.fn()} />);
    await waitFor(() => expect(stub.editors[0]?.revealed).toEqual([42]));
    first.unmount();
    render(<PreviewPanel onClose={vi.fn()} />);
    await waitFor(() => expect(stub.editors).toHaveLength(2));
    expect(stub.editors[1].revealed).toEqual([]);
  });
});


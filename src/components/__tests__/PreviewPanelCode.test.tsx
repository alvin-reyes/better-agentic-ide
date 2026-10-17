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

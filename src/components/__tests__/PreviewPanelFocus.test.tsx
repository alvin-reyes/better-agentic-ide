import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

type Handler = (args: Record<string, unknown>) => unknown;
const h = vi.hoisted(() => ({ handlers: {} as Record<string, Handler> }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => (h.handlers[cmd] ? h.handlers[cmd](args) : null)),
  Channel: class { onmessage: unknown = null; },
}));
vi.mock("@monaco-editor/react", () => import("../editor/__tests__/monacoStub"));
vi.mock("../editor/monacoSetup", () => ({}));
// useKeybindings pulls in the terminal hook, which loads xterm.
vi.mock("../../hooks/useTerminal", () => ({ refreshAllTerminals: vi.fn(), getPtyCwd: vi.fn(async () => null) }));

import { stub } from "../editor/__tests__/monacoStub";
import PreviewPanel from "../PreviewPanel";
import { useTabStore } from "../../stores/tabStore";
import { useKeybindings } from "../../hooks/useKeybindings";

const head = (text: string) => ({ text, size: text.length, truncated: false, binary: false, lossy: false });
const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

function openInPanel(path: string) {
  act(() => {
    const { activeTabId, setPreviewPath } = useTabStore.getState();
    setPreviewPath(activeTabId, path);
  });
}

const panelRoot = () => screen.getByRole("complementary", { name: "Preview" });
const bodyRegion = () => panelRoot().querySelector<HTMLElement>('[tabindex="-1"]');

let term: HTMLTextAreaElement;
let outside: HTMLButtonElement;

beforeEach(() => {
  stub.reset();
  stub.asyncMount = true;
  h.handlers = {
    read_text_head: async ({ path }) => head(`// ${String(path)}`),
    read_file: async () => "# Doc",
  };
  useTabStore.setState({ tabs: [], activeTabId: "" });
  useTabStore.getState().addTab();
  term = document.createElement("textarea");
  term.className = "xterm-helper-textarea";
  outside = document.createElement("button");
  document.body.append(term, outside);
});

afterEach(() => { term.remove(); outside.remove(); });

describe("keyboard and the side panel", () => {
  it("is a labelled complementary region", () => {
    render(<PreviewPanel onClose={vi.fn()} />);
    expect(panelRoot()).toBeTruthy();
    expect(bodyRegion()).not.toBeNull();
  });

  it("⌘⇧B focus survives the lazy mount", async () => {
    openInPanel("/r/src/App.tsx");
    const { rerender } = render(<PreviewPanel onClose={vi.fn()} focusRequest={0} />);
    await screen.findByTestId("monaco-stub");
    await tick();
    expect(stub.editors[0].focusCount).toBe(0);
    rerender(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    await tick();
    // The editor was already mounted: a code file's focus still goes to its
    // editor, once.
    expect(stub.editors[0].focusCount).toBe(1);
  });

  it("⌘⇧B on a closed panel focuses the editor once it has mounted", async () => {
    openInPanel("/r/src/App.tsx");
    render(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    // Nothing to focus yet: the CodeView chunk and Monaco both load later.
    expect(stub.editors).toHaveLength(0);
    await screen.findByTestId("monaco-stub");
    await waitFor(() => expect(stub.editors).toHaveLength(1));
    expect(stub.editors[0].focusCount).toBe(1);
    expect(stub.editors[0].calls.filter((c) => c === "focus")).toHaveLength(1);
  });

  it("⌘⇧B with a document focuses the panel's body", async () => {
    openInPanel("/r/plan.md");
    const { rerender } = render(<PreviewPanel onClose={vi.fn()} focusRequest={0} />);
    outside.focus();
    rerender(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    await waitFor(() => expect(document.activeElement).toBe(bodyRegion()));
  });

  it("opening a file never takes focus", async () => {
    // Served once for A...
    openInPanel("/r/src/A.ts");
    const { rerender } = render(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    await waitFor(() => expect(stub.editors).toHaveLength(1));
    expect(stub.editors[0].focusCount).toBe(1);
    // ...then a click opens B with the same request: no focus.
    outside.focus();
    openInPanel("/r/src/B.ts");
    rerender(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    await waitFor(() => expect(stub.editors).toHaveLength(2));
    await tick();
    expect(stub.editors[1].getValue()).toBe("// /r/src/B.ts");
    expect(stub.editors[1].focusCount).toBe(0);
    expect(document.activeElement).toBe(outside);

    // Back to A, whose request was served: still no focus.
    openInPanel("/r/src/A.ts");
    rerender(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    await waitFor(() => expect(stub.editors).toHaveLength(3));
    await tick();
    expect(stub.editors[2].focusCount).toBe(0);
    expect(document.activeElement).toBe(outside);

    // A document opened the same way doesn't take it either.
    openInPanel("/r/plan.md");
    rerender(<PreviewPanel onClose={vi.fn()} focusRequest={1} />);
    await tick();
    expect(document.activeElement).toBe(outside);
  });

  it("a panel opened by a click, not ⌘⇧B, takes no focus", async () => {
    openInPanel("/r/src/A.ts");
    outside.focus();
    render(<PreviewPanel onClose={vi.fn()} focusRequest={0} />);
    await waitFor(() => expect(stub.editors).toHaveLength(1));
    await tick();
    expect(stub.editors[0].focusCount).toBe(0);
    expect(document.activeElement).toBe(outside);
  });

  it("Esc returns to the terminal", () => {
    const noop = () => {};
    function Keys() {
      useKeybindings({
        toggleScratchpad: noop, closeScratchpad: noop, sendScratchpad: noop, copyScratchpad: noop,
        saveNoteScratchpad: noop, sendEnterToTerminal: noop, toggleCommandPalette: noop,
        toggleAgentPicker: noop, togglePreview: noop, toggleBoard: noop, toggleFleet: noop,
        toggleFileBrowser: noop, openOrchestrator: noop, toggleContracts: noop, toggleTokens: noop,
        toggleIntegrations: noop, toggleShortcuts: noop, toggleTabSwitcher: noop,
        requestCloseTab: noop, requestClosePane: noop, isScratchpadOpen: false,
      });
      return null;
    }
    render(<><Keys /><PreviewPanel onClose={vi.fn()} /></>);
    const body = bodyRegion() as HTMLElement;
    body.focus();
    expect(document.activeElement).toBe(body);
    fireEvent.keyDown(body, { key: "Escape" });
    expect(document.activeElement).toBe(term);
  });
});

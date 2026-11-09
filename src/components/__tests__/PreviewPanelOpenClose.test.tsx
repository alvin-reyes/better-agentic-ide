import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) =>
    cmd === "read_text_head" ? { text: "// code", size: 7, truncated: false, binary: false, lossy: false } : null),
  Channel: class { onmessage: unknown = null; },
}));
vi.mock("@monaco-editor/react", () => import("../editor/__tests__/monacoStub"));
vi.mock("../editor/monacoSetup", () => ({}));

import { stub } from "../editor/__tests__/monacoStub";
import PreviewPanel from "../PreviewPanel";
import { useTabStore } from "../../stores/tabStore";
import { usePreviewPanel } from "../../lib/previewFocus";

/** What App does with the hook: the panel is mounted only while open. */
let api: ReturnType<typeof usePreviewPanel>;
function Host() {
  api = usePreviewPanel();
  return api.open ? <PreviewPanel onClose={api.close} focusRequest={api.focusRequest} /> : null;
}

const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
let term: HTMLTextAreaElement;

beforeEach(() => {
  stub.reset();
  useTabStore.setState({ tabs: [], activeTabId: "" });
  useTabStore.getState().addTab();
  term = document.createElement("textarea");
  term.className = "xterm-helper-textarea";
  document.body.append(term);
});
afterEach(() => term.remove());

describe("opening and closing the panel", () => {
  it("only ⌘⇧B asks for focus, and closing gives it back to the terminal", async () => {
    render(<Host />);
    term.focus();

    // ⌘⇧B opens it: focus goes in (the empty panel's body).
    act(() => api.toggle());
    expect(api.focusRequest).toBeGreaterThan(0);
    const panel = screen.getByRole("complementary", { name: "Preview" });
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

    // ⌘⇧B closes it with focus inside: back to the terminal.
    act(() => api.toggle());
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(document.activeElement).toBe(term);

    // A terminal click opens it on a code file: no request, focus stays put.
    act(() => {
      const { activeTabId, setPreviewPath } = useTabStore.getState();
      setPreviewPath(activeTabId, "/r/src/App.tsx");
      api.openForFile();
    });
    expect(api.focusRequest).toBe(0);
    await waitFor(() => expect(stub.editors).toHaveLength(1));
    await tick();
    expect(stub.editors[0].focusCount).toBe(0);
    expect(document.activeElement).toBe(term);
  });

  it("the close button also gives focus back to the terminal", async () => {
    render(<Host />);
    act(() => api.toggle());
    const panel = screen.getByRole("complementary", { name: "Preview" });
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));
    act(() => api.close());
    expect(api.open).toBe(false);
    expect(api.focusRequest).toBe(0);
    expect(document.activeElement).toBe(term);
  });
});

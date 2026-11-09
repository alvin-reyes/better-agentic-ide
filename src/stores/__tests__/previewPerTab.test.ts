import { describe, it, expect, beforeEach, vi } from "vitest";
// saveSession reads each terminal pane's buffer and folder from here.
vi.mock("../../hooks/useTerminal", () => ({
  serializeTerminalBuffer: () => "",
  getPtyCwd: async () => "/repo",
}));
import { useTabStore, saveSession } from "../tabStore";

/**
 * The preview used to hold its path in component state, on a single instance
 * mounted outside the tab tree. One document for the whole app: open a spec in
 * the tab building the API, switch to the tab building the UI, and you were
 * still looking at the spec.
 *
 * Tab already carries browserUrl, editorFilePath and contractsRoot, so a
 * per-tab document is the pattern here rather than a new idea. The preview was
 * the outlier.
 */
function freshTabs(n: number): string[] {
  useTabStore.setState({ tabs: [], activeTabId: "" });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    useTabStore.getState().addTab();
    ids.push(useTabStore.getState().activeTabId);
  }
  return ids;
}

describe("the preview document belongs to a tab", () => {
  beforeEach(() => useTabStore.setState({ tabs: [], activeTabId: "" }));

  it("starts with no document", () => {
    const [a] = freshTabs(1);
    expect(useTabStore.getState().tabs.find((t) => t.id === a)?.previewPath).toBeFalsy();
  });

  it("keeps each tab's document separate", () => {
    const [a, b] = freshTabs(2);
    useTabStore.getState().setPreviewPath(a, "/repo/api/openapi.yaml");
    useTabStore.getState().setPreviewPath(b, "/repo/web/README.md");
    const tabs = useTabStore.getState().tabs;
    expect(tabs.find((t) => t.id === a)?.previewPath).toBe("/repo/api/openapi.yaml");
    expect(tabs.find((t) => t.id === b)?.previewPath).toBe("/repo/web/README.md");
  });

  it("setting one tab's document leaves the others alone", () => {
    const [a, b] = freshTabs(2);
    useTabStore.getState().setPreviewPath(a, "/repo/api/plan.md");
    expect(useTabStore.getState().tabs.find((t) => t.id === b)?.previewPath).toBeFalsy();
  });

  it("switching tabs changes which document is current", () => {
    const [a, b] = freshTabs(2);
    useTabStore.getState().setPreviewPath(a, "/repo/api/plan.md");
    useTabStore.getState().setPreviewPath(b, "/repo/web/notes.md");

    const current = () => {
      const s = useTabStore.getState();
      return s.tabs.find((t) => t.id === s.activeTabId)?.previewPath ?? null;
    };
    useTabStore.getState().setActiveTab(a);
    expect(current()).toBe("/repo/api/plan.md");
    useTabStore.getState().setActiveTab(b);
    expect(current()).toBe("/repo/web/notes.md");
  });

  it("clears a document without touching the tab's other state", () => {
    const [a] = freshTabs(1);
    useTabStore.getState().renameTab(a, "api");
    useTabStore.getState().setPreviewPath(a, "/repo/api/plan.md");
    useTabStore.getState().setPreviewPath(a, null);
    const tab = useTabStore.getState().tabs.find((t) => t.id === a)!;
    expect(tab.previewPath).toBeNull();
    expect(tab.name).toBe("api");
  });

  /**
   * Closing the panel used to unmount PreviewPanel, which took the path with
   * it, so reopening always started blank. The document living on the tab is
   * what makes closing and reopening lossless.
   */
  it("survives the panel being closed, because the tab holds it", () => {
    const [a] = freshTabs(1);
    useTabStore.getState().setPreviewPath(a, "/repo/api/plan.md");
    // Panel closes and reopens: no store call at all.
    expect(useTabStore.getState().tabs.find((t) => t.id === a)?.previewPath).toBe("/repo/api/plan.md");
  });

  it("ignores a path aimed at a tab that no longer exists", () => {
    const [a] = freshTabs(1);
    useTabStore.getState().setPreviewPath("gone", "/repo/x.md");
    expect(useTabStore.getState().tabs).toHaveLength(1);
    expect(useTabStore.getState().tabs.find((t) => t.id === a)?.previewPath).toBeFalsy();
  });
});

describe("a target line from a path:line click", () => {
  beforeEach(() => useTabStore.setState({ tabs: [], activeTabId: "" }));
  const tab = (id: string) => useTabStore.getState().tabs.find((t) => t.id === id)!;

  it("a target line is per open request and never saved", async () => {
    const [a, b] = freshTabs(2);
    const { setPreviewPath } = useTabStore.getState();
    setPreviewPath(a, "/repo/src/App.tsx", { line: 42 });
    const first = tab(a).previewReveal!;
    expect(first).toMatchObject({ path: "/repo/src/App.tsx", line: 42 });
    expect(first.col).toBeUndefined();
    expect(typeof first.nonce).toBe("number");

    // The same click again is a new request: a new nonce.
    setPreviewPath(a, "/repo/src/App.tsx", { line: 42 });
    const second = tab(a).previewReveal!;
    expect(second).toMatchObject({ path: "/repo/src/App.tsx", line: 42 });
    expect(second.nonce).not.toBe(first.nonce);

    setPreviewPath(a, "/repo/src/App.tsx", { line: 42, col: 7 });
    expect(tab(a).previewReveal).toMatchObject({ path: "/repo/src/App.tsx", line: 42, col: 7 });
    expect(tab(b).previewReveal).toBeFalsy();

    // Opening without a line clears it; so does clearing the document.
    setPreviewPath(a, "/repo/src/App.tsx");
    expect(tab(a).previewPath).toBe("/repo/src/App.tsx");
    expect(tab(a).previewReveal).toBeFalsy();
    setPreviewPath(a, "/repo/src/App.tsx", { line: 3 });
    setPreviewPath(a, null);
    expect(tab(a).previewReveal).toBeFalsy();

    // Never in the saved session, for a terminal tab or any other kind.
    setPreviewPath(a, "/repo/src/App.tsx", { line: 42, col: 7 });
    const browser = useTabStore.getState().addBrowserTab("https://example.com");
    setPreviewPath(browser, "/repo/src/B.ts", { line: 300 });
    localStorage.removeItem("ade-session");
    await saveSession();
    const saved = localStorage.getItem("ade-session");
    expect(saved).toBeTruthy();
    expect(saved).not.toContain("previewReveal");
    expect(saved).not.toContain("nonce");
    for (const t of JSON.parse(saved!).tabs) expect(t).not.toHaveProperty("previewReveal");
  });

  it("a reveal is cleared once applied, not a newer one", () => {
    const [a] = freshTabs(1);
    const { setPreviewPath, clearPreviewReveal } = useTabStore.getState();
    setPreviewPath(a, "/repo/a.ts", { line: 1 });
    const old = tab(a).previewReveal!.nonce;
    setPreviewPath(a, "/repo/a.ts", { line: 2 });
    const newer = tab(a).previewReveal!.nonce;

    clearPreviewReveal(a, old);
    expect(tab(a).previewReveal).toMatchObject({ line: 2, nonce: newer });

    clearPreviewReveal(a, newer);
    expect(tab(a).previewReveal).toBeFalsy();
    expect(tab(a).previewPath).toBe("/repo/a.ts");

    // Nothing to clear, or a tab that is gone: no change, no throw.
    clearPreviewReveal(a, newer);
    clearPreviewReveal("gone", newer);
    expect(tab(a).previewPath).toBe("/repo/a.ts");
  });
});

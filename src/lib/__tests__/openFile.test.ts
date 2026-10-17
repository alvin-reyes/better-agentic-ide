import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn(async () => {}), listen: vi.fn(async () => () => {}) }));

import { openFileFromTerminal } from "../openFile";
import { useTabStore } from "../../stores/tabStore";

describe("openFileFromTerminal", () => {
  let opened: string[];
  const onPreview = (e: Event) => opened.push((e as CustomEvent).detail.path);

  beforeEach(() => {
    opened = [];
    useTabStore.setState({ tabs: [], activeTabId: "" });
    useTabStore.getState().addTab();
    window.addEventListener("open-preview", onPreview);
  });
  afterEach(() => window.removeEventListener("open-preview", onPreview));

  it("every clicked file opens in the panel", () => {
    const addEditorTab = vi.spyOn(useTabStore.getState(), "addEditorTab");
    const tabsBefore = useTabStore.getState().tabs.length;
    const paths = ["/r/src/App.tsx", "/r/spec.docx", "/r/plan.md", "/r/shot.png"];
    for (const p of paths) openFileFromTerminal(p);
    expect(opened).toEqual(paths);
    expect(addEditorTab).not.toHaveBeenCalled();
    expect(useTabStore.getState().tabs.length).toBe(tabsBefore);
    addEditorTab.mockRestore();
  });

  it("opensInPreview is gone", () => {
    const root = resolve(__dirname, "../..");
    expect(readFileSync(resolve(root, "lib/terminalFileLinks.ts"), "utf8")).not.toContain("opensInPreview");
    expect(readFileSync(resolve(root, "lib/openFile.ts"), "utf8")).not.toContain("opensInPreview");
  });
});

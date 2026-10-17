import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const win = vi.hoisted(() => ({ label: "main" }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: win.label }) }));
vi.mock("@tauri-apps/api/event", () => ({ emitTo: vi.fn(async () => {}), listen: vi.fn(async () => () => {}) }));

import { emitTo, listen } from "@tauri-apps/api/event";
import { listenForFileOpens, openFileFromTerminal, revealTargetOf } from "../openFile";
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

  it("the line travels with the file", async () => {
    const details: unknown[] = [];
    const onDetail = (e: Event) => details.push((e as CustomEvent).detail);
    window.addEventListener("open-preview", onDetail);
    try {
      openFileFromTerminal("/r/src/App.tsx", { line: 42, col: 7 });
      openFileFromTerminal("/r/a.ts", { line: 9 });
      openFileFromTerminal("/r/b.ts");
      expect(details).toEqual([
        { path: "/r/src/App.tsx", line: 42, col: 7 },
        { path: "/r/a.ts", line: 9 },
        { path: "/r/b.ts" },
      ]);
      expect(details[1]).not.toHaveProperty("col");
      expect(details[2]).not.toHaveProperty("line");

      // A detached window hands the same fields to the main window.
      win.label = "detached-1";
      vi.mocked(emitTo).mockClear();
      openFileFromTerminal("/r/src/App.tsx", { line: 42, col: 7 });
      expect(vi.mocked(emitTo).mock.calls).toEqual([["main", "open-file", { path: "/r/src/App.tsx", line: 42, col: 7 }]]);
      expect(details).toHaveLength(3);
      win.label = "main";

      // ... and the main window passes them on.
      vi.mocked(listen).mockClear();
      await listenForFileOpens();
      const handler = vi.mocked(listen).mock.calls[0][1] as (e: { payload: unknown }) => void;
      handler({ payload: { path: "/r/src/App.tsx", line: 42, col: 7 } });
      expect(details[3]).toEqual({ path: "/r/src/App.tsx", line: 42, col: 7 });
    } finally {
      win.label = "main";
      window.removeEventListener("open-preview", onDetail);
    }
  });

  it("the panel's target line comes from the event, only when it is a real line", () => {
    expect(revealTargetOf({ path: "/r/a.ts", line: 42, col: 7 })).toEqual({ line: 42, col: 7 });
    expect(revealTargetOf({ path: "/r/a.ts", line: 9 })).toEqual({ line: 9 });
    expect(revealTargetOf({ path: "/r/a.ts", line: 9 })).not.toHaveProperty("col");
    expect(revealTargetOf({ path: "/r/a.ts", line: 9, col: 0 })).toEqual({ line: 9 });
    for (const bad of [{ path: "/r/a.ts" }, { line: 0 }, { line: -1 }, { line: 1.5 }, { line: "4" }, { line: NaN }, null, undefined]) {
      expect(revealTargetOf(bad)).toBeUndefined();
    }
  });

  it("opensInPreview is gone", () => {
    const root = resolve(__dirname, "../..");
    expect(readFileSync(resolve(root, "lib/terminalFileLinks.ts"), "utf8")).not.toContain("opensInPreview");
    expect(readFileSync(resolve(root, "lib/openFile.ts"), "utf8")).not.toContain("opensInPreview");
  });
});

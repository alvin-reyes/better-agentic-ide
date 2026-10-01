import { describe, it, expect, vi } from "vitest";
import { editorDirty, unsavedEditorTabs } from "../editorDirty";

/**
 * Closing one tab asks the editor whether it has unsaved changes and prompts.
 * Closing several ("Close others", "Close to the right") did not: it only
 * checked hasActiveProcess, which reads an xterm buffer and returns null for
 * every non-terminal pane. Editor tabs therefore never counted as live, and
 * unsaved work was discarded with no dialog at all.
 */
function answerFor(tabId: string, isDirty: boolean) {
  const handler = (ev: Event) => {
    if ((ev as CustomEvent).detail?.tabId !== tabId) return;
    window.dispatchEvent(new CustomEvent("editor-dirty-response", { detail: { tabId, isDirty } }));
  };
  window.addEventListener("editor-dirty-check", handler);
  return () => window.removeEventListener("editor-dirty-check", handler);
}

describe("editorDirty", () => {
  it("reports an editor that answers dirty", async () => {
    const stop = answerFor("t1", true);
    await expect(editorDirty("t1")).resolves.toBe(true);
    stop();
  });

  it("reports an editor that answers clean", async () => {
    const stop = answerFor("t2", false);
    await expect(editorDirty("t2")).resolves.toBe(false);
    stop();
  });

  it("resolves false when nothing answers, rather than hanging the close", async () => {
    await expect(editorDirty("nobody", 5)).resolves.toBe(false);
  });

  it("ignores a reply meant for a different tab", async () => {
    const stop = answerFor("other", true);
    await expect(editorDirty("mine", 5)).resolves.toBe(false);
    stop();
  });

  it("leaves no listener behind once it has answered", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const stop = answerFor("t3", true);
    await editorDirty("t3");
    const added = add.mock.calls.filter(([e]) => e === "editor-dirty-response").length;
    const removed = remove.mock.calls.filter(([e]) => e === "editor-dirty-response").length;
    expect(removed).toBe(added);
    stop(); add.mockRestore(); remove.mockRestore();
  });
});

describe("unsavedEditorTabs", () => {
  const tabs = [
    { id: "term", type: "terminal" },
    { id: "clean", type: "editor" },
    { id: "dirty", type: "editor" },
  ];

  it("names only the editors with unsaved changes", async () => {
    const stops = [answerFor("clean", false), answerFor("dirty", true)];
    await expect(unsavedEditorTabs(tabs, 20)).resolves.toEqual(["dirty"]);
    stops.forEach((s) => s());
  });

  it("never asks a terminal tab, which could not answer", async () => {
    const asked: string[] = [];
    const spy = (ev: Event) => asked.push((ev as CustomEvent).detail.tabId);
    window.addEventListener("editor-dirty-check", spy);
    await unsavedEditorTabs(tabs, 5);
    window.removeEventListener("editor-dirty-check", spy);
    expect(asked).not.toContain("term");
  });

  it("returns nothing when there are no editors", async () => {
    await expect(unsavedEditorTabs([{ id: "a", type: "terminal" }], 5)).resolves.toEqual([]);
  });
});

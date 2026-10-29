import { beforeEach, describe, expect, it, vi } from "vitest";

/** A fresh settingsStore module, which reads localStorage as the app does at start. */
async function loadStore() {
  vi.resetModules();
  return (await import("../settingsStore")).useSettingsStore;
}

beforeEach(() => localStorage.clear());

describe("settingsStore", () => {
  it("file hover preview setting", async () => {
    const store = await loadStore();
    expect(store.getState().fileHoverPreview).toBe(true);

    store.getState().setFileHoverPreview(false);
    expect(store.getState().fileHoverPreview).toBe(false);
    expect(JSON.parse(localStorage.getItem("better-terminal-settings") ?? "{}").fileHoverPreview).toBe(false);

    const reloaded = await loadStore();
    expect(reloaded).not.toBe(store);
    expect(reloaded.getState().fileHoverPreview).toBe(false);
  });
});

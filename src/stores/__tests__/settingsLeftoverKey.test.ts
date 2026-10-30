import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => {
    throw new Error("not under Tauri");
  }),
}));

const KEY = "better-terminal-settings";
const savedJson = () => JSON.parse(localStorage.getItem(KEY)!) as Record<string, unknown>;

/** A fresh store, evaluated against what localStorage holds now (as at boot). */
async function loadStore() {
  vi.resetModules();
  return (await import("../settingsStore")).useSettingsStore;
}

beforeEach(() => {
  localStorage.clear();
});

describe("B7: the old key field is carried by the store, never held in it", () => {
  it("keeps a leftover key and unknown fields through saves, until the key is stripped", async () => {
    localStorage.setItem(KEY, JSON.stringify({ anthropicApiKey: "sk-ant-K", futureThing: { v: 2 }, fontSize: 13 }));
    const store = await loadStore();

    const state = store.getState() as unknown as Record<string, unknown>;
    expect("anthropicApiKey" in state).toBe(false);
    expect("setAnthropicApiKey" in state).toBe(false);
    expect(state.futureThing).toEqual({ v: 2 });

    store.getState().setFontSize(15);
    let saved = savedJson();
    expect(saved.anthropicApiKey).toBe("sk-ant-K");
    expect(saved.futureThing).toEqual({ v: 2 });
    expect(saved.fontSize).toBe(15);

    // The move (or Remove the saved copy) strips localStorage.
    const { anthropicApiKey: _drop, ...rest } = saved;
    localStorage.setItem(KEY, JSON.stringify(rest));

    store.getState().setFontSize(16);
    saved = savedJson();
    expect("anthropicApiKey" in saved).toBe(false);
    expect(saved.futureThing).toEqual({ v: 2 });
    expect(saved.fontSize).toBe(16);
  });

  it("a save with no leftover key never adds one", async () => {
    localStorage.setItem(KEY, JSON.stringify({ fontSize: 13 }));
    const store = await loadStore();
    store.getState().setFontSize(14);
    expect("anthropicApiKey" in savedJson()).toBe(false);
  });
});

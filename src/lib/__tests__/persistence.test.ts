import { describe, it, expect, beforeEach, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import {
  isPersistedKey,
  hydrateFromDisk,
  startAutoSave,
  flushNow,
  __resetForTests,
} from "../persistence";

describe("isPersistedKey", () => {
  it("covers app state keys and recording prefixes only", () => {
    expect(isPersistedKey("ade-session")).toBe(true);
    expect(isPersistedKey("better-terminal-settings")).toBe(true);
    expect(isPersistedKey("ade-scratchpad-draft")).toBe(true);
    expect(isPersistedKey("ade-rec-abc")).toBe(true);
    expect(isPersistedKey("some-other-lib-key")).toBe(false);
  });
});

describe("hydrateFromDisk", () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
  });

  it("copies saved keys into localStorage and skips unknown ones", async () => {
    invoke.mockResolvedValueOnce({ "ade-session": '{"tabs":[]}', "foreign-key": "x" });
    const n = await hydrateFromDisk();
    expect(n).toBe(1);
    expect(localStorage.getItem("ade-session")).toBe('{"tabs":[]}');
    expect(localStorage.getItem("foreign-key")).toBeNull();
  });

  it("seeds disk from localStorage on first run after upgrade", async () => {
    localStorage.setItem("better-terminal-saved-notes", "[1]");
    localStorage.setItem("unrelated", "y");
    invoke.mockResolvedValueOnce({}).mockResolvedValueOnce(undefined);
    await hydrateFromDisk();
    expect(invoke).toHaveBeenLastCalledWith("state_write", {
      entries: { "better-terminal-saved-notes": "[1]" },
    });
  });

  it("does nothing outside Tauri", async () => {
    invoke.mockRejectedValueOnce(new Error("no tauri"));
    await expect(hydrateFromDisk()).resolves.toBe(0);
  });
});

describe("startAutoSave", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    localStorage.clear();
    __resetForTests();
    startAutoSave();
  });

  it("queues writes and removals of persisted keys and flushes them in one batch", async () => {
    localStorage.setItem("better-terminal-settings", '{"theme":"x"}');
    localStorage.setItem("ade-scratchpad-draft", "draft");
    localStorage.removeItem("ade-scratchpad-draft");
    localStorage.setItem("not-ours", "1");
    await flushNow();
    const writes = invoke.mock.calls.filter((c) => c[0] === "state_write");
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual({
      entries: { "better-terminal-settings": '{"theme":"x"}', "ade-scratchpad-draft": null },
    });
  });

  it("keeps a failed batch and retries it with the next flush", async () => {
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "state_write") throw new Error("disk full");
    });
    localStorage.setItem("ade-session", "a");
    await flushNow();
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    localStorage.setItem("ade-file-browser", "b");
    await flushNow();
    expect(invoke).toHaveBeenCalledWith("state_write", {
      entries: { "ade-session": "a", "ade-file-browser": "b" },
    });
  });

  it("still behaves as normal localStorage", () => {
    localStorage.setItem("ade-session", "v");
    expect(localStorage.getItem("ade-session")).toBe("v");
  });
});

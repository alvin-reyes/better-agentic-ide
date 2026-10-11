import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  applies: [] as Record<string, unknown>[],
  statusFails: false,
  applyFails: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_setup_status":
        if (tauri.statusFails) throw new Error("not a folder");
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: tauri.byDir[args.root as string] ?? null };
      case "project_setup_apply":
        tauri.applies.push(args);
        if (tauri.applyFails) throw new Error("disk full");
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import {
  __resetPromptForTests, askAndSetUp, askMethodology, projectName, settlePrompt, useMethodologyPrompt,
  type MethodologyAnswer,
} from "../methodologyPrompt";
import { requestNewTab } from "../newTab";
import { setUpProject } from "../projectSetup";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";

const request = () => useMethodologyPrompt.getState().request;
const asked = (root: string) => vi.waitFor(() => expect(request()).toEqual({ root }));

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.applies.length = 0;
  tauri.statusFails = false;
  tauri.applyFails = false;
  __resetPromptForTests();
});

describe("askMethodology", () => {
  it("returns the version on disk without asking", async () => {
    tauri.byDir = { "/code/old": "v4", "/code/new": "v6" };
    expect(await askMethodology("/code/old")).toEqual({ kind: "chosen", methodology: "v4", asked: false });
    expect(await askMethodology("/code/new/")).toEqual({ kind: "chosen", methodology: "v6", asked: false });
    expect(request()).toBeNull();
  });

  it("asks about a project with no BMAD, and resolves with the answer", async () => {
    const answer = askMethodology("/code/shop/");
    await asked("/code/shop");
    settlePrompt({ kind: "chosen", methodology: "v4", asked: true });
    expect(await answer).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    expect(request()).toBeNull();
  });

  it("resolves as dismissed when the question is closed", async () => {
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    expect(await answer).toEqual({ kind: "dismissed" });
  });

  it("asks when the check on disk fails, rather than guessing a version", async () => {
    tauri.statusFails = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("shares one question between two callers asking about the same project", async () => {
    const a = askMethodology("/code/shop");
    const b = askMethodology("/code/shop/");
    await asked("/code/shop");
    settlePrompt({ kind: "chosen", methodology: "v6", asked: true });
    expect(await a).toEqual({ kind: "chosen", methodology: "v6", asked: true });
    expect(await b).toEqual({ kind: "chosen", methodology: "v6", asked: true });
  });

  it("dismisses the question it replaces when another project asks", async () => {
    const first = askMethodology("/code/shop");
    await asked("/code/shop");
    const second = askMethodology("/code/other");
    await asked("/code/other");
    expect(await first).toEqual({ kind: "dismissed" });
    settlePrompt({ kind: "chosen", methodology: "v6", asked: true });
    expect(await second).toEqual({ kind: "chosen", methodology: "v6", asked: true });
  });

  it("uses the caller's own question instead of the dialog", async () => {
    const ask = vi.fn(async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v4", asked: true }));
    expect(await askMethodology("/code/shop/", { ask })).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    expect(ask).toHaveBeenCalledWith("/code/shop");
    expect(request()).toBeNull();
  });
});

describe("askAndSetUp", () => {
  it("sets the project up on the answer and announces it", async () => {
    const done = vi.fn();
    window.addEventListener("project-setup-done", done);
    const result = askAndSetUp("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "chosen", methodology: "v4", asked: true });
    expect((await result)?.root).toBe("/code/shop");
    expect(tauri.applies).toHaveLength(1);
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4", full: true });
    expect(done).toHaveBeenCalledOnce();
    window.removeEventListener("project-setup-done", done);
  });

  it("sets up a project that has BMAD on its own version, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    await askAndSetUp("/code/old");
    expect(request()).toBeNull();
    expect(tauri.applies[0]).toMatchObject({ root: "/code/old", methodology: "v4" });
  });

  it("sets nothing up when the question is dismissed", async () => {
    const result = askAndSetUp("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    expect(await result).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("a project that gains BMAD while its question is open", () => {
  it("is set up on the version it now has, not the one answered", async () => {
    const result = askAndSetUp("/code/shop");
    await asked("/code/shop");
    // Another route (the cd hook's toast, a hand install) put v4 there meanwhile.
    tauri.byDir = { "/code/shop": "v4" };
    settlePrompt({ kind: "chosen", methodology: "v6", asked: true });
    await result;
    expect(tauri.applies.map((a) => a.methodology)).toEqual(["v4"]);
  });

  it("has its question closed by a setup that finishes elsewhere, and is not set up a second time", async () => {
    const done = vi.fn();
    window.addEventListener("project-setup-done", done);
    const result = askAndSetUp("/code/shop/");
    await asked("/code/shop");
    const elsewhere = await setUpProject("/code/shop", "v4");
    expect(request()).toBeNull();
    // The caller gets that setup's result, so it refreshes as if it had run it.
    expect(await result).toBe(elsewhere);
    expect(tauri.applies.map((a) => a.methodology)).toEqual(["v4"]);
    expect(done).not.toHaveBeenCalled();
    window.removeEventListener("project-setup-done", done);
  });

  it("tells whoever asked which version it was set up on", async () => {
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    const elsewhere = await setUpProject("/code/shop", "v4");
    expect(await answer).toEqual({ kind: "chosen", methodology: "v4", asked: false, done: elsewhere });
  });

  it("leaves another project's question open", async () => {
    void askMethodology("/code/shop");
    await asked("/code/shop");
    await setUpProject("/code/other", "v4");
    expect(request()).toEqual({ root: "/code/shop" });
  });

  it("keeps its question after a setup that failed", async () => {
    void askMethodology("/code/shop");
    await asked("/code/shop");
    tauri.applyFails = true;
    await expect(setUpProject("/code/shop", "v4")).rejects.toThrow();
    expect(request()).toEqual({ root: "/code/shop" });
  });
});

describe("a folder that isn't a project", () => {
  it.each(["/Users/testuser", "/Users/testuser/", "/home/u", "/", "C:\\", "C:\\Users\\u"])("is refused before anything is asked: %s", async (root) => {
    await expect(askAndSetUp(root)).rejects.toBe("This folder isn't a project.");
    expect(request()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("New Tab while a question is open", () => {
  it.each([true, false])("is ignored (ask on new tab: %s)", async (askOnNewTab) => {
    useSettingsStore.setState({ askOnNewTab });
    const requested = vi.fn();
    window.addEventListener("request-new-tab", requested);
    const before = useTabStore.getState().tabs.length;
    void askMethodology("/code/shop");
    await asked("/code/shop");

    requestNewTab();
    expect(requested).not.toHaveBeenCalled();
    expect(useTabStore.getState().tabs).toHaveLength(before);

    // Answered: New Tab works again.
    settlePrompt({ kind: "chosen", methodology: "v6", asked: true });
    requestNewTab();
    expect(requested.mock.calls.length + useTabStore.getState().tabs.length - before).toBe(1);
    window.removeEventListener("request-new-tab", requested);
  });
});

describe("projectName", () => {
  it("is the folder's name, on either separator", () => {
    expect(projectName("/code/shop")).toBe("shop");
    expect(projectName("/code/shop/")).toBe("shop");
    expect(projectName("C:\\code\\shop")).toBe("shop");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  applies: [] as Record<string, unknown>[],
  statusFails: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_setup_status":
        if (tauri.statusFails) throw new Error("not a folder");
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: tauri.byDir[args.root as string] ?? null };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import {
  __resetPromptForTests, askAndSetUp, askMethodology, dismissedThisSession, projectName, settlePrompt, useMethodologyPrompt,
  type MethodologyAnswer,
} from "../methodologyPrompt";

const request = () => useMethodologyPrompt.getState().request;
const asked = (root: string) => vi.waitFor(() => expect(request()).toEqual({ root }));

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.applies.length = 0;
  tauri.statusFails = false;
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
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
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

describe("asking once per session", () => {
  it("marks the project before the question shows, and doesn't ask it again", async () => {
    // A question that is never answered: a toast that timed out.
    const ask = vi.fn(() => new Promise<MethodologyAnswer>(() => {}));
    void askMethodology("/code/shop", { once: true, ask });
    await vi.waitFor(() => expect(ask).toHaveBeenCalledOnce());
    expect(dismissedThisSession("/code/shop/")).toBe(true);

    expect(await askMethodology("/code/shop/", { once: true, ask })).toEqual({ kind: "dismissed" });
    expect(ask).toHaveBeenCalledOnce();
  });

  it("stays dismissed after the question is closed", async () => {
    const ask = async (): Promise<MethodologyAnswer> => ({ kind: "dismissed" });
    expect(await askMethodology("/code/shop", { once: true, ask })).toEqual({ kind: "dismissed" });
    expect(dismissedThisSession("/code/shop")).toBe(true);
  });

  it("clears the mark when a version is chosen", async () => {
    const ask = async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v6", asked: true });
    await askMethodology("/code/shop", { once: true, ask });
    expect(dismissedThisSession("/code/shop")).toBe(false);
  });

  it("still asks a dismissed project when the caller doesn't ask once", async () => {
    await askMethodology("/code/shop", { once: true, ask: async () => ({ kind: "dismissed" }) });
    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
  });

  it("never dismisses a project that has BMAD", async () => {
    tauri.byDir = { "/code/old": "v4" };
    await askMethodology("/code/old", { once: true });
    expect(dismissedThisSession("/code/old")).toBe(false);
  });

  it("keeps the dismissals in memory only", async () => {
    await askMethodology("/code/shop", { once: true, ask: async () => ({ kind: "dismissed" }) });
    expect(localStorage.length).toBe(0);
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

describe("projectName", () => {
  it("is the folder's name, on either separator", () => {
    expect(projectName("/code/shop")).toBe("shop");
    expect(projectName("/code/shop/")).toBe("shop");
    expect(projectName("C:\\code\\shop")).toBe("shop");
  });
});

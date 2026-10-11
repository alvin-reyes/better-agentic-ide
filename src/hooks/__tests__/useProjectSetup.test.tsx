import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  /** Folders with no `.git`. */
  notGit: new Set<string>(),
  applies: [] as Record<string, unknown>[],
  applyError: null as string | null,
  /** When set, project_setup_apply waits for it: the setup is still running. */
  applyGate: null as Promise<void> | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
      case "project_setup_status":
        return {
          isGit: !tauri.notGit.has(args.root as string), missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        if (tauri.applyGate) await tauri.applyGate;
        if (tauri.applyError) throw new Error(tauri.applyError);
        return { created: [`${args.root}/.ade/rules.md`], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import { __resetSetupQuestionsForTests, useProjectSetup } from "../useProjectSetup";
import type { GuardToast } from "../useContextGuard";
import { __resetPromptForTests, settlePrompt, useMethodologyPrompt } from "../../lib/methodologyPrompt";
import { openProjectTab } from "../../lib/newTab";
import { useSettingsStore } from "../../stores/settingsStore";

const show = vi.fn<(t: GuardToast) => void>();
const mount = (cwd: string | null) =>
  renderHook(({ cwd }: { cwd: string | null }) => useProjectSetup(cwd, show), { initialProps: { cwd } });
const toasts = () => show.mock.calls.map(([t]) => t);
/** The toasts that ask which version: all of them, or those about one project. */
const questions = (name?: string) =>
  toasts().filter((t) => (name ? t.title === `Set up ${name} with BMAD?` : / with BMAD\?$/.test(t.title)));
/** Let the hook's chain of awaits run out, to assert that nothing happened. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.roots = {};
  tauri.notGit = new Set();
  tauri.applies.length = 0;
  tauri.applyError = null;
  tauri.applyGate = null;
  show.mockClear();
  __resetPromptForTests();
  __resetSetupQuestionsForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("a project with no BMAD", () => {
  it("is asked with a toast that offers v6 then v4 and no way to skip, not the dialog, and nothing is set up", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    const toast = questions()[0];
    expect(toast.title).toBe("Set up shop with BMAD?");
    expect(toast.actions!.map((a) => a.label)).toEqual(["v6", "v4"]);
    expect(toast.action).toBeUndefined();
    expect(useMethodologyPrompt.getState().request).toBeNull();
    await settle();
    expect(tauri.applies).toHaveLength(0);
  });

  it("is asked with a toast that stays until it is answered", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    expect(questions()[0].sticky).toBe(true);
  });

  it("is set up on the version clicked, and the setup is announced", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    act(() => questions()[0].actions![1].run!());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4", full: true });
    await waitFor(() => expect(toasts().some((t) => t.title === "Set up shop")).toBe(true));
  });

  it("is asked again on the next run after another toast replaced its question", async () => {
    tauri.roots = { "/code/shop/src": "/code/shop" };
    const hook = mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    // App shows one toast at a time: this one takes the place of shop's.
    hook.rerender({ cwd: "/code/other" });
    await waitFor(() => expect(questions("other")).toHaveLength(1));

    hook.rerender({ cwd: "/code/shop/" });
    await waitFor(() => expect(questions("shop")).toHaveLength(2));
    hook.rerender({ cwd: "/code/shop/src" });
    await waitFor(() => expect(questions("shop")).toHaveLength(3));
    await settle();
    expect(tauri.applies).toHaveLength(0);
  });

  it("is set up once, on the first answer, when an old toast and a re-shown one are both clicked", async () => {
    const hook = mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    hook.rerender({ cwd: "/code/other" });
    await waitFor(() => expect(questions("other")).toHaveLength(1));
    hook.rerender({ cwd: "/code/shop" });
    await waitFor(() => expect(questions("shop")).toHaveLength(2));

    const [old, again] = questions("shop");
    act(() => { old.actions![1].run!(); again.actions![0].run!(); });
    await waitFor(() => expect(toasts().some((t) => t.title === "Set up shop")).toBe(true));
    await settle();
    expect(tauri.applies).toHaveLength(1);
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4" });
    expect(toasts().filter((t) => t.title === "Set up shop")).toHaveLength(1);
  });

  it("is not asked again while the setup it was answered with is running", async () => {
    let release!: () => void;
    tauri.applyGate = new Promise<void>((r) => { release = r; });
    const hook = mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    act(() => questions("shop")[0].actions![0].run!());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));

    hook.rerender({ cwd: "/code/elsewhere" });
    await waitFor(() => expect(questions("elsewhere")).toHaveLength(1));
    hook.rerender({ cwd: "/code/shop" });
    await settle();
    expect(questions("shop")).toHaveLength(1);
    release();
    await settle();
    expect(tauri.applies).toHaveLength(1);
  });

  it("is not asked again once it was answered and set up", async () => {
    const hook = mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    act(() => questions("shop")[0].actions![0].run!());
    await waitFor(() => expect(toasts().some((t) => t.title === "Set up shop")).toBe(true));

    hook.rerender({ cwd: "/code/other" });
    await waitFor(() => expect(questions("other")).toHaveLength(1));
    hook.rerender({ cwd: "/code/shop" });
    await settle();
    expect(questions("shop")).toHaveLength(1);
    expect(tauri.applies).toHaveLength(1);
  });

  it("is not set up by a toast left over from before something else set it up", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    // The palette or New tab got there first.
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/shop"]));
    act(() => questions("shop")[0].actions![1].run!());
    await settle();
    expect(tauri.applies).toHaveLength(0);
  });

  it("says so when the setup it was asked for fails", async () => {
    tauri.applyError = "disk full";
    mount("/code/shop");
    await waitFor(() => expect(questions()).toHaveLength(1));
    act(() => questions()[0].actions![0].run!());
    await waitFor(() => expect(toasts().some((t) => t.title === "Project setup" && t.body.includes("disk full"))).toBe(true));
  });

  it("is asked again after the setup it was answered with failed", async () => {
    tauri.applyError = "disk full";
    const hook = mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    act(() => questions("shop")[0].actions![0].run!());
    await waitFor(() => expect(toasts().some((t) => t.title === "Project setup")).toBe(true));

    tauri.applyError = null;
    hook.rerender({ cwd: "/code/other" });
    await waitFor(() => expect(questions("other")).toHaveLength(1));
    hook.rerender({ cwd: "/code/shop" });
    await waitFor(() => expect(questions("shop")).toHaveLength(2));
    act(() => questions("shop")[1].actions![0].run!());
    await waitFor(() => expect(toasts().some((t) => t.title === "Set up shop")).toBe(true));
  });

  it("is left alone outside a git repository", async () => {
    tauri.notGit.add("/code/loose");
    mount("/code/loose");
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("a project that has BMAD", () => {
  it("is set up on its own version, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    mount("/code/old");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/old", methodology: "v4" });
    expect(questions()).toHaveLength(0);
    expect(useMethodologyPrompt.getState().request).toBeNull();
  });

  it("is set up where it sits, below the repository root", async () => {
    tauri.roots = { "/code/mono/app/src": "/code/mono", "/code/mono/app": "/code/mono" };
    tauri.byDir = { "/code/mono/app": "v6" };
    tauri.notGit.add("/code/mono/app");
    mount("/code/mono/app/src");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/mono/app", methodology: "v6" });
    expect(questions()).toHaveLength(0);
  });

  it("stays quiet when a setup nobody asked for fails", async () => {
    tauri.byDir = { "/code/old": "v4" };
    tauri.applyError = "disk full";
    mount("/code/old");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    await settle();
    expect(show).not.toHaveBeenCalled();
  });
});

describe("when automatic setup doesn't apply", () => {
  it("does nothing with automatic setup off", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    mount("/code/shop");
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(tauri.applies).toHaveLength(0);
  });

  it("does nothing for a project whose setup was undone", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop/"]));
    mount("/code/shop");
    await settle();
    expect(show).not.toHaveBeenCalled();
    expect(tauri.applies).toHaveLength(0);
  });

  it("does not ask about a project already set up", async () => {
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/shop"]));
    mount("/code/shop");
    await settle();
    expect(show).not.toHaveBeenCalled();
  });
});

describe("after the New tab dialog", () => {
  it("does not ask about the repository while New tab is setting up a folder inside it", async () => {
    let release!: () => void;
    tauri.applyGate = new Promise<void>((r) => { release = r; });
    tauri.roots = { "/code/mono/app": "/code/mono" };
    const opened = openProjectTab("/code/mono/app");
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/mono/app" }));
    act(() => settlePrompt({ kind: "chosen", methodology: "v6", asked: true }));
    await opened;
    await waitFor(() => expect(tauri.applies).toHaveLength(1));

    // The marker isn't written yet, so the hook resolves the repository above.
    mount("/code/mono/app");
    await settle();
    expect(questions()).toHaveLength(0);
    expect(tauri.applies).toHaveLength(1);
    release();
    await settle();
  });
});

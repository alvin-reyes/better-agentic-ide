import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  pending: [] as unknown[],
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
      case "bmad_switch_pending":
        return tauri.pending;
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
      case "bmad_switch_apply":
        return { archive: ".ade/archive/bmad-v4-2026-10-11", moved: 3, setup: { created: [], appendedImport: false, agents: 0, bmadFiles: 0 }, rulesAppended: false, archiveDenied: false, movedCapped: false };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import { __resetSetupQuestionsForTests, useProjectSetup } from "../useProjectSetup";
import { withdrawToast, type GuardToast } from "../useContextGuard";
import { __resetPromptForTests, askAndSetUp, settlePrompt, useMethodologyPrompt } from "../../lib/methodologyPrompt";
import { openProjectTab } from "../../lib/newTab";
import { runSwitch, type SwitchPlan } from "../../lib/bmadSwitch";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";

/** The app's one toast, as App keeps it: the last shown, until it is withdrawn by its key. */
const screen = { toast: null as GuardToast | null };
const show = vi.fn<(t: GuardToast) => void>((t) => { screen.toast = t; });
const withdraw = vi.fn<(key: string) => void>((key) => { screen.toast = withdrawToast(screen.toast, key); });
const mount = (cwd: string | null) =>
  renderHook(({ cwd }: { cwd: string | null }) => useProjectSetup(cwd, show, withdraw), { initialProps: { cwd } });
const toasts = () => show.mock.calls.map(([t]) => t);
/** The toasts that ask which version: all of them, or those about one project. */
const questions = (name?: string) =>
  toasts().filter((t) => (name ? t.title === `Set up ${name} with BMAD?` : / with BMAD\?$/.test(t.title)));
/** Let the hook's chain of awaits run out, to assert that nothing happened. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

beforeEach(() => {
  tauri.pending = [];
  localStorage.clear();
  tauri.byDir = {};
  tauri.roots = {};
  tauri.notGit = new Set();
  tauri.applies.length = 0;
  tauri.applyError = null;
  tauri.applyGate = null;
  show.mockClear();
  withdraw.mockClear();
  screen.toast = null;
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

  it("is set up on the version it gained while the toast was up, not the one clicked", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    // Installed by hand in the meantime.
    tauri.byDir = { "/code/shop": "v4" };
    act(() => questions("shop")[0].actions![0].run!());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4" });
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

describe("the question toast leaves with its project", () => {
  const SHOP = "Set up shop with BMAD?";
  /** A project set up long ago: the hook shows nothing for it. */
  const setUpBefore = (root: string) => localStorage.setItem("ade-project-setup-done", JSON.stringify([root]));

  it("is withdrawn when the terminal moves to another project, and shown again on return", async () => {
    setUpBefore("/code/other");
    const hook = mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));

    hook.rerender({ cwd: "/code/other" });
    expect(screen.toast).toBeNull();
    await settle();
    expect(screen.toast).toBeNull();

    hook.rerender({ cwd: "/code/shop" });
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));
    // Still one question: the copy that came back answers it, once.
    act(() => screen.toast!.actions![1].run!());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4" });
  });

  it("is withdrawn when the pane has no folder any more", async () => {
    const hook = mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));
    hook.rerender({ cwd: null });
    expect(screen.toast).toBeNull();
  });

  it("is withdrawn when automatic setup is turned off, and shown again when it is turned back on", async () => {
    mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));

    act(() => useSettingsStore.getState().setAutoProjectSetup(false));
    expect(screen.toast).toBeNull();
    await settle();
    expect(screen.toast).toBeNull();
    expect(tauri.applies).toHaveLength(0);

    act(() => useSettingsStore.getState().setAutoProjectSetup(true));
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));
  });

  it("does not take a different toast off the screen", async () => {
    setUpBefore("/code/other");
    const hook = mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe(SHOP));
    const finished: GuardToast = { title: "Agent finished", body: "Done." };
    show(finished);

    hook.rerender({ cwd: "/code/other" });
    await settle();
    expect(screen.toast).toBe(finished);
  });

  it("is not shown by a run the terminal has already left", async () => {
    setUpBefore("/code/other");
    const hook = mount("/code/shop");
    hook.rerender({ cwd: "/code/other" });
    await settle();
    expect(questions("shop")).toHaveLength(0);
    expect(screen.toast).toBeNull();
  });
});

describe("the toast and the dialog asking about one project", () => {
  const dialogAsks = (root: string) => waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root, mode: "choose" }));

  it("the toast's answer closes the dialog, and the project is set up once, on that version", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    // Set up now, or the palette, for the same project.
    const fromDialog = askAndSetUp("/code/shop");
    await dialogAsks("/code/shop");

    act(() => questions("shop")[0].actions![1].run!());
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toBeNull());
    expect((await fromDialog)?.root).toBe("/code/shop");
    await settle();
    expect(tauri.applies.map((a) => a.methodology)).toEqual(["v4"]);
  });

  it("the toast's answer lets New Tab open the folder, with no second setup", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    const before = useTabStore.getState().tabs.length;
    const opened = openProjectTab("/code/shop");
    await dialogAsks("/code/shop");
    expect(useTabStore.getState().tabs).toHaveLength(before);

    act(() => questions("shop")[0].actions![1].run!());
    await opened;
    expect(useTabStore.getState().tabs).toHaveLength(before + 1);
    await settle();
    expect(tauri.applies.map((a) => a.methodology)).toEqual(["v4"]);
  });

  it("the dialog's answer withdraws the toast, and a copy of it clicked afterwards installs nothing", async () => {
    mount("/code/shop");
    await waitFor(() => expect(screen.toast?.title).toBe("Set up shop with BMAD?"));
    const stale = screen.toast!;
    const fromDialog = askAndSetUp("/code/shop");
    await dialogAsks("/code/shop");

    act(() => settlePrompt({ kind: "chosen", methodology: "v6", asked: true }));
    await fromDialog;
    expect(screen.toast).toBeNull();
    expect(withdraw).toHaveBeenCalledWith(stale.key);

    act(() => stale.actions![1].run!());
    await settle();
    expect(tauri.applies.map((a) => a.methodology)).toEqual(["v6"]);
  });

  it("the dialog's answer does not take a different toast off the screen", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    const finished: GuardToast = { title: "Agent finished", body: "Done." };
    show(finished);
    const fromDialog = askAndSetUp("/code/shop");
    await dialogAsks("/code/shop");
    act(() => settlePrompt({ kind: "chosen", methodology: "v6", asked: true }));
    await fromDialog;
    expect(screen.toast).toBe(finished);
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

  it("is never asked to keep or switch from the cd hook, kept or not", async () => {
    tauri.byDir = { "/code/old": "v4" };
    expect(localStorage.getItem("ade-bmad-kept")).toBeNull();
    mount("/code/old");
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    await settle();
    expect(useMethodologyPrompt.getState().request).toBeNull();
    expect(questions()).toHaveLength(0);
    expect(toasts().some((t) => /Keep|Switch/.test(`${t.title} ${t.body}`))).toBe(false);
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

  it("neither asks nor sets up a project whose switch didn't finish, and shows no toast", async () => {
    tauri.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "incomplete", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    mount("/code/shop");
    await settle();
    expect(toasts()).toHaveLength(0);
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("after the New tab dialog", () => {
  it("does not ask about the repository while New tab is setting up a folder inside it", async () => {
    let release!: () => void;
    tauri.applyGate = new Promise<void>((r) => { release = r; });
    tauri.roots = { "/code/mono/app": "/code/mono" };
    const opened = openProjectTab("/code/mono/app");
    await waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/mono/app", mode: "choose" }));
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

describe("a BMAD switch finishing while the question is open", () => {
  const dialogAsks = (root: string) => waitFor(() => expect(useMethodologyPrompt.getState().request).toEqual({ root, mode: "choose" }));
  const PLAN: SwitchPlan = {
    from: "v4", to: "v6", archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [],
    leftInPlace: [], dirty: false, archiveIgnored: false, blocked: null,
  };

  it("withdraws the toast and ends its question, with no setup", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    const stale = screen.toast!;
    const fromDialog = askAndSetUp("/code/shop");
    await dialogAsks("/code/shop");

    await act(async () => { await runSwitch("/code/shop", PLAN); });
    expect(withdraw).toHaveBeenCalledWith(stale.key);
    expect(screen.toast).toBeNull();
    expect(useMethodologyPrompt.getState().request).toBeNull();
    expect(await fromDialog).toBeNull();

    act(() => stale.actions![1].run!());
    await settle();
    expect(tauri.applies).toEqual([]);
  });

  it("leaves a question about another project alone", async () => {
    mount("/code/shop");
    await waitFor(() => expect(questions("shop")).toHaveLength(1));
    const toast = screen.toast;
    void askAndSetUp("/code/shop");
    await dialogAsks("/code/shop");

    await act(async () => { await runSwitch("/code/other", PLAN); });
    expect(screen.toast).toBe(toast);
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "choose" });
  });
});

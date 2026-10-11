import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  pending: [] as unknown[],
  pendingFails: false,
  byDir: {} as Record<string, "v4" | "v6" | null>,
  applies: [] as Record<string, unknown>[],
  statusFails: false,
  applyFails: false,
  /** When set, bmad_switch_apply waits for it: the switch is still running. */
  switchGate: null as Promise<void> | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "bmad_switch_pending":
        if (tauri.pendingFails) throw new Error("no such command");
        return tauri.pending;
      case "project_setup_status":
        if (tauri.statusFails) throw new Error("not a folder");
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: tauri.byDir[args.root as string] ?? null };
      case "project_setup_apply":
        tauri.applies.push(args);
        if (tauri.applyFails) throw new Error("disk full");
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      case "bmad_switch_apply":
        if (tauri.switchGate) await tauri.switchGate;
        return { archive: ".ade/archive/bmad-v4-2026-10-11", moved: 2, setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true, movedCapped: false };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import {
  __resetPromptForTests, askAndSetUp, askKeepOrSwitch, askMethodology, askSwitch, dismissPrompts, keepVersion, leaveConfirm,
  isRefusal, projectName, settlePrompt, startSwitch, switchOnDemand, useMethodologyPrompt,
  type MethodologyAnswer,
} from "../methodologyPrompt";
import { runSwitch, type SwitchPlan } from "../bmadSwitch";
import { requestNewTab } from "../newTab";
import { beginSwitch } from "../projectSetup";
import { isKept, setUpProject } from "../projectSetup";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";

const request = () => useMethodologyPrompt.getState().request;
const asked = (root: string) => vi.waitFor(() => expect(request()).toEqual({ root, mode: "choose" }));

beforeEach(() => {
  tauri.pending = [];
  tauri.pendingFails = false;
  localStorage.clear();
  tauri.byDir = {};
  tauri.applies.length = 0;
  tauri.statusFails = false;
  tauri.applyFails = false;
  tauri.switchGate = null;
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
    expect(request()).toEqual({ root: "/code/shop", mode: "choose" });
  });

  it("keeps its question after a setup that failed", async () => {
    void askMethodology("/code/shop");
    await asked("/code/shop");
    tauri.applyFails = true;
    await expect(setUpProject("/code/shop", "v4")).rejects.toThrow();
    expect(request()).toEqual({ root: "/code/shop", mode: "choose" });
  });
});

describe("a folder that isn't a project", () => {
  it.each(["/Users/testuser", "/Users/testuser/", "/home/u", "/", "C:\\", "C:\\Users\\u"])("is refused before anything is asked: %s", async (root) => {
    await expect(askAndSetUp(root)).rejects.toMatchObject({ reason: "This folder isn't a project." });
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

describe("a project whose BMAD switch didn't finish", () => {
  const PENDING = { archive: ".ade/archive/bmad-v4-2026-10-11", status: "incomplete", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" };

  it("is blocked, before the disk is looked at and with no question", async () => {
    tauri.pending = [PENDING];
    tauri.statusFails = true;
    const answer = await askMethodology("/code/shop/");
    expect(answer).toEqual({
      kind: "blocked",
      reason: "A BMAD switch in shop didn't finish. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
      // The journal to open, for whoever shows the reason.
      archiveFile: "/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md",
    });
    expect(request()).toBeNull();
  });

  it("says a record it couldn't read, rather than that the switch didn't finish", async () => {
    tauri.pending = [{ ...PENDING, status: "unknown" }];
    const answer = await askMethodology("/code/shop");
    expect(answer.kind).toBe("blocked");
    const reason = (answer as { reason: string }).reason;
    expect(reason).toMatch(/couldn't be read/);
    expect(reason).not.toMatch(/didn't finish/);
    expect(reason).toContain(".ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
  });

  it("is blocked, not clear, when the check itself fails", async () => {
    tauri.pendingFails = true;
    tauri.byDir = { "/code/shop": "v6" };
    expect(await askMethodology("/code/shop")).toEqual({ kind: "blocked", reason: "Couldn't check for an unfinished BMAD switch." });
    expect(request()).toBeNull();
  });

  it("is blocked while a switch is running for it", async () => {
    const end = beginSwitch("/code/shop/");
    try {
      expect(await askMethodology("/code/shop")).toEqual({ kind: "blocked", reason: "A BMAD switch is running." });
      expect(request()).toBeNull();
    } finally {
      end();
    }
  });

  it("is not set up by the palette or Set up now, which say why", async () => {
    tauri.pending = [PENDING];
    await expect(askAndSetUp("/code/shop")).rejects.toMatchObject({ reason: expect.stringMatching(/didn't finish.*ARCHIVE\.md/) });
    expect(tauri.applies).toHaveLength(0);
  });

  it("still returns the version of a project that has one and nothing pending", async () => {
    tauri.byDir = { "/code/old": "v4" };
    expect(await askMethodology("/code/old")).toEqual({ kind: "chosen", methodology: "v4", asked: false });
  });
});

describe("the kept list", () => {
  it("gains a project when its question is answered", async () => {
    const answer = askMethodology("/code/shop/");
    await asked("/code/shop");
    expect(isKept("/code/shop")).toBe(false);
    settlePrompt({ kind: "chosen", methodology: "v4", asked: true });
    await answer;
    expect(isKept("/code/shop")).toBe(true);
  });

  it("gains it when the question was put another way, such as the cd hook's toast", async () => {
    const ask = vi.fn(async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v6", asked: true }));
    await askMethodology("/code/shop", { ask });
    expect(isKept("/code/shop")).toBe(true);
  });

  it("does not gain a project that merely has a version, or whose question was dismissed", async () => {
    tauri.byDir = { "/code/old": "v4" };
    await askMethodology("/code/old");
    expect(isKept("/code/old")).toBe(false);

    const answer = askMethodology("/code/shop");
    await asked("/code/shop");
    settlePrompt({ kind: "dismissed" });
    await answer;
    expect(isKept("/code/shop")).toBe(false);
  });
});

describe("one dialog at a time, across both questions", () => {
  it("dismisses a keep-or-switch question when another project is asked about", async () => {
    const keep = askKeepOrSwitch("/code/old", "v4");
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v4" });
    const choose = askMethodology("/code/shop");
    await asked("/code/shop");
    expect(await keep).toEqual({ kind: "dismissed" });
    settlePrompt({ kind: "dismissed" });
    await choose;
  });

  it("dismisses a choose question when a switch is asked for", async () => {
    const choose = askMethodology("/code/shop");
    await asked("/code/shop");
    void askSwitch("/code/old", "v4");
    expect(await choose).toEqual({ kind: "dismissed" });
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: false });
  });

  it("shares one keep-or-switch question between two callers for the same project", () => {
    expect(askKeepOrSwitch("/code/old/", "v4")).toBe(askKeepOrSwitch("/code/old", "v4"));
  });

  it("is not closed by a choose answer that isn't its own", () => {
    void askKeepOrSwitch("/code/old", "v4");
    settlePrompt({ kind: "dismissed" });
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v4" });
  });

  it("blocks New Tab while keep-or-switch is open, as while choosing", () => {
    useSettingsStore.setState({ askOnNewTab: false });
    const before = useTabStore.getState().tabs.length;
    void askKeepOrSwitch("/code/old", "v4");
    requestNewTab();
    expect(useTabStore.getState().tabs).toHaveLength(before);
  });

  it("blocks New Tab on the confirm step too", () => {
    useSettingsStore.setState({ askOnNewTab: true });
    const requested = vi.fn();
    window.addEventListener("request-new-tab", requested);
    void askSwitch("/code/old", "v4");
    requestNewTab();
    expect(requested).not.toHaveBeenCalled();
    window.removeEventListener("request-new-tab", requested);
  });

  it("settles both kinds of question as dismissed when nobody is left to answer", async () => {
    const keep = askKeepOrSwitch("/code/old", "v4");
    dismissPrompts();
    expect(await keep).toEqual({ kind: "dismissed" });
    expect(request()).toBeNull();

    const choose = askMethodology("/code/shop");
    await asked("/code/shop");
    dismissPrompts();
    expect(await choose).toEqual({ kind: "dismissed" });
    expect(request()).toBeNull();
  });
});

describe("the keep-or-switch question's answers", () => {
  it("keeps: the project is on the kept list and the question is over", async () => {
    const answer = askKeepOrSwitch("/code/old/", "v4");
    keepVersion();
    expect(await answer).toEqual({ kind: "kept" });
    expect(isKept("/code/old")).toBe(true);
    expect(request()).toBeNull();
  });

  it("goes to the confirm step and back without an answer or a kept project", async () => {
    let settled = false;
    void askKeepOrSwitch("/code/old", "v6").then(() => { settled = true; });
    startSwitch();
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v6", to: "v4", back: true });
    leaveConfirm();
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v6" });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(isKept("/code/old")).toBe(false);
  });

  it("does not keep from the confirm step, or with nothing asked", () => {
    keepVersion();
    void askSwitch("/code/old", "v4");
    keepVersion();
    expect(isKept("/code/old")).toBe(false);
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: false });
  });

  it("is dismissed when a switch asked for on its own is cancelled", async () => {
    const answer = askSwitch("/code/old", "v4");
    leaveConfirm();
    expect(await answer).toEqual({ kind: "dismissed" });
    expect(request()).toBeNull();
    expect(isKept("/code/old")).toBe(false);
  });
});

describe("New Tab asking about a project whose switch is already being confirmed", () => {
  it("turns that confirm step's Cancel into Back, so the question still gets its answer", async () => {
    const onDemand = askSwitch("/code/old", "v4");
    const newTab = askKeepOrSwitch("/code/old/", "v4");
    expect(newTab).toBe(onDemand);
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: true });

    let settled = false;
    void newTab.then(() => { settled = true; });
    leaveConfirm();
    await Promise.resolve();
    expect(settled, "New Tab is still waiting").toBe(false);
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v4" });

    keepVersion();
    expect(await newTab).toEqual({ kind: "kept" });
  });

  it("takes a switch asked for while the question is open as the question's Switch", () => {
    const newTab = askKeepOrSwitch("/code/old", "v4");
    expect(askSwitch("/code/old/", "v4")).toBe(newTab);
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: true });
  });
});

describe("a project that changes by another route while keep-or-switch is open", () => {
  const PLAN: SwitchPlan = {
    from: "v4", to: "v6", archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [],
    leftInPlace: [], dirty: false, archiveIgnored: false, blocked: null,
  };

  it("has its question settled by a switch that finishes, from the question or the confirm step", async () => {
    const keep = askKeepOrSwitch("/code/old", "v4");
    await runSwitch("/code/old/", PLAN);
    expect(await keep).toEqual({ kind: "switched" });
    expect(request()).toBeNull();

    const confirm = askSwitch("/code/older", "v4");
    await runSwitch("/code/older", PLAN);
    expect(await confirm).toEqual({ kind: "switched" });
    expect(request()).toBeNull();
  });

  it("has its question settled by a setup that finishes, with that setup's result", async () => {
    tauri.byDir = { "/code/old": "v4" };
    const keep = askKeepOrSwitch("/code/old", "v4");
    const elsewhere = await setUpProject("/code/old/", "v4");
    expect(await keep).toEqual({ kind: "setUp", done: elsewhere });
    expect(request()).toBeNull();
    // Nobody answered: the next New Tab asks again.
    expect(isKept("/code/old")).toBe(false);
  });

  it("is settled by a setup from the confirm step New Tab is waiting behind", async () => {
    const keep = askKeepOrSwitch("/code/old", "v4");
    startSwitch();
    const elsewhere = await setUpProject("/code/old", "v4");
    expect(await keep).toEqual({ kind: "setUp", done: elsewhere });
  });

  it("leaves a switch asked for on its own open after a setup", async () => {
    void askSwitch("/code/old", "v4");
    await setUpProject("/code/old", "v4");
    expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: false });
  });

  it("is left alone by another project's setup or switch", async () => {
    void askKeepOrSwitch("/code/old", "v4");
    await setUpProject("/code/other", "v4");
    await runSwitch("/code/other2", PLAN);
    expect(request()).toEqual({ root: "/code/old", mode: "keep", methodology: "v4" });
  });

  it("re-plans a switch asked for on its own after a setup: its plan was made before it", async () => {
    const replans = () => useMethodologyPrompt.getState().replans;
    void askSwitch("/code/old", "v4");
    const before = replans();
    await setUpProject("/code/other", "v4");
    expect(replans()).toBe(before);
    await setUpProject("/code/old", "v4");
    expect(replans()).toBe(before + 1);
  });
});

describe("another project's question while a switch is running in the confirm step", () => {
  const PLAN: SwitchPlan = {
    from: "v4", to: "v6", archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [],
    leftInPlace: [], dirty: false, archiveIgnored: false, blocked: null,
  };
  const REFUSED = { kind: "blocked", reason: "A BMAD switch is running in old. Wait for it to finish." };
  const CONFIRM = { root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: true };

  /** New Tab's question for /code/old, on its confirm step, with the switch started and held. */
  const switching = () => {
    let release!: () => void;
    tauri.switchGate = new Promise<void>((r) => { release = r; });
    const newTab = askKeepOrSwitch("/code/old", "v4");
    startSwitch();
    const running = runSwitch("/code/old", PLAN);
    return { newTab, running, release };
  };

  it("refuses a setup's question, and leaves the dialog and its asker alone", async () => {
    const { newTab, running, release } = switching();
    let settled = false;
    void newTab.then(() => { settled = true; });

    expect(await askMethodology("/code/shop")).toEqual(REFUSED);
    await expect(askAndSetUp("/code/shop")).rejects.toMatchObject({ reason: REFUSED.reason });
    expect(request()).toEqual(CONFIRM);
    expect(settled).toBe(false);
    expect(tauri.applies).toHaveLength(0);
    expect(isKept("/code/shop")).toBe(false);

    release();
    await running;
    expect(await newTab).toEqual({ kind: "switched" });
  });

  it("refuses a keep-or-switch question and a switch asked for on its own", async () => {
    const { newTab, running, release } = switching();
    tauri.byDir = { "/code/other": "v6" };
    expect(await askKeepOrSwitch("/code/other", "v6")).toEqual(REFUSED);
    expect(await askSwitch("/code/other", "v6")).toEqual(REFUSED);
    await expect(switchOnDemand("/code/other")).rejects.toMatchObject({ reason: REFUSED.reason });
    expect(request()).toEqual(CONFIRM);
    expect(isKept("/code/other")).toBe(false);

    release();
    await running;
    expect(await newTab).toEqual({ kind: "switched" });
    expect(request()).toBeNull();
  });

  it("still answers a project that needs no dialog, and one asked another way", async () => {
    const { running, release } = switching();
    tauri.byDir = { "/code/other": "v6" };
    expect(await askMethodology("/code/other")).toEqual({ kind: "chosen", methodology: "v6", asked: false });
    const ask = vi.fn(async (): Promise<MethodologyAnswer> => ({ kind: "chosen", methodology: "v4", asked: true }));
    expect(await askMethodology("/code/shop", { ask })).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    release();
    await running;
  });

  it("shares the running switch's question with a second asker for the same project", () => {
    const { newTab, release } = switching();
    expect(askKeepOrSwitch("/code/old/", "v4")).toBe(newTab);
    expect(askSwitch("/code/old", "v4")).toBe(newTab);
    expect(request()).toEqual(CONFIRM);
    release();
  });

  it("is replaced as before once the switch is over, or before it starts", async () => {
    const { newTab, running, release } = switching();
    release();
    await running;
    await newTab;
    const confirm = askSwitch("/code/old", "v6");
    const other = askMethodology("/code/shop");
    await asked("/code/shop");
    expect(await confirm).toEqual({ kind: "dismissed" });
    settlePrompt({ kind: "dismissed" });
    await other;
  });
});

describe("switchOnDemand", () => {
  it("opens the confirm step for the other version than the project is on", async () => {
    tauri.byDir = { "/code/old": "v4", "/code/new": "v6" };
    void switchOnDemand("/code/old/");
    await vi.waitFor(() => expect(request()).toEqual({ root: "/code/old", mode: "confirm", from: "v4", to: "v6", back: false }));
    void switchOnDemand("/code/new");
    await vi.waitFor(() => expect(request()).toEqual({ root: "/code/new", mode: "confirm", from: "v6", to: "v4", back: false }));
  });

  it("refuses a project with no BMAD", async () => {
    await expect(switchOnDemand("/code/shop")).rejects.toMatchObject({ reason: "This project has no BMAD to switch from." });
    expect(request()).toBeNull();
  });

  it("tells a refusal from any other error by identity, not by its text", async () => {
    const reason = "This project has no BMAD to switch from.";
    // The same reason thrown twice is a refusal both times, and reads as the reason.
    for (let i = 0; i < 2; i++) {
      const err = await switchOnDemand("/code/shop").catch((e) => e);
      expect(isRefusal(err)).toBe(true);
      expect(String(err)).toBe(reason);
      expect(err.message).toBe(reason);
    }
    // A plain string, an Error or an object with the same text is not one.
    expect(isRefusal(reason)).toBe(false);
    expect(isRefusal(new Error(reason))).toBe(false);
    expect(isRefusal({ reason })).toBe(false);
  });
});

describe("the entry points that never ask keep-or-switch", () => {
  it("returns the version of a project that was never kept, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    expect(isKept("/code/old")).toBe(false);
    expect(await askMethodology("/code/old")).toEqual({ kind: "chosen", methodology: "v4", asked: false });
    await askAndSetUp("/code/old");
    expect(request()).toBeNull();
    expect(tauri.applies.map((a) => a.methodology)).toEqual(["v4"]);
  });
});

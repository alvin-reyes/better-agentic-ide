import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({
  calls: [] as { command: string; args: Record<string, unknown> }[],
  /** When set, bmad_switch_apply waits for it: the switch is still running. */
  applyGate: null as Promise<void> | null,
  applyError: null as string | null,
  /** When set, project_setup_apply waits for it: a setup is still running. */
  setupGate: null as Promise<void> | null,
  pending: [] as unknown,
  pendingFails: false,
  statusFails: false,
  /** project_setup_status reports no BMAD on disk. */
  noBmad: false,
}));

const RESULT = {
  archive: ".ade/archive/bmad-v4-2026-10-11",
  moved: 7,
  setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 },
  rulesAppended: true,
  archiveDenied: true,
  movedCapped: false,
};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    tauri.calls.push({ command, args });
    switch (command) {
      case "project_setup_status":
        if (tauri.statusFails) throw new Error("no status");
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: !tauri.noBmad, stacks: ["go"],
          methodology: tauri.noBmad ? null : "v4",
        };
      case "project_setup_apply":
        if (tauri.setupGate) await tauri.setupGate;
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      case "bmad_switch_plan":
        return { ...PLAN, to: args.to };
      case "bmad_switch_pending":
        if (tauri.pendingFails) throw new Error("not a folder");
        return tauri.pending;
      case "bmad_switch_apply":
        if (tauri.applyGate) await tauri.applyGate;
        if (tauri.applyError) throw tauri.applyError;
        return RESULT;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// Panes are asked for their folder; there is no terminal here.
const pane = vi.hoisted(() => ({
  cwd: "/code/shop/src" as string | null,
  /** A pane's own answer: a folder, none, or "throws". */
  byId: {} as Record<string, string | null | "throws">,
}));
vi.mock("../../hooks/useTerminal", () => ({
  getPtyCwd: vi.fn(async (id: string) => {
    const own = pane.byId[id];
    if (own === "throws") throw new Error("pty gone");
    return own !== undefined ? own : pane.cwd;
  }),
}));

import {
  COUNT_LIMIT, SWITCH_DONE_EVENT, countLabel, movedLabel, openInProject, otherVersion, pendingSwitches, planSwitch, runSwitch,
  type SwitchDone, type SwitchPlan,
} from "../bmadSwitch";
import { SWITCH_RUNNING, addStackAgents, isKept, isSettingUp, isSwitching, onProjectHasBmad, onSwitchChange, setUpProject, setupDeclined, wasSetUp } from "../projectSetup";
import { useFleetStore } from "../../stores/fleetStore";
import { useTabStore, type Tab } from "../../stores/tabStore";
import { __resetPromptForTests, askMethodology, useMethodologyPrompt } from "../methodologyPrompt";

const PLAN: SwitchPlan = {
  from: "v4",
  to: "v6",
  archive: ".ade/archive/bmad-v4-2026-10-11",
  moves: [{ from: ".bmad-core", to: ".ade/archive/bmad-v4-2026-10-11/.bmad-core", files: 2, ignored: "none" }],
  documents: [],
  leftovers: [],
  leftInPlace: [],
  isGit: true,
  dirty: false,
  archiveIgnored: false,
  blocked: null,
};

const called = (command: string) => tauri.calls.filter((c) => c.command === command).map((c) => c.args);
const gate = () => {
  let open!: () => void;
  tauri.applyGate = new Promise<void>((r) => { open = r; });
  return open;
};

beforeEach(() => {
  localStorage.clear();
  tauri.calls.length = 0;
  tauri.applyGate = null;
  tauri.applyError = null;
  tauri.setupGate = null;
  tauri.pending = [];
  tauri.pendingFails = false;
  tauri.statusFails = false;
  tauri.noBmad = false;
  pane.cwd = "/code/shop/src";
  pane.byId = {};
  __resetPromptForTests();
  useFleetStore.setState({ subagents: [] });
});

describe("planSwitch and pendingSwitches", () => {
  it("asks for the dry run on the normalised root, with the ticked documents", async () => {
    await planSwitch("/code/shop/", "v6", ["docs/prd.md"]);
    expect(called("bmad_switch_plan")).toEqual([{ root: "/code/shop", to: "v6", documents: ["docs/prd.md"] }]);
    await planSwitch("/code/shop", "v4");
    expect(called("bmad_switch_plan")[1]).toEqual({ root: "/code/shop", to: "v4", documents: [] });
  });

  it("names the other version", () => {
    expect(otherVersion("v4")).toBe("v6");
    expect(otherVersion("v6")).toBe("v4");
  });

  it("is empty when nothing is pending", async () => {
    expect(await pendingSwitches("/code/shop")).toEqual([]);
    const one = { archive: ".ade/archive/bmad-v4-2026-10-11", status: "in-progress", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" };
    tauri.pending = [one];
    expect(await pendingSwitches("/code/shop/")).toEqual([one]);
    expect(called("bmad_switch_pending")[1]).toEqual({ root: "/code/shop" });
  });

  it("counts moved files for the toast, capped as a lower bound", () => {
    expect(movedLabel({ moved: 1, movedCapped: false })).toBe("1 file");
    expect(movedLabel({ moved: 0, movedCapped: false })).toBe("0 files");
    expect(movedLabel({ moved: 1234, movedCapped: false })).toBe("1,234 files");
    expect(movedLabel({ moved: 812, movedCapped: true })).toBe("50,000+ files");
    expect(movedLabel({ moved: 75_000, movedCapped: false })).toBe("75,000 files");
  });

  it("rejects, rather than say nothing is pending, when the check fails or answers with something else", async () => {
    tauri.pendingFails = true;
    await expect(pendingSwitches("/code/shop")).rejects.toThrow("not a folder");
    tauri.pendingFails = false;
    tauri.pending = null;
    await expect(pendingSwitches("/code/shop")).rejects.toThrow();
  });
});

describe("file counts", () => {
  it("keeps the Rust COUNT_LIMIT", () => {
    const rust = readFileSync(resolve(__dirname, "..", "..", "..", "src-tauri/src/bmadswitch.rs"), "utf8");
    const found = /pub\(crate\) const COUNT_LIMIT: u32 = ([\d_]+);/.exec(rust);
    expect(found, "COUNT_LIMIT not found in bmadswitch.rs").not.toBeNull();
    expect(COUNT_LIMIT).toBe(Number(found![1].replace(/_/g, "")));
  });

  it("shows a capped count as a lower bound", () => {
    expect(countLabel(0)).toBe("0");
    expect(countLabel(7)).toBe("7");
    expect(countLabel(1234)).toBe("1,234");
    expect(countLabel(COUNT_LIMIT - 1)).toBe("49,999");
    expect(countLabel(COUNT_LIMIT)).toBe("50,000+");
  });
});

describe("runSwitch", () => {
  it("sends the plan with the new version's setup files, then marks the project set up and kept", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop"]));
    localStorage.setItem("ade-project-agents-removed", JSON.stringify({ "/code/shop": ["qa"] }));
    const result = await runSwitch("/code/shop/", PLAN);
    expect(result).toEqual(RESULT);

    const [sent] = called("bmad_switch_apply");
    expect(sent.root).toBe("/code/shop");
    expect(sent.to).toBe("v6");
    expect(sent.plan).toEqual(PLAN);
    expect(sent.import).toContain("@.ade/rules.md");
    expect(sent.marker).toBe("<!-- ade:methodology -->");
    // The paragraphs of the version switched to, for the CLAUDE.md already there.
    const bmad = sent.bmad as { paragraph: string; section: string; paragraphs: string[]; sections: string[] };
    expect(bmad.paragraph).toMatch(/^- \*\*BMAD v6\*\*/);
    expect(bmad.section).toContain(bmad.paragraph);
    expect(bmad.paragraphs).toContain(bmad.paragraph);
    expect(bmad.sections).toHaveLength(bmad.paragraphs.length);
    const paths = (sent.files as { path: string }[]).map((f) => f.path);
    expect(paths).toContain(".ade/rules.md");
    expect(paths).toContain(".claude/agents/architect.md");
    expect(paths, "an agent the person removed isn't brought back").not.toContain(".claude/agents/qa.md");
    expect(paths, "the stack's agents come too").toContain(".claude/agents/backend-go.md");

    expect(isKept("/code/shop")).toBe(true);
    expect(wasSetUp("/code/shop")).toBe(true);
    expect(setupDeclined("/code/shop")).toBe(false);
  });

  it("reports through its own event, never project-setup-done", async () => {
    const setupDone = vi.fn();
    const switchDone = vi.fn();
    window.addEventListener("project-setup-done", setupDone);
    window.addEventListener(SWITCH_DONE_EVENT, switchDone);
    await runSwitch("/code/shop", PLAN);
    expect(setupDone).not.toHaveBeenCalled();
    expect(switchDone).toHaveBeenCalledOnce();
    expect((switchDone.mock.calls[0][0] as CustomEvent<SwitchDone>).detail).toEqual({ root: "/code/shop", from: "v4", to: "v6", result: RESULT });
    window.removeEventListener("project-setup-done", setupDone);
    window.removeEventListener(SWITCH_DONE_EVENT, switchDone);
  });

  it("keeps setup out while it runs: setUpProject rejects rather than sharing the promise", async () => {
    const changes: [string, boolean][] = [];
    const stop = onSwitchChange((root, running) => changes.push([root, running]));
    const open = gate();
    const running = runSwitch("/code/shop", PLAN);
    await vi.waitFor(() => expect(called("bmad_switch_apply")).toHaveLength(1));
    expect(isSwitching("/code/shop/")).toBe(true);
    expect(isSettingUp("/code/shop")).toBe(true);
    await expect(setUpProject("/code/shop", "v6")).rejects.toBe(SWITCH_RUNNING);
    expect(SWITCH_RUNNING).toBe("a BMAD switch is running");
    expect(called("project_setup_apply")).toHaveLength(0);
    // Another project is not held up.
    await setUpProject("/code/other", "v6", []);
    expect(called("project_setup_apply")).toHaveLength(1);

    open();
    await running;
    expect(isSwitching("/code/shop")).toBe(false);
    expect(isSettingUp("/code/shop")).toBe(false);
    expect(changes).toEqual([["/code/shop", true], ["/code/shop", false]]);
    stop();
  });

  it("runs one switch when asked twice", async () => {
    const open = gate();
    const first = runSwitch("/code/shop", PLAN);
    const second = runSwitch("/code/shop/", PLAN);
    await vi.waitFor(() => expect(called("bmad_switch_apply")).toHaveLength(1));
    open();
    expect(await second).toBe(await first);
    expect(called("bmad_switch_apply")).toHaveLength(1);
  });

  it("leaves the project as it was listed when the switch fails", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop"]));
    tauri.applyError = "Couldn't move .ade/stage: the file is in use";
    const switchDone = vi.fn();
    window.addEventListener(SWITCH_DONE_EVENT, switchDone);
    await expect(runSwitch("/code/shop", PLAN)).rejects.toBe("Couldn't move .ade/stage: the file is in use");
    expect(isKept("/code/shop")).toBe(false);
    expect(wasSetUp("/code/shop")).toBe(false);
    expect(setupDeclined("/code/shop"), "a decline stands").toBe(true);
    expect(isSwitching("/code/shop")).toBe(false);
    expect(switchDone).not.toHaveBeenCalled();
    window.removeEventListener(SWITCH_DONE_EVENT, switchDone);
  });

  it("clears the switch when something throws before the backend is asked", async () => {
    const changes: boolean[] = [];
    const stop = onSwitchChange((_root, running) => changes.push(running));
    tauri.statusFails = true;
    await expect(runSwitch("/code/shop", PLAN)).rejects.toThrow("no status");
    expect(called("bmad_switch_apply")).toHaveLength(0);
    expect(isSwitching("/code/shop")).toBe(false);
    expect(isSettingUp("/code/shop")).toBe(false);
    expect(changes).toEqual([true, false]);
    stop();
  });

  it("refuses a blocked plan, or one with no version to leave, without asking the backend", async () => {
    await expect(runSwitch("/code/shop", { ...PLAN, blocked: "A switch is unfinished." })).rejects.toBe("A switch is unfinished.");
    await expect(runSwitch("/code/shop", { ...PLAN, from: "" })).rejects.toBeTruthy();
    expect(called("bmad_switch_apply")).toHaveLength(0);
    expect(isSwitching("/code/shop")).toBe(false);
  });

  it("keeps stack agents out too while it runs", async () => {
    const open = gate();
    const running = runSwitch("/code/shop", PLAN);
    await vi.waitFor(() => expect(called("bmad_switch_apply")).toHaveLength(1));
    await expect(addStackAgents("/code/shop/", ["go"], "v6")).rejects.toBe(SWITCH_RUNNING);
    expect(called("project_setup_apply")).toHaveLength(0);
    open();
    await running;
    await addStackAgents("/code/shop", ["go"], "v6");
    expect(called("project_setup_apply")).toHaveLength(1);
  });

  it("closes an open BMAD question for the project, and only that one", async () => {
    const prompt = () => useMethodologyPrompt.getState().request;
    // No BMAD on disk for these: the question is put to the dialog.
    tauri.noBmad = true;
    const shop = askMethodology("/code/shop");
    await vi.waitFor(() => expect(prompt()).toEqual({ root: "/code/shop", mode: "choose" }));
    const open = gate();
    const running = runSwitch("/code/other", PLAN);
    await vi.waitFor(() => expect(called("bmad_switch_apply")).toHaveLength(1));
    open();
    await running;
    expect(prompt(), "another project's switch leaves the question").toEqual({ root: "/code/shop", mode: "choose" });

    await runSwitch("/code/shop/", PLAN);
    expect(prompt()).toBeNull();
    expect(await shop).toEqual({ kind: "chosen", methodology: "v6", asked: false, switched: true });
  });

  it("tells onProjectHasBmad, with no setup result", async () => {
    const heard = vi.fn();
    const stop = onProjectHasBmad(heard);
    await runSwitch("/code/shop/", PLAN);
    expect(heard).toHaveBeenCalledWith("/code/shop", "v6", undefined);
    stop();
  });

  it("does not start while a setup of the project is running", async () => {
    let finish!: () => void;
    tauri.setupGate = new Promise<void>((r) => { finish = r; });
    const setup = setUpProject("/code/shop", "v4", []);
    await vi.waitFor(() => expect(called("project_setup_apply")).toHaveLength(1));
    await expect(runSwitch("/code/shop", PLAN)).rejects.toBe("Project setup is running. Try again when it has finished.");
    expect(called("bmad_switch_apply")).toHaveLength(0);
    finish();
    await setup;
  });
});

const tabOf = (id: string, name: string, paneId: string): Tab => ({
  id, name, activePaneId: paneId, root: { type: "pane", pane: { id: paneId, ptyId: 1 } },
});

describe("openInProject", () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [tabOf("t1", "shop", "p1"), tabOf("t2", "other", "p2")], activeTabId: "t1" });
  });

  it("lists the terminal panes whose folder is inside the project", async () => {
    pane.byId = { p1: "/code/shop/src", p2: "/code/other" };
    expect((await openInProject("/code/shop")).panes).toEqual([{ tab: "shop", cwd: "/code/shop/src" }]);
  });

  it("still lists one pane when another's folder can't be read", async () => {
    pane.byId = { p1: "throws", p2: "/code/shop" };
    expect((await openInProject("/code/shop")).panes).toEqual([{ tab: "other", cwd: "/code/shop" }]);
  });

  it("leaves out a pane in a folder that only starts with the project's name, or with no folder", async () => {
    pane.cwd = "/code/shop2/src";
    expect((await openInProject("/code/shop")).panes).toEqual([]);
    pane.cwd = null;
    expect((await openInProject("/code/shop")).panes).toEqual([]);
  });

  it("lists the agents still running in the project", async () => {
    const agent = { agentType: "qa", description: "Verify story 1.2", model: null, startTime: 1, cwd: "/code/shop" };
    useFleetStore.setState({
      subagents: [
        { ...agent, id: "a", endTime: null },
        { ...agent, id: "b", endTime: 5 },
        { ...agent, id: "c", endTime: null, cwd: "/code/other" },
        { ...agent, id: "d", endTime: null, description: "" },
      ],
    });
    expect((await openInProject("/code/shop/")).agents).toEqual([
      { name: "Verify story 1.2", cwd: "/code/shop" },
      { name: "qa", cwd: "/code/shop" },
    ]);
  });
});

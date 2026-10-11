import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewTabDialog from "../NewTabDialog";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests, askAndSetUp, askSwitch, switchOnDemand } from "../../lib/methodologyPrompt";
import { runSwitch, type SwitchPlan } from "../../lib/bmadSwitch";
import { setUpProject } from "../../lib/projectSetup";
import { openProjectTab, recentProjects } from "../../lib/newTab";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";

// Setup is IPC only: the status command says what a folder is on, and the
// apply calls record the root and version the dialog's answer led to.
const tauri = vi.hoisted(() => ({
  pending: [] as unknown[],
  /** What a folder is on when `byDir` doesn't name it. */
  methodology: null as "v4" | "v6" | null,
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  applies: [] as Record<string, unknown>[],
  applyError: null as string | null,
  gitInit: [] as string[],
  gitInitError: null as string | null,
  switches: [] as Record<string, unknown>[],
  switchError: null as string | null,
  /** When set, bmad_switch_apply waits for it: the switch is still running. */
  switchGate: null as Promise<void> | null,
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
          isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: (args.root as string) in tauri.byDir ? tauri.byDir[args.root as string] : tauri.methodology,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        if (tauri.applyError) throw new Error(tauri.applyError);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0, bmadv6Files: 0 };
      case "project_git_init":
        if (tauri.gitInitError) throw new Error(tauri.gitInitError);
        tauri.gitInit.push(String(args.root));
        return true;
      case "bmad_switch_plan":
        return {
          from: "v4", to: args.to, archive: ".ade/archive/bmad-v4-2026-10-11",
          moves: [{ from: ".bmad-core", to: ".ade/archive/bmad-v4-2026-10-11/.bmad-core", files: 2, ignored: "none" }],
          documents: [], leftovers: [], leftInPlace: [], dirty: false, archiveIgnored: false, blocked: null,
        };
      case "bmad_switch_apply":
        tauri.switches.push(args);
        if (tauri.switchGate) await tauri.switchGate;
        if (tauri.switchError) throw tauri.switchError;
        return {
          archive: ".ade/archive/bmad-v4-2026-10-11", moved: 2,
          setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true, movedCapped: false,
        };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// The folder picker is native: the test answers it with the path under test.
const picker = vi.hoisted(() => ({ picked: null as string | null }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => picker.picked) }));

// The confirm step asks every pane for its folder; there is no terminal here.
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null), destroyInstance: vi.fn(), detachInstance: vi.fn() }));

const NEWAPP = "/Users/testuser/code/newapp";
const OTHER = "/Users/testuser/code/other";
const ASK_NEWAPP = "Set up newapp with BMAD v6 (default) or BMAD v4?";

const lastApply = () => tauri.applies[tauri.applies.length - 1];
const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
const prompt = () => screen.getByRole("dialog", { name: "Set up project" });
const open = (label: RegExp) => fireEvent.click(screen.getByRole("option", { name: label }));
const tabs = () => useTabStore.getState().tabs.length;
/** Long enough for anything a keypress started to have run. */
const settle = () => new Promise((r) => setTimeout(r, 20));
/** Projects that have already answered keep-or-switch. */
const kept = (...roots: string[]) => localStorage.setItem("ade-bmad-kept", JSON.stringify(roots));
/** The dialog beside the app-level host that shows the question it raises. */
const renderDialog = (onClose = vi.fn()) => {
  render(<><NewTabDialog onClose={onClose} /><MethodologyPromptHost /></>);
  return onClose;
};

beforeEach(() => {
  tauri.pending = [];
  localStorage.clear();
  tauri.methodology = null;
  tauri.byDir = {};
  tauri.roots = {};
  tauri.applies.length = 0;
  tauri.applyError = null;
  tauri.gitInit.length = 0;
  tauri.gitInitError = null;
  tauri.switches.length = 0;
  tauri.switchError = null;
  tauri.switchGate = null;
  __resetPromptForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("the BMAD version question", () => {
  it("asks for a new project through the shared dialog and sets it up on the answer", async () => {
    picker.picked = NEWAPP;
    const onClose = renderDialog();

    open(/New project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    // git init ran, and the New tab dialog closed, before the question.
    expect(tauri.gitInit).toEqual([NEWAPP]);
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(lastApply().root).toBe(NEWAPP);
    expect(lastApply().full).toBe(true);
  });

  it("picks v6 on Enter", async () => {
    picker.picked = NEWAPP;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(lastApply()?.methodology).toBe("v6"));
    expect(tauri.gitInit).toEqual([]);
  });

  it("does not ask about a project that is already on a version", async () => {
    kept("/Users/testuser/code/oldapp");
    tauri.methodology = "v4";
    picker.picked = "/Users/testuser/code/oldapp";
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(question()).toBeNull();
    expect(tauri.applies[0].full).toBe(true);
  });

  it("does not open a folder with no BMAD until a version is picked", async () => {
    picker.picked = NEWAPP;
    const onClose = renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    expect(tabs()).toBe(before);

    // Escape is no answer: the question stays, and nothing opens or is set up.
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(question()).toBe(ASK_NEWAPP);
    expect(tabs()).toBe(before);
    expect(tauri.applies).toHaveLength(0);
    // Nor did it reach the New tab dialog: that closed once, when the folder was picked.
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("option", { name: /BMAD v6/ }));
    await waitFor(() => expect(tabs()).toBe(before + 1));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v6"));
    expect(question()).toBeNull();
  });

  it("sets up on the version the project gained while the question was open, not the one answered", async () => {
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    // Another route put v4 there in the meantime.
    tauri.byDir = { [NEWAPP]: "v4" };
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(lastApply().methodology).toBe("v4");
  });

  it("opens nothing when the question is superseded", async () => {
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));

    // A question about another project replaces this one.
    const other = openProjectTab(OTHER);
    await waitFor(() => expect(question()).toBe("Set up other with BMAD v6 (default) or BMAD v4?"));
    await settle();
    expect(tabs()).toBe(before);
    expect(recentProjects()).toEqual([]);

    fireEvent.keyDown(prompt(), { key: "Enter" });
    await other;
    // Only the project that was answered for opened.
    expect(tabs()).toBe(before + 1);
    expect(recentProjects()).toEqual([OTHER]);
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(lastApply().root).toBe(OTHER);
  });

  it("neither sets up nor asks when automatic setup is off", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });

  it("neither sets up nor asks about a project whose setup was undone", async () => {
    localStorage.setItem("ade-project-setup-declined", JSON.stringify([NEWAPP]));
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("which folder is the project", () => {
  const MONO = "/Users/testuser/code/mono";

  it("sets up the picked folder when nothing above it has BMAD", async () => {
    tauri.roots = { [`${MONO}/app`]: MONO };
    picker.picked = `${MONO}/app`;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe("Set up app with BMAD v6 (default) or BMAD v4?"));
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(lastApply()?.root).toBe(`${MONO}/app`));
  });

  it("uses the project above the picked folder when that one has BMAD", async () => {
    kept(MONO);
    tauri.roots = { [`${MONO}/app`]: MONO };
    tauri.byDir = { [MONO]: "v4" };
    picker.picked = `${MONO}/app`;
    renderDialog();

    open(/Open project/);
    await waitFor(() => expect(lastApply()?.root).toBe(MONO));
    expect(lastApply().methodology).toBe("v4");
    expect(question()).toBeNull();
  });
});

describe("when something fails", () => {
  it("shows a git init error in the dialog and keeps it open", async () => {
    tauri.gitInitError = "git is not installed";
    picker.picked = NEWAPP;
    const onClose = renderDialog();
    const before = tabs();

    open(/New project/);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("git is not installed"));
    expect(onClose).not.toHaveBeenCalled();
    expect(question()).toBeNull();
    expect(tabs()).toBe(before);
  });

  it("reports a setup that fails", async () => {
    tauri.applyError = "disk full";
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    fireEvent.keyDown(prompt(), { key: "Enter" });
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain("disk full");
    // The folder was asked for and answered about: it is open all the same.
    expect(tabs()).toBe(before + 1);
    window.removeEventListener("project-setup-failed", failed);
  });

  it("opens a project whose switch didn't finish, without setting it up, and says why", async () => {
    tauri.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "in-progress", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    picker.picked = NEWAPP;
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain(".ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
    // A terminal there is how the person resolves it.
    expect(tabs()).toBe(before + 1);
    expect(recentProjects()).toEqual([NEWAPP]);
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
    window.removeEventListener("project-setup-failed", failed);
  });
});

describe("a project that already has BMAD", () => {
  const OLDAPP = "/Users/testuser/code/oldapp";
  const ASK = "oldapp uses BMAD v4. Keep v4 (default) · Switch to v6…";
  const keepDialog = () => screen.getByRole("dialog", { name: "BMAD version" });
  const isKeptNow = () => JSON.parse(localStorage.getItem("ade-bmad-kept") ?? "[]") as string[];
  const PLAN: SwitchPlan = {
    from: "v4", to: "v6", archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [],
    leftInPlace: [], dirty: false, archiveIgnored: false, blocked: null,
  };

  beforeEach(() => {
    tauri.methodology = "v4";
    picker.picked = OLDAPP;
  });

  it("is asked to keep or switch, and is not opened until that is answered", async () => {
    const onClose = renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    expect(onClose).toHaveBeenCalledOnce();
    expect(tabs()).toBe(before);

    // Escape is no answer.
    fireEvent.keyDown(window, { key: "Escape" });
    await settle();
    expect(question()).toBe(ASK);
    expect(tabs()).toBe(before);
    expect(recentProjects()).toEqual([]);
    expect(tauri.applies).toHaveLength(0);
    // Nor did it reach the New tab dialog beneath.
    expect(onClose).toHaveBeenCalledOnce();

    // Enter keeps the version: the folder opens and is set up on it.
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(lastApply().root).toBe(OLDAPP);
    expect(isKeptNow()).toEqual([OLDAPP]);
    expect(question()).toBeNull();
    expect(tauri.switches).toHaveLength(0);
    await settle();
    expect(tabs(), "one tab for the folder").toBe(before + 1);
    expect(tauri.applies).toHaveLength(1);
  });

  it("is not asked again once kept", async () => {
    kept(OLDAPP);
    renderDialog();
    open(/Open project/);
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(question()).toBeNull();
  });

  it("is asked about the project above the picked folder when that one has BMAD", async () => {
    const MONO = "/Users/testuser/code/mono";
    tauri.methodology = null;
    tauri.roots = { [`${MONO}/app`]: MONO };
    tauri.byDir = { [MONO]: "v6" };
    picker.picked = `${MONO}/app`;
    renderDialog();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe("mono uses BMAD v6. Keep v6 (default) · Switch to v4…"));
  });

  it("goes to the confirm step on Switch, and Back returns to the question", async () => {
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    await screen.findByRole("dialog", { name: "Switch to BMAD v6" });
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(question()).toBe(ASK));
    expect(tabs()).toBe(before);
    expect(tauri.switches).toHaveLength(0);
    expect(isKeptNow()).toEqual([]);
  });

  it("opens after a switch, kept, with no second setup", async () => {
    const setupDone = vi.fn();
    window.addEventListener("project-setup-done", setupDone);
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    const confirm = await screen.findByRole("button", { name: "Archive and switch" });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(tauri.switches).toHaveLength(1);
    expect(tauri.switches[0]).toMatchObject({ root: OLDAPP, to: "v6" });
    expect(isKeptNow()).toEqual([OLDAPP]);
    expect(recentProjects()).toEqual([OLDAPP]);
    await settle();
    expect(tauri.applies, "the switch set the project up").toHaveLength(0);
    expect(setupDone).not.toHaveBeenCalled();
    // Only the New tab dialog, which this test keeps mounted, is left.
    expect(screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-label"))).toEqual(["New tab"]);
    expect(question()).toBeNull();
    expect(tabs(), "one tab for the folder").toBe(before + 1);
    window.removeEventListener("project-setup-done", setupDone);
  });

  it("stays in the confirm step when the switch fails, and Back still leads to an answer", async () => {
    tauri.switchError = "A folder is in use.";
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    const confirm = await screen.findByRole("button", { name: "Archive and switch" });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("A folder is in use."));
    expect(screen.getByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(tabs()).toBe(before);
    expect(isKeptNow()).toEqual([]);

    const back = screen.getByRole("button", { name: "Back" });
    await waitFor(() => expect((back as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(back);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    await settle();
    expect(tabs(), "one tab for the folder").toBe(before + 1);
    expect(tauri.switches).toHaveLength(1);
  });

  it("goes back to the question on Escape from the confirm step, and opens nothing", async () => {
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    await screen.findByRole("dialog", { name: "Switch to BMAD v6" });
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(question()).toBe(ASK));
    await settle();
    expect(tabs()).toBe(before);
  });

  it("is not asked with automatic setup off, or when its setup was undone", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();

    useSettingsStore.getState().setAutoProjectSetup(true);
    localStorage.setItem("ade-project-setup-declined", JSON.stringify([OLDAPP]));
    await openProjectTab(OLDAPP);
    expect(tabs()).toBe(before + 2);
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });

  it("opens nothing when the question is superseded", async () => {
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));

    tauri.byDir = { [NEWAPP]: null };
    const other = openProjectTab(NEWAPP);
    await waitFor(() => expect(question()).toBe(ASK_NEWAPP));
    await settle();
    expect(tabs()).toBe(before);
    expect(recentProjects()).toEqual([]);
    expect(isKeptNow()).toEqual([]);

    fireEvent.keyDown(prompt(), { key: "Enter" });
    await other;
    expect(tabs()).toBe(before + 1);
    expect(recentProjects()).toEqual([NEWAPP]);
  });

  it("opens nothing when the dialog's host goes away", async () => {
    const before = tabs();
    const host = render(<MethodologyPromptHost />);
    const opening = openProjectTab(OLDAPP);
    await waitFor(() => expect(question()).toBe(ASK));
    host.unmount();
    await opening;
    expect(tabs()).toBe(before);
    expect(recentProjects()).toEqual([]);
    expect(tauri.applies).toHaveLength(0);
  });

  it("opens on the new version, with no second switch, when a switch finishes by another route", async () => {
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));

    await act(async () => { await runSwitch(OLDAPP, PLAN); });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    await settle();
    expect(tabs(), "one tab for the folder").toBe(before + 1);
    expect(tauri.switches).toHaveLength(1);
    expect(tauri.applies).toHaveLength(0);
    expect(isKeptNow()).toEqual([OLDAPP]);
  });

  it("opens, with no second setup, when the project is set up by another route", async () => {
    const setupDone = vi.fn();
    window.addEventListener("project-setup-done", setupDone);
    renderDialog();
    const before = tabs();
    open(/Open project/);
    await waitFor(() => expect(question()).toBe(ASK));

    await act(async () => { await setUpProject(OLDAPP, "v4"); });
    await waitFor(() => expect(tabs()).toBe(before + 1));
    expect(question()).toBeNull();
    await settle();
    expect(tabs(), "one tab for the folder").toBe(before + 1);
    expect(tauri.applies).toHaveLength(1);
    // Whoever set it up announces it.
    expect(setupDone).not.toHaveBeenCalled();
    window.removeEventListener("project-setup-done", setupDone);
  });

  it("still gets its answer when the project's switch was already being confirmed", async () => {
    render(<MethodologyPromptHost />);
    const before = tabs();
    // Asked for from the palette or the board: that confirm step has Cancel.
    act(() => { void askSwitch(OLDAPP, "v4"); });
    await screen.findByRole("button", { name: "Cancel" });

    let opened = false;
    void openProjectTab(OLDAPP).then(() => { opened = true; });
    // New Tab waits on it now: leaving it leads to the question, not out.
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await waitFor(() => expect(question()).toBe(ASK));
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    await settle();
    expect(opened).toBe(false);
    expect(tabs()).toBe(before);

    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    await waitFor(() => expect(opened).toBe(true));
    expect(tabs()).toBe(before + 1);
    expect(recentProjects()).toEqual([OLDAPP]);
  });

  it("is not asked while its switch didn't finish: it opens without setup and says why", async () => {
    tauri.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "in-progress", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    renderDialog();
    const before = tabs();

    open(/Open project/);
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain("ARCHIVE.md");
    await settle();
    expect(tabs()).toBe(before + 1);
    expect(question()).toBeNull();
    expect(tauri.applies).toHaveLength(0);
    expect(isKeptNow()).toEqual([]);
    window.removeEventListener("project-setup-failed", failed);
  });

  describe("while its switch is running", () => {
    const REFUSED = "A BMAD switch is running in oldapp. Wait for it to finish.";
    const confirmDialog = () => screen.queryByRole("dialog", { name: "Switch to BMAD v6" });

    /** New Tab asked, Switch… was picked and Archive and switch pressed: the switch is held. */
    const startSwitching = async () => {
      let release!: () => void;
      tauri.switchGate = new Promise<void>((r) => { release = r; });
      renderDialog();
      open(/Open project/);
      await waitFor(() => expect(question()).toBe(ASK));
      fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
      const confirm = await screen.findByRole("button", { name: "Archive and switch" });
      await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(confirm);
      await waitFor(() => expect(tauri.switches).toHaveLength(1));
      return release;
    };

    it("refuses another project's setup, switch and New Tab question, then opens its own folder once", async () => {
      const failed = vi.fn();
      window.addEventListener("project-setup-failed", failed);
      const before = tabs();
      const release = await startSwitching();
      tauri.byDir = { [NEWAPP]: null, [OTHER]: "v4" };

      // The palette's "Set up BMAD" and both Set up now buttons.
      await expect(askAndSetUp(NEWAPP)).rejects.toMatchObject({ reason: REFUSED });
      // The palette's and the board's switch.
      await expect(switchOnDemand(OTHER)).rejects.toMatchObject({ reason: REFUSED });
      expect(confirmDialog()).toBeTruthy();
      expect(tabs()).toBe(before);

      // New Tab for a project that would be asked keep-or-switch: opened as a
      // blocked project is, with the reason and no setup.
      await openProjectTab(OTHER);
      expect(tabs()).toBe(before + 1);
      expect(recentProjects()).toEqual([OTHER]);
      expect(failed).toHaveBeenCalledOnce();
      expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toBe(REFUSED);
      expect(isKeptNow()).toEqual([]);
      // And one that would be asked which version.
      await openProjectTab(NEWAPP);
      expect(tabs()).toBe(before + 2);
      expect(failed).toHaveBeenCalledTimes(2);
      expect(isKeptNow()).toEqual([]);
      expect(tauri.applies).toHaveLength(0);
      expect(confirmDialog(), "the running switch keeps its dialog").toBeTruthy();
      expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);

      release();
      await waitFor(() => expect(tabs()).toBe(before + 3));
      await settle();
      expect(tabs(), "one tab for the switched folder").toBe(before + 3);
      expect(recentProjects()[0]).toBe(OLDAPP);
      expect(isKeptNow()).toEqual([OLDAPP]);
      expect(confirmDialog()).toBeNull();
      expect(tauri.switches).toHaveLength(1);
      expect(tauri.applies).toHaveLength(0);
      window.removeEventListener("project-setup-failed", failed);
    });

    it("shows a failure in its own dialog after another project's question was refused", async () => {
      tauri.switchError = "A folder is in use.";
      const before = tabs();
      const release = await startSwitching();
      tauri.byDir = { [NEWAPP]: null };
      await expect(askAndSetUp(NEWAPP)).rejects.toMatchObject({ reason: REFUSED });

      release();
      await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("A folder is in use."));
      expect(confirmDialog()).toBeTruthy();
      expect(tabs()).toBe(before);
      // The person can still go Back and answer.
      const back = screen.getByRole("button", { name: "Back" });
      await waitFor(() => expect((back as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(back);
      await waitFor(() => expect(question()).toBe(ASK));
    });
  });
});

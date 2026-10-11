import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewTabDialog from "../NewTabDialog";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests } from "../../lib/methodologyPrompt";
import { openProjectTab, recentProjects } from "../../lib/newTab";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore } from "../../stores/tabStore";

// Setup is IPC only: the status command says what a folder is on, and the
// apply calls record the root and version the dialog's answer led to.
const tauri = vi.hoisted(() => ({
  /** What a folder is on when `byDir` doesn't name it. */
  methodology: null as "v4" | "v6" | null,
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  applies: [] as Record<string, unknown>[],
  applyError: null as string | null,
  gitInit: [] as string[],
  gitInitError: null as string | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
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
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// The folder picker is native: the test answers it with the path under test.
const picker = vi.hoisted(() => ({ picked: null as string | null }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(async () => picker.picked) }));

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
/** The dialog beside the app-level host that shows the question it raises. */
const renderDialog = (onClose = vi.fn()) => {
  render(<><NewTabDialog onClose={onClose} /><MethodologyPromptHost /></>);
  return onClose;
};

beforeEach(() => {
  localStorage.clear();
  tauri.methodology = null;
  tauri.byDir = {};
  tauri.roots = {};
  tauri.applies.length = 0;
  tauri.applyError = null;
  tauri.gitInit.length = 0;
  tauri.gitInitError = null;
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
});

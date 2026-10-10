import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewTabDialog from "../NewTabDialog";
import { useSettingsStore } from "../../stores/settingsStore";

// Setup is IPC only: the status command says what the project is on, and the
// apply calls record the methodology the dialog passed.
const tauri = vi.hoisted(() => ({
  methodology: null as "v4" | "v6" | null,
  applies: [] as Record<string, unknown>[],
  gitInit: [] as string[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_setup_status":
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: tauri.methodology };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0, bmadv6Files: 0 };
      case "project_git_init":
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

const lastApply = () => tauri.applies[tauri.applies.length - 1];
const question = () => screen.queryByText("Methodology: BMAD v6 (default) or BMAD v4");
const open = (label: RegExp) => fireEvent.click(screen.getByRole("option", { name: label }));

beforeEach(() => {
  localStorage.clear();
  tauri.methodology = null;
  tauri.applies.length = 0;
  tauri.gitInit.length = 0;
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("the methodology question", () => {
  it("asks for a new project and sets it up on the answer", async () => {
    picker.picked = "/Users/testuser/code/newapp";
    render(<NewTabDialog onClose={vi.fn()} />);

    open(/New project/);
    await waitFor(() => expect(question()).toBeTruthy());

    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(tauri.gitInit).toEqual(["/Users/testuser/code/newapp"]);
  });

  it("defaults to v6 when the question is answered with the default", async () => {
    picker.picked = "/Users/testuser/code/newapp";
    render(<NewTabDialog onClose={vi.fn()} />);

    open(/New project/);
    await waitFor(() => expect(question()).toBeTruthy());

    fireEvent.click(screen.getByRole("option", { name: /BMAD v6 \(default\)/ }));
    await waitFor(() => expect(lastApply()?.methodology).toBe("v6"));
  });

  it("does not ask about a project that is already on a methodology", async () => {
    tauri.methodology = "v4";
    picker.picked = "/Users/testuser/code/oldapp";
    render(<NewTabDialog onClose={vi.fn()} />);

    open(/Open project/);
    await waitFor(() => expect(lastApply()?.methodology).toBe("v4"));
    expect(question()).toBeNull();
    expect(tauri.applies[0].full).toBe(true);
  });

  it("does not ask when automatic setup is off", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    picker.picked = "/Users/testuser/code/newapp";
    render(<NewTabDialog onClose={vi.fn()} />);

    open(/Open project/);
    await waitFor(() => expect(tauri.applies.length).toBe(0));
    expect(question()).toBeNull();
  });
});

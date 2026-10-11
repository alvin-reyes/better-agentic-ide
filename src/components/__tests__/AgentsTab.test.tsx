import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  /** `.bmad-core/VERSION` is on disk. */
  bmadInstalled: false,
  applies: [] as Record<string, unknown>[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
      case "bmad_switch_pending":
        return [];
      case "project_setup_status":
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: tauri.bmadInstalled, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        // The setup writes the marker: the project is on that version from here on.
        tauri.byDir[args.root as string] = args.methodology as "v4" | "v6";
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      case "mcp_list":
        return {};
      case "vault_list":
        return [];
      case "check_command_exists":
        throw new Error("not installed");
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import AgentsTab from "../AgentsTab";
import IntegrationsPanel from "../IntegrationsPanel";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests } from "../../lib/methodologyPrompt";
import { SWITCH_DONE_EVENT } from "../../lib/bmadSwitch";

const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
const renderTab = (root: string) =>
  render(
    <>
      <AgentsTab root={root} onNotice={vi.fn()} onError={vi.fn()} />
      <MethodologyPromptHost />
    </>,
  );

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.roots = {};
  tauri.bmadInstalled = false;
  tauri.applies.length = 0;
  __resetPromptForTests();
});

describe("Set up now on the Agents tab", () => {
  it("asks which BMAD version before it sets the project up", async () => {
    renderTab("/code/shop");
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).toBe("Set up shop with BMAD v6 (default) or BMAD v4?"));
    expect(tauri.applies).toHaveLength(0);

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Set up project" }), { key: "Enter" });
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v6", full: true });
  });

  it("cannot be skipped: Escape leaves the question open and sets nothing up", async () => {
    renderTab("/code/shop");
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 20));
    expect(question()).not.toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });

  it("re-checks a v4 project on its own version, with no question", async () => {
    tauri.byDir = { "/code/old": "v4" };
    tauri.bmadInstalled = true;
    renderTab("/code/old");
    fireEvent.click(await screen.findByRole("button", { name: "Re-check" }));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/old", methodology: "v4" });
    expect(question()).toBeNull();
  });
});

describe("Set up now in a folder that isn't a project", () => {
  it("says so, asks nothing and writes nothing", async () => {
    const onError = vi.fn();
    render(
      <>
        <AgentsTab root="/Users/testuser" onNotice={vi.fn()} onError={onError} />
        <MethodologyPromptHost />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Set up now" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("This folder isn't a project."));
    expect(question()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("the Agents tab's project", () => {
  it("is the BMAD project the pane is in, not the repository above it", async () => {
    tauri.roots = { "/code/mono/app/src": "/code/mono", "/code/mono/app": "/code/mono" };
    tauri.byDir = { "/code/mono/app": "v6" };
    render(<IntegrationsPanel cwd="/code/mono/app/src" initialTab="agents" onClose={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".contracts-panel__root")?.textContent).toBe("/code/mono/app"));
  });
});

describe("the Project setup card", () => {
  it("shows a v6 project as set up", async () => {
    tauri.byDir = { "/code/shop": "v6" };
    renderTab("/code/shop");
    expect(await screen.findByText("Set up")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Re-check" })).toBeTruthy();
    expect(screen.queryByText("Incomplete")).toBeNull();
    expect(screen.queryByText(/BMAD isn't installed/)).toBeNull();
  });

  it("shows a project with no BMAD as incomplete, and says BMAD isn't installed", async () => {
    renderTab("/code/shop");
    expect(await screen.findByText("Incomplete")).toBeTruthy();
    expect(screen.getByText(/BMAD isn't installed/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Set up now" })).toBeTruthy();
  });
});

describe("the Agents tab and a BMAD switch", () => {
  const statusCalls = () => vi.mocked(invoke).mock.calls.filter(([c]) => c === "project_setup_status").length;

  it("re-reads the project when its switch is done, and not for another project's", async () => {
    renderTab("/code/shop");
    await screen.findByRole("button", { name: "Set up now" });
    await waitFor(() => expect(statusCalls()).toBeGreaterThan(0));
    const before = statusCalls();
    act(() => { window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/code/other" } })); });
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCalls()).toBe(before);

    act(() => { window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/code/shop" } })); });
    await waitFor(() => expect(statusCalls()).toBeGreaterThan(before));
  });

  it("stops listening when it unmounts", async () => {
    const { unmount } = renderTab("/code/shop");
    await waitFor(() => expect(statusCalls()).toBeGreaterThan(0));
    unmount();
    const before = statusCalls();
    window.dispatchEvent(new CustomEvent(SWITCH_DONE_EVENT, { detail: { root: "/code/shop" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(statusCalls()).toBe(before);
  });
});

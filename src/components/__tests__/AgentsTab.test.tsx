import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

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

describe("the Agents tab's project", () => {
  it("is the BMAD project the pane is in, not the repository above it", async () => {
    tauri.roots = { "/code/mono/app/src": "/code/mono", "/code/mono/app": "/code/mono" };
    tauri.byDir = { "/code/mono/app": "v6" };
    render(<IntegrationsPanel cwd="/code/mono/app/src" initialTab="agents" onClose={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".contracts-panel__root")?.textContent).toBe("/code/mono/app"));
  });
});

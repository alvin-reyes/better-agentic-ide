import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const tauri = vi.hoisted(() => ({
  byDir: {} as Record<string, "v4" | "v6" | null>,
  pending: [] as unknown[],
  applies: [] as Record<string, unknown>[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return String(args.path).replace(/\/src$/, "");
      case "bmad_switch_pending":
        return tauri.pending;
      case "bmad_switch_plan":
        return {
          from: "v4", to: args.to, archive: ".ade/archive/bmad-v4-2026-10-11",
          moves: [], documents: [], leftovers: [], leftInPlace: [], dirty: null, archiveIgnored: null, blocked: null,
        };
      case "project_setup_status":
        return {
          isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [],
          methodology: tauri.byDir[args.root as string] ?? null,
        };
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// The palette asks the active pane for its folder; there is no terminal here.
const pane = vi.hoisted(() => ({ cwd: "/code/shop/src" as string | null }));
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => pane.cwd) }));

// jsdom has no layout engine, so it doesn't implement scrollIntoView.
// The palette calls it to keep the selected row visible.
Element.prototype.scrollIntoView = vi.fn();

import CommandPalette from "../CommandPalette";
import MethodologyPromptHost from "../MethodologyPrompt";
import { __resetPromptForTests, useMethodologyPrompt } from "../../lib/methodologyPrompt";
import { beginSwitch } from "../../lib/projectSetup";
import { useSettingsStore } from "../../stores/settingsStore";

const COMMAND = "Project: Set up BMAD, methodology and agents";
const question = () => document.querySelector(".new-tab-ask")?.textContent ?? null;
const renderPalette = () =>
  render(
    <>
      <CommandPalette onClose={vi.fn()} onToggleScratchpad={vi.fn()} onOpenAgentPicker={vi.fn()} />
      <MethodologyPromptHost />
    </>,
  );

beforeEach(() => {
  localStorage.clear();
  tauri.byDir = {};
  tauri.pending = [];
  tauri.applies.length = 0;
  pane.cwd = "/code/shop/src";
  __resetPromptForTests();
  useSettingsStore.getState().setAutoProjectSetup(true);
});

describe("Project: Set up BMAD, methodology and agents", () => {
  it("asks which version for a project with no BMAD, then sets it up", async () => {
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(question()).toBe("Set up shop with BMAD v6 (default) or BMAD v4?"));
    expect(tauri.applies).toHaveLength(0);

    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4", full: true });
  });

  it("still asks with automatic setup off, and for a project whose setup was undone", async () => {
    useSettingsStore.getState().setAutoProjectSetup(false);
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["/code/shop"]));
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(question()).toBe("Set up shop with BMAD v6 (default) or BMAD v4?"));
  });

  it("sets up a project that has BMAD on its own version, with no question", async () => {
    tauri.byDir = { "/code/shop": "v4" };
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    expect(tauri.applies[0]).toMatchObject({ root: "/code/shop", methodology: "v4" });
    expect(question()).toBeNull();
  });

  it("cannot be skipped: Escape leaves the question open and sets nothing up", async () => {
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(question()).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });
    await new Promise((r) => setTimeout(r, 20));
    expect(question()).not.toBeNull();
    expect(tauri.applies).toHaveLength(0);
  });

  it("says a home folder isn't a project, asks nothing and writes nothing", async () => {
    pane.cwd = "/Users/testuser";
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toBe("This folder isn't a project.");
    expect(question()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(tauri.applies).toHaveLength(0);
    window.removeEventListener("project-setup-failed", failed);
  });

  it("says why when the active tab has no folder", async () => {
    pane.cwd = null;
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect((failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why).toContain("no folder");
    window.removeEventListener("project-setup-failed", failed);
  });
});

describe("BMAD: Initialize", () => {
  it("is gone from the palette", () => {
    renderPalette();
    expect(screen.queryByText(/BMAD: Initialize/)).toBeNull();
  });

  it("and so is the command it called, which then had no caller", () => {
    const tauriSrc = resolve(__dirname, "../../../src-tauri/src");
    expect(readFileSync(resolve(tauriSrc, "lib.rs"), "utf8")).not.toContain("scaffold_bmad");
    expect(readFileSync(resolve(tauriSrc, "bmad.rs"), "utf8")).not.toContain("scaffold_bmad");
    expect(readFileSync(resolve(__dirname, "../CommandPalette.tsx"), "utf8")).not.toContain("scaffold_bmad");
  });
});

describe("BMAD: Switch to the other version", () => {
  const request = () => useMethodologyPrompt.getState().request;
  const failures = () => {
    const failed = vi.fn();
    window.addEventListener("project-setup-failed", failed);
    return { failed, why: () => (failed.mock.calls[0][0] as CustomEvent<{ why: string }>).detail.why, stop: () => window.removeEventListener("project-setup-failed", failed) };
  };

  it("offers v6 for a v4 project, and opens the confirm step with Cancel", async () => {
    tauri.byDir = { "/code/shop": "v4" };
    renderPalette();
    fireEvent.click(await screen.findByText("BMAD: Switch to v6…"));
    await waitFor(() => expect(request()).toEqual({ root: "/code/shop", mode: "confirm", from: "v4", to: "v6", back: false }));
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(tauri.applies).toHaveLength(0);
  });

  it("offers v4 for a v6 project", async () => {
    tauri.byDir = { "/code/shop": "v6" };
    renderPalette();
    expect(await screen.findByText("BMAD: Switch to v4…")).toBeTruthy();
    expect(screen.queryByText("BMAD: Switch to v6…")).toBeNull();
  });

  it("is not offered for a project with no BMAD", async () => {
    renderPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/BMAD: Switch to/)).toBeNull();
  });

  it("is not offered for a pane with no folder", async () => {
    pane.cwd = null;
    tauri.byDir = { "/code/shop": "v4" };
    renderPalette();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/BMAD: Switch to/)).toBeNull();
  });

  it("shows why another project's running switch blocks it, plainly", async () => {
    tauri.byDir = { "/code/shop": "v4" };
    const seen = failures();
    // Another project's switch holds the dialog.
    useMethodologyPrompt.setState({ request: { root: "/code/other", mode: "confirm", from: "v4", to: "v6", back: false } });
    const end = beginSwitch("/code/other");
    try {
      renderPalette();
      fireEvent.click(await screen.findByText("BMAD: Switch to v6…"));
      await waitFor(() => expect(seen.failed).toHaveBeenCalledOnce());
      expect(seen.why()).toBe("A BMAD switch is running in other. Wait for it to finish.");
      expect(request()).toMatchObject({ root: "/code/other" });
    } finally {
      end();
      seen.stop();
    }
  });

  it("shows a blocked project's reason as it is, not as a failed setup", async () => {
    tauri.byDir = { "/code/shop": "v4" };
    tauri.pending = [{ archive: ".ade/archive/bmad-v4-2026-10-11", status: "in-progress", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" }];
    const seen = failures();
    renderPalette();
    fireEvent.click(screen.getByText(COMMAND));
    await waitFor(() => expect(seen.failed).toHaveBeenCalledOnce());
    expect(seen.why()).toMatch(/^A BMAD switch in shop didn't finish\./);
    expect(seen.why()).not.toContain("Project setup failed");
    seen.stop();
  });
});

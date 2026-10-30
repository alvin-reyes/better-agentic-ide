import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import IntegrationsPanel from "../IntegrationsPanel";

const tauri = vi.hoisted(() => ({
  installs: [] as Record<string, unknown>[],
  /** What mcp_install reports it added to the settings files. */
  added: [] as string[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return "/repo";
      case "mcp_list":
        return {};
      case "vault_list":
        return [];
      case "check_command_exists":
        return "/usr/bin/x";
      case "mcp_install":
        tauri.installs.push(args);
        return tauri.added;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderPanel() {
  render(<IntegrationsPanel cwd="/repo/app" initialTab="mcp" onClose={() => {}} />);
  await act(async () => {
    await flush();
  });
}

function orgoCard(): HTMLElement {
  const card = screen.getByText("Orgo").closest("li");
  if (!card) throw new Error("no Orgo card");
  return card;
}

beforeEach(() => {
  tauri.installs.length = 0;
  tauri.added = [];
});

describe("the Orgo card", () => {
  it("the Orgo card is a sign-in server with its caution", async () => {
    await renderPanel();
    const card = within(orgoCard());
    expect(card.getByText("Sign in")).toBeTruthy();
    const note = card.getByRole("note");
    expect(note.className).toBe("mcp-caution");
    expect(note.textContent).toMatch(/cost money until deleted/);
    expect(note.textContent).toMatch(/always ask before a computer is created, changed, stopped or deleted, even in Continuous mode/);
    expect(orgoCard().querySelector(".mcp-secret")).toBeNull();
    expect(card.queryByText("Add to vault")).toBeNull();
    expect(card.queryByText("npx")).toBeNull();
  });

  it("installing Orgo writes the hosted server and says where the rules went", async () => {
    tauri.added = ["mcp__*orgo*__*create*", "mcp__*orgo*__*delete*"];
    await renderPanel();
    await act(async () => {
      fireEvent.click(within(orgoCard()).getByText("Install"));
      await flush();
    });
    expect(tauri.installs).toHaveLength(1);
    expect(tauri.installs[0].project).toBe("/repo");
    expect(tauri.installs[0].name).toBe("orgo");
    expect(tauri.installs[0].server).toEqual({ type: "http", url: "https://www.orgo.ai/mcp" });

    const notice = screen.getByRole("status").textContent ?? "";
    expect(notice).toMatch(/Agents ADE starts will always ask before Orgo creates, changes, stops or deletes a computer/);
    expect(notice).toContain(".claude/settings.json");
    expect(notice).toContain(".claude/settings.local.json");
    expect(notice).toMatch(/The first install may reorder \.claude\/settings\.json; every setting is kept/);
    expect(notice).toMatch(/Run \/mcp in Claude Code to sign in/);
  });

  it("keeps the plain sign-in notice for servers that add no rules", async () => {
    await renderPanel();
    const sentry = screen.getByText("Sentry").closest("li")!;
    await act(async () => {
      fireEvent.click(within(sentry).getByText("Install"));
      await flush();
    });
    expect(screen.getByRole("status").textContent).toBe("Sentry added to .mcp.json. Start Claude Code here and run /mcp to sign in.");
  });
});

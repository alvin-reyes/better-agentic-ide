import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within, cleanup } from "@testing-library/react";
import IntegrationsPanel from "../IntegrationsPanel";

const tauri = vi.hoisted(() => ({
  installs: [] as Record<string, unknown>[],
  /** What mcp_install reports: the rules it added, and the settings files that gained one. */
  installed: { rules: [] as string[], files: [] as string[] },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return "/r";
      case "mcp_list":
        return {};
      case "vault_list":
        return [];
      case "check_command_exists":
        return "/usr/bin/x";
      case "mcp_install":
        tauri.installs.push(args);
        return tauri.installed;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderPanel() {
  render(<IntegrationsPanel cwd="/r/app" initialTab="mcp" onClose={() => {}} />);
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
  tauri.installed = { rules: [], files: [] };
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
    const lead = "Orgo added to .mcp.json. Agents ADE starts will always ask before Orgo creates, changes, stops or deletes a computer. For sessions you start yourself, ask rules were added to ";
    const reorder = " The first install may reorder .claude/settings.json; every setting is kept.";
    const signIn = " Run /mcp in Claude Code to sign in.";
    const cases: [string, string[], string][] = [
      ["(a) both files", ["/r/.claude/settings.json", "/r/.claude/settings.local.json"],
        `${lead}.claude/settings.json and .claude/settings.local.json.${reorder}${signIn}`],
      ["(b) local only", ["/r/.claude/settings.local.json"],
        `${lead}.claude/settings.local.json.${signIn}`],
      ["(c) shared only", ["/r/.claude/settings.json"],
        `${lead}.claude/settings.json.${reorder}${signIn}`],
      ["(d) a worktree", ["/r/.claude/settings.json", "/m/.claude/settings.local.json"],
        `${lead}.claude/settings.json and /m/.claude/settings.local.json, which Claude Code reads in this worktree.${reorder}${signIn}`],
    ];
    for (const [label, files, expected] of cases) {
      tauri.installs.length = 0;
      tauri.installed = { rules: ["mcp__*orgo*__*create*", "mcp__*orgo*__*delete*"], files };
      await renderPanel();
      await act(async () => {
        fireEvent.click(within(orgoCard()).getByText("Install"));
        await flush();
      });
      expect(tauri.installs, label).toHaveLength(1);
      expect(tauri.installs[0].project, label).toBe("/r");
      expect(tauri.installs[0].name, label).toBe("orgo");
      expect(tauri.installs[0].server, label).toEqual({ type: "http", url: "https://www.orgo.ai/mcp" });
      const notice = screen.getByRole("status").textContent ?? "";
      expect(notice, label).toBe(expected);
      if (label.startsWith("(b)")) {
        expect(notice, label).not.toContain(".claude/settings.json");
        expect(notice, label).not.toContain("reorder");
      }
      if (label.startsWith("(c)")) expect(notice, label).not.toContain("settings.local.json");
      cleanup();
    }
  });

  it("a repeat Orgo install that added no rules gets the plain sign-in notice", async () => {
    tauri.installed = { rules: [], files: [] };
    await renderPanel();
    await act(async () => {
      fireEvent.click(within(orgoCard()).getByText("Install"));
      await flush();
    });
    expect(screen.getByRole("status").textContent).toBe("Orgo added to .mcp.json. Start Claude Code here and run /mcp to sign in.");
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

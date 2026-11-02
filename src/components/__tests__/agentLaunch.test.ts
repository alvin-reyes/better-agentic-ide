import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { specFromCurated, rolePathFor } from "../../lib/agentSpec";
import AgentPicker from "../AgentPicker";
import { useTabStore } from "../../stores/tabStore";
import { usePaneCwd } from "../../stores/paneMetaStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { __resetLaunchRulesForTests } from "../../lib/launchRules";

const tauri = vi.hoisted(() => ({
  ptyWrites: [] as string[],
  /** The arguments of every launch_rules call. */
  ruleCalls: [] as unknown[],
  guard: null as unknown,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args?: Record<string, unknown>) => {
    switch (command) {
      case "launch_rules":
        tauri.ruleCalls.push(args);
        return { ask: ["mcp__*orgo*__*create*", "mcp__*orgo*__*stop*"], continuousDeny: DENY, guard: tauri.guard };
      case "pty_line_editor_ready":
        // Can't know: typed at once.
        return null;
      case "create_directory":
        return String(args?.path).replace("~", "/Users/testuser");
      case "write_text_file":
        return null;
      case "write_pty":
        tauri.ptyWrites.push(new TextDecoder().decode(new Uint8Array(args?.data as number[])));
        return null;
      default:
        // check_command_exists, and the project lookups of methodologyOf.
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

/** What `launch_rules` answers for Continuous launches: a glob, and a Bash rule with spaces. */
const DENY = vi.hoisted(() => ["mcp__*orgo*__*create*", "Bash(*orgo c create*)"]);

Element.prototype.scrollIntoView = vi.fn();
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("specFromCurated", () => {
  it("resolves a curated id to its role and domain", () => {
    const spec = specFromCurated("backend-auth", "claude");
    expect(spec?.roleId).toBe("architect");
    expect(spec?.domainId).toBe("security");
    expect(spec?.provider).toBe("claude");
  });

  it("resolves a curated id that has no domain", () => {
    const spec = specFromCurated("general-architect", "claude");
    expect(spec?.roleId).toBe("architect");
    expect(spec?.domainId).toBe(undefined);
  });

  it("returns undefined for an unknown id", () => {
    expect(specFromCurated("nope", "claude")).toBe(undefined);
  });
});

describe("rolePathFor", () => {
  it("builds a path under the app's role directory", () => {
    const path = rolePathFor({ roleId: "architect", domainId: "security", provider: "claude" });
    expect(path).toBe("~/.ade/roles/architect-security.md");
  });

  it("builds a bare role path when there is no domain", () => {
    const path = rolePathFor({ roleId: "architect", provider: "claude" });
    expect(path).toBe("~/.ade/roles/architect.md");
  });

  it("builds an absolute path inside an expanded directory", () => {
    // What the launch paths actually pass: the directory create_directory
    // returned, already tilde-expanded, so the quoted path in the shell
    // command points at a file that exists.
    const path = rolePathFor(
      { roleId: "architect", domainId: "security", provider: "claude" },
      "/Users/x/.ade/roles",
    );
    expect(path).toBe("/Users/x/.ade/roles/architect-security.md");
  });

  it("does not double the separator when the directory has a trailing slash", () => {
    const path = rolePathFor({ roleId: "dev", provider: "claude" }, "/Users/x/.ade/roles/");
    expect(path).toBe("/Users/x/.ade/roles/dev.md");
  });

  it("keys the file by methodology, so a v4 and a v6 launch never share one", () => {
    const spec = { roleId: "qa", domainId: "security", provider: "claude" as const };
    expect(rolePathFor(spec, "/r", "v4")).toBe("/r/qa-security.v4.md");
    expect(rolePathFor({ roleId: "qa", provider: "claude" }, "/r", "v6")).toBe("/r/qa.v6.md");
  });
});

describe("launching from the agent picker", () => {
  /** Launch Auth Architect in the active pane, whose folder is `cwd`, and return the typed command. */
  async function launchIn(cwd: string, ptyId: number, continuous = false): Promise<string> {
    __resetLaunchRulesForTests();
    tauri.ptyWrites.length = 0;
    const pane = useTabStore.getState().getActivePane();
    if (!pane) throw new Error("no active pane");
    useTabStore.getState().setPtyId(pane.id, ptyId);
    usePaneCwd.getState().setCwd(pane.id, cwd);
    render(createElement(AgentPicker, { onClose: () => {} }));
    await act(async () => { await flush(); });
    if (continuous) {
      // On through its warning, as a user turns it on.
      fireEvent.click(screen.getByRole("switch", { name: "Continuous mode" }));
      fireEvent.click(screen.getByText("I understand, enable"));
      expect(screen.getByRole("switch", { name: "Continuous mode" }).getAttribute("aria-checked")).toBe("true");
    }
    await act(async () => {
      fireEvent.click(screen.getAllByText("Auth Architect")[0]);
      await flush();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/This terminal/));
      await flush();
    });
    cleanup();
    expect(tauri.ptyWrites).toHaveLength(1);
    return tauri.ptyWrites[0];
  }

  const settingsOf = (command: string) => command.match(/ --settings '[^']*' /g);

  it("Orgo rules do not depend on the folder an agent starts in", async () => {
    useSettingsStore.getState().setDefaultProvider("claude");
    tauri.ruleCalls.length = 0;
    const inSub = await launchIn("/repo/app", 41);
    const atRoot = await launchIn("/repo", 42);
    // Asked twice (the cache was reset), and never told a folder.
    expect(tauri.ruleCalls).toEqual([undefined, undefined]);
    expect(settingsOf(inSub)).toEqual([` --settings '{"permissions":{"ask":["mcp__*orgo*__*create*","mcp__*orgo*__*stop*"]}}' `]);
    expect(settingsOf(atRoot)).toEqual(settingsOf(inSub));
  });

  /** Everything from `--disallowedTools` up to the role flag, or null when there is no such flag. */
  const denyOf = (command: string) => command.match(/ --disallowedTools (.*) --append-system-prompt-file /)?.[1] ?? null;

  it("continuous denies are the same in every folder", async () => {
    useSettingsStore.getState().setDefaultProvider("claude");
    tauri.ruleCalls.length = 0;
    const inSub = await launchIn("/repo/app", 44, true);
    const atRoot = await launchIn("/repo", 45, true);
    // Never told a folder.
    expect(tauri.ruleCalls).toEqual([undefined, undefined]);
    expect(inSub).toContain(" --dangerously-skip-permissions ");
    expect(denyOf(inSub)).toBe("'mcp__*orgo*__*create*' 'Bash(*orgo c create*)'");
    expect(denyOf(atRoot)).toBe(denyOf(inSub));
    // Continuous off: neither folder gets the flag.
    for (const cwd of ["/repo/app", "/repo"]) {
      const manual = await launchIn(cwd, 46);
      expect(manual, cwd).not.toContain("--dangerously-skip-permissions");
      expect(manual, cwd).not.toContain("--disallowedTools");
    }
  });

  it("the picker's launches are not headless", async () => {
    useSettingsStore.getState().setDefaultProvider("claude");
    tauri.guard = { interactive: "GUARD-INTERACTIVE", headless: "GUARD-HEADLESS" };
    try {
      const typed = await launchIn("/repo", 43);
      expect(typed).toContain('"command":"GUARD-INTERACTIVE"');
      expect(typed).not.toContain("GUARD-HEADLESS");
    } finally {
      tauri.guard = null;
    }
  });
});

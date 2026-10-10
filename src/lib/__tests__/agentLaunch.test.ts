import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({ writes: [] as { path: string; content: string }[], ran: [] as string[] }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
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
import { useAgentTrackerStore } from "../../stores/agentTrackerStore";

describe("prepareAgentLaunch", () => {
  beforeEach(() => { io.writes.length = 0; io.ran.length = 0; });

  it("writes the role file and returns a command carrying the task", async () => {
    const r = await prepareAgentLaunch({ roleId: "developer", provider: "claude" }, "/p", { task: "Implement story 1.1" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.command).toMatch(/^claude --append-system-prompt-file '\/home\/u\/\.ade\/roles\/.+' 'Implement story 1\.1'$/);
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
});

describe("dispatchAgent", () => {
  beforeEach(() => { io.writes.length = 0; io.ran.length = 0; });

  it("runs the command in a new tab and records the session", async () => {
    const start = vi.spyOn(useAgentTrackerStore.getState(), "startSession");
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "claude" }, cwd: "/p", task: "Implement story 1.1",
    });
    expect(err).toBeNull();
    expect(io.ran[0]).toContain("'Implement story 1.1'");
    expect(start).toHaveBeenCalledWith("pane-1", "Developer", "D", "claude", "developer");
  });

  it("returns the reason and opens nothing when the provider cannot take a task", async () => {
    const err = await dispatchAgent({
      name: "Developer", icon: "D", spec: { roleId: "developer", provider: "ollama" }, cwd: "/p", task: "go",
    });
    expect(err).toMatch(/Ollama/);
    expect(io.ran).toEqual([]);
  });
});

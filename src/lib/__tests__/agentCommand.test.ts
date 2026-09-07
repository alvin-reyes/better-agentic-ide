import { describe, it, expect } from "vitest";
import { buildLaunchCommand } from "../agentCommand";

const PATH = "~/.ade/roles/architect-security.md";

describe("buildLaunchCommand", () => {
  it("uses claude's append-system-prompt-file flag", () => {
    const result = buildLaunchCommand("claude", PATH);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.includes("--append-system-prompt-file")).toBe(true);
    expect(result.command.includes(PATH)).toBe(true);
  });

  it("adds the skip-permissions flag only in continuous mode", () => {
    const plain = buildLaunchCommand("claude", PATH);
    const cont = buildLaunchCommand("claude", PATH, { continuous: true });
    if (plain.kind !== "command" || cont.kind !== "command") throw new Error("expected commands");
    expect(plain.command.includes("--dangerously-skip-permissions")).toBe(false);
    expect(cont.command.includes("--dangerously-skip-permissions")).toBe(true);
  });

  it("pipes the file to gemini, which has no system-prompt flag", () => {
    const result = buildLaunchCommand("gemini", PATH);
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.includes(PATH)).toBe(true);
    expect(result.command.includes("--append-system-prompt-file")).toBe(false);
  });

  it("passes the file contents to ollama's --system", () => {
    const result = buildLaunchCommand("ollama", PATH, { ollamaModel: "llama3" });
    expect(result.kind).toBe("command");
    if (result.kind !== "command") return;
    expect(result.command.includes("ollama run llama3")).toBe(true);
    expect(result.command.includes("--system")).toBe(true);
  });

  it("defaults the ollama model", () => {
    const result = buildLaunchCommand("ollama", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command.includes("deepseek-r1")).toBe(true);
  });

  it("reports codex as unsupported rather than guessing", () => {
    const result = buildLaunchCommand("codex", PATH);
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("never emits a raw newline, which would submit a partial command", () => {
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, PATH);
      if (result.kind !== "command") continue;
      expect(result.command.includes("\n"), `${provider} emitted a newline`).toBe(false);
    }
  });

  it("single-quotes the path so spaces cannot split the argument", () => {
    const spaced = "~/.ade/roles/my role.md";
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, spaced);
      if (result.kind !== "command") continue;
      expect(result.command.includes(`'${spaced}'`), `${provider} left the path unquoted`).toBe(true);
    }
  });
});

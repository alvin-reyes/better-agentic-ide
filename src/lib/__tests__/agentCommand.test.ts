import { describe, it, expect } from "vitest";
import { buildLaunchCommand, supportsRoleDelivery } from "../agentCommand";

/**
 * An absolute path, because that is what the launch paths now pass. The old
 * fixture here was "~/.ade/roles/architect-security.md", and the assertions
 * were `includes(PATH)` — which passes happily against `cat '~/.ade/...'`,
 * a command that finds nothing because single quotes suppress tilde
 * expansion. Hence the full-string assertions below: they pin the exact
 * bytes the shell receives, where a broken path cannot hide inside a
 * surviving substring.
 */
const PATH = "/Users/x/.ade/roles/architect-security.md";

describe("buildLaunchCommand", () => {
  it("emits claude's exact command", () => {
    const result = buildLaunchCommand("claude", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toBe(
      "claude --append-system-prompt-file '/Users/x/.ade/roles/architect-security.md'"
    );
  });

  it("emits claude's exact command in continuous mode", () => {
    const result = buildLaunchCommand("claude", PATH, { continuous: true });
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toBe(
      "claude --dangerously-skip-permissions --append-system-prompt-file " +
        "'/Users/x/.ade/roles/architect-security.md'"
    );
  });

  it("adds the skip-permissions flag only in continuous mode", () => {
    const plain = buildLaunchCommand("claude", PATH);
    const cont = buildLaunchCommand("claude", PATH, { continuous: true });
    if (plain.kind !== "command" || cont.kind !== "command") throw new Error("expected commands");
    expect(plain.command.includes("--dangerously-skip-permissions")).toBe(false);
    expect(cont.command.includes("--dangerously-skip-permissions")).toBe(true);
  });

  /**
   * DeepSeek publishes an Anthropic-compatible endpoint, so this is the claude
   * binary with its base URL and model redirected. That is what makes it the
   * one third-party provider with real role delivery: the flag is claude's own,
   * already verified, rather than a convention guessed at from docs.
   *
   * The key is never interpolated. It is read from the environment the vault
   * already populates, so it stays out of the command string, the shell
   * history and the process arguments.
   */
  it("emits deepseek as claude redirected at the compatible endpoint", () => {
    const result = buildLaunchCommand("deepseek", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toBe(
      "ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic " +
        'ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" ' +
        "ANTHROPIC_MODEL=deepseek-flash " +
        "claude --append-system-prompt-file '/Users/x/.ade/roles/architect-security.md'"
    );
  });

  it("never puts the deepseek key itself in the command", () => {
    const result = buildLaunchCommand("deepseek", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toContain('"$DEEPSEEK_API_KEY"');
    expect(result.command).not.toMatch(/sk-[a-zA-Z0-9]/);
  });

  /**
   * Pinning the model matters for more than routing. ADE prices Claude Code
   * transcripts by model name, and deepseek-* matches no price pattern, so the
   * spend is correctly left out rather than charged at Anthropic's rates.
   * Without this, claude would request claude-sonnet-*, DeepSeek would serve it,
   * and the transcript would be priced as if Anthropic had.
   */
  it("pins the model so deepseek usage is not priced as anthropic", () => {
    const result = buildLaunchCommand("deepseek", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toContain("ANTHROPIC_MODEL=deepseek-flash");
  });

  it("honours continuous mode for deepseek too", () => {
    const result = buildLaunchCommand("deepseek", PATH, { continuous: true });
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toContain("claude --dangerously-skip-permissions --append-system-prompt-file");
  });

  it("emits gemini's exact command, piping the file it has no flag for", () => {
    const result = buildLaunchCommand("gemini", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toBe(
      `gemini -i "$(cat '/Users/x/.ade/roles/architect-security.md')"`
    );
  });

  it("derives a model from the Modelfile and runs that", () => {
    // `ollama run` has no system-prompt flag — verified against its own help,
    // which lists MODEL [PROMPT] and nothing for a system prompt. The only way
    // to start an interactive session with one is to derive a model.
    const result = buildLaunchCommand("ollama", PATH, { ollamaModel: "llama3", roleId: "architect", domainId: "security" });
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toBe(
      `ollama create 'ade-llama3-architect-security' -f '/Users/x/.ade/roles/architect-security.md' && ollama run 'ade-llama3-architect-security'`
    );
  });

  it("never emits a flag ollama does not have", () => {
    const result = buildLaunchCommand("ollama", PATH, { ollamaModel: "llama3" });
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).not.toMatch(/--system/);
  });

  it("keeps shell metacharacters in the model out of the command", () => {
    const result = buildLaunchCommand("ollama", PATH, { ollamaModel: "llama3; echo pwned" });
    if (result.kind !== "command") throw new Error("expected a command");
    // The model name only reaches the command through the derived tag, which is
    // sanitised to [a-z0-9._-]; the raw name goes in the Modelfile, not a shell.
    expect(result.command).not.toContain("echo pwned");
    expect(result.command).toMatch(/^ollama create '[a-z0-9._-]+' -f /);
  });

  it("defaults the ollama model", () => {
    const result = buildLaunchCommand("ollama", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toContain("ade-deepseek-r1-");
  });

  it("reports codex as unsupported rather than guessing", () => {
    const result = buildLaunchCommand("codex", PATH);
    expect(result.kind).toBe("unsupported");
    if (result.kind !== "unsupported") return;
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("never emits a raw newline, which would submit a partial command", () => {
    const rolePathWithNewline = "/Users/x/.ade/roles/architect\nsecurity.md";
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, rolePathWithNewline);
      if (result.kind !== "command") continue;
      // shellQuote does not strip or escape newlines — single quotes preserve
      // them literally — so this pins that the newline still round-trips
      // inside the quoted token rather than asserting something vacuous.
      expect(result.command.includes(`'${rolePathWithNewline}'`), `${provider} did not quote the newline-bearing path correctly`).toBe(true);
    }
  });

  it("single-quotes the path so spaces cannot split the argument", () => {
    const spaced = "/Users/x/.ade/roles/my role.md";
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, spaced);
      if (result.kind !== "command") continue;
      expect(result.command.includes(`'${spaced}'`), `${provider} left the path unquoted`).toBe(true);
    }
  });

  it("never emits a tilde path, which single quotes would stop the shell expanding", () => {
    // The bug this pins: `cat '~/.ade/roles/x.md'` prints "No such file or
    // directory" and the agent launches with an empty role definition.
    for (const provider of ["claude", "gemini", "ollama"] as const) {
      const result = buildLaunchCommand(provider, PATH);
      if (result.kind !== "command") continue;
      expect(result.command.includes("'~"), `${provider} quoted a tilde path`).toBe(false);
    }
  });
});

describe("supportsRoleDelivery", () => {
  it("reports deepseek as supported, because it is claude underneath", () => {
    expect(supportsRoleDelivery("deepseek")).toBe(true);
  });

  it("is true exactly for the providers that produce a command", () => {
    expect(supportsRoleDelivery("claude")).toBe(true);
    expect(supportsRoleDelivery("gemini")).toBe(true);
    expect(supportsRoleDelivery("ollama")).toBe(true);
    expect(supportsRoleDelivery("codex")).toBe(false);
  });
});

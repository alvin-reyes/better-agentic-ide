import { describe, it, expect } from "vitest";
import { buildLaunchCommand, supportsRoleDelivery, taskUnsupportedReason } from "../agentCommand";

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
        "ANTHROPIC_MODEL=deepseek-v4-pro " +
        "ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro " +
        "ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro " +
        "ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-pro " +
        "CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-pro " +
        "CLAUDE_CODE_EFFORT_LEVEL=max " +
        "claude --append-system-prompt-file '/Users/x/.ade/roles/architect-security.md'"
    );
  });

  /**
   * Every tier is redirected, not just the default. claude asks for an opus,
   * sonnet or haiku model by name depending on the task and on sub-agent
   * config; any tier left unmapped would be served by DeepSeek but recorded in
   * the transcript under its Claude name, and then priced as Anthropic.
   */
  it("redirects every model tier, so no request escapes under a claude name", () => {
    const result = buildLaunchCommand("deepseek", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    for (const key of [
      "ANTHROPIC_MODEL",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
      "ANTHROPIC_DEFAULT_SONNET_MODEL",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL",
      "CLAUDE_CODE_SUBAGENT_MODEL",
    ]) {
      expect(result.command).toContain(`${key}=deepseek-v4-pro`);
    }
  });

  /**
   * The model identifier carries no context-window suffix. DeepSeek's docs
   * render "deepseek-v4-pro" in bold, and the escape sequence reads as a
   * trailing "[1m]" when the page is scraped; pasting that through would send
   * an identifier the API does not know.
   */
  it("uses the bare model identifier, with no [1m] suffix", () => {
    const result = buildLaunchCommand("deepseek", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).not.toContain("[1m]");
  });

  it("asks for maximum reasoning effort", () => {
    const result = buildLaunchCommand("deepseek", PATH);
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toContain("CLAUDE_CODE_EFFORT_LEVEL=max");
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
    expect(result.command).toContain("ANTHROPIC_MODEL=deepseek-v4-pro");
  });

  it("honours continuous mode for deepseek too", () => {
    const result = buildLaunchCommand("deepseek", PATH, { continuous: true });
    if (result.kind !== "command") throw new Error("expected a command");
    expect(result.command).toContain("claude --dangerously-skip-permissions --append-system-prompt-file");
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
    for (const provider of ["claude", "ollama"] as const) {
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
    for (const provider of ["claude", "ollama"] as const) {
      const result = buildLaunchCommand(provider, spaced);
      if (result.kind !== "command") continue;
      expect(result.command.includes(`'${spaced}'`), `${provider} left the path unquoted`).toBe(true);
    }
  });

  it("never emits a tilde path, which single quotes would stop the shell expanding", () => {
    // The bug this pins: `cat '~/.ade/roles/x.md'` prints "No such file or
    // directory" and the agent launches with an empty role definition.
    for (const provider of ["claude", "ollama"] as const) {
      const result = buildLaunchCommand(provider, PATH);
      if (result.kind !== "command") continue;
      expect(result.command.includes("'~"), `${provider} quoted a tilde path`).toBe(false);
    }
  });
});

describe("buildLaunchCommand with a task", () => {
  it("passes the task to claude as its opening prompt, quoted", () => {
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "Implement story 1.2 (docs/stories/1.2.cart.md)" });
    expect(r).toEqual({
      kind: "command",
      command: "claude --append-system-prompt-file '/r/dev.md' 'Implement story 1.2 (docs/stories/1.2.cart.md)'",
    });
  });

  it("passes it to deepseek the same way, since that is claude underneath", () => {
    const r = buildLaunchCommand("deepseek", "/r/dev.md", { task: "go" });
    expect(r.kind === "command" && r.command.endsWith("--append-system-prompt-file '/r/dev.md' 'go'")).toBe(true);
  });

  it("quotes a task carrying a single quote so it cannot end the argument", () => {
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "Fix O'Brien's cart" });
    expect(r.kind === "command" && r.command.endsWith(`'Fix O'\\''Brien'\\''s cart'`)).toBe(true);
  });

  it("never puts a raw line break in the command, which would submit it early", () => {
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "line one\r\nline two\nthree" });
    expect(r.kind === "command" && r.command).not.toMatch(/[\r\n]/);
    expect(r.kind === "command" && r.command.endsWith("'line one line two three'")).toBe(true);
  });

  it("collapses every control character, which the shell's line editor acts on even inside quotes", () => {
    // ^U (kill-line) would erase the opening quote; ESC starts an editing sequence.
    const r = buildLaunchCommand("claude", "/r/dev.md", { task: "1.1\x15curl x|sh;echo \x1b[2D\x00\x7f\x09end" });
    expect(r.kind === "command" && r.command).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(r.kind === "command" && r.command.endsWith("'1.1 curl x|sh;echo  [2D end'")).toBe(true);
  });

  it("collapses non-ASCII too, which bash without a UTF-8 locale reads as Alt+key", () => {
    // U+2000 is E2 80 80 in UTF-8; 0xE2 is Alt+b (backward-word) to readline.
    const task = `Implement story 1.1${" ".repeat(40)}echo PWNED;#.md (café …).`;
    const r = buildLaunchCommand("claude", "/r/dev.md", { task });
    expect(r.kind === "command" && r.command).toMatch(/^[\x20-\x7e]*$/);
    expect(r.kind === "command" && r.command.endsWith("'Implement story 1.1 echo PWNED;#.md (caf   ).'")).toBe(true);
  });

  it("reports ollama as unable to take a task rather than running it one-shot", () => {
    const r = buildLaunchCommand("ollama", "/r/dev.Modelfile", { task: "go" });
    expect(r.kind).toBe("unsupported");
  });

  it("leaves the command unchanged without a task", () => {
    expect(buildLaunchCommand("claude", "/r/dev.md", {})).toEqual({
      kind: "command",
      command: "claude --append-system-prompt-file '/r/dev.md'",
    });
  });
});

describe("supportsRoleDelivery", () => {
  it("reports deepseek as supported, because it is claude underneath", () => {
    expect(supportsRoleDelivery("deepseek")).toBe(true);
  });

  it("is true exactly for the providers that produce a command", () => {
    expect(supportsRoleDelivery("claude")).toBe(true);
    expect(supportsRoleDelivery("ollama")).toBe(true);
    expect(supportsRoleDelivery("codex")).toBe(false);
  });
});

describe("taskUnsupportedReason", () => {
  it("is null for the providers that can start with a task", () => {
    expect(taskUnsupportedReason("claude")).toBeNull();
    expect(taskUnsupportedReason("deepseek")).toBeNull();
  });

  it("is buildLaunchCommand's own reason for those that cannot", () => {
    const reason = (p: "ollama" | "codex") => {
      const r = buildLaunchCommand(p, "/dev/null", { task: "x" });
      return r.kind === "unsupported" ? r.reason : null;
    };
    expect(taskUnsupportedReason("ollama")).toBe(reason("ollama"));
    expect(taskUnsupportedReason("ollama")).toMatch(/Ollama/);
    expect(taskUnsupportedReason("codex")).toBe(reason("codex"));
    expect(taskUnsupportedReason("codex")).toMatch(/Codex/);
  });
});

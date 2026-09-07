export type Provider = "claude" | "codex" | "gemini" | "ollama";

export interface LaunchOptions {
  continuous?: boolean;
  ollamaModel?: string;
}

export type LaunchResult =
  | { kind: "command"; command: string }
  | { kind: "unsupported"; reason: string };

/** Single-quote for POSIX shells, escaping any embedded single quote. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the shell command that launches a provider with a composed role file.
 *
 * The role definition is ~2KB of markdown, so it travels as a file path rather
 * than as an argument. Each provider needs a different mechanism; the
 * differences are real and are not papered over.
 */
export function buildLaunchCommand(
  provider: Provider,
  rolePath: string,
  opts: LaunchOptions = {}
): LaunchResult {
  const path = shellQuote(rolePath);

  switch (provider) {
    case "claude": {
      const flags = opts.continuous ? " --dangerously-skip-permissions" : "";
      return { kind: "command", command: `claude${flags} --append-system-prompt-file ${path}` };
    }

    case "gemini":
      // gemini exposes only -p/--prompt and -i/--prompt-interactive; there is no
      // system-prompt flag, so the role is piped in as the opening prompt.
      return { kind: "command", command: `gemini -i "$(cat ${path})"` };

    case "ollama": {
      // ollamaModel is free text (see SettingsPanel.tsx), so it must be quoted
      // exactly like rolePath — it is just as user-controlled.
      const model = shellQuote(opts.ollamaModel || "deepseek-r1");
      return { kind: "command", command: `ollama run ${model} --system "$(cat ${path})"` };
    }

    case "codex":
      return {
        kind: "unsupported",
        reason:
          "Codex role delivery is not implemented. Its mechanism has not been " +
          "verified against the real CLI, and guessing a convention would fail " +
          "silently at launch.",
      };
  }
}

import { modelTagFor } from "./agentComposition";

export type Provider = "claude" | "codex" | "deepseek" | "gemini" | "ollama";

export interface LaunchOptions {
  continuous?: boolean;
  ollamaModel?: string;
  /** Identifies the derived Ollama model, so a role keeps the same one. */
  roleId?: string;
  domainId?: string;
}

export type LaunchResult =
  | { kind: "command"; command: string }
  | { kind: "unsupported"; reason: string };

/** Single-quote for POSIX shells, escaping any embedded single quote. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com/anthropic";
/** Pinned so the transcript records a deepseek name; see the deepseek case. */
export const DEEPSEEK_MODEL = "deepseek-flash";

/** The claude invocation both the claude and deepseek providers launch. */
function claudeCommand(quotedPath: string, opts: LaunchOptions): string {
  const flags = opts.continuous ? " --dangerously-skip-permissions" : "";
  return `claude${flags} --append-system-prompt-file ${quotedPath}`;
}

/**
 * Build the shell command that launches a provider with a composed role file.
 *
 * The role definition is ~2KB of markdown, so it travels as a file path rather
 * than as an argument. Each provider needs a different mechanism; the
 * differences are real and are not papered over.
 *
 * `rolePath` must already be absolute. It is single-quoted here so spaces and
 * metacharacters cannot split or escape the argument, and single quotes also
 * suppress tilde expansion — a `~/...` path would quietly resolve to nothing
 * and the agent would launch with no role definition at all. Callers get an
 * absolute path from `ensureRoleDir()` in agentSpec.ts.
 */
export function buildLaunchCommand(
  provider: Provider,
  rolePath: string,
  opts: LaunchOptions = {}
): LaunchResult {
  const path = shellQuote(rolePath);

  switch (provider) {
    case "claude": {
      return { kind: "command", command: claudeCommand(path, opts) };
    }

    /**
     * DeepSeek publishes an Anthropic-compatible endpoint, so this is the
     * claude binary with its base URL and model redirected rather than a
     * different CLI. That is why it has real role delivery where Codex does
     * not: the flag is claude's own and already verified.
     *
     * The key is referenced, never interpolated. $DEEPSEEK_API_KEY is read
     * from the environment the secrets vault already populates, so the value
     * stays out of this string, the shell history and the process arguments.
     *
     * ANTHROPIC_MODEL is pinned for a second reason beyond routing: ADE prices
     * Claude Code transcripts by model name, and `deepseek-*` matches none of
     * the price patterns, so the spend is correctly excluded and named rather
     * than charged at Anthropic's rates. Left unset, claude would ask for
     * claude-sonnet-*, DeepSeek would serve it, and the transcript would be
     * priced as though Anthropic had.
     */
    case "deepseek": {
      const env = [
        `ANTHROPIC_BASE_URL=${DEEPSEEK_BASE_URL}`,
        `ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY"`,
        `ANTHROPIC_MODEL=${DEEPSEEK_MODEL}`,
      ].join(" ");
      return { kind: "command", command: `${env} ${claudeCommand(path, opts)}` };
    }

    case "gemini":
      // gemini exposes only -p/--prompt and -i/--prompt-interactive; there is no
      // system-prompt flag, so the role is piped in as the opening prompt.
      return { kind: "command", command: `gemini -i "$(cat ${path})"` };

    case "ollama": {
      // `ollama run` has no system-prompt flag; the only way to start an
      // interactive session with one is to derive a model whose Modelfile
      // carries it. ollamaModel is free text from Settings, so it is quoted
      // exactly like the path.
      const raw = opts.ollamaModel || "deepseek-r1";
      const tag = shellQuote(modelTagFor(opts.roleId ?? "role", opts.domainId, raw));
      return {
        kind: "command",
        command: `ollama create ${tag} -f ${path} && ollama run ${tag}`,
      };
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

/**
 * Whether a provider has a verified role-delivery mechanism.
 *
 * Derived from `buildLaunchCommand` rather than kept as a second list, so the
 * picker's "unavailable" marking cannot drift from what launching actually
 * does. The path argument is irrelevant to the outcome.
 */
export function supportsRoleDelivery(provider: Provider): boolean {
  return buildLaunchCommand(provider, "/dev/null").kind === "command";
}

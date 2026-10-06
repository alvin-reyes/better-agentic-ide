import type { Provider } from "../lib/agentCommand";

export interface ProviderInfo {
  id: Provider;
  name: string;
  color: string;
  /**
   * The command to probe for and launch. Usually the id, but DeepSeek is the
   * claude binary pointed at an Anthropic-compatible endpoint, so probing for
   * `deepseek` would report it missing on a machine where it works.
   */
  binary?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "claude", name: "Claude", color: "#d97706" },
  { id: "codex", name: "Codex", color: "#10b981" },
  { id: "deepseek", name: "DeepSeek", color: "#4d6bfe", binary: "claude" },
  { id: "gemini", name: "Gemini", color: "#3b82f6" },
  { id: "ollama", name: "Ollama", color: "#ffffff" },
];

/** The binary a provider actually runs. Defaults to the id. */
export function binaryFor(id: Provider): string {
  return PROVIDERS.find((p) => p.id === id)?.binary ?? id;
}

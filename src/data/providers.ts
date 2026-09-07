import type { Provider } from "../lib/agentCommand";

export const PROVIDERS: { id: Provider; name: string; color: string }[] = [
  { id: "claude", name: "Claude", color: "#d97706" },
  { id: "codex", name: "Codex", color: "#10b981" },
  { id: "gemini", name: "Gemini", color: "#3b82f6" },
  { id: "ollama", name: "Ollama", color: "#ffffff" },
];

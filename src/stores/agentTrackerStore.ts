import { create } from "zustand";

const STORAGE_KEY = "better-terminal-agent-tracker";

export interface AgentSession {
  paneId: string;
  agentName: string;
  agentIcon: string;
  provider: string;
  startTime: number;
  endTime: number | null;
  status: "running" | "completed" | "cancelled";
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

interface AgentTrackerStore {
  sessions: AgentSession[];
  totalSpent: number; // cumulative estimated cost in cents

  startSession: (paneId: string, agentName: string, agentIcon: string, provider: string) => void;
  endSession: (paneId: string) => void;
  cancelSession: (paneId: string) => void;
  updateTokenEstimate: (paneId: string, inputTokens: number, outputTokens: number) => void;
  getActiveSession: (paneId: string) => AgentSession | undefined;
  getActiveSessions: () => AgentSession[];
  getSessionHistory: () => AgentSession[];
  clearHistory: () => void;
}

// Rough cost estimates per 1M tokens (in cents)
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  claude: { input: 300, output: 1500 },   // ~$3/$15 per 1M
  codex: { input: 250, output: 1000 },    // ~$2.50/$10 per 1M
  gemini: { input: 125, output: 500 },    // ~$1.25/$5 per 1M
};

function estimateCost(session: AgentSession): number {
  const rates = COST_PER_1M[session.provider] ?? COST_PER_1M.claude;
  const inputCost = (session.estimatedInputTokens / 1_000_000) * rates.input;
  const outputCost = (session.estimatedOutputTokens / 1_000_000) * rates.output;
  return inputCost + outputCost;
}

// Estimate tokens from session duration (rough: ~50 tokens/sec output for active agent)
function estimateTokensFromDuration(durationMs: number): { input: number; output: number } {
  const seconds = durationMs / 1000;
  // Agents typically think 30% of the time, output 70%
  // Average ~200 tokens/sec when outputting
  const activeSeconds = seconds * 0.5; // assume 50% active
  return {
    input: Math.round(activeSeconds * 30),  // ~30 input tokens/sec
    output: Math.round(activeSeconds * 80), // ~80 output tokens/sec
  };
}

function loadSessions(): AgentSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions = JSON.parse(raw) as AgentSession[];
    // Mark any "running" sessions from previous app launch as cancelled
    return sessions.map((s) =>
      s.status === "running" ? { ...s, status: "cancelled" as const, endTime: s.startTime + 1000 } : s
    );
  } catch {
    return [];
  }
}

function persistSessions(sessions: AgentSession[]) {
  // Keep last 200 sessions
  const trimmed = sessions.slice(-200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export const useAgentTrackerStore = create<AgentTrackerStore>((set, get) => ({
  sessions: loadSessions(),
  totalSpent: loadSessions().reduce((sum, s) => sum + estimateCost(s), 0),

  startSession: (paneId, agentName, agentIcon, provider) => {
    // End any existing session for this pane
    const existing = get().sessions.find((s) => s.paneId === paneId && s.status === "running");
    if (existing) {
      get().endSession(paneId);
    }

    const session: AgentSession = {
      paneId,
      agentName,
      agentIcon,
      provider,
      startTime: Date.now(),
      endTime: null,
      status: "running",
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
    };

    set((state) => {
      const updated = [...state.sessions, session];
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  endSession: (paneId) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.paneId === paneId && s.status === "running") {
          const endTime = Date.now();
          const duration = endTime - s.startTime;
          const estimated = estimateTokensFromDuration(duration);
          const finished: AgentSession = {
            ...s,
            status: "completed",
            endTime,
            estimatedInputTokens: s.estimatedInputTokens || estimated.input,
            estimatedOutputTokens: s.estimatedOutputTokens || estimated.output,
          };
          return finished;
        }
        return s;
      });
      persistSessions(updated);
      const totalSpent = updated.reduce((sum, s) => sum + estimateCost(s), 0);
      return { sessions: updated, totalSpent };
    });
  },

  cancelSession: (paneId) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.paneId === paneId && s.status === "running") {
          return { ...s, status: "cancelled" as const, endTime: Date.now() };
        }
        return s;
      });
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  updateTokenEstimate: (paneId, inputTokens, outputTokens) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.paneId === paneId && s.status === "running") {
          return {
            ...s,
            estimatedInputTokens: s.estimatedInputTokens + inputTokens,
            estimatedOutputTokens: s.estimatedOutputTokens + outputTokens,
          };
        }
        return s;
      });
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  getActiveSession: (paneId) => {
    return get().sessions.find((s) => s.paneId === paneId && s.status === "running");
  },

  getActiveSessions: () => {
    return get().sessions.filter((s) => s.status === "running");
  },

  getSessionHistory: () => {
    return get().sessions.filter((s) => s.status !== "running").slice(-50).reverse();
  },

  clearHistory: () => {
    const active = get().sessions.filter((s) => s.status === "running");
    persistSessions(active);
    set({ sessions: active, totalSpent: 0 });
  },
}));

export { estimateCost };

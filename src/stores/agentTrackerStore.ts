import { create } from "zustand";

const STORAGE_KEY = "better-terminal-agent-tracker";

export interface AgentSession {
  paneId: string;
  agentName: string;
  agentIcon: string;
  provider: string;
  /**
   * Optional because `loadSessions` parses localStorage written before roles
   * existed, where this key is simply absent. Declaring it required would make
   * every restored pre-branch session lie about its shape.
   */
  roleId?: string;
  startTime: number;
  endTime: number | null;
  status: "running" | "completed" | "cancelled";
}

interface AgentTrackerStore {
  sessions: AgentSession[];

  startSession: (paneId: string, agentName: string, agentIcon: string, provider: string, roleId: string) => void;
  endSession: (paneId: string) => void;
  cancelSession: (paneId: string) => void;
  getActiveSession: (paneId: string) => AgentSession | undefined;
  getActiveSessions: () => AgentSession[];
  getSessionHistory: () => AgentSession[];
  clearHistory: () => void;
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

const initialSessions = loadSessions();

export const useAgentTrackerStore = create<AgentTrackerStore>((set, get) => ({
  sessions: initialSessions,

  startSession: (paneId, agentName, agentIcon, provider, roleId) => {
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
      roleId,
      startTime: Date.now(),
      endTime: null,
      status: "running",
    };

    set((state) => {
      const updated = [...state.sessions, session].slice(-200);
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  endSession: (paneId) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.paneId === paneId && s.status === "running") {
          return { ...s, status: "completed" as const, endTime: Date.now() };
        }
        return s;
      });
      persistSessions(updated);
      return { sessions: updated };
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
    set({ sessions: active });
  },
}));


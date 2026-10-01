import { create } from "zustand";
import { readJson } from "../lib/storage";

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
  getActiveSession: (paneId: string) => AgentSession | undefined;
  clearHistory: () => void;
}

// Sessions still "running" were cut off when the app last quit.
function loadSessions(): AgentSession[] {
  return readJson<AgentSession[]>(STORAGE_KEY, []).map((s) =>
    s.status === "running" ? { ...s, status: "cancelled" as const, endTime: s.startTime + 1000 } : s
  );
}

const MAX_SESSIONS = 200;

function persistSessions(sessions: AgentSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
}

export const useAgentTrackerStore = create<AgentTrackerStore>((set, get) => ({
  sessions: loadSessions(),

  startSession: (paneId, agentName, agentIcon, provider, roleId) => {
    if (get().getActiveSession(paneId)) get().endSession(paneId);
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
      const sessions = [...state.sessions, session].slice(-MAX_SESSIONS);
      persistSessions(sessions);
      return { sessions };
    });
  },

  endSession: (paneId) =>
    set((state) => {
      const sessions = state.sessions.map((s) =>
        s.paneId === paneId && s.status === "running" ? { ...s, status: "completed" as const, endTime: Date.now() } : s,
      );
      persistSessions(sessions);
      return { sessions };
    }),

  getActiveSession: (paneId) => get().sessions.find((s) => s.paneId === paneId && s.status === "running"),

  clearHistory: () => {
    const active = get().sessions.filter((s) => s.status === "running");
    persistSessions(active);
    set({ sessions: active });
  },
}));

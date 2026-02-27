import { create } from "zustand";

const STORAGE_KEY = "better-terminal-orchestrator";

export interface ChatImage {
  dataUrl: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
  timestamp: number;
}

export interface OrchestratorTask {
  id: string;
  title: string;
  description: string;
  agentProfileId: string;
  status: "pending" | "running" | "completed" | "failed";
  priority: number;
  dependencies: string[];
  paneId: string | null;
  tabId: string | null;
}

export interface OrchestratorSession {
  id: string;
  name: string;
  messages: ChatMessage[];
  tasks: OrchestratorTask[];
  createdAt: number;
  status: "planning" | "executing" | "completed";
  projectDir?: string;
}

interface OrchestratorStore {
  sessions: OrchestratorSession[];
  activeSessionId: string | null;

  createSession: (name: string) => string;
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, role: "user" | "assistant", content: string, images?: ChatImage[]) => void;
  setTasks: (sessionId: string, tasks: Omit<OrchestratorTask, "id" | "status" | "paneId" | "tabId">[]) => void;
  updateTaskStatus: (sessionId: string, taskId: string, status: OrchestratorTask["status"], paneId?: string, tabId?: string) => void;
  setSessionStatus: (sessionId: string, status: OrchestratorSession["status"]) => void;
  setProjectDir: (sessionId: string, projectDir: string) => void;
  getActiveSession: () => OrchestratorSession | undefined;
  getDispatchableTasks: (sessionId: string) => OrchestratorTask[];
  deleteSession: (id: string) => void;
}

function loadSessions(): OrchestratorSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSessions(sessions: OrchestratorSession[]) {
  const trimmed = sessions.slice(-20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

let taskCounter = 0;

export const useOrchestratorStore = create<OrchestratorStore>((set, get) => ({
  sessions: loadSessions(),
  activeSessionId: null,

  createSession: (name) => {
    const id = `orch-${Date.now()}`;
    const session: OrchestratorSession = {
      id,
      name,
      messages: [],
      tasks: [],
      createdAt: Date.now(),
      status: "planning",
    };
    set((state) => {
      const updated = [...state.sessions, session];
      persistSessions(updated);
      return { sessions: updated, activeSessionId: id };
    });
    return id;
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  addMessage: (sessionId, role, content, images) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: [...s.messages, {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role,
            content,
            ...(images && images.length > 0 ? { images } : {}),
            timestamp: Date.now(),
          }],
        };
      });
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  setTasks: (sessionId, rawTasks) => {
    const tasks: OrchestratorTask[] = rawTasks.map((t) => ({
      ...t,
      id: `task-${++taskCounter}`,
      status: "pending" as const,
      paneId: null,
      tabId: null,
    }));
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, tasks };
      });
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  updateTaskStatus: (sessionId, taskId, status, paneId, tabId) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const tasks = s.tasks.map((t) => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            status,
            paneId: paneId ?? t.paneId,
            tabId: tabId ?? t.tabId,
          };
        });
        const allDone = tasks.every((t) => t.status === "completed" || t.status === "failed");
        return { ...s, tasks, status: allDone ? "completed" as const : s.status };
      });
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  setSessionStatus: (sessionId, status) => {
    set((state) => {
      const updated = state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status } : s
      );
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  setProjectDir: (sessionId, projectDir) => {
    set((state) => {
      const updated = state.sessions.map((s) =>
        s.id === sessionId ? { ...s, projectDir } : s
      );
      persistSessions(updated);
      return { sessions: updated };
    });
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId);
  },

  getDispatchableTasks: (sessionId) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return [];
    return session.tasks
      .filter((t) => t.status === "pending")
      .filter((t) => {
        const deps = t.dependencies ?? [];
        return deps.every((depTitle) =>
          session.tasks.find((d) => d.title === depTitle)?.status === "completed"
        );
      })
      .sort((a, b) => a.priority - b.priority);
  },

  deleteSession: (id) => {
    set((state) => {
      const updated = state.sessions.filter((s) => s.id !== id);
      persistSessions(updated);
      return {
        sessions: updated,
        activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
      };
    });
  },
}));

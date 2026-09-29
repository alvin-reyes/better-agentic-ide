import { create } from "zustand";
import { readJson } from "../lib/storage";

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
  createSession: (name: string) => string;
  addMessage: (sessionId: string, role: "user" | "assistant", content: string, images?: ChatImage[]) => void;
  setTasks: (sessionId: string, tasks: Omit<OrchestratorTask, "id" | "status" | "paneId" | "tabId">[]) => void;
  updateTaskStatus: (sessionId: string, taskId: string, status: OrchestratorTask["status"], paneId?: string, tabId?: string) => void;
  setSessionStatus: (sessionId: string, status: OrchestratorSession["status"]) => void;
  setProjectDir: (sessionId: string, projectDir: string) => void;
  getDispatchableTasks: (sessionId: string) => OrchestratorTask[];
}

const MAX_SESSIONS = 20;

function persistSessions(sessions: OrchestratorSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
}

let taskCounter = 0;

export const useOrchestratorStore = create<OrchestratorStore>((set, get) => {
  const updateSession = (id: string, fn: (s: OrchestratorSession) => OrchestratorSession) =>
    set((state) => {
      const sessions = state.sessions.map((s) => (s.id === id ? fn(s) : s));
      persistSessions(sessions);
      return { sessions };
    });

  return {
    sessions: readJson<OrchestratorSession[]>(STORAGE_KEY, []),

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
        const sessions = [...state.sessions, session].slice(-MAX_SESSIONS);
        persistSessions(sessions);
        return { sessions };
      });
      return id;
    },

    addMessage: (sessionId, role, content, images) =>
      updateSession(sessionId, (s) => ({
        ...s,
        messages: [...s.messages, {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role,
          content,
          ...(images && images.length > 0 ? { images } : {}),
          timestamp: Date.now(),
        }],
      })),

    setTasks: (sessionId, rawTasks) => {
      const tasks: OrchestratorTask[] = rawTasks.map((t) => ({
        ...t,
        id: `task-${++taskCounter}`,
        status: "pending",
        paneId: null,
        tabId: null,
      }));
      updateSession(sessionId, (s) => ({ ...s, tasks }));
    },

    updateTaskStatus: (sessionId, taskId, status, paneId, tabId) =>
      updateSession(sessionId, (s) => {
        const tasks = s.tasks.map((t) =>
          t.id === taskId ? { ...t, status, paneId: paneId ?? t.paneId, tabId: tabId ?? t.tabId } : t,
        );
        const allDone = tasks.every((t) => t.status === "completed" || t.status === "failed");
        return { ...s, tasks, status: allDone ? "completed" : s.status };
      }),

    setSessionStatus: (sessionId, status) => updateSession(sessionId, (s) => ({ ...s, status })),

    setProjectDir: (sessionId, projectDir) => updateSession(sessionId, (s) => ({ ...s, projectDir })),

    getDispatchableTasks: (sessionId) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session) return [];
      return session.tasks
        .filter((t) => t.status === "pending")
        .filter((t) =>
          (t.dependencies ?? []).every((depTitle) =>
            session.tasks.find((d) => d.title === depTitle)?.status === "completed"
          )
        )
        .sort((a, b) => a.priority - b.priority);
    },
  };
});

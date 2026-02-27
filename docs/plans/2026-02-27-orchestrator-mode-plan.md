# Orchestrator Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Orchestrator Mode — a new tab type where users chat with Claude (Anthropic API) to plan a project, the AI breaks it into tasks, and ADE dispatches agents in parallel terminal tabs.

**Architecture:** Orchestrator is a special tab type (`type: "orchestrator"`) in the existing tab system. It renders a two-column layout (chat + backlog) instead of terminal panes. Chat is powered by `@anthropic-ai/sdk`. Tasks are extracted via Claude tool_use and stored in a new Zustand store. Dispatch creates terminal tabs per task with the correct agent profile.

**Tech Stack:** React 19, TypeScript, Zustand, @anthropic-ai/sdk, Tailwind CSS v4

---

### Task 1: Install Anthropic SDK

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run: `npm install @anthropic-ai/sdk`

**Step 2: Verify it installed**

Run: `grep anthropic package.json`
Expected: `"@anthropic-ai/sdk": "^X.X.X"`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk dependency"
```

---

### Task 2: Add API Key to Settings Store

**Files:**
- Modify: `src/stores/settingsStore.ts:294-315` (Settings interface + store)

**Step 1: Add `anthropicApiKey` and `orchestratorModel` to the Settings interface**

Find the `Settings` interface (above line 294) and add:

```typescript
anthropicApiKey: string;
orchestratorModel: string;
```

**Step 2: Add setter methods to SettingsStore interface**

```typescript
setAnthropicApiKey: (key: string) => void;
setOrchestratorModel: (model: string) => void;
```

**Step 3: Add defaults in the store creation**

In the `create<SettingsStore>()` call, add defaults:

```typescript
anthropicApiKey: saved.anthropicApiKey ?? "",
orchestratorModel: saved.orchestratorModel ?? "claude-sonnet-4-20250514",
```

**Step 4: Add setter implementations**

```typescript
setAnthropicApiKey: (key) => {
  set({ anthropicApiKey: key });
  persistSettings(get());
},
setOrchestratorModel: (model) => {
  set({ orchestratorModel: model });
  persistSettings(get());
},
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat: add anthropic API key and model to settings store"
```

---

### Task 3: Add API Key UI to Settings Panel

**Files:**
- Modify: `src/components/SettingsPanel.tsx`

**Step 1: Add "AI API" tab to settings tabs**

Update the `settingsTab` type to include `"ai"`. Add a tab button for "AI API" alongside "Themes", "Terminal", "Workspace".

**Step 2: Add the AI API settings section**

When `settingsTab === "ai"`, render:

```tsx
<div>
  <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
    Anthropic API Key
  </label>
  <input
    type="password"
    value={anthropicApiKey}
    onChange={(e) => setAnthropicApiKey(e.target.value)}
    placeholder="sk-ant-..."
    style={{
      width: "100%",
      backgroundColor: "var(--bg-primary)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "8px 12px",
      fontSize: "13px",
      color: "var(--text-primary)",
      fontFamily: "monospace",
      marginTop: "6px",
    }}
  />
  <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
    Required for Orchestrator Mode. Get your key at console.anthropic.com
  </p>

  <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600, marginTop: "16px", display: "block" }}>
    Model
  </label>
  <select
    value={orchestratorModel}
    onChange={(e) => setOrchestratorModel(e.target.value)}
    style={{
      width: "100%",
      backgroundColor: "var(--bg-primary)",
      border: "1px solid var(--border)",
      borderRadius: "6px",
      padding: "8px 12px",
      fontSize: "13px",
      color: "var(--text-primary)",
      marginTop: "6px",
    }}
  >
    <option value="claude-sonnet-4-20250514">Claude Sonnet 4 (recommended)</option>
    <option value="claude-opus-4-20250514">Claude Opus 4</option>
  </select>
</div>
```

**Step 3: Update settingsTab type in settingsStore**

Change `settingsTab: "theme" | "terminal" | "workspace"` to `"theme" | "terminal" | "workspace" | "ai"`.

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/SettingsPanel.tsx src/stores/settingsStore.ts
git commit -m "feat: add AI API settings tab with API key and model selector"
```

---

### Task 4: Create Orchestrator Store

**Files:**
- Create: `src/stores/orchestratorStore.ts`

**Step 1: Create the store file**

```typescript
import { create } from "zustand";

const STORAGE_KEY = "better-terminal-orchestrator";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
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
}

interface OrchestratorStore {
  sessions: OrchestratorSession[];
  activeSessionId: string | null;

  createSession: (name: string) => string;
  setActiveSession: (id: string) => void;
  addMessage: (sessionId: string, role: "user" | "assistant", content: string) => void;
  setTasks: (sessionId: string, tasks: Omit<OrchestratorTask, "id" | "status" | "paneId" | "tabId">[]) => void;
  updateTaskStatus: (sessionId: string, taskId: string, status: OrchestratorTask["status"], paneId?: string, tabId?: string) => void;
  setSessionStatus: (sessionId: string, status: OrchestratorSession["status"]) => void;
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

  addMessage: (sessionId, role, content) => {
    set((state) => {
      const updated = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: [...s.messages, {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role,
            content,
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
        // Check if all tasks are done
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
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/stores/orchestratorStore.ts
git commit -m "feat: add orchestrator store with session, task, and message management"
```

---

### Task 5: Extend Tab Store for Orchestrator Tabs

**Files:**
- Modify: `src/stores/tabStore.ts:24-29` (Tab interface)

**Step 1: Add optional fields to Tab interface**

```typescript
export interface Tab {
  id: string;
  name: string;
  type?: "terminal" | "orchestrator";
  orchestratorSessionId?: string;
  root: PaneNode;
  activePaneId: string;
}
```

**Step 2: Add `addOrchestratorTab` method to TabStore interface**

```typescript
addOrchestratorTab: (sessionId: string) => string;
```

**Step 3: Implement `addOrchestratorTab`**

```typescript
addOrchestratorTab: (sessionId) => {
  const id = newTabId();
  const pane = createDefaultPane();
  const tab: Tab = {
    id,
    name: "Orchestrator",
    type: "orchestrator",
    orchestratorSessionId: sessionId,
    root: { type: "pane", pane },
    activePaneId: pane.id,
  };
  set((state) => ({
    tabs: [...state.tabs, tab],
    activeTabId: id,
  }));
  return id;
},
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/stores/tabStore.ts
git commit -m "feat: add orchestrator tab type to tab store"
```

---

### Task 6: Create Anthropic API Helper

**Files:**
- Create: `src/lib/anthropic.ts`

**Step 1: Create the API helper**

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { useSettingsStore } from "../stores/settingsStore";

const CREATE_TASKS_TOOL = {
  name: "create_tasks" as const,
  description: "Break down the project plan into executable tasks for AI agents. Call this when you and the user have agreed on the plan.",
  input_schema: {
    type: "object" as const,
    properties: {
      tasks: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const, description: "Short task title" },
            description: { type: "string" as const, description: "Detailed task description including acceptance criteria for the agent to execute" },
            agentProfile: {
              type: "string" as const,
              enum: [
                "api-builder", "db-engineer", "auth-architect",
                "ui-builder", "style-architect", "state-manager",
                "unit-tester", "e2e-tester", "perf-tester",
                "debugger", "code-reviewer", "docs-writer", "system-architect",
              ],
              description: "Which agent profile should handle this task",
            },
            priority: { type: "number" as const, minimum: 1, maximum: 5, description: "1 = highest priority" },
            dependencies: {
              type: "array" as const,
              items: { type: "string" as const },
              description: "Titles of tasks that must complete before this one",
            },
          },
          required: ["title", "description", "agentProfile", "priority"],
        },
      },
    },
    required: ["tasks"],
  },
};

const SYSTEM_PROMPT = `You are a project planner inside ADE (Agentic Development Environment).

Your job is to help the user plan their project through conversation. Ask clarifying questions about requirements, architecture, constraints, and scope. Help them think through edge cases and trade-offs.

When you and the user have agreed on a solid plan, call the create_tasks tool to break it into discrete tasks. Each task should be:
- Self-contained enough for a single AI agent to execute
- Specific with clear acceptance criteria in the description
- Assigned to the most appropriate agent profile
- Ordered by priority (1 = do first)
- Dependencies listed if a task requires another to finish first

Available agent profiles:
- api-builder: REST/GraphQL API endpoints, routing, middleware
- db-engineer: Database schema, migrations, queries, ORM setup
- auth-architect: Authentication, authorization, JWT, OAuth
- ui-builder: React components, pages, layouts
- style-architect: CSS, Tailwind, responsive design, animations
- state-manager: State management, data flow, caching
- unit-tester: Unit tests, mocking, test utilities
- e2e-tester: End-to-end tests, integration tests
- debugger: Bug investigation, root cause analysis, fixes
- code-reviewer: Code review, refactoring, best practices
- docs-writer: Documentation, READMEs, API docs
- system-architect: System design, architecture decisions

Do NOT call create_tasks until the user confirms the plan. Ask first.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onTasksCreated: (tasks: Array<{
    title: string;
    description: string;
    agentProfile: string;
    priority: number;
    dependencies?: string[];
  }>) => void;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

export async function sendOrchestratorMessage(
  history: ChatTurn[],
  callbacks: StreamCallbacks,
) {
  const settings = useSettingsStore.getState();
  const apiKey = settings.anthropicApiKey;

  if (!apiKey) {
    callbacks.onError("No Anthropic API key set. Go to Settings → AI API to add one.");
    return;
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const response = await client.messages.create({
      model: settings.orchestratorModel || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [CREATE_TASKS_TOOL],
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });

    let fullText = "";

    for (const block of response.content) {
      if (block.type === "text") {
        fullText += block.text;
        callbacks.onText(block.text);
      } else if (block.type === "tool_use" && block.name === "create_tasks") {
        const input = block.input as { tasks: Array<{
          title: string;
          description: string;
          agentProfile: string;
          priority: number;
          dependencies?: string[];
        }> };
        callbacks.onTasksCreated(input.tasks);
        fullText += `\n\n[Created ${input.tasks.length} tasks]`;
      }
    }

    callbacks.onDone(fullText);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    callbacks.onError(message);
  }
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/anthropic.ts
git commit -m "feat: add anthropic API helper with orchestrator system prompt and create_tasks tool"
```

---

### Task 7: Create OrchestratorTab Component

**Files:**
- Create: `src/components/OrchestratorTab.tsx`

**Step 1: Create the main orchestrator tab component**

This is the full-area component that renders when a tab has `type: "orchestrator"`. It has two columns: chat (left) and backlog (right).

```typescript
import { useState, useRef, useEffect, useCallback } from "react";
import { useOrchestratorStore, type OrchestratorTask } from "../stores/orchestratorStore";
import { useTabStore } from "../stores/tabStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { agentProfiles } from "../data/agentProfiles";
import { sendOrchestratorMessage, type ChatTurn } from "../lib/anthropic";
import { invoke } from "@tauri-apps/api/core";

interface OrchestratorTabProps {
  sessionId: string;
}

export default function OrchestratorTab({ sessionId }: OrchestratorTabProps) {
  const session = useOrchestratorStore((s) => s.sessions.find((sess) => sess.id === sessionId));
  const addMessage = useOrchestratorStore((s) => s.addMessage);
  const setTasks = useOrchestratorStore((s) => s.setTasks);
  const updateTaskStatus = useOrchestratorStore((s) => s.updateTaskStatus);
  const setSessionStatus = useOrchestratorStore((s) => s.setSessionStatus);
  const getDispatchableTasks = useOrchestratorStore((s) => s.getDispatchableTasks);
  const { addTab } = useTabStore();

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session?.messages, streamingText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming || !session) return;

    const userText = input.trim();
    setInput("");
    addMessage(sessionId, "user", userText);
    setStreaming(true);
    setStreamingText("");

    const history: ChatTurn[] = [
      ...session.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userText },
    ];

    await sendOrchestratorMessage(history, {
      onText: (text) => {
        setStreamingText((prev) => prev + text);
      },
      onTasksCreated: (tasks) => {
        setTasks(sessionId, tasks.map((t) => ({
          title: t.title,
          description: t.description,
          agentProfileId: t.agentProfile,
          priority: t.priority,
          dependencies: t.dependencies ?? [],
        })));
      },
      onDone: (fullText) => {
        addMessage(sessionId, "assistant", fullText);
        setStreaming(false);
        setStreamingText("");
      },
      onError: (error) => {
        addMessage(sessionId, "assistant", `Error: ${error}`);
        setStreaming(false);
        setStreamingText("");
      },
    });
  }, [input, streaming, session, sessionId, addMessage, setTasks]);

  const dispatchTask = useCallback(async (task: OrchestratorTask) => {
    const profile = agentProfiles.find((p) => p.id === task.agentProfileId);
    if (!profile) return;

    // Create a new tab for this agent
    addTab(`Agent: ${task.title}`);

    // Wait for PTY to be ready
    await new Promise((r) => setTimeout(r, 800));

    const ptyId = useTabStore.getState().getActivePtyId();
    if (ptyId === null) return;

    const activePane = useTabStore.getState().getActivePane();
    const tabId = useTabStore.getState().activeTabId;

    // Construct agent command with task description
    const escapedDesc = task.description.replace(/"/g, '\\"');
    const cmd = `claude "${profile.providers.claude} Your task: ${escapedDesc}"`;
    const data = Array.from(new TextEncoder().encode(cmd + "\r"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});

    // Track session
    if (activePane) {
      useAgentTrackerStore.getState().startSession(
        activePane.id,
        task.title,
        profile.icon,
        "claude",
      );
      updateTaskStatus(sessionId, task.id, "running", activePane.id, tabId);
    }

    setSessionStatus(sessionId, "executing");
  }, [sessionId, addTab, updateTaskStatus, setSessionStatus]);

  const dispatchAll = useCallback(async () => {
    const tasks = getDispatchableTasks(sessionId);
    for (const task of tasks) {
      await dispatchTask(task);
    }
  }, [sessionId, getDispatchableTasks, dispatchTask]);

  if (!session) return null;

  const statusColor = (status: OrchestratorTask["status"]) => {
    switch (status) {
      case "pending": return "var(--text-muted)";
      case "running": return "#22c55e";
      case "completed": return "#a855f7";
      case "failed": return "#ef4444";
    }
  };

  const statusLabel = (status: OrchestratorTask["status"]) => {
    switch (status) {
      case "pending": return "PENDING";
      case "running": return "RUNNING";
      case "completed": return "DONE";
      case "failed": return "FAILED";
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", backgroundColor: "var(--bg-primary)" }}>
      {/* Left: Chat */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid var(--border)" }}>
        {/* Chat header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span style={{ fontSize: "16px" }}>&#x1f3af;</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
            Orchestrator
          </span>
          <span style={{
            fontSize: "10px",
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: "3px",
            backgroundColor: session.status === "planning" ? "var(--accent-subtle)" : session.status === "executing" ? "rgba(34,197,94,0.15)" : "rgba(168,85,247,0.15)",
            color: session.status === "planning" ? "var(--accent)" : session.status === "executing" ? "#22c55e" : "#a855f7",
          }}>
            {session.status.toUpperCase()}
          </span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
          {session.messages.length === 0 && !streaming && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "60px 20px" }}>
              <p style={{ fontSize: "24px", marginBottom: "12px", opacity: 0.3 }}>&#x1f3af;</p>
              <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
                What do you want to build?
              </p>
              <p style={{ fontSize: "13px" }}>
                Describe your project and I'll help you plan it, then dispatch AI agents to build it.
              </p>
            </div>
          )}

          {session.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: 1.6,
                backgroundColor: msg.role === "user" ? "var(--accent-subtle)" : "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: `1px solid ${msg.role === "user" ? "rgba(88,166,255,0.2)" : "var(--border)"}`,
                whiteSpace: "pre-wrap",
              }}>
                {msg.content}
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", padding: "0 4px" }}>
                {msg.role === "user" ? "You" : "AI"}
              </span>
            </div>
          ))}

          {streaming && streamingText && (
            <div style={{ marginBottom: "16px", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: "12px",
                fontSize: "13px",
                lineHeight: 1.6,
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                whiteSpace: "pre-wrap",
              }}>
                {streamingText}
                <span style={{ display: "inline-block", width: "2px", height: "14px", background: "var(--accent)", animation: "blink 1s infinite", verticalAlign: "text-bottom", marginLeft: "2px" }}></span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Describe what you want to build..."
              rows={2}
              style={{
                flex: 1,
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "10px 14px",
                fontSize: "13px",
                color: "var(--text-primary)",
                resize: "none",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              style={{
                padding: "0 16px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: input.trim() && !streaming ? "var(--accent)" : "var(--bg-surface)",
                color: input.trim() && !streaming ? "#fff" : "var(--text-muted)",
                cursor: input.trim() && !streaming ? "pointer" : "default",
                fontSize: "13px",
                fontWeight: 600,
                alignSelf: "flex-end",
                height: "36px",
              }}
            >
              {streaming ? "..." : "Send"}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Backlog */}
      <div style={{ width: "340px", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-secondary)" }}>
        {/* Backlog header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
            Tasks ({session.tasks.length})
          </span>
          {session.tasks.length > 0 && session.tasks.some((t) => t.status === "pending") && (
            <button
              onClick={dispatchAll}
              style={{
                padding: "4px 12px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#22c55e",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Dispatch All
            </button>
          )}
        </div>

        {/* Task list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {session.tasks.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 16px", fontSize: "12px" }}>
              Tasks will appear here once the AI breaks down your plan.
            </div>
          )}

          {session.tasks.map((task) => {
            const profile = agentProfiles.find((p) => p.id === task.agentProfileId);
            return (
              <div
                key={task.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: `1px solid ${task.status === "running" ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                  backgroundColor: task.status === "running" ? "rgba(34,197,94,0.05)" : "var(--bg-tertiary)",
                  marginBottom: "6px",
                  cursor: task.status === "pending" ? "pointer" : "default",
                }}
                onClick={() => {
                  if (task.status === "pending") dispatchTask(task);
                  if (task.tabId) useTabStore.getState().setActiveTab(task.tabId);
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "14px" }}>{profile?.icon ?? "?"}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                    {task.title}
                  </span>
                  <span style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: "3px",
                    backgroundColor: statusColor(task.status) + "20",
                    color: statusColor(task.status),
                  }}>
                    {statusLabel(task.status)}
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.4, margin: 0 }}>
                  {task.description.slice(0, 120)}{task.description.length > 120 ? "..." : ""}
                </p>
                {task.dependencies.length > 0 && (
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px", fontFamily: "monospace" }}>
                    depends on: {task.dependencies.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        {session.tasks.length > 0 && (
          <div style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border)",
            fontSize: "10px",
            color: "var(--text-muted)",
            fontFamily: "monospace",
            display: "flex",
            gap: "12px",
          }}>
            <span>{session.tasks.filter((t) => t.status === "completed").length}/{session.tasks.length} done</span>
            <span>{session.tasks.filter((t) => t.status === "running").length} running</span>
            <span>{session.tasks.filter((t) => t.status === "pending").length} pending</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/OrchestratorTab.tsx
git commit -m "feat: add OrchestratorTab component with chat UI and task backlog"
```

---

### Task 8: Wire Orchestrator Tab into App

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/PaneContainer.tsx` or the rendering logic in App.tsx

**Step 1: Lazy-load OrchestratorTab**

In `App.tsx`, add:

```typescript
const OrchestratorTab = lazy(() => import("./components/OrchestratorTab"));
```

**Step 2: Update the tab content rendering**

In `App.tsx`, where `activeTab` renders either `TerminalPane` or `PaneContainer`, add orchestrator tab handling:

```typescript
{activeTab && (
  activeTab.type === "orchestrator" && activeTab.orchestratorSessionId
    ? <Suspense fallback={null}>
        <OrchestratorTab sessionId={activeTab.orchestratorSessionId} />
      </Suspense>
    : zoomedPane
      ? <TerminalPane paneId={activeTab.activePaneId} tabId={activeTab.id} />
      : <PaneContainer node={activeTab.root} tabId={activeTab.id} />
)}
```

**Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire OrchestratorTab into App with lazy loading"
```

---

### Task 9: Add Keyboard Shortcut and Command Palette Entry

**Files:**
- Modify: `src/hooks/useKeybindings.ts`
- Modify: `src/components/CommandPalette.tsx`
- Modify: `src/components/ShortcutsBar.tsx`
- Modify: `src/App.tsx` (add callback)

**Step 1: Add `openOrchestrator` callback in App.tsx**

```typescript
const openOrchestrator = useCallback(() => {
  import("./stores/orchestratorStore").then(({ useOrchestratorStore }) => {
    const sessionId = useOrchestratorStore.getState().createSession("New Project");
    useTabStore.getState().addOrchestratorTab(sessionId);
  });
}, []);
```

Pass `openOrchestrator` to `useKeybindings`.

**Step 2: Add keybinding for Cmd+Shift+O in useKeybindings.ts**

Add `openOrchestrator` to the `KeybindingActions` interface and handle:

```typescript
if (meta && shift && e.key === "o") {
  e.preventDefault();
  actions.openOrchestrator();
  return;
}
```

Add `"o"` and `"O"` to the xterm passthrough keys.

**Step 3: Add command palette entry in CommandPalette.tsx**

```typescript
{ id: "orchestrator", label: "Open Orchestrator", shortcut: "Cmd+Shift+O", category: "Panels", action: () => {
  import("../stores/orchestratorStore").then(({ useOrchestratorStore }) => {
    const sessionId = useOrchestratorStore.getState().createSession("New Project");
    useTabStore.getState().addOrchestratorTab(sessionId);
  });
  onClose();
}},
```

**Step 4: Add to ShortcutsBar.tsx**

```typescript
{ keys: "⌘ ⇧ O", action: "Orchestrator" }
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/App.tsx src/hooks/useKeybindings.ts src/components/CommandPalette.tsx src/components/ShortcutsBar.tsx
git commit -m "feat: add Cmd+Shift+O shortcut and command palette entry for orchestrator"
```

---

### Task 10: Wire Agent Completion Back to Orchestrator

**Files:**
- Modify: `src/hooks/useTerminal.ts` (idle transition handler)

**Step 1: Update `checkIdleTransition` to notify orchestrator store**

In the `.then()` block of the dynamic import in `checkIdleTransition`, after ending the agent session, also update the orchestrator task status:

```typescript
import("../stores/agentTrackerStore")
  .then(({ useAgentTrackerStore }) => {
    const session = useAgentTrackerStore.getState().getActiveSession(paneId);
    if (session) {
      useAgentTrackerStore.getState().endSession(paneId);
      sendNotification(`${session.agentIcon} ${session.agentName} finished`, "Agent completed its task");

      // Update orchestrator task status if this pane was dispatched
      import("../stores/orchestratorStore").then(({ useOrchestratorStore }) => {
        const store = useOrchestratorStore.getState();
        for (const orchSession of store.sessions) {
          const task = orchSession.tasks.find((t) => t.paneId === paneId && t.status === "running");
          if (task) {
            store.updateTaskStatus(orchSession.id, task.id, "completed");
            break;
          }
        }
      }).catch(() => {});
    }
  })
  .catch(() => {})
  .finally(() => {
    idleCheckInFlight.delete(paneId);
  });
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useTerminal.ts
git commit -m "feat: wire agent completion back to orchestrator task status"
```

---

### Task 11: Integration Test

**Step 1: Build and run the app**

Run: `export PATH="$HOME/.cargo/bin:$PATH" && npm run tauri dev`

**Step 2: Manual test checklist**

- [ ] Open Settings → AI API tab → enter Anthropic API key
- [ ] Press `Cmd+Shift+O` → Orchestrator tab opens
- [ ] Type a project description → AI responds in chat
- [ ] AI asks clarifying questions → answer them
- [ ] AI calls create_tasks → tasks appear in backlog
- [ ] Click "Dispatch All" → new terminal tabs created per task
- [ ] Agents run in parallel → tasks show RUNNING status
- [ ] Agents finish → tasks update to DONE
- [ ] Click back to Orchestrator tab → see updated progress

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: orchestrator mode — AI chat, task backlog, parallel agent dispatch"
```

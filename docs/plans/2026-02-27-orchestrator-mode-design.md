# Orchestrator Mode — Design Document

**Status:** Approved
**Date:** 2026-02-27

## Goal

Add Orchestrator Mode to ADE — a new tab type where users chat with Claude (via Anthropic API) to plan a project, the AI breaks it down into tasks, and ADE dispatches AI agents in parallel terminal tabs to execute each task.

## Architecture

Orchestrator Mode is a **special tab type** in the existing tab system. It renders a full-area two-column layout instead of a terminal pane:

- **Left column**: Chat interface powered by the Anthropic API
- **Right column**: Task backlog with dispatch controls

When tasks are dispatched, new terminal tabs are created with the correct agent profile per task. Status flows back via the existing idle detection system.

```
┌─────────────────────────────────────────────────┐
│ TabBar                                          │
│ [Orchestrator] [Agent: Auth] [Agent: API] [...]│
├─────────────────────────────────────────────────┤
│  ┌──────────────┬──────────────────────────┐   │
│  │  Chat        │  Backlog / Tasks         │   │
│  │              │                          │   │
│  │  You: build  │  □ Set up JWT auth       │   │
│  │  an auth     │  □ Create API endpoints  │   │
│  │  system...   │  □ Write unit tests      │   │
│  │              │  ■ Add database schema   │   │
│  │  AI: I'll    │                          │   │
│  │  break that  │  [Dispatch All]          │   │
│  │  down...     │                          │   │
│  └──────────────┴──────────────────────────┘   │
├─────────────────────────────────────────────────┤
│ ShortcutsBar                                    │
└─────────────────────────────────────────────────┘
```

## Data Flow

1. User opens Orchestrator (`Cmd+Shift+O`) → creates tab with `type: "orchestrator"`
2. User chats with Claude via Anthropic SDK (API key from settings)
3. AI system prompt guides spec formation, asks clarifying questions
4. When plan is ready, AI calls `create_tasks` tool with structured JSON
5. Tasks populate the backlog panel in the orchestrator tab
6. User clicks "Dispatch All" or selects specific tasks
7. For each dispatched task:
   - `addTab()` creates a named terminal tab
   - Agent command constructed from task description + agent profile
   - Command sent to PTY, agent session tracked
8. Existing idle detection marks agents as done → updates task status
9. Orchestrator tab shows live progress across all tasks

## Components

### OrchestratorTab (`src/components/OrchestratorTab.tsx`)

New component rendered when `tab.type === "orchestrator"`. Two-column layout:

- Left: `OrchestratorChat` — message list, input box, send button
- Right: `OrchestratorBacklog` — task list with status badges, dispatch controls

### OrchestratorChat

- Renders chat messages (user + assistant) in a scrollable list
- Input area at bottom with send button
- Shows typing indicator while AI responds
- Messages stored in `orchestratorStore`

### OrchestratorBacklog

- Lists tasks extracted from AI tool calls
- Each task shows: title, description, assigned agent, priority, status badge
- Status badges: PENDING (gray), RUNNING (green pulse), DONE (purple), FAILED (red)
- "Dispatch All" button, or click individual tasks to dispatch
- Click a running/done task to jump to its terminal tab

### Anthropic API Integration

- Uses `@anthropic-ai/sdk` (new dependency)
- API key stored in `settingsStore`, entered in Settings panel
- Model: `claude-sonnet-4-20250514` (default), configurable
- System prompt guides the AI through spec formation
- `create_tasks` tool defined for structured task extraction

## Store Design

### orchestratorStore (`src/stores/orchestratorStore.ts`)

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface OrchestratorTask {
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

interface OrchestratorSession {
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
  addMessage: (sessionId: string, message: ChatMessage) => void;
  setTasks: (sessionId: string, tasks: OrchestratorTask[]) => void;
  updateTaskStatus: (sessionId: string, taskId: string, status, paneId?, tabId?) => void;
  getActiveSession: () => OrchestratorSession | undefined;
}
```

Persisted to localStorage. Last 20 sessions kept.

## AI Tool Definition

```typescript
const createTasksTool = {
  name: "create_tasks",
  description: "Break down the project plan into executable tasks for AI agents. Call this when you and the user have agreed on the plan.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short task title" },
            description: { type: "string", description: "Detailed task description for the agent" },
            agentProfile: {
              type: "string",
              enum: ["api-builder", "db-engineer", "auth-architect", "ui-builder",
                     "style-architect", "state-manager", "unit-tester", "e2e-tester",
                     "debugger", "code-reviewer", "docs-writer", "system-architect"],
              description: "Which agent profile should handle this task"
            },
            priority: { type: "number", minimum: 1, maximum: 5, description: "1 = highest priority" },
            dependencies: {
              type: "array",
              items: { type: "string" },
              description: "Titles of tasks that must complete before this one"
            }
          },
          required: ["title", "description", "agentProfile", "priority"]
        }
      }
    },
    required: ["tasks"]
  }
};
```

## AI System Prompt

```
You are a project planner inside ADE (Agentic Development Environment).

Your job is to help the user plan their project through conversation. Ask clarifying
questions about requirements, architecture, constraints, and scope. Help them think
through edge cases and trade-offs.

When you and the user have agreed on a solid plan, call the create_tasks tool to
break it into discrete tasks. Each task should be:
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

Do NOT call create_tasks until the user confirms the plan. Ask first.
```

## Dispatch Logic

```typescript
async function dispatchTasks(session: OrchestratorSession) {
  const pendingTasks = session.tasks
    .filter(t => t.status === "pending")
    .filter(t => {
      // Check dependencies are completed
      const deps = t.dependencies ?? [];
      return deps.every(depTitle =>
        session.tasks.find(d => d.title === depTitle)?.status === "completed"
      );
    })
    .sort((a, b) => a.priority - b.priority);

  for (const task of pendingTasks) {
    // 1. Find the agent profile
    const profile = agentProfiles.find(p => p.id === task.agentProfileId);

    // 2. Create a new tab
    const tabId = addTab(`Agent: ${task.title}`);

    // 3. Wait for PTY to be ready (short delay)
    await new Promise(r => setTimeout(r, 500));

    // 4. Construct and send the agent command
    const cmd = `claude "${profile.providers.claude} Task: ${task.description}"`;
    const ptyId = getActivePtyId();
    await invoke("write_pty", { id: ptyId, data: encode(cmd + "\r") });

    // 5. Track the session
    startSession(paneId, task.title, profile.icon, "claude");
    updateTaskStatus(session.id, task.id, "running", paneId, tabId);
  }
}
```

Tasks with unmet dependencies wait. When a dependency completes (detected by idle transition), the orchestrator checks for newly unblocked tasks and dispatches them automatically.

## Tab Store Changes

Add an optional `type` field to the Tab interface:

```typescript
interface Tab {
  id: string;
  name: string;
  type?: "terminal" | "orchestrator";  // default: "terminal"
  root: PaneNode;
  activePaneId: string;
  orchestratorSessionId?: string;      // links to orchestratorStore
}
```

In `App.tsx` / `PaneContainer`, check `tab.type`:
- `"terminal"` (default) → render terminal panes as usual
- `"orchestrator"` → render `<OrchestratorTab sessionId={tab.orchestratorSessionId} />`

## Settings Integration

New "AI API" section in SettingsPanel:

- **API Key** — text input (masked), stored in settingsStore
- **Model** — dropdown: claude-sonnet-4-20250514 (default), claude-opus-4-20250514
- Key validated on save with a test API call

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+O` | Open new Orchestrator tab |

Added to `useKeybindings.ts`, `CommandPalette.tsx`, and `ShortcutsBar.tsx`.

## New Dependencies

- `@anthropic-ai/sdk` — Anthropic API client

## Key Design Decisions

- **Tab-based**: Orchestrator is a tab, not a modal or separate window. Fits the existing UX pattern.
- **Anthropic API direct**: Uses the SDK instead of CLI for structured tool calls and chat UI control.
- **Parallel dispatch**: Tasks without dependencies launch simultaneously in separate tabs.
- **Dependency-aware**: Tasks with dependencies auto-dispatch when predecessors complete.
- **Session persistence**: Orchestrator sessions saved to localStorage for review/resume.

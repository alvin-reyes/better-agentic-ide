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
                "unit-tester", "e2e-tester",
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

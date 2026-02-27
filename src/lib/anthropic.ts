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
                "backend-api", "backend-db", "backend-auth",
                "frontend-ui", "frontend-css", "frontend-state",
                "test-unit", "test-e2e", "test-perf",
                "general-debug", "general-review", "general-docs", "general-architect",
                "devops-docker", "devops-ci", "devops-infra", "devops-k8s",
                "general-git", "general-brainstorm",
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
- backend-api: REST/GraphQL API endpoints, routing, middleware
- backend-db: Database schema, migrations, queries, ORM setup
- backend-auth: Authentication, authorization, JWT, OAuth
- frontend-ui: React components, pages, layouts
- frontend-css: CSS, Tailwind, responsive design, animations
- frontend-state: State management, data flow, caching
- test-unit: Unit tests, mocking, test utilities
- test-e2e: End-to-end tests, integration tests
- test-perf: Performance testing, benchmarks
- general-debug: Bug investigation, root cause analysis, fixes
- general-review: Code review, refactoring, best practices
- general-docs: Documentation, READMEs, API docs
- general-architect: System design, architecture decisions
- general-git: Git workflows, branching, merging
- general-brainstorm: Brainstorming, ideation, planning
- devops-docker: Docker, containerization
- devops-ci: CI/CD pipelines
- devops-infra: Infrastructure, deployment
- devops-k8s: Kubernetes orchestration

Do NOT call create_tasks until the user confirms the plan. Ask first.`;

export interface ChatImage {
  dataUrl: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onTasksCreated: (tasks: Array<{
    title: string;
    description: string;
    agentProfile: string;
    priority: number;
    dependencies?: string[];
  }>) => void | Promise<void>;
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
      model: settings.orchestratorModel || "claude-opus-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [CREATE_TASKS_TOOL],
      messages: history.map((m) => {
        if (m.role === "user" && m.images && m.images.length > 0) {
          type MediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";
          const content: Array<
            | { type: "text"; text: string }
            | { type: "image"; source: { type: "base64"; media_type: MediaType; data: string } }
          > = [];
          for (const img of m.images) {
            const base64 = img.dataUrl.split(",")[1];
            content.push({
              type: "image",
              source: { type: "base64", media_type: img.mediaType as MediaType, data: base64 },
            });
          }
          if (m.content.trim()) {
            content.push({ type: "text", text: m.content });
          }
          return { role: m.role, content };
        }
        return { role: m.role, content: m.content };
      }),
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
        await callbacks.onTasksCreated(input.tasks);
        fullText += `\n\n[Created ${input.tasks.length} tasks]`;
      }
    }

    callbacks.onDone(fullText);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    callbacks.onError(message);
  }
}

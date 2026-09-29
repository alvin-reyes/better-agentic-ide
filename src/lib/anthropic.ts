import Anthropic from "@anthropic-ai/sdk";
import { useSettingsStore } from "../stores/settingsStore";
import type { ChatImage } from "../stores/orchestratorStore";
import { AGENT_PROFILES } from "../data/agentProfiles";

const PROFILE_IDS = AGENT_PROFILES.map((p) => p.id);

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
              enum: PROFILE_IDS,
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

const SYSTEM_PROMPT_OLLAMA = `You are a project planner inside ADE (Agentic Development Environment).

Your job is to help the user plan their project through conversation. Ask clarifying questions about requirements, architecture, constraints, and scope.

When you and the user have agreed on a solid plan, output the tasks as a JSON code block. Format:

\`\`\`json
{
  "tasks": [
    {
      "title": "Short task title",
      "description": "Detailed description with acceptance criteria",
      "agentProfile": "backend-api",
      "priority": 1,
      "dependencies": []
    }
  ]
}
\`\`\`

Available agent profiles: ${PROFILE_IDS.join(", ")}.

Do NOT output tasks until the user confirms the plan. Ask first.`;

const SYSTEM_PROMPT = `You are a project planner inside ADE (Agentic Development Environment).

Your job is to help the user plan their project through conversation. Ask clarifying questions about requirements, architecture, constraints, and scope. Help them think through edge cases and trade-offs.

When you and the user have agreed on a solid plan, call the create_tasks tool to break it into discrete tasks. Each task should be:
- Self-contained enough for a single AI agent to execute
- Specific with clear acceptance criteria in the description
- Assigned to the most appropriate agent profile
- Ordered by priority (1 = do first)
- Dependencies listed if a task requires another to finish first

Available agent profiles:
${AGENT_PROFILES.map((p) => `- ${p.id}: ${p.description}`).join("\n")}

Do NOT call create_tasks until the user confirms the plan. Ask first.`;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  images?: ChatImage[];
}

interface PlannedTask {
  title: string;
  description: string;
  agentProfile: string;
  priority: number;
  dependencies?: string[];
}

interface StreamCallbacks {
  onText: (text: string) => void;
  onTasksCreated: (tasks: PlannedTask[]) => void | Promise<void>;
  onDone: (fullText: string) => void;
  onError: (error: string) => void;
}

async function sendOllamaOrchestratorMessage(
  history: ChatTurn[],
  callbacks: StreamCallbacks,
) {
  const settings = useSettingsStore.getState();
  const endpoint = settings.ollamaEndpoint || "http://localhost:11434";
  const model = settings.ollamaModel || "deepseek-r1";

  const messages = [
    { role: "system", content: SYSTEM_PROMPT_OLLAMA },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  try {
    const resp = await fetch(`${endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => resp.statusText);
      callbacks.onError(`Ollama error (${resp.status}): ${errText}`);
      return;
    }

    const data = await resp.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";

    callbacks.onText(content);

    // Parse JSON task blocks from the response
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          await callbacks.onTasksCreated(parsed.tasks);
        }
      } catch {
        // Model output wasn't valid JSON — that's fine, just show text
      }
    }

    callbacks.onDone(content);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
      callbacks.onError(`Cannot connect to Ollama at ${endpoint}. Is Ollama running? Start it with: ollama serve`);
    } else {
      callbacks.onError(message);
    }
  }
}

export async function sendOrchestratorMessage(
  history: ChatTurn[],
  callbacks: StreamCallbacks,
) {
  const settings = useSettingsStore.getState();

  if (settings.orchestratorProvider === "ollama") {
    return sendOllamaOrchestratorMessage(history, callbacks);
  }

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
          const content: Array<
            | { type: "text"; text: string }
            | { type: "image"; source: { type: "base64"; media_type: ChatImage["mediaType"]; data: string } }
          > = m.images.map((img) => ({
            type: "image",
            source: { type: "base64", media_type: img.mediaType, data: img.dataUrl.split(",")[1] },
          }));
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
        const input = block.input as { tasks: PlannedTask[] };
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

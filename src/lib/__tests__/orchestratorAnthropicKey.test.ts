import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** The mock keychain; a missing name rejects with "not found". */
  vault: new Map<string, string>(),
  /** Make every vault_get reject with this message. */
  getRejects: null as string | null,
  gets: [] as string[],
  /** Options each SDK client was built with. */
  clients: [] as Record<string, unknown>[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    if (cmd !== "vault_get") throw new Error(`unexpected command: ${cmd}`);
    h.gets.push(args.name as string);
    if (h.getRejects) throw h.getRejects;
    const v = h.vault.get(args.name as string);
    if (v === undefined) throw "not found";
    return v;
  }),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: vi.fn(async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "planned" }] })),
    };
    constructor(opts: Record<string, unknown>) {
      h.clients.push(opts);
    }
  },
}));

import { sendOrchestratorMessage } from "../anthropic";
import { useSettingsStore } from "../../stores/settingsStore";

const NAME = "ADE_ORCHESTRATOR_ANTHROPIC_KEY";
const NO_KEY = "No Anthropic API key set. Go to Settings → AI API to add one.";

const callbacks = () => ({
  onText: vi.fn(),
  onTasksCreated: vi.fn(),
  onDone: vi.fn(),
  onError: vi.fn(),
});

const send = async () => {
  const cb = callbacks();
  await sendOrchestratorMessage([{ role: "user", content: "plan it" }], cb);
  return cb;
};

beforeEach(() => {
  h.vault.clear();
  h.getRejects = null;
  h.gets.length = 0;
  h.clients.length = 0;
  localStorage.clear();
  useSettingsStore.setState({ orchestratorProvider: "anthropic", orchestratorModel: "claude-opus-5" });
});

describe("the Orchestrator's Anthropic key comes from the vault", () => {
  it("B8: reads ADE_ORCHESTRATOR_ANTHROPIC_KEY and hands it to the SDK client", async () => {
    h.vault.set(NAME, "sk-ant-VAULT");
    const cb = await send();
    expect(h.gets).toEqual([NAME]);
    expect(h.clients).toHaveLength(1);
    expect(h.clients[0].apiKey).toBe("sk-ant-VAULT");
    expect(h.clients[0].baseURL).toBeUndefined();
    expect(cb.onError).not.toHaveBeenCalled();
    expect(cb.onDone).toHaveBeenCalledWith("planned");
  });

  it("B9: no entry gives the missing-key copy and never calls the SDK", async () => {
    const cb = await send();
    expect(cb.onError).toHaveBeenCalledWith(NO_KEY);
    expect(h.clients).toHaveLength(0);
  });

  it("B9: an empty value gives the missing-key copy and never calls the SDK", async () => {
    h.vault.set(NAME, "");
    const cb = await send();
    expect(cb.onError).toHaveBeenCalledWith(NO_KEY);
    expect(h.clients).toHaveLength(0);
  });

  it("B9: no fallback to ANTHROPIC_API_KEY in the vault, nor to a plain-text copy in settings", async () => {
    h.vault.set("ANTHROPIC_API_KEY", "sk-ant-TERMINAL");
    localStorage.setItem("better-terminal-settings", JSON.stringify({ anthropicApiKey: "sk-ant-PLAIN" }));
    useSettingsStore.setState({ anthropicApiKey: "sk-ant-PLAIN" } as never);
    const cb = await send();
    expect(h.gets).toEqual([NAME]);
    expect(cb.onError).toHaveBeenCalledWith(NO_KEY);
    expect(h.clients).toHaveLength(0);
  });

  it("B9: a keychain error is passed on as the vault's own message", async () => {
    h.getRejects = "The system keychain isn't available: locked";
    const cb = await send();
    expect(cb.onError).toHaveBeenCalledWith("The system keychain isn't available: locked");
    expect(h.clients).toHaveLength(0);
  });
});

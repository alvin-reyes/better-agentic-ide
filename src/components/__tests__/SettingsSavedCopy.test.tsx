import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/** Item 8: the stranded plain-text key is offered for removal whatever the Orchestrator provider. */
const h = vi.hoisted(() => ({ savedCopy: true }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "vault_list") return [];
    throw new Error(`not under Tauri: ${cmd}`);
  }),
}));

vi.mock("../../lib/anthropicKey", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/anthropicKey")>()),
  lastMoveFailure: () => ({ reason: "The system keychain isn't available: no Secret Service", keyInVault: false }),
  lastMoveError: () => "The system keychain isn't available: no Secret Service",
  hasSavedCopy: () => h.savedCopy,
}));

import SettingsPanel from "../SettingsPanel";
import { useSettingsStore } from "../../stores/settingsStore";

beforeEach(() => {
  h.savedCopy = true;
  useSettingsStore.setState({ showSettings: true, settingsTab: "ai" });
});

describe("item 8: Settings → AI API shows the saved copy for every provider", () => {
  it.each(["anthropic", "deepseek", "ollama"] as const)("with %s", async (provider) => {
    useSettingsStore.setState({ orchestratorProvider: provider });
    render(<SettingsPanel />);
    expect(await screen.findByRole("button", { name: "Remove the saved copy" })).toBeTruthy();
    expect(screen.getAllByText(/no Secret Service/)).toHaveLength(1);
  });

  it("not at all without a saved copy", async () => {
    h.savedCopy = false;
    useSettingsStore.setState({ orchestratorProvider: "deepseek" });
    render(<SettingsPanel />);
    await screen.findByText(/Choose which AI provider powers the Orchestrator/);
    expect(screen.queryByRole("button", { name: "Remove the saved copy" })).toBeNull();
  });
});

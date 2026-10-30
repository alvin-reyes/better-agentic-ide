import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  /** What `vault_list` answers: the names, with `inTerminals` computed by the vault. */
  secrets: [] as { name: string; note: string; updatedAt: number; inTerminals: boolean }[],
  sets: [] as Record<string, unknown>[],
  /** Names the mock vault keeps out of terminals, as `APP_ONLY` does in Rust. */
  appOnly: [] as string[],
  /** Make `vault_list` reject, as a keychain or index read failure would. */
  listFails: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "vault_list":
        if (tauri.listFails) throw new Error("index unreadable");
        return tauri.secrets;
      case "vault_set": {
        tauri.sets.push(args);
        // As the vault does: the index gains the name, `inTerminals` is computed.
        const name = args.name as string;
        tauri.secrets = [
          ...tauri.secrets.filter((s) => s.name !== name),
          { name, note: "", updatedAt: 2, inTerminals: !tauri.appOnly.includes(name) },
        ];
        return null;
      }
      case "check_command_exists":
        throw new Error("not installed");
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import IntegrationsPanel from "../IntegrationsPanel";

const APP_ONLY = "ADE_ORCHESTRATOR_ANTHROPIC_KEY";

const renderSecrets = () => render(<IntegrationsPanel cwd={null} initialTab="secrets" onClose={vi.fn()} />);
const row = (name: string) => screen.getByText(name, { selector: "code" }).closest("li") as HTMLElement;

const save = async (name: string) => {
  fireEvent.change(screen.getByLabelText("Secret name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "v" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(tauri.sets).toHaveLength(1));
};

beforeEach(() => {
  tauri.secrets = [];
  tauri.sets.length = 0;
  tauri.appOnly = [APP_ONLY];
  tauri.listFails = false;
});

describe("the Secrets tab and app-only secrets", () => {
  it("marks a row the vault keeps out of terminals, and only that row", async () => {
    tauri.secrets = [
      { name: APP_ONLY, note: "", updatedAt: 1, inTerminals: false },
      { name: "GITHUB_TOKEN", note: "", updatedAt: 1, inTerminals: true },
    ];
    renderSecrets();
    await screen.findByText(APP_ONLY, { selector: "code" });
    expect(within(row(APP_ONLY)).getByText(/Not in terminals/)).toBeTruthy();
    expect(within(row("GITHUB_TOKEN")).queryByText(/Not in terminals/)).toBeNull();
  });

  it("says terminals don't get an app-only secret once it's saved, even a new one", async () => {
    renderSecrets();
    await screen.findByText(/No secrets yet/);
    await save(APP_ONLY);
    expect(await screen.findByText(`${APP_ONLY} saved to the system keychain. ADE uses it; terminals don't get it.`)).toBeTruthy();
    expect(screen.queryByText(/Terminals you open from now on have it/)).toBeNull();
  });

  it("says new terminals have any other secret once it's saved", async () => {
    renderSecrets();
    await save("GITHUB_TOKEN");
    expect(await screen.findByText("GITHUB_TOKEN saved to the system keychain. Terminals you open from now on have it.")).toBeTruthy();
  });

  it("says new terminals have another secret even when an app-only one is already saved", async () => {
    tauri.secrets = [{ name: APP_ONLY, note: "", updatedAt: 1, inTerminals: false }];
    renderSecrets();
    await screen.findByText(APP_ONLY, { selector: "code" });
    await save("GITHUB_TOKEN");
    expect(await screen.findByText("GITHUB_TOKEN saved to the system keychain. Terminals you open from now on have it.")).toBeTruthy();
    expect(screen.queryByText(/terminals don't get it/)).toBeNull();
  });

  it("takes the app-only notice from the vault's answer, not from the name", async () => {
    tauri.appOnly = ["FOO_KEY"];
    renderSecrets();
    await screen.findByText(/No secrets yet/);
    await save("FOO_KEY");
    expect(await screen.findByText("FOO_KEY saved to the system keychain. ADE uses it; terminals don't get it.")).toBeTruthy();
  });

  it("still says the save worked when the list can't be read back", async () => {
    renderSecrets();
    await screen.findByText(/No secrets yet/);
    tauri.listFails = true;
    await save("GITHUB_TOKEN");
    expect(await screen.findByText("GITHUB_TOKEN saved to the system keychain.")).toBeTruthy();
    expect(screen.queryByText(/Terminals you open from now on have it|terminals don't get it/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names the exception in the footer", async () => {
    renderSecrets();
    const foot = await screen.findByText(/Values live in your system keychain/);
    expect(foot.textContent).toContain("Each one, except the few ADE keeps for itself (marked Not in terminals), is set as an environment variable");
  });
});

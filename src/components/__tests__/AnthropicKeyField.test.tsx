import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  /** Names `vault_list` answers with. */
  names: [] as string[],
  calls: [] as { cmd: string; args: Record<string, unknown> }[],
  moveError: null as string | null,
  savedCopy: false,
  removeFails: null as string | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown> = {}) => {
    h.calls.push({ cmd, args });
    switch (cmd) {
      case "vault_list":
        return h.names.map((name) => ({ name, note: "", updatedAt: 1, inTerminals: name !== "ADE_ORCHESTRATOR_ANTHROPIC_KEY" }));
      case "vault_set":
        h.names = [...h.names.filter((n) => n !== args.name), args.name as string];
        return null;
      case "vault_delete":
        h.names = h.names.filter((n) => n !== args.name);
        return null;
      default:
        throw new Error(`unexpected command: ${cmd}`);
    }
  }),
}));

vi.mock("../../lib/anthropicKey", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/anthropicKey")>()),
  lastMoveError: () => h.moveError,
  hasSavedCopy: () => h.savedCopy,
  removeSavedCopy: vi.fn(async () => {
    if (h.removeFails) throw h.removeFails;
    h.savedCopy = false;
  }),
}));

import AnthropicKeyField from "../AnthropicKeyField";
import { removeSavedCopy } from "../../lib/anthropicKey";

const NAME = "ADE_ORCHESTRATOR_ANTHROPIC_KEY";
const NOTE = "Orchestrator: Anthropic API key. Not exported to terminals.";
const ROTATE =
  "If a key was ever saved in ADE's settings before this version, it was stored in plain text: rotate it at console.anthropic.com.";
const SAVED = "Saved in the system keychain. Not exported to terminals.";

const cmds = () => h.calls.map((c) => c.cmd);
const listed = () => waitFor(() => expect(cmds()).toContain("vault_list"));

beforeEach(() => {
  h.names = [];
  h.calls.length = 0;
  h.moveError = null;
  h.savedCopy = false;
  h.removeFails = null;
  vi.mocked(removeSavedCopy).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  // Every render, in every test: the field never reads a value.
  expect(cmds()).not.toContain("vault_get");
});

describe("T13a (B12): the vault-backed key field", () => {
  it("with no key it says so and offers Save", async () => {
    render(<AnthropicKeyField />);
    await screen.findByText("No key set.");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("Save writes the vault with the name, value and note, then empties the input", async () => {
    render(<AnthropicKeyField />);
    await listed();
    const input = screen.getByLabelText("Anthropic API key") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input, { target: { value: "sk-ant-NEW" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(cmds()).toContain("vault_set"));
    expect(h.calls.find((c) => c.cmd === "vault_set")!.args).toEqual({ name: NAME, value: "sk-ant-NEW", note: NOTE });
    await screen.findByText(SAVED);
    expect(input.value).toBe("");
    expect(document.body.innerHTML).not.toContain("sk-ant-NEW");
  });

  it("with a key set the button reads Replace, and the value is never shown", async () => {
    h.names = [NAME];
    render(<AnthropicKeyField />);
    await screen.findByText(SAVED);
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect((screen.getByLabelText("Anthropic API key") as HTMLInputElement).value).toBe("");
  });

  it("Remove deletes from the vault only after the confirm is accepted", async () => {
    h.names = [NAME];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AnthropicKeyField />);
    await screen.findByText(SAVED);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(cmds()).not.toContain("vault_delete");

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(cmds()).toContain("vault_delete"));
    expect(h.calls.find((c) => c.cmd === "vault_delete")!.args).toEqual({ name: NAME });
    await screen.findByText("No key set.");
  });
});

describe("T13b (B13): the static rotate text", () => {
  it("shows while a key is set", async () => {
    h.names = [NAME];
    render(<AnthropicKeyField />);
    await screen.findByText(SAVED);
    expect(screen.getByText(ROTATE)).toBeTruthy();
  });

  it("shows while a saved copy exists", async () => {
    h.savedCopy = true;
    render(<AnthropicKeyField />);
    await screen.findByText("No key set.");
    expect(screen.getByText(ROTATE)).toBeTruthy();
  });

  it("is absent with neither", async () => {
    h.names = ["GITHUB_TOKEN"];
    render(<AnthropicKeyField />);
    await screen.findByText("No key set.");
    expect(screen.queryByText(ROTATE)).toBeNull();
  });
});

describe("T13c (B14): Remove the saved copy", () => {
  it("shows the reason and the action, and the action goes once it worked", async () => {
    h.moveError = "The system keychain isn't available: no Secret Service";
    h.savedCopy = true;
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AnthropicKeyField />);
    await screen.findByText(/no Secret Service/);

    fireEvent.click(screen.getByRole("button", { name: "Remove the saved copy" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(removeSavedCopy).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove the saved copy" }));
    await waitFor(() => expect(removeSavedCopy).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove the saved copy" })).toBeNull());
    expect(screen.queryByText(/no Secret Service/)).toBeNull();
  });

  it("a failed removal shows its error", async () => {
    h.moveError = "The system keychain isn't available: locked";
    h.savedCopy = true;
    h.removeFails = "disk full";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AnthropicKeyField />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove the saved copy" }));
    await screen.findByText(/disk full/);
    expect(screen.getByRole("button", { name: "Remove the saved copy" })).toBeTruthy();
  });

  it("without a saved copy the action is not shown", async () => {
    h.moveError = "The system keychain isn't available: locked";
    render(<AnthropicKeyField />);
    await screen.findByText("No key set.");
    expect(screen.queryByRole("button", { name: "Remove the saved copy" })).toBeNull();
    expect(screen.queryByText(/locked/)).toBeNull();
  });

  it("without a move error the action is not shown", async () => {
    h.savedCopy = true;
    render(<AnthropicKeyField />);
    await screen.findByText("No key set.");
    expect(screen.queryByRole("button", { name: "Remove the saved copy" })).toBeNull();
  });
});

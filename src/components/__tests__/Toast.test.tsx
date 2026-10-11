import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const terminal = vi.hoisted(() => ({ sendToActiveTerminal: vi.fn(async (_command: string, _run: boolean) => true) }));
vi.mock("../../lib/terminalCommands", () => terminal);

import Toast from "../Toast";
import { toastActions, type GuardToast } from "../../hooks/useContextGuard";

beforeEach(() => terminal.sendToActiveTerminal.mockClear());

describe("toastActions", () => {
  it("reads `action` as shorthand for one action", () => {
    const undo = { label: "Undo", run: vi.fn() };
    expect(toastActions({ title: "t", body: "b", action: undo })).toEqual([undo]);
    expect(toastActions({ title: "t", body: "b", actions: [undo, undo] })).toHaveLength(2);
    expect(toastActions({ title: "t", body: "b" })).toEqual([]);
  });
});

describe("Toast", () => {
  const ask = (runs: Record<string, () => void>): GuardToast => ({
    title: "Set up shop with BMAD?",
    body: "Existing files are left as they were.",
    actions: [
      { label: "v6", run: runs.v6 },
      { label: "v4", run: runs.v4 },
      { label: "Not now", run: runs.notNow },
    ],
  });

  it("shows every action as a button, in order", () => {
    render(<Toast toast={ask({})} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["v6", "v4", "Not now"]);
  });

  it("is not dismissed by a click on its body when it has actions", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={ask({})} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Set up shop with BMAD?"));
    fireEvent.click(screen.getByText("Existing files are left as they were."));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("runs the action clicked, only that one, then dismisses", () => {
    const runs = { v6: vi.fn(), v4: vi.fn(), notNow: vi.fn() };
    const onDismiss = vi.fn();
    render(<Toast toast={ask(runs)} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "v4" }));
    expect(runs.v4).toHaveBeenCalledOnce();
    expect(runs.v6).not.toHaveBeenCalled();
    expect(runs.notNow).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("is dismissed by a click anywhere when it has no action", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ title: "Agent finished", body: "Done." }} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Done."));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("types a command action into the terminal without running it", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={{ title: "Context at 80%", body: "b", action: { label: "Type /compact", command: "/compact" } }} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Type /compact" }));
    expect(terminal.sendToActiveTerminal).toHaveBeenCalledWith("/compact", false);
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

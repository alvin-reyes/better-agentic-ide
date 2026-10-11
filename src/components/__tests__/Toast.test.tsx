import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const terminal = vi.hoisted(() => ({ sendToActiveTerminal: vi.fn(async (_command: string, _run: boolean) => true) }));
vi.mock("../../lib/terminalCommands", () => terminal);

import Toast from "../Toast";
import { toastActions, toastLifetime, withdrawToast, type GuardToast } from "../../hooks/useContextGuard";

beforeEach(() => terminal.sendToActiveTerminal.mockClear());

describe("toastActions", () => {
  it("reads `action` as shorthand for one action", () => {
    const undo = { label: "Undo", run: vi.fn() };
    expect(toastActions({ title: "t", body: "b", action: undo })).toEqual([undo]);
    expect(toastActions({ title: "t", body: "b", actions: [undo, undo] })).toHaveLength(2);
    expect(toastActions({ title: "t", body: "b" })).toEqual([]);
  });
});

describe("toastLifetime", () => {
  it("gives a toast with an action longer than one that only tells", () => {
    expect(toastLifetime({ title: "t", body: "b" })).toBe(4000);
    expect(toastLifetime({ title: "t", body: "b", action: { label: "Undo", run: vi.fn() } })).toBe(15000);
  });

  it("gives a sticky toast no end: it stays until it is answered or replaced", () => {
    const pick = { label: "v6", run: vi.fn() };
    expect(toastLifetime({ title: "t", body: "b", actions: [pick], sticky: true })).toBeNull();
  });
});

describe("withdrawToast", () => {
  const question: GuardToast = { title: "Set up shop with BMAD?", body: "b", sticky: true, key: "setup-question:/code/shop" };

  it("takes down the toast it names", () => {
    expect(withdrawToast(question, "setup-question:/code/shop")).toBeNull();
  });

  it("leaves a different toast on screen", () => {
    const finished: GuardToast = { title: "Agent finished", body: "Done." };
    expect(withdrawToast(finished, "setup-question:/code/shop")).toBe(finished);
    const other: GuardToast = { ...question, key: "setup-question:/code/other" };
    expect(withdrawToast(other, "setup-question:/code/shop")).toBe(other);
  });

  it("has nothing to do when no toast is up", () => {
    expect(withdrawToast(null, "setup-question:/code/shop")).toBeNull();
  });
});

describe("Toast", () => {
  const ask = (runs: Record<string, () => void>): GuardToast => ({
    title: "Set up shop with BMAD?",
    body: "Existing files are left as they were.",
    actions: [
      { label: "One", run: runs.one },
      { label: "Two", run: runs.two },
      { label: "Three", run: runs.three },
    ],
  });

  it("shows every action as a button, in order", () => {
    render(<Toast toast={ask({})} onDismiss={vi.fn()} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["One", "Two", "Three"]);
  });

  it("is not dismissed by a click on its body when it has actions", () => {
    const onDismiss = vi.fn();
    render(<Toast toast={ask({})} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Set up shop with BMAD?"));
    fireEvent.click(screen.getByText("Existing files are left as they were."));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("runs the action clicked, only that one, then dismisses", () => {
    const runs = { one: vi.fn(), two: vi.fn(), three: vi.fn() };
    const onDismiss = vi.fn();
    render(<Toast toast={ask(runs)} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Two" }));
    expect(runs.two).toHaveBeenCalledOnce();
    expect(runs.one).not.toHaveBeenCalled();
    expect(runs.three).not.toHaveBeenCalled();
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

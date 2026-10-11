import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({ plans: 0 }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "bmad_switch_pending") return [];
    if (command === "project_setup_apply") return { created: [], appendedImport: false, agents: 0, bmadFiles: 0 };
    if (command === "bmad_switch_plan") {
      tauri.plans += 1;
      return { from: "v4", to: "v6", archive: ".ade/archive/bmad-v4-2026-10-11", moves: [], documents: [], leftovers: [], leftInPlace: [], dirty: null, archiveIgnored: null, blocked: null };
    }
    if (command === "project_setup_status") {
      return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: null };
    }
    throw new Error(`unexpected command: ${command}`);
  }),
}));

// The confirm step asks every pane for its folder; there is no terminal here.
vi.mock("../../hooks/useTerminal", () => ({ getPtyCwd: vi.fn(async () => null) }));

import { useEscapeToClose } from "../useEscapeToClose";
import MethodologyPromptHost, { MethodologyPrompt } from "../MethodologyPrompt";
import { __resetPromptForTests, askKeepOrSwitch, askMethodology, askSwitch, useMethodologyPrompt } from "../../lib/methodologyPrompt";
import { isKept, setUpProject } from "../../lib/projectSetup";

const dialog = () => screen.getByRole("dialog", { name: "Set up project" });
const question = () => document.querySelector(".new-tab-ask");

beforeEach(() => __resetPromptForTests());

describe("MethodologyPrompt, choose mode", () => {
  it("asks in the spec's words, with the project and both versions in bold", () => {
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} />);
    expect(question()!.textContent).toBe("Set up shop with BMAD v6 (default) or BMAD v4?");
    expect([...question()!.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["shop", "BMAD v6", "BMAD v4"]);
  });

  it("names a Windows project by its folder", () => {
    render(<MethodologyPrompt root={"C:\\code\\shop"} onAnswer={vi.fn()} />);
    expect(question()!.textContent).toBe("Set up shop with BMAD v6 (default) or BMAD v4?");
  });

  it("picks v6 on Enter", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    expect(document.activeElement).toBe(dialog());
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("v6");
  });

  it("picks v4 by click, or by arrow and Enter", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    expect(onAnswer).toHaveBeenLastCalledWith("v4");
    fireEvent.keyDown(dialog(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /BMAD v4/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledTimes(2);
    expect(onAnswer).toHaveBeenLastCalledWith("v4");
  });

  it("has no close button, and a click outside does nothing", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    expect(screen.queryByRole("button")).toBeNull();
    const backdrop = dialog().parentElement!;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(dialog()).toBeTruthy();
  });

  it("takes the keyboard back when the backdrop is pressed", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    dialog().blur();
    expect(document.activeElement).not.toBe(dialog());
    // Not cancelled, the press would move focus to the page and Enter would go nowhere.
    expect(fireEvent.mouseDown(dialog().parentElement!)).toBe(false);
    expect(document.activeElement).toBe(dialog());
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("v6");
  });

  it("leaves a press inside the dialog alone", () => {
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} />);
    expect(fireEvent.mouseDown(screen.getByRole("option", { name: /BMAD v4/ }))).toBe(true);
  });

  it("is a modal dialog to assistive technology", () => {
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} />);
    expect(dialog().getAttribute("aria-modal")).toBe("true");
  });

  it("ignores Escape", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("doesn't close a panel beneath it on Escape", () => {
    const under = vi.fn();
    function Under() { useEscapeToClose(under); return null; }
    render(<Under />);
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(under).not.toHaveBeenCalled();
  });

  it("doesn't pick on Enter from another control", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    const other = document.createElement("button");
    dialog().appendChild(other);
    fireEvent.keyDown(other, { key: "Enter" });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("option", { name: /BMAD v4/ }), { key: "Enter" });
    expect(onAnswer).toHaveBeenCalledWith("v6");
  });

  it("ignores a repeated Enter", () => {
    const onAnswer = vi.fn();
    render(<MethodologyPrompt root="/code/shop" onAnswer={onAnswer} />);
    fireEvent.keyDown(dialog(), { key: "Enter", repeat: true });
    expect(onAnswer).not.toHaveBeenCalled();
  });
});

describe("MethodologyPromptHost", () => {
  it("shows nothing until a project is asked about", () => {
    render(<MethodologyPromptHost />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the question askMethodology raises and resolves it with the answer", async () => {
    render(<MethodologyPromptHost />);
    const answer = askMethodology("/code/shop");
    expect((await screen.findByRole("dialog", { name: "Set up project" })).textContent).toContain("Set up shop with");
    fireEvent.click(screen.getByRole("option", { name: /BMAD v4/ }));
    expect(await answer).toEqual({ kind: "chosen", methodology: "v4", asked: true });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the question open on Escape", async () => {
    render(<MethodologyPromptHost />);
    void askMethodology("/code/shop");
    await screen.findByRole("dialog", { name: "Set up project" });
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByRole("dialog", { name: "Set up project" })).toBeTruthy();
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "choose" });
  });

  it("settles an open question as dismissed when the host unmounts", async () => {
    const host = render(<MethodologyPromptHost />);
    const answer = askMethodology("/code/shop");
    await screen.findByRole("dialog", { name: "Set up project" });
    host.unmount();
    expect(await answer).toEqual({ kind: "dismissed" });
    expect(useMethodologyPrompt.getState().request).toBeNull();
  });
});

describe("MethodologyPrompt, keep-or-switch mode", () => {
  const keepDialog = () => screen.getByRole("dialog", { name: "BMAD version" });
  const renderKeep = () => {
    const onKeep = vi.fn();
    const onSwitch = vi.fn();
    render(<MethodologyPrompt mode="keep" root="/code/shop" methodology="v4" onKeep={onKeep} onSwitch={onSwitch} />);
    return { onKeep, onSwitch };
  };

  it("asks in the spec's words, with the project, its version and both answers in bold", () => {
    renderKeep();
    expect(question()!.textContent).toBe("shop uses BMAD v4. Keep v4 (default) · Switch to v6…");
    expect([...question()!.querySelectorAll("b")].map((b) => b.textContent)).toEqual(["shop", "BMAD v4", "Keep v4", "Switch to v6…"]);
  });

  it("follows the version the project is on", () => {
    render(<MethodologyPrompt mode="keep" root="/code/shop" methodology="v6" onKeep={vi.fn()} onSwitch={vi.fn()} />);
    expect(question()!.textContent).toBe("shop uses BMAD v6. Keep v6 (default) · Switch to v4…");
  });

  it("keeps the version on Enter", () => {
    const { onKeep, onSwitch } = renderKeep();
    expect(document.activeElement).toBe(keepDialog());
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    expect(onKeep).toHaveBeenCalledOnce();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("goes to the switch by click, or by arrow and Enter", () => {
    const { onKeep, onSwitch } = renderKeep();
    fireEvent.click(screen.getByRole("option", { name: /Switch to v6…/ }));
    expect(onSwitch).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(keepDialog(), { key: "ArrowDown" });
    fireEvent.keyDown(keepDialog(), { key: "Enter" });
    expect(onSwitch).toHaveBeenCalledTimes(2);
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("names the dialog and its list differently, in either mode", () => {
    renderKeep();
    expect(screen.getByRole("listbox").getAttribute("aria-label")).not.toBe(keepDialog().getAttribute("aria-label"));
    cleanup();
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} />);
    expect(screen.getByRole("listbox").getAttribute("aria-label")).not.toBe(dialog().getAttribute("aria-label"));
  });

  it("must be answered: no close button, and Escape and a click outside do nothing", () => {
    const { onKeep, onSwitch } = renderKeep();
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.mouseDown(keepDialog().parentElement!);
    fireEvent.click(keepDialog().parentElement!);
    expect(onKeep).not.toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
    expect(keepDialog()).toBeTruthy();
    expect(keepDialog().getAttribute("aria-modal")).toBe("true");
  });

  it("doesn't close a panel beneath it on Escape", () => {
    const under = vi.fn();
    function Under() { useEscapeToClose(under); return null; }
    render(<Under />);
    renderKeep();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(under).not.toHaveBeenCalled();
  });

  it("ignores a repeated Enter, and Enter from another control", () => {
    const { onKeep } = renderKeep();
    fireEvent.keyDown(keepDialog(), { key: "Enter", repeat: true });
    const other = document.createElement("button");
    keepDialog().appendChild(other);
    fireEvent.keyDown(other, { key: "Enter" });
    expect(onKeep).not.toHaveBeenCalled();
  });
});

describe("MethodologyPromptHost, keeping or switching", () => {
  beforeEach(() => localStorage.clear());
  /** Ask from outside React, as New Tab and the palette do. */
  const ask = <T,>(raise: () => Promise<T>): Promise<T> => {
    let answer!: Promise<T>;
    act(() => { answer = raise(); });
    return answer;
  };

  it("keeps the version, and remembers not to ask this project again", async () => {
    render(<MethodologyPromptHost />);
    const answer = ask(() => askKeepOrSwitch("/code/shop/", "v4"));
    fireEvent.keyDown(await screen.findByRole("dialog", { name: "BMAD version" }), { key: "Enter" });
    expect(await answer).toEqual({ kind: "kept" });
    expect(isKept("/code/shop")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the question open on Escape", async () => {
    render(<MethodologyPromptHost />);
    void ask(() => askKeepOrSwitch("/code/shop", "v4"));
    await screen.findByRole("dialog", { name: "BMAD version" });
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    expect(isKept("/code/shop")).toBe(false);
  });

  it("shows the confirm step for Switch, and Back returns to the question unanswered", async () => {
    render(<MethodologyPromptHost />);
    let settled = false;
    void ask(() => askKeepOrSwitch("/code/shop", "v4")).then(() => { settled = true; });
    fireEvent.click(await screen.findByRole("option", { name: /Switch to v6…/ }));
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "confirm", from: "v4", to: "v6", back: true });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    // The keyboard follows the dialog on screen, each way.
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Switch to BMAD v6" }));

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "BMAD version" }));
    expect(settled).toBe(false);
    expect(isKept("/code/shop")).toBe(false);
    // The way back is a new question: Enter keeps again.
    expect(screen.getByRole("option", { name: /Keep v4/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("goes back to the question on Escape from the confirm step", async () => {
    render(<MethodologyPromptHost />);
    let settled = false;
    void ask(() => askKeepOrSwitch("/code/shop", "v4")).then(() => { settled = true; });
    fireEvent.click(await screen.findByRole("option", { name: /Switch to v6…/ }));
    await screen.findByRole("dialog", { name: "Switch to BMAD v6" });
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(await screen.findByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    // And there Escape is no answer.
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(screen.getByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    expect(settled).toBe(false);
  });

  it("offers Cancel when the switch was asked for on its own, and Cancel closes it", async () => {
    render(<MethodologyPromptHost />);
    const answer = ask(() => askSwitch("/code/shop", "v6"));
    await screen.findByRole("dialog", { name: "Switch to BMAD v4" });
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop", mode: "confirm", from: "v6", to: "v4", back: false });
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await answer).toEqual({ kind: "dismissed" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers Back instead once New Tab asks about the project being confirmed", async () => {
    render(<MethodologyPromptHost />);
    void ask(() => askSwitch("/code/shop", "v4"));
    await screen.findByRole("button", { name: "Cancel" });
    let settled = false;
    void ask(() => askKeepOrSwitch("/code/shop", "v4")).then(() => { settled = true; });
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    expect(settled).toBe(false);
  });

  it("shows the question's own confirm step, with Back, when a switch is asked for while it is open", async () => {
    render(<MethodologyPromptHost />);
    let settled = false;
    void ask(() => askKeepOrSwitch("/code/shop", "v4")).then(() => { settled = true; });
    await screen.findByRole("dialog", { name: "BMAD version" });
    void ask(() => askSwitch("/code/shop", "v4"));
    expect(await screen.findByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("dialog", { name: "BMAD version" })).toBeTruthy();
    expect(settled).toBe(false);
  });

  it("plans again when the project is set up while a switch asked for on its own is open", async () => {
    render(<MethodologyPromptHost />);
    tauri.plans = 0;
    void ask(() => askSwitch("/code/shop", "v4"));
    await waitFor(() => expect(tauri.plans).toBe(1));
    await act(async () => { await setUpProject("/code/shop", "v4"); });
    await waitFor(() => expect(tauri.plans).toBe(2));
    // Still the same dialog, with its Cancel.
    expect(screen.getByRole("dialog", { name: "Switch to BMAD v6" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("settles an open keep-or-switch question as dismissed when the host unmounts", async () => {
    const host = render(<MethodologyPromptHost />);
    const answer = ask(() => askKeepOrSwitch("/code/shop", "v4"));
    await screen.findByRole("dialog", { name: "BMAD version" });
    host.unmount();
    expect(await answer).toEqual({ kind: "dismissed" });
    expect(useMethodologyPrompt.getState().request).toBeNull();
  });
});

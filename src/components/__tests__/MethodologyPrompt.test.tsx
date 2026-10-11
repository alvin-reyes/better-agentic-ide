import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === "project_setup_status") {
      return { isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: null };
    }
    throw new Error(`unexpected command: ${command}`);
  }),
}));

import { useEscapeToClose } from "../useEscapeToClose";
import MethodologyPromptHost, { MethodologyPrompt } from "../MethodologyPrompt";
import { __resetPromptForTests, askMethodology, useMethodologyPrompt } from "../../lib/methodologyPrompt";

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
    render(<MethodologyPrompt root="/code/shop" onAnswer={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.click(dialog().parentElement!);
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
    expect(useMethodologyPrompt.getState().request).toEqual({ root: "/code/shop" });
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

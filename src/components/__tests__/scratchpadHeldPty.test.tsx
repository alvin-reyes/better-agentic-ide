import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Hotfix 0.23.2, review finding B1: ⌘↵ in the scratchpad writes straight to
 * the active PTY. While that PTY is an `ade open` sub-terminal whose command
 * isn't typed yet, the send is refused (writePty), nothing is written, and
 * the scratchpad keeps the text so it can be sent once the terminal is up.
 */

const io = vi.hoisted(() => ({ writes: [] as { id: number; text: string }[] }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "write_pty") {
      io.writes.push({ id: Number(args.id), text: new TextDecoder().decode(new Uint8Array(args.data as number[])) });
    }
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ readImage: vi.fn() }));
vi.mock("../../hooks/useTerminal", () => ({ isPaneActive: () => false, destroyInstance: vi.fn(), paneBusy: async () => null }));

import Scratchpad, { type ScratchpadHandle } from "../Scratchpad";
import { holdPtyInput, PTY_STARTING_MESSAGE } from "../../lib/terminalCommands";
import { useTabStore, ownViewOnly, type Tab } from "../../stores/tabStore";

let toasts: string[] = [];
const onToast = (e: Event) => toasts.push((e as CustomEvent).detail.body);

beforeEach(() => {
  io.writes.length = 0;
  toasts = [];
  window.addEventListener("agent-notification", onToast);
  localStorage.setItem("ade-scratchpad-draft", "explain this repo");
  const a: Tab = { id: "a", name: "Terminal", ...ownViewOnly({ type: "pane", pane: { id: "a1", ptyId: 41 } }, "a1") };
  useTabStore.setState({ tabs: [a], activeTabId: "a", closedTabs: [] });
});

afterEach(() => {
  window.removeEventListener("agent-notification", onToast);
  localStorage.clear();
});

describe("the scratchpad's send to a terminal that is still starting", () => {
  it("writes nothing, says so, keeps the text, and sends once the terminal is up", async () => {
    let held = true;
    holdPtyInput(41, () => held);
    const ref = createRef<ScratchpadHandle>();
    render(<Scratchpad ref={ref} />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(box.value).toBe("explain this repo");

    await act(async () => { await ref.current!.send(); });
    expect(io.writes).toEqual([]);
    expect(toasts).toEqual([PTY_STARTING_MESSAGE]);
    expect(box.value).toBe("explain this repo");

    held = false;
    await act(async () => { await ref.current!.send(); });
    expect(io.writes).toEqual([{ id: 41, text: "explain this repo\r" }]);
    expect(box.value).toBe("");
  });

  it("a multi-step send writes nothing and keeps the text too", async () => {
    localStorage.setItem("ade-scratchpad-draft", "step one\n---\nstep two");
    holdPtyInput(41, () => true);
    render(<Scratchpad />);
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Run Chain \(2 steps\)/ })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(io.writes).toEqual([]);
    expect(toasts).toEqual([PTY_STARTING_MESSAGE]);
    expect(box.value).toBe("step one\n---\nstep two");
  });
});

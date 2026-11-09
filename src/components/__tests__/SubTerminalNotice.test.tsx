import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// Story 9, T6: the not-typed notice inside a sub-terminal's view, and its
// Insert command. The busy check and the line-editor check are mocked; the
// write is the only effect.
const h = vi.hoisted(() => ({
  busy: null as string | null,
  ready: true as boolean | null,
  shell: "zsh" as string | null,
  invoke: vi.fn(),
}));
vi.mock("../../hooks/useTerminal", () => ({ paneBusy: vi.fn(async () => h.busy) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));

import SubTerminalNotice from "../SubTerminalNotice";

const LINE = "npm run dev --token 'sekret value'";
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const writes = () => h.invoke.mock.calls.filter(([cmd]) => cmd === "write_pty");
const button = () => screen.getByRole("button", { name: "Insert command" }) as HTMLButtonElement;

function show() {
  render(<SubTerminalNotice firstWord="npm" line={LINE} why="the shell's line editor didn't start" paneId="p1" ptyId={7} onDismiss={() => {}} />);
}

beforeEach(() => {
  h.busy = null;
  h.ready = true;
  h.shell = "zsh";
  h.invoke.mockReset();
  h.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "pty_line_editor_ready") return h.ready;
    if (cmd === "pty_shell_name") return h.shell;
    return null;
  });
});
afterEach(() => cleanup());

describe("SubTerminalNotice", () => {
  it("the_notice_shows_only_the_first_word_and_an_ellipsis", async () => {
    show();
    await flush();
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("The command (npm …) wasn't typed: the shell's line editor didn't start.");
    expect(document.body.textContent).not.toContain("run dev");
    expect(document.body.textContent).not.toContain("sekret");
    expect(button().disabled).toBe(false);
  });

  it("insert_is_disabled_while_paneBusy_names_a_program", async () => {
    h.busy = "vim";
    show();
    await flush();
    expect(button().disabled).toBe(true);
    expect(button().title).toBe("Available once the shell is back at its prompt");
  });

  it("insert_is_disabled_while_the_line_editor_is_not_ready", async () => {
    // A `read -s` prompt: the shell is in front but its line editor is down.
    h.ready = false;
    show();
    await flush();
    expect(button().disabled).toBe(true);
    expect(button().title).toBe("Available once the shell is back at its prompt");
  });

  it("insert_is_disabled_for_dash_with_its_own_title", async () => {
    h.shell = "dash";
    h.ready = false;
    show();
    await flush();
    expect(button().disabled).toBe(true);
    expect(button().title).toBe("This shell has no line editor; type the command yourself");
  });

  it("insert_rechecks_both_on_click_and_writes_nothing_if_either_fails", async () => {
    show();
    await flush();
    expect(button().disabled).toBe(false);
    h.busy = "npm"; // busy between render and click
    fireEvent.click(button());
    await flush();
    expect(writes()).toEqual([]);
    expect(button().disabled).toBe(true);

    cleanup();
    h.busy = null;
    show();
    await flush();
    h.ready = false; // the line editor went down between render and click
    fireEvent.click(button());
    await flush();
    expect(writes()).toEqual([]);
    expect(button().disabled).toBe(true);
  });

  it("insert_writes_the_full_quoted_line_without_enter", async () => {
    show();
    await flush();
    fireEvent.click(button());
    await flush();
    expect(writes()).toEqual([["write_pty", { id: 7, data: Array.from(new TextEncoder().encode(LINE)) }]]);
    expect(writes()[0][1].data).not.toContain(13);
  });

  it("dismiss calls back", async () => {
    const onDismiss = vi.fn();
    render(<SubTerminalNotice firstWord="npm" line={LINE} why="x" paneId="p1" ptyId={7} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

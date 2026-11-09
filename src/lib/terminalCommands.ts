import { invoke } from "@tauri-apps/api/core";
import { useTabStore, allTabPanes, shownView } from "../stores/tabStore";

/** Send text to a PTY as if typed. */
export function writePty(id: number, text: string): Promise<void> {
  return invoke("write_pty", { id, data: Array.from(new TextEncoder().encode(text)) });
}

/**
 * Put a command in the active terminal. With `run`, press Enter too;
 * otherwise it's left on the prompt for you to review and edit.
 */
export async function sendToActiveTerminal(command: string, run: boolean): Promise<boolean> {
  const ptyId = useTabStore.getState().getActivePtyId();
  if (ptyId === null) return false;
  await writePty(ptyId, command + (run ? "\r" : ""));
  return true;
}

/**
 * Wait until the shell in PTY `ptyId` is reading with its own line editor
 * (`pty_line_editor_ready`): out of canonical mode, with the shell in the
 * foreground. Until then the kernel holds typed input as one line of at most
 * 1024 bytes on macOS (4096 on Linux), and a longer line is cut and still runs.
 *
 * Polls every 50 ms and returns after two ready answers in a row: one sample
 * can land between two rc commands, after a child cleared canonical mode and
 * exited. A not-ready answer resets the count. Returns at once when it can't
 * be known (null, or a rejected invoke), and after `timeoutMs` in any case:
 * a shell with no line editor (`sh`) never leaves canonical mode.
 */
export async function whenLineEditorReady(ptyId: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let inARow = 0;
  for (;;) {
    let ready: boolean | null;
    try {
      ready = await invoke<boolean | null>("pty_line_editor_ready", { id: ptyId });
    } catch {
      return;
    }
    if (ready === null || ready === undefined) return;
    inARow = ready ? inARow + 1 : 0;
    if (inARow >= 2) return;
    await new Promise((r) => setTimeout(r, Math.max(0, Math.min(50, deadline - Date.now()))));
    if (Date.now() >= deadline) return;
  }
}

/**
 * Type `command` and Enter into PTY `ptyId` once its shell's line editor is
 * up (see `whenLineEditorReady`). Types nothing, and resolves false, when
 * `stillOpen()` says the terminal it was meant for went away meanwhile.
 * Rejects when the write does.
 */
export async function typeWhenReady(ptyId: number, command: string, stillOpen: () => boolean): Promise<boolean> {
  await whenLineEditorReady(ptyId);
  if (!stillOpen()) return false;
  await writePty(ptyId, command + "\r");
  return true;
}

/** Open a new terminal tab in `cwd` and run `command` there once its shell is up. */
export async function runInNewTab(name: string, cwd: string | undefined, command: string): Promise<boolean> {
  return (await runInNewTabPane(name, cwd, command)) !== null;
}

/**
 * Open a terminal tab and run a command in it once its shell is up. Waits for
 * that tab's own PTY (up to 8 s), never whichever tab is active by then, and
 * then for its line editor (`typeWhenReady`). Returns the new pane's id, or
 * null if the shell didn't start or the tab was closed before it was typed.
 */
export async function runInNewTabPane(name: string, cwd: string | undefined, command: string): Promise<string | null> {
  const tabId = useTabStore.getState().addTab(name, cwd);
  const opened = useTabStore.getState().tabs.find((t) => t.id === tabId);
  const paneId = opened ? shownView(opened).activePaneId : undefined;
  if (!paneId) return null;
  for (let i = 0; i < 32; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return null; // Closed before its shell started.
    const ptyId = allTabPanes(tab).find((p) => p.id === paneId)?.ptyId ?? null;
    if (ptyId !== null) {
      const stillOpen = () => useTabStore.getState().tabs.some((t) => t.id === tabId);
      return (await typeWhenReady(ptyId, command, stillOpen)) ? paneId : null;
    }
  }
  return null;
}

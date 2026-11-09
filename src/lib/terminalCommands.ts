import { invoke } from "@tauri-apps/api/core";
import { useTabStore, allTabPanes, shownView } from "../stores/tabStore";

/** What a refused write tells the user (a toast). */
export const PTY_STARTING_MESSAGE = "This terminal is still starting; try again in a moment";

/** `writePty`'s rejection for a PTY whose input is held. */
export class PtyStartingError extends Error {
  constructor() {
    super(PTY_STARTING_MESSAGE);
    this.name = "PtyStartingError";
  }
}

/**
 * PTYs whose input is held (hotfix 0.23.2): an `ade open` sub-terminal whose
 * command isn't typed yet. `terminalOpen` registers one as its PTY id lands;
 * the predicate says whether it is still held, and once it says no the entry
 * is forgotten.
 */
const holds = new Map<number, () => boolean>();

/** Hold the window's writes to PTY `id` while `held()` is true. */
export function holdPtyInput(id: number, held: () => boolean) {
  holds.set(id, held);
}

/** Whether the window's writes to PTY `id` are held now. */
export function ptyInputHeld(id: number): boolean {
  const held = holds.get(id);
  if (!held) return false;
  if (held()) return true;
  holds.delete(id);
  return false;
}

/**
 * Send text to a PTY as if typed. Every app-level write goes through here.
 * A write to a PTY whose input is held (`ptyInputHeld`) is refused: nothing
 * is written, a toast says so, and the promise rejects with
 * `PtyStartingError`, so the caller keeps what it was sending.
 */
export function writePty(id: number, text: string): Promise<void> {
  if (ptyInputHeld(id)) {
    window.dispatchEvent(new CustomEvent("agent-notification", { detail: { title: "Not sent", body: PTY_STARTING_MESSAGE } }));
    return Promise.reject(new PtyStartingError());
  }
  return writePtyInput(id, text);
}

/**
 * Write a terminal's own input (xterm's onData) to its PTY. Only `wireInput`
 * calls this: it applies the hold itself, letting xterm's replies through.
 */
export function writePtyInput(id: number, text: string): Promise<void> {
  return invoke("write_pty", { id, data: Array.from(new TextEncoder().encode(text)) });
}

/**
 * Put a command in the active terminal. With `run`, press Enter too;
 * otherwise it's left on the prompt for you to review and edit. False when
 * there is no active terminal, or it is still starting (`writePty`).
 */
export async function sendToActiveTerminal(command: string, run: boolean): Promise<boolean> {
  const ptyId = useTabStore.getState().getActivePtyId();
  if (ptyId === null) return false;
  try {
    await writePty(ptyId, command + (run ? "\r" : ""));
  } catch (err) {
    if (err instanceof PtyStartingError) return false;
    throw err;
  }
  return true;
}

/**
 * Wait until the shell in PTY `ptyId` is reading with its own line editor
 * (`pty_line_editor_ready`): out of canonical mode, with the shell (or a
 * nested interactive shell at its prompt) in the foreground. Until then the kernel holds typed input as one line of at most
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
 * `stillOpen()` says the terminal it was meant for went away meanwhile, or
 * when `free()`, awaited just before the write, says a job is in front.
 *
 * `free` is what decides after the 10 s cap: a line editor that never came up
 * means either a shell with none (`sh`, `dash`), which is in front and gets
 * the line, or a job in front (an rc ending in `tmux attach`), which must not.
 * Rejects when the write does; callers count that as not typed.
 */
export async function typeWhenReady(
  ptyId: number,
  command: string,
  stillOpen: () => boolean,
  free: () => Promise<boolean>,
): Promise<boolean> {
  await whenLineEditorReady(ptyId);
  if (!stillOpen()) return false;
  if (!(await free())) return false;
  if (!stillOpen()) return false;
  await writePty(ptyId, command + "\r");
  return true;
}

/** Whether pane `paneId` has its shell in front (`paneBusy` says null). */
export async function paneFree(paneId: string): Promise<boolean> {
  const { paneBusy } = await import("../hooks/useTerminal");
  return (await paneBusy(paneId)) === null;
}

/** Open a new terminal tab in `cwd` and run `command` there once its shell is up. */
export async function runInNewTab(name: string, cwd: string | undefined, command: string): Promise<boolean> {
  return (await runInNewTabPane(name, cwd, command)) !== null;
}

/**
 * Open a terminal tab and run a command in it once its shell is up. Waits for
 * that tab's own PTY (up to 8 s), never whichever tab is active by then, and
 * then for its line editor (`typeWhenReady`). Returns the new pane's id, or
 * null if the shell didn't start, the pane or its tab was closed before it was
 * typed, or a job was in front of the shell by then.
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
      // The pane, still holding this PTY: a tab can outlive a pane closed in it.
      const stillOpen = () => {
        const now = useTabStore.getState().tabs.find((t) => t.id === tabId);
        return !!now && allTabPanes(now).some((p) => p.id === paneId && p.ptyId === ptyId);
      };
      return (await typeWhenReady(ptyId, command, stillOpen, () => paneFree(paneId))) ? paneId : null;
    }
  }
  return null;
}

import { invoke } from "@tauri-apps/api/core";
import { useTabStore, findAllPanes } from "../stores/tabStore";

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

/** Open a new terminal tab in `cwd` and run `command` there once its shell is up. */
export async function runInNewTab(name: string, cwd: string | undefined, command: string): Promise<boolean> {
  return (await runInNewTabPane(name, cwd, command)) !== null;
}

/**
 * Open a terminal tab and run a command in it once its shell is up. Waits for
 * that tab's own PTY (up to 8 s), never whichever tab is active by then.
 * Returns the new pane's id, or null if the shell didn't start.
 */
export async function runInNewTabPane(name: string, cwd: string | undefined, command: string): Promise<string | null> {
  const tabId = useTabStore.getState().addTab(name, cwd);
  const paneId = useTabStore.getState().tabs.find((t) => t.id === tabId)?.activePaneId;
  if (!paneId) return null;
  for (let i = 0; i < 32; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return null; // Closed before its shell started.
    const ptyId = findAllPanes(tab.root).find((p) => p.id === paneId)?.ptyId ?? null;
    if (ptyId !== null) {
      await writePty(ptyId, command + "\r");
      return paneId;
    }
  }
  return null;
}

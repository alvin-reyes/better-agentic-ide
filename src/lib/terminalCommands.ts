import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../stores/tabStore";

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
export async function runInNewTab(name: string, cwd: string, command: string): Promise<boolean> {
  useTabStore.getState().addTab(name, cwd);
  // The new tab's shell starts asynchronously: wait for its PTY (up to 5s).
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const ptyId = useTabStore.getState().getActivePtyId();
    if (ptyId !== null) {
      await writePty(ptyId, command + "\r");
      return true;
    }
  }
  return false;
}

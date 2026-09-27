import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../stores/tabStore";

const encode = (s: string) => Array.from(new TextEncoder().encode(s));

/**
 * Put a command in the active terminal. With `run`, press Enter too;
 * otherwise it's left on the prompt for you to review and edit.
 */
export async function sendToActiveTerminal(command: string, run: boolean): Promise<boolean> {
  const ptyId = useTabStore.getState().getActivePtyId();
  if (ptyId === null) return false;
  await invoke("write_pty", { id: ptyId, data: encode(command + (run ? "\r" : "")) });
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
      await invoke("write_pty", { id: ptyId, data: encode(command + "\r") });
      return true;
    }
  }
  return false;
}

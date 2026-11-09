import { useEffect, useState } from "react";
import type { Tab } from "../stores/tabStore";
import { tabFolderPaneId } from "../lib/tabDisplay";

/** How often the active terminal's folder is re-read to follow `cd`. */
export const CWD_POLL_MS = 3000;

/**
 * The active tab's folder (App's activeCwd): its own view's active pane,
 * whatever view is in sight. Non-terminal tabs (fleet, editor, browser,
 * orchestrator) have no PTY, so the last resolved value is kept rather than
 * cleared — the fleet views read this while a fleet tab is focused.
 *
 * folderPtyId (tabFolderPtyId of the tab) is in the dependency list on
 * purpose: getPtyCwd resolves null (it does not reject) while the pane's PTY
 * has not been created yet, which is the state of every pane on the first
 * render. Depending on the PTY id makes this re-run the moment create_pty
 * lands, which is the only recovery path in a single-pane layout.
 *
 * It is also re-read every few seconds: a `cd` inside the terminal changes the
 * folder without any React state changing, and the BMAD banner and the
 * "This terminal" fleet view would otherwise keep using the old folder.
 * (The file browser polls on its own for the same reason.)
 */
export function useOwnFolderCwd(activeTab: Tab | undefined, folderPtyId: number | null): string | null {
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const folderPaneId = activeTab ? tabFolderPaneId(activeTab) : undefined;
  useEffect(() => {
    const paneId = folderPaneId;
    if (!paneId) return;
    if (activeTab?.type && activeTab.type !== "terminal") return;
    let cancelled = false;
    const resolve = () =>
      import("./useTerminal").then(({ getPtyCwd }) =>
        getPtyCwd(paneId).then((cwd) => { if (cwd && !cancelled) setActiveCwd(cwd); }),
      ).catch(() => {});
    resolve();
    const id = window.setInterval(resolve, CWD_POLL_MS);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [activeTab?.type, folderPaneId, folderPtyId]);
  return activeCwd;
}

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import type { GuardToast } from "./useContextGuard";
import { STACK_LABELS } from "../lib/projectMethodology";
import {
  addStackAgents, isComplete, isSettingUp, isSetupCandidate, setUpProject, setupDeclined, setupStatus, summarize, undoSetup, wasSetUp,
  type SetupResult,
} from "../lib/projectSetup";

const nameOf = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? root;

/** Show what a setup wrote, with Undo. */
export function announceSetup(r: SetupResult, show: (t: GuardToast) => void, stackOnly = false) {
  const what = summarize(r.report);
  if (!what) return;
  const stacks = r.stacks.map((s) => STACK_LABELS[s]).join(", ");
  show({
    title: stackOnly ? `${stacks} detected in ${nameOf(r.root)}` : `Set up ${nameOf(r.root)}`,
    body: stackOnly
      ? `Added ${what} for it. Remove any in Integrations > Agents.`
      : `Added ${what}${stacks ? ` (${stacks} project)` : ""}. Existing files were left as they were.`,
    action: { label: "Undo", run: () => { void undoSetup(r); } },
  });
}

/**
 * Every git project a terminal opens in is set up once: BMAD, the ADE
 * methodology, the core roles and the agents for its stack. On later opens,
 * agents for a stack the project has gained since are added.
 */
export function useProjectSetup(cwd: string | null, show: (t: GuardToast) => void) {
  const enabled = useSettingsStore((s) => s.autoProjectSetup);
  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    (async () => {
      const root = await invoke<string>("project_root", { path: cwd }).catch(() => null);
      // Skip projects whose setup the user undid, and ones being set up right
      // now (the new-tab dialog starts its own and reports it).
      if (!root || cancelled || !isSetupCandidate(root) || setupDeclined(root) || isSettingUp(root)) return;
      const status = await setupStatus(root).catch(() => null);
      if (!status || cancelled) return;
      if (wasSetUp(root)) {
        if (!status.stacks.length) return;
        const r = await addStackAgents(root, status.stacks).catch(() => null);
        if (r && !cancelled) announceSetup(r, show, true);
        return;
      }
      if (!status.isGit) return;
      const quiet = isComplete(status);
      const result = await setUpProject(root, status.stacks).catch(() => null);
      if (result && !cancelled && !quiet) announceSetup(result, show);
    })();
    return () => { cancelled = true; };
  }, [cwd, enabled, show]);
}

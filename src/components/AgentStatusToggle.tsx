import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AgentStatusInfo {
  project: string;
  enabled: boolean;
  /** Why Agent status can't work in this ADE, even when on. */
  unavailable: string | null;
}

/** Windows waits until the hook command is checked on its shell. */
const onWindows = () => typeof navigator !== "undefined" && /Win/i.test(navigator.platform || navigator.userAgent);

/**
 * The Agent status toggle for the folder's project: ADE's hooks in its
 * .claude/settings.local.json, added and removed only from here.
 */
export default function AgentStatusToggle({ cwd }: { cwd: string }) {
  const windows = onWindows();
  const [info, setInfo] = useState<AgentStatusInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (windows) return;
    setError(null);
    invoke<AgentStatusInfo | null>("agent_status_get", { cwd })
      .then((i) => setInfo(i ?? null))
      .catch((e) => setError(String(e)));
  }, [cwd, windows]);

  useEffect(load, [load]);

  if (windows) return null;

  const toggle = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setInfo(await invoke<AgentStatusInfo>("agent_status_toggle", { cwd, on }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="contracts-section">
      <h3>Agent status <small>.claude/settings.local.json</small></h3>
      <label className="tokens-guard">
        <input
          type="checkbox"
          aria-label="Agent status"
          checked={!!info?.enabled}
          disabled={busy || !info}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Show on each tab when its Claude Code agent needs you
      </label>
      <p className="contracts-note">
        {info?.enabled
          ? `On for ${info.project}. Claude Code sessions here report to ADE from their next prompt.`
          : "Off. Turning it on adds ADE's hooks to your personal project settings, which stay out of git."}
      </p>
      {info?.unavailable && <p className="contracts-note" role="alert">{info.unavailable}</p>}
      {error && <p className="contracts-note" role="alert">{error}</p>}
    </div>
  );
}

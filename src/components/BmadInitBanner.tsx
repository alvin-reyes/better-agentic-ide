import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useBmadStore } from "../stores/bmadStore";

interface BmadStatus { installed: boolean; version: string | null; }
interface Props { cwd: string; onInitialized: () => void; }

/**
 * Returns true if `path` looks like a user home directory.
 * We intentionally do NOT use import.meta.env.HOME (undefined in browser/Vite).
 * Regex covers /Users/<name> (macOS) and /home/<name> (Linux), with optional trailing slash.
 */
function isHome(path: string): boolean {
  return /^\/Users\/[^/]+\/?$|^\/home\/[^/]+\/?$/.test(path);
}

export default function BmadInitBanner({ cwd, onInitialized }: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const dismiss = useBmadStore((s) => s.dismiss);
  const isDismissed = useBmadStore((s) => s.isDismissed);

  useEffect(() => {
    let active = true;
    if (!cwd || isHome(cwd) || isDismissed(cwd)) { setVisible(false); return; }
    invoke<BmadStatus>("bmad_status", { path: cwd })
      .then((st) => { if (active) setVisible(!st.installed); })
      .catch(() => { if (active) setVisible(false); });
    return () => { active = false; };
  }, [cwd, isDismissed]);

  if (!visible) return null;

  const init = async () => {
    setBusy(true);
    try {
      await invoke("scaffold_bmad", { path: cwd });
      setVisible(false);
      onInitialized();
    } finally { setBusy(false); }
  };

  return (
    <div className="bmad-banner">
      <span>Initialize BMAD in this project?</span>
      <div className="bmad-banner__actions">
        <button disabled={busy} onClick={init}>{busy ? "Initializing…" : "Initialize"}</button>
        <button disabled={busy} onClick={() => { dismiss(cwd); setVisible(false); }}>Dismiss</button>
      </div>
    </div>
  );
}

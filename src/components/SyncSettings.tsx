import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getSyncConfig,
  setSyncConfig,
  syncNow,
  onSyncResult,
  type SyncConfig,
  type SyncReport,
} from "../lib/sync";
import { flushNow, suspendAutoSave } from "../lib/persistence";

interface ClaudeMemStatus {
  installed: boolean;
  dataDir: string | null;
}

const label = { fontSize: "12px", color: "var(--text-secondary)", marginBottom: "6px", display: "block" } as const;
const input = {
  width: "100%", padding: "7px 10px", fontSize: "12px", borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)", background: "var(--bg-primary)", color: "var(--text-primary)",
  fontFamily: "monospace", boxSizing: "border-box",
} as const;
const button = {
  padding: "6px 12px", fontSize: "12px", borderRadius: "var(--radius-sm)", cursor: "pointer",
  border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)",
} as const;
const section = { marginBottom: "22px" } as const;
const note = { fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.6, marginTop: "6px" } as const;

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ms).toLocaleString();
}

/** Settings → Sync: auto-save status, git-backed sync, snapshots, claude-mem. */
export default function SyncSettings() {
  const [config, setConfig] = useState<SyncConfig>({ remote: "", device: "", includeClaudeMemory: true });
  const [saved, setSaved] = useState<SyncConfig | null>(null);
  const [report, setReport] = useState<SyncReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stateDir, setStateDir] = useState("");
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [claudeMem, setClaudeMem] = useState<ClaudeMemStatus | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  useEffect(() => {
    getSyncConfig()
      .then((c) => {
        setSaved(c);
        if (c) setConfig(c);
        else setConfig((prev) => ({ ...prev, device: prev.device || defaultDeviceName() }));
      })
      .catch(() => {});
    invoke<string>("state_dir_path").then(setStateDir).catch(() => {});
    invoke<string[]>("state_list_snapshots").then(setSnapshots).catch(() => {});
    invoke<ClaudeMemStatus>("claude_mem_status").then(setClaudeMem).catch(() => {});
    return onSyncResult((r, e) => {
      setReport(r);
      setError(e);
    });
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await setSyncConfig(config);
      setSaved(config.remote.trim() ? config : null);
      if (config.remote.trim()) await syncNow(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    await syncNow(false);
    setBusy(false);
  };

  const restore = async (name: string) => {
    if (!window.confirm("Restore this snapshot? The current state is snapshotted first, and the snapshot applies the next time ADE starts.")) return;
    try {
      // Write pending changes so the pre-restore snapshot has them, then stop
      // auto-save so this window can't overwrite the restored files.
      await flushNow();
      suspendAutoSave();
      await invoke("state_restore_snapshot", { name });
      setRestoreMsg("Snapshot restored. Auto-save is paused until you restart ADE, which loads it.");
      invoke<string[]>("state_list_snapshots").then(setSnapshots).catch(() => {});
    } catch (e) {
      setRestoreMsg(`Restore failed: ${e}`);
    }
  };

  return (
    <div>
      <div style={section}>
        <span style={label}>Auto-save</span>
        <div style={{ fontSize: "12px", color: "var(--text-primary)" }}>
          On. Tabs, splits, each terminal's folder, the scratchpad draft, notes, prompt history,
          settings and workspaces are saved to disk within a second of changing.
        </div>
        {stateDir && <div style={note}>Saved in <code>{stateDir}</code></div>}
      </div>

      <div style={section}>
        <span style={label}>Sync between machines</span>
        <div style={note}>
          Use a <b>private</b> git repository you own (for example a new empty <code>ade-sync</code> repo).
          ADE commits and pushes with your existing git credentials. Settings, notes, prompt history,
          workspaces and orchestrator history are shared (newest change wins); each machine's terminal
          session is kept under its own device name.
        </div>
        <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
          <div>
            <span style={label}>Git remote</span>
            <input
              style={input}
              placeholder="git@github.com:you/ade-sync.git"
              value={config.remote}
              onChange={(e) => setConfig({ ...config, remote: e.target.value })}
            />
          </div>
          <div>
            <span style={label}>This device's name</span>
            <input
              style={input}
              value={config.device}
              onChange={(e) => setConfig({ ...config, device: e.target.value })}
            />
          </div>
          <label style={{ fontSize: "12px", color: "var(--text-primary)", display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={config.includeClaudeMemory}
              onChange={(e) => setConfig({ ...config, includeClaudeMemory: e.target.checked })}
            />
            Sync Claude memory: <code>~/.claude/CLAUDE.md</code> and your commands, agents and skills
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={button} disabled={busy} onClick={save}>
              {config.remote.trim() ? "Save and sync" : saved ? "Turn off sync" : "Save"}
            </button>
            {saved && (
              <button style={button} disabled={busy} onClick={runNow}>
                {busy ? "Syncing…" : "Sync now"}
              </button>
            )}
          </div>
        </div>
        {error && <div style={{ ...note, color: "#f87171" }}>Last sync failed: {error}</div>}
        {report && (
          <div style={note}>
            Last synced {ago(report.lastSyncMs)}
            {report.devices.length > 0 && <> · devices: {report.devices.join(", ")}</>}
            {report.importedKeys.length + report.importedMemory.length > 0 && (
              <> · pulled {report.importedKeys.length + report.importedMemory.length} change(s)</>
            )}
            {report.conflicts.length > 0 && (
              <div style={{ color: "#fbbf24", marginTop: "4px" }}>
                Edited on two machines: {report.conflicts.join(", ")}. Your copy was kept; the other
                machine's version is saved next to it as <code>*.sync-conflict</code>.
              </div>
            )}
          </div>
        )}
        <div style={note}>
          Changes from other machines are applied when ADE starts. Local changes are pushed every
          3 minutes and when the window is hidden or closed.
        </div>
      </div>

      <div style={section}>
        <span style={label}>claude-mem</span>
        {claudeMem?.installed ? (
          <div style={note}>
            Installed (<code>{claudeMem.dataDir}</code>). Its memory database is a live SQLite store that
            can't be safely copied between machines, so ADE doesn't sync it. Use claude-mem's own
            Cloud Sync to share it across devices.
          </div>
        ) : (
          <div style={note}>Not installed on this machine.</div>
        )}
      </div>

      <div style={section}>
        <span style={label}>Local snapshots</span>
        <div style={note}>Taken at startup and every 10 minutes; the newest 20 are kept.</div>
        {restoreMsg && <div style={{ ...note, color: "var(--accent)" }}>{restoreMsg}</div>}
        <div style={{ marginTop: "8px", display: "grid", gap: "4px", maxHeight: "180px", overflowY: "auto" }}>
          {snapshots.length === 0 && <div style={note}>No snapshots yet.</div>}
          {snapshots.map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12px" }}>
              <span style={{ flex: 1, color: "var(--text-primary)" }}>{new Date(Number(s)).toLocaleString()}</span>
              <button style={{ ...button, padding: "3px 8px", fontSize: "11px" }} onClick={() => restore(s)}>
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? "mac" : /Win/.test(ua) ? "windows" : /Linux/.test(ua) ? "linux" : "device";
  return `${os}-${Math.random().toString(36).slice(2, 6)}`;
}

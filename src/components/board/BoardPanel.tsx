import { useEffect, useMemo, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import BoardView, { type BoardActions } from "./BoardView";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { stageView, writeStage } from "../../lib/confirmedStage";
import { approveStory, approveTicket } from "../../lib/boardActions";
import { dispatchAgent } from "../../lib/agentLaunch";
import { watchTargets, WATCH_EXTENSIONS } from "../../lib/boardWatch";
import { tauriFs } from "../../lib/tauriFs";
import { setUpProject, isSetupCandidate } from "../../lib/projectSetup";
import { ROLE_ITEMS } from "../../data/pickerItems";
import { useSettingsStore } from "../../stores/settingsStore";
import { joinPath } from "../../lib/bmadRuntime/paths";
import { openFileFromTerminal } from "../../lib/openFile";

interface Props {
  cwd: string | null;
  onClose(): void;
}

/** Watch the board's folders while they exist; any change schedules a rebuild. */
function useBoardWatch(dirs: string[], onChange: () => void) {
  const key = dirs.join("\n");
  useEffect(() => {
    let cancelled = false;
    const ids: number[] = [];
    (async () => {
      for (const dir of dirs) {
        if (cancelled || !(await tauriFs.exists(dir).catch(() => false))) continue;
        const channel = new Channel<{ type: string }>();
        channel.onmessage = () => { if (!cancelled) onChange(); };
        const id = await invoke<number>("watch_directory", { dir, extensions: WATCH_EXTENSIONS, onEvent: channel }).catch(() => null);
        if (id === null) continue;
        if (cancelled) invoke("unwatch_directory", { id }).catch(() => {});
        else ids.push(id);
      }
    })();
    return () => {
      cancelled = true;
      for (const id of ids) invoke("unwatch_directory", { id }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the folder list
  }, [key]);
}

export default function BoardPanel({ cwd, onClose }: Props) {
  const [root, setRoot] = useState<string | null>(null);
  const { methodology, board, stageFile, error, loading, show, refresh, scheduleRefresh } = useBoardPanel();
  const [setupError, setSetupError] = useState<string | null>(null);

  // The active pane's project, by the same walk-up agent launches use.
  useEffect(() => {
    let live = true;
    if (!cwd) { setRoot(null); return; }
    invoke<string>("project_root", { path: cwd })
      .catch(() => cwd)
      .then((r) => { if (live) setRoot(isSetupCandidate(r) ? r : null); });
    return () => { live = false; };
  }, [cwd]);

  useEffect(() => { show(root); }, [root, show]);

  // A missed watcher event costs a refresh, not correctness.
  useEffect(() => {
    const onFocus = () => scheduleRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [scheduleRefresh]);

  const dirs = useMemo(
    () => (root && methodology ? watchTargets(root, methodology, board?.paths ?? null) : []),
    [root, methodology, board?.paths],
  );
  useBoardWatch(dirs, scheduleRefresh);

  const actions: BoardActions = useMemo(() => ({
    onOpen: (path) => { if (root) openFileFromTerminal(joinPath(root, path)); },
    onApprove: async (v) => {
      if (!root) return;
      if (methodology === "v6") await approveTicket(root, v.story.id, tauriFs);
      else await approveStory(root, v.story.file, tauriFs);
      await refresh();
    },
    onDispatch: async (v) => {
      if (!root) return;
      const dev = ROLE_ITEMS.find((i) => i.roleId === "developer");
      const what = methodology === "v6" ? "ticket" : "story";
      const err = await dispatchAgent({
        name: `${dev?.name ?? "Developer"} ${v.story.id}`,
        icon: dev?.icon ?? "D",
        spec: { roleId: "developer", provider: useSettingsStore.getState().defaultProvider },
        cwd: root,
        task: `Implement ${what} ${v.story.id}${v.story.file ? ` (${v.story.file})` : ""}.`,
      });
      if (err) throw new Error(err);
    },
    onStage: async (to) => {
      if (!root) return;
      await writeStage(root, to, tauriFs);
      await refresh();
    },
  }), [root, methodology, refresh]);

  const body = (() => {
    if (!cwd || (!root && !loading)) return <Empty>No project in this pane</Empty>;
    if (!methodology && !loading && !board) {
      return (
        <Empty>
          <div>This project isn't set up for BMAD</div>
          <button
            type="button"
            onClick={async () => {
              setSetupError(null);
              try {
                const result = await setUpProject(root!);
                window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result }));
                await refresh();
              } catch (e) {
                setSetupError(String(e));
              }
            }}
          >
            Set up now
          </button>
          {setupError && <div role="alert">{setupError}</div>}
        </Empty>
      );
    }
    if (!board || !methodology) return error ? <Empty><div role="alert">{error}</div></Empty> : <Empty>Loading…</Empty>;
    return <BoardView methodology={methodology} board={board} stage={stageView(board, stageFile)} error={error} actions={actions} />;
  })();

  return (
    <div style={{ width: 380, height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Board{methodology ? ` · BMAD ${methodology}` : ""}</span>
        <button type="button" aria-label="Close board" onClick={onClose} style={{ background: "none", border: 0, color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
      </div>
      {body}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 16, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}

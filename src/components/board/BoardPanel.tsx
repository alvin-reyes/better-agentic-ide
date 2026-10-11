import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import BoardView, { type BoardActions } from "./BoardView";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { stageView, writeStage } from "../../lib/confirmedStage";
import { approveStory, approveTicket } from "../../lib/boardActions";
import { dispatchAgent } from "../../lib/agentLaunch";
import { taskUnsupportedReason } from "../../lib/agentCommand";
import { watchTargets } from "../../lib/boardWatch";
import { useBoardWatch, useExistingFolders } from "./useBoardWatchers";
import { useDragWidth } from "../../hooks/useDragWidth";
import { tauriFs } from "../../lib/tauriFs";
import { setUpProject, isSetupCandidate, bmadRootOf } from "../../lib/projectSetup";
import { ROLE_ITEMS } from "../../data/pickerItems";
import { useSettingsStore } from "../../stores/settingsStore";
import { joinPath } from "../../lib/bmadRuntime/paths";
import { openFileFromTerminal } from "../../lib/openFile";
import type { StoryView } from "../../lib/storyState";

const BOARD_WIDTH = { initial: 380, min: 280, max: 720 };

interface Props {
  cwd: string | null;
  onClose(): void;
}

/**
 * Rows a developer was started on this session, as `root::ref::state`. In
 * memory only (nothing is written): it stops a second click opening a second
 * developer tab, and lapses once the row's state moves on.
 */
const dispatchedRows = new Set<string>();
const dispatchKey = (root: string, v: StoryView) => `${root}::${v.story.id}::${v.state}`;

export default function BoardPanel({ cwd, onClose }: Props) {
  // undefined while the pane's project is being resolved; null when it has none.
  const [root, setRoot] = useState<string | null | undefined>(undefined);
  const { root: storeRoot, methodology, board, stageFile, error, loading, show, refresh, scheduleRefresh } = useBoardPanel();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [dispatchCount, setDispatchCount] = useState(0);
  const { width, onDragStart } = useDragWidth(BOARD_WIDTH.min, BOARD_WIDTH.max, BOARD_WIDTH.initial);
  const provider = useSettingsStore((s) => s.defaultProvider);

  // The active pane's project, by the same walk-up agent launches use: the
  // nearest BMAD project from cwd up to the project root, else the project
  // root itself (which is what the setup card would set up).
  useEffect(() => {
    let live = true;
    if (!cwd) { setRoot(null); return; }
    setRoot(undefined);
    bmadRootOf(cwd)
      .catch(() => null)
      .then(async (found) => found?.root ?? (await invoke<string>("project_root", { path: cwd }).catch(() => cwd)))
      .then((r) => { if (live) setRoot(isSetupCandidate(r) ? r : null); });
    return () => { live = false; };
  }, [cwd]);

  useEffect(() => { if (root !== undefined) show(root); }, [root, show]);
  // Closing lets go of the project, which also cancels a pending debounced
  // rebuild. Reopening mounts with no root and shows the project once resolved.
  useEffect(() => () => show(null), [show]);

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
  const existing = useExistingFolders(dirs, board, scheduleRefresh);
  useBoardWatch(existing, methodology, scheduleRefresh);

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
      dispatchedRows.add(dispatchKey(root, v));
      setDispatchCount((n) => n + 1);
    },
    onStage: async (to) => {
      if (!root) return;
      await writeStage(root, to, tauriFs);
      await refresh();
    },
  }), [root, methodology, refresh]);

  const dispatched = useCallback(
    (v: StoryView) => !!root && dispatchedRows.has(dispatchKey(root, v)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispatchCount marks a change to the module-level set
    [root, dispatchCount],
  );

  const body = (() => {
    if (!cwd || root === null) return <Empty>No project in this pane</Empty>;
    if (root === undefined) return <Empty>Loading…</Empty>;
    // The store follows `root` one effect late; until it catches up, everything it holds is the previous project's.
    if (storeRoot !== root) return <Empty>Loading…</Empty>;
    if (!methodology && !loading && !board && !error) {
      return (
        <Empty>
          <div>This project isn't set up for BMAD</div>
          <div style={{ fontSize: 12, wordBreak: "break-all" }}>{root}</div>
          <button
            type="button"
            onClick={async () => {
              setSetupError(null);
              try {
                const result = await setUpProject(root);
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
    return <BoardView methodology={methodology} board={board} stage={stageView(board, stageFile)} error={error} actions={actions} dispatched={dispatched} dispatchUnavailable={taskUnsupportedReason(provider)} />;
  })();

  return (
    <aside
      aria-label="Stage board"
      // Shrinks (down to its minimum) before the terminal area goes below its own.
      style={{ width, minWidth: BOARD_WIDTH.min, height: "100%", display: "flex", flexDirection: "column", backgroundColor: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", flexShrink: 1, position: "relative" }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize stage board"
        onMouseDown={onDragStart}
        style={{ position: "absolute", top: 0, left: -3, width: 6, height: "100%", cursor: "col-resize", zIndex: 10 }}
      />
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border)", gap: 8 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>Board{methodology ? ` · BMAD ${methodology}` : ""}</span>
        <button type="button" aria-label="Close board" onClick={onClose} style={{ background: "none", border: 0, color: "var(--text-secondary)", cursor: "pointer" }}>✕</button>
      </div>
      {body}
    </aside>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 16, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}

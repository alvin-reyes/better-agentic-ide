import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import BoardView, { type BoardActions } from "./BoardView";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { stageView, writeStage } from "../../lib/confirmedStage";
import { approveStory, approveTicket } from "../../lib/boardActions";
import { dispatchAgent } from "../../lib/agentLaunch";
import { watchTargets, WATCH_EXTENSIONS } from "../../lib/boardWatch";
import { tauriFs } from "../../lib/tauriFs";
import { setUpProject, isSetupCandidate, bmadRootOf } from "../../lib/projectSetup";
import { ROLE_ITEMS } from "../../data/pickerItems";
import { useSettingsStore } from "../../stores/settingsStore";
import { joinPath } from "../../lib/bmadRuntime/paths";
import { openFileFromTerminal } from "../../lib/openFile";
import type { StoryView } from "../../lib/storyState";

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

/** How often a missing candidate folder is looked for again while the panel is open. */
export const MISSING_FOLDER_RECHECK_MS = 5000;

/**
 * Which of the board's folders exist. Recomputed after each rebuild
 * (`rebuilt` changes), and, while any is missing, every few seconds: a folder
 * that cannot be watched yet cannot report its own creation, and the root is
 * never watched. A folder that appears schedules a rebuild.
 */
function useExistingFolders(candidates: string[], rebuilt: unknown, onAppeared: () => void): string[] {
  const key = candidates.join("\n");
  const [found, setFound] = useState<{ key: string; dirs: string[] }>({ key: "", dirs: [] });

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const check = (dirs: string[]) =>
      Promise.all(dirs.map((d) => tauriFs.exists(d).catch(() => false))).then((ok) => dirs.filter((_, i) => ok[i]));
    const publish = (dirs: string[]) =>
      setFound((prev) => (prev.key === key && prev.dirs.join("\n") === dirs.join("\n") ? prev : { key, dirs }));

    check(candidates).then((present) => {
      if (!live) return;
      publish(present);
      if (present.length === candidates.length) return;
      timer = setInterval(async () => {
        const missing = candidates.filter((d) => !present.includes(d));
        const appeared = await check(missing);
        if (!live || appeared.length === 0) return;
        present = candidates.filter((d) => present.includes(d) || appeared.includes(d));
        publish(present);
        onAppeared();
        if (present.length === candidates.length && timer) clearInterval(timer);
      }, MISSING_FOLDER_RECHECK_MS);
    });
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the folder list and each rebuild
  }, [key, rebuilt]);

  return found.key === key ? found.dirs : [];
}

/** Watch the given folders; any change schedules a rebuild. Re-registers only when the list changes. */
function useBoardWatch(dirs: string[], onChange: () => void) {
  const key = dirs.join("\n");
  useEffect(() => {
    let cancelled = false;
    const ids: number[] = [];
    (async () => {
      for (const dir of dirs) {
        if (cancelled) break;
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
  const { root: storeRoot, methodology, board, stageFile, error, loading, show, refresh, scheduleRefresh } = useBoardPanel();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [dispatchCount, setDispatchCount] = useState(0);

  // The active pane's project, by the same walk-up agent launches use: the
  // nearest BMAD project from cwd up to the project root, else the project
  // root itself (which is what the setup card would set up).
  useEffect(() => {
    let live = true;
    if (!cwd) { setRoot(null); return; }
    bmadRootOf(cwd)
      .catch(() => null)
      .then(async (found) => found?.root ?? (await invoke<string>("project_root", { path: cwd }).catch(() => cwd)))
      .then((r) => { if (live) setRoot(isSetupCandidate(r) ? r : null); });
    return () => { live = false; };
  }, [cwd]);

  useEffect(() => { show(root); }, [root, show]);
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
  useBoardWatch(existing, scheduleRefresh);

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
    if (!cwd || (!root && !loading)) return <Empty>No project in this pane</Empty>;
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
    return <BoardView methodology={methodology} board={board} stage={stageView(board, stageFile)} error={error} actions={actions} dispatched={dispatched} />;
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

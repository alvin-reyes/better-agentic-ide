import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import BoardView, { type BoardActions } from "./BoardView";
import V6MapView from "./V6MapView";
import { useBoardPanel } from "../../stores/boardPanelStore";
import { stageView, writeStage } from "../../lib/confirmedStage";
import { approveStory, approveTicket } from "../../lib/boardActions";
import { dispatchAgent } from "../../lib/agentLaunch";
import { taskUnsupportedReason } from "../../lib/agentCommand";
import { watchTargets } from "../../lib/boardWatch";
import { useBoardWatch, useExistingFolders } from "./useBoardWatchers";
import { useDragWidth } from "../../hooks/useDragWidth";
import { tauriFs } from "../../lib/tauriFs";
import { isSetupCandidate, isSwitching, normRoot, onSwitchChange, setupRootOf, type SetupFailure } from "../../lib/projectSetup";
import { SWITCH_DONE_EVENT, otherVersion, pendingSwitches, type PendingSwitch } from "../../lib/bmadSwitch";
import { askAndSetUp, isRefusal, switchOnDemand } from "../../lib/methodologyPrompt";
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

/** Any switch starting or ending may be this project's: the panel asks again which. */
const subscribeToSwitches = (changed: () => void) => onSwitchChange(() => changed());

const WARNING: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" };
const LINK: React.CSSProperties = { background: "none", border: 0, padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit", textDecoration: "underline" };

/** What the warning says of one unfinished switch. `unknown` is a record that couldn't be read, not one that stopped. */
const pendingText = (p: PendingSwitch) =>
  p.status === "unknown"
    ? "A BMAD switch's record couldn't be read, so it may not have finished. Setup and switching wait until it is resolved:"
    : "A BMAD switch didn't finish here. Setup and switching wait until it is resolved:";

/**
 * A refusal over an unfinished switch also goes to the app's toast, which
 * links to the journal: the line in the panel can't be clicked.
 */
function tellRefusal(e: unknown) {
  if (!isRefusal(e) || !e.archiveFile) return;
  const detail: SetupFailure = { why: e.reason, archiveFile: e.archiveFile };
  window.dispatchEvent(new CustomEvent("project-setup-failed", { detail }));
}

export default function BoardPanel({ cwd, onClose }: Props) {
  // undefined while the pane's project is being resolved; null when it has none.
  const [root, setRoot] = useState<string | null | undefined>(undefined);
  const { root: storeRoot, methodology, board, map, stageFile, error, loading, show, refresh, scheduleRefresh } = useBoardPanel();
  const [setupError, setSetupError] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  // One project's refusal never shows under another project's link.
  useEffect(() => { setSwitchError(null); }, [root]);
  const [dispatchCount, setDispatchCount] = useState(0);
  const { width, onDragStart } = useDragWidth(BOARD_WIDTH.min, BOARD_WIDTH.max, BOARD_WIDTH.initial);
  const provider = useSettingsStore((s) => s.defaultProvider);

  // A switch is moving this project's folders. Until it is over the board
  // watches nothing and rebuilds nothing: a half-moved tree reads as a project
  // with no BMAD, and every move would otherwise be a rebuild.
  const switching = useSyncExternalStore(subscribeToSwitches, () => !!root && isSwitching(root));
  const switchingRef = useRef(switching);
  switchingRef.current = switching;
  // `failed`: the check itself failed. Kept with the root it was asked for.
  const [pending, setPending] = useState<{ root: string; list: PendingSwitch[]; failed: boolean } | null>(null);
  // A watcher event can arrive between the switch starting and the watcher being let go.
  const scheduleUnlessSwitching = useCallback(() => { if (!switchingRef.current) scheduleRefresh(); }, [scheduleRefresh]);

  // The active pane's project, by the same walk-up agent launches use: the
  // nearest BMAD project from cwd up to the project root, else the project
  // root itself (which is what the setup card would set up).
  useEffect(() => {
    let live = true;
    if (!cwd) { setRoot(null); return; }
    setRoot(undefined);
    setupRootOf(cwd)
      .catch(() => cwd)
      .then((r) => { if (live) setRoot(isSetupCandidate(r) ? r : null); });
    return () => { live = false; };
  }, [cwd]);

  useEffect(() => { if (root !== undefined) show(root); }, [root, show]);
  // Closing lets go of the project, which also cancels a pending debounced
  // rebuild. Reopening mounts with no root and shows the project once resolved.
  useEffect(() => () => show(null), [show]);

  // A missed watcher event costs a refresh, not correctness.
  useEffect(() => {
    const onFocus = () => scheduleUnlessSwitching();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [scheduleUnlessSwitching]);

  const dirs = useMemo(
    () => (root && methodology && !switching ? watchTargets(root, methodology, board?.paths ?? null, map?.outputFolder) : []),
    [root, methodology, switching, board?.paths, map?.outputFolder],
  );
  const existing = useExistingFolders(dirs, board ?? map, scheduleUnlessSwitching);
  useBoardWatch(existing, methodology, scheduleUnlessSwitching);

  // One refresh when the switch ends, whether it went through or was undone:
  // anything the watcher said meanwhile was dropped, and this covers it.
  const lastSwitching = useRef<{ root: string | null | undefined; switching: boolean }>({ root, switching });
  useEffect(() => {
    const was = lastSwitching.current;
    lastSwitching.current = { root, switching };
    if (was.root === root && was.switching && !switching) void refresh();
  }, [root, switching, refresh]);

  // A switch that finished while none was registered for this project (one
  // that settled an open "Set up now" question elsewhere) still changed the
  // files. While one is registered, its end refreshes.
  useEffect(() => {
    if (!root) return;
    const onDone = (e: Event) => {
      const done = (e as CustomEvent<{ root?: string }>).detail;
      if (done?.root && normRoot(done.root) === normRoot(root) && !isSwitching(root)) void refresh();
    };
    window.addEventListener(SWITCH_DONE_EVENT, onDone);
    return () => window.removeEventListener(SWITCH_DONE_EVENT, onDone);
  }, [root, refresh]);

  // A switch that didn't finish. It asks again after each rebuild: resolving
  // one by hand is an edit to ARCHIVE.md, which the watcher (rightly) doesn't report.
  useEffect(() => {
    let live = true;
    if (!root || switching) { setPending(null); return; }
    pendingSwitches(root).then(
      (list) => { if (live) setPending({ root, list, failed: false }); },
      () => { if (live) setPending({ root, list: [], failed: true }); },
    );
    return () => { live = false; };
  }, [root, switching, board, map]);

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
    onStage: methodology === "v4" ? async (to) => {
      if (!root) return;
      await writeStage(root, to, tauriFs);
      await refresh();
    } : undefined,
  }), [root, methodology, refresh]);

  const dispatched = useCallback(
    (v: StoryView) => !!root && dispatchedRows.has(dispatchKey(root, v)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dispatchCount marks a change to the module-level set
    [root, dispatchCount],
  );

  const body = (() => {
    if (!cwd || root === null) return <Empty>No project in this pane</Empty>;
    if (root === undefined) return <Empty>Loading…</Empty>;
    if (switching) return <Empty>Switching…</Empty>;
    // The store follows `root` one effect late; until it catches up, everything it holds is the previous project's.
    if (storeRoot !== root) return <Empty>Loading…</Empty>;
    if (!methodology && !loading && !board && !map && !error) {
      return (
        <Empty>
          <div>This project isn't set up for BMAD</div>
          <div style={{ fontSize: 12, wordBreak: "break-all" }}>{root}</div>
          <button
            type="button"
            onClick={async () => {
              setSetupError(null);
              try {
                // Asks which BMAD version first; null means the question was superseded, so do nothing.
                if (await askAndSetUp(root)) await refresh();
              } catch (e) {
                setSetupError(String(e));
                tellRefusal(e);
              }
            }}
          >
            Set up now
          </button>
          {setupError && <div role="alert">{setupError}</div>}
        </Empty>
      );
    }
    if (methodology === "v6" && map) {
      return <V6MapView map={map} error={error} actions={actions} dispatched={dispatched} dispatchUnavailable={taskUnsupportedReason(provider)} />;
    }
    if (methodology === "v4" && board) {
      return <BoardView board={board} stage={stageView(board, stageFile)} error={error} actions={actions} dispatched={dispatched} dispatchUnavailable={taskUnsupportedReason(provider)} />;
    }
    return error ? <Empty><div role="alert">{error}</div></Empty> : <Empty>Loading…</Empty>;
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
      {root && !switching && pending?.root === root && pending.failed && (
        <div role="alert" style={WARNING}>Couldn't check for an unfinished BMAD switch.</div>
      )}
      {root && !switching && pending?.root === root && pending.list.map((p) => (
        <div key={p.archive} role="alert" style={WARNING}>
          {pendingText(p)}{" "}
          <button type="button" style={LINK} onClick={() => openFileFromTerminal(joinPath(root, `${p.archive}/ARCHIVE.md`))}>ARCHIVE.md</button>
        </div>
      ))}
      {body}
      {/* Not offered while a switch runs, with no BMAD, or while one is unresolved or unchecked: those block it. */}
      {root && methodology && storeRoot === root && !switching && pending?.root === root && !pending.failed && pending.list.length === 0 && (
        <div style={{ marginTop: "auto", padding: "8px 12px", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)" }}>
          <button
            type="button"
            style={LINK}
            onClick={() => {
              setSwitchError(null);
              // Opens the confirm step; nothing moves until that is confirmed.
              switchOnDemand(root).catch((e) => { setSwitchError(String(e)); tellRefusal(e); });
            }}
          >
            Switch to BMAD {otherVersion(methodology)}…
          </button>
          {switchError && <div role="alert">{switchError}</div>}
        </div>
      )}
    </aside>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 16, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>;
}

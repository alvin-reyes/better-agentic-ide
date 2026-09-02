import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import {
  useFleetStore,
  buildLanes,
  buildPaneMeta,
  type SubagentEvent,
  type PaneInfo,
  type FleetLane,
} from "../stores/fleetStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { useTabStore, findAllPanes } from "../stores/tabStore";

// ---------------------------------------------------------------------------
// Watcher ownership
//
// The spec requires "one watcher regardless of open views", but this hook runs
// once per mounted fleet view (the modal and the tab can both be up at once).
// Ownership therefore lives at module scope behind a refcount rather than in
// the hook: the Rust watcher starts on 0 -> 1, stops on 1 -> 0, and is torn down
// and restarted only when the cwd actually changes. The store is reset only on a
// real cwd change, so a second view mounting no longer wipes the records the
// first one already received.
// ---------------------------------------------------------------------------

let watchCwd: string | null = null;
let watchRefs = 0;
let watchHandle: Promise<number | null> | null = null;

function startWatch(cwd: string) {
  const channel = new Channel<SubagentEvent>();
  channel.onmessage = (ev) => useFleetStore.getState().applyEvent(ev, cwd);
  watchHandle = invoke<number>("watch_subagents", { cwd, onEvent: channel }).catch(
    () => null,
  );
}

function stopWatch() {
  const handle = watchHandle;
  watchHandle = null;
  if (!handle) return;
  handle
    .then((id) => {
      if (id !== null) invoke("unwatch_subagents", { id }).catch(() => {});
    })
    .catch(() => {});
}

/**
 * Register interest in the sub-agent watcher for `cwd`. Returns a release
 * function; the watcher lives as long as at least one holder has not released.
 * Re-acquiring the same cwd after the count hits zero replays the backfill,
 * which `applyEvent` dedupes by id — so records survive closing and reopening a
 * view.
 */
export function acquireWatch(cwd: string): () => void {
  const cwdChanged = watchCwd !== cwd;
  if (cwdChanged) {
    stopWatch(); // no-op when nothing is running
    useFleetStore.getState().reset();
    watchCwd = cwd;
  }
  if (cwdChanged || watchRefs === 0) startWatch(cwd);
  watchRefs += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    watchRefs -= 1;
    if (watchRefs === 0) stopWatch();
  };
}

/** Test seam: drop all watcher state between cases. */
export function __resetWatchForTests() {
  watchCwd = null;
  watchRefs = 0;
  watchHandle = null;
}

export function useFleetData(activeCwd: string | null): {
  lanes: FleetLane[];
  totalCostCents: number;
  runningCount: number;
} {
  const subagents = useFleetStore((s) => s.subagents);
  const sessions = useAgentTrackerStore((s) => s.sessions);
  const tabs = useTabStore((s) => s.tabs);

  useEffect(() => {
    if (!activeCwd) {
      useFleetStore.getState().reset();
      return;
    }
    return acquireWatch(activeCwd);
  }, [activeCwd]);

  const panes = useMemo<PaneInfo[]>(() => {
    const out: PaneInfo[] = [];
    for (const tab of tabs) {
      // findAllPanes is already exported from tabStore — do not reimplement it.
      for (const pane of findAllPanes(tab.root)) {
        out.push({
          paneId: pane.id,
          tabId: tab.id,
          tabName: tab.name,
          ptyId: pane.ptyId,
          fallbackCwd: pane.savedCwd ?? pane.initialCwd ?? null,
        });
      }
    }
    return out;
  }, [tabs]);

  // Stable primitive key: the resolution effect must re-run when a pane appears,
  // disappears, or gets its PTY — but not merely because `panes` was rebuilt.
  const paneKey = panes.map((p) => `${p.paneId}:${p.ptyId}`).join(",");

  const [liveCwds, setLiveCwds] = useState<Record<string, string>>({});
  const panesRef = useRef(panes);
  panesRef.current = panes;

  // Resolve pane cwds from the live PTY — the same source `activeCwd` (and hence
  // every sub-agent record's cwd) comes from. Reading them off the tab store
  // instead would compare a stored-or-missing cwd against a live one, which is
  // why sub-agents never nested under their parent.
  useEffect(() => {
    let cancelled = false;
    const entries = panesRef.current;
    import("./useTerminal")
      .then(({ getPtyCwd }) =>
        Promise.all(
          entries.map(async (p) =>
            [p.paneId, p.ptyId === null ? null : await getPtyCwd(p.paneId)] as const,
          ),
        ),
      )
      .then((results) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const [paneId, cwd] of results) if (cwd) next[paneId] = cwd;
        // Only commit a new object when something actually changed, so this
        // effect's state write can never feed back into a render loop.
        setLiveCwds((prev) => {
          const prevKeys = Object.keys(prev);
          if (
            prevKeys.length === Object.keys(next).length &&
            prevKeys.every((k) => prev[k] === next[k])
          ) {
            return prev;
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [paneKey]);

  const paneMeta = useMemo(() => buildPaneMeta(panes, liveCwds), [panes, liveCwds]);

  const lanes = useMemo(
    () => buildLanes(sessions, subagents, paneMeta),
    [sessions, subagents, paneMeta],
  );

  const totalCostCents = useMemo(
    () => lanes.reduce((sum, l) => sum + (l.costCents ?? 0), 0),
    [lanes],
  );
  const runningCount = useMemo(
    () => lanes.filter((l) => l.status === "running").length,
    [lanes],
  );

  return { lanes, totalCostCents, runningCount };
}

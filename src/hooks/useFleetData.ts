import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import {
  useFleetStore,
  buildLanes,
  withUsage,
  buildPaneMeta,
  groupLanesByTerminal,
  groupLanesByProject,
  groupLanesByRole,
  terminalGroupsToLaneGroups,
  type SubagentEvent,
  type PaneInfo,
  type FleetLane,
  type LaneGroup,
  type FleetScope,
  type TerminalTabInfo,
} from "../stores/fleetStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import type { SessionUsage, UsageReport } from "../lib/tokenUsage";

// ---------------------------------------------------------------------------
// Watcher ownership
//
// Several fleet views can be mounted at once (the modal and the tab), and the
// all-terminals view watches every terminal's folder. Ownership therefore lives
// at module scope as one refcounted Rust watcher per cwd: a watcher starts on
// its first holder and stops on its last release. When a folder loses its last
// holder its records are dropped; re-acquiring replays the backfill, which
// `applyEvent` dedupes by id, so records survive closing and reopening a view.
// ---------------------------------------------------------------------------

interface Watch {
  refs: number;
  handle: Promise<number | null>;
}

const watches = new Map<string, Watch>();

function startWatch(cwd: string): Promise<number | null> {
  const channel = new Channel<SubagentEvent>();
  channel.onmessage = (ev) => useFleetStore.getState().applyEvent(ev, cwd);
  return invoke<number>("watch_subagents", { cwd, onEvent: channel }).catch(() => null);
}

function stopWatch(handle: Promise<number | null>) {
  handle
    .then((id) => {
      if (id !== null) invoke("unwatch_subagents", { id }).catch(() => {});
    })
    .catch(() => {});
}

/**
 * Register interest in the sub-agent watcher for `cwd`. Returns a release
 * function; the watcher lives as long as at least one holder has not released.
 */
export function acquireWatch(cwd: string): () => void {
  let watch = watches.get(cwd);
  if (!watch) {
    watch = { refs: 0, handle: startWatch(cwd) };
    watches.set(cwd, watch);
  }
  watch.refs += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = watches.get(cwd);
    if (!current) return;
    current.refs -= 1;
    if (current.refs === 0) {
      watches.delete(cwd);
      stopWatch(current.handle);
      useFleetStore.getState().removeCwd(cwd);
    }
  };
}

/** Test seam: drop all watcher state between cases. */
export function __resetWatchForTests() {
  watches.clear();
}

/**
 * Hold watchers for exactly `cwds`, diffing on change so a folder present in
 * both the old and new set keeps its watcher (and records) instead of being
 * torn down and backfilled again.
 */
function useWatchedCwds(cwds: string[]) {
  const key = [...new Set(cwds)].sort().join("\n");
  const held = useRef(new Map<string, () => void>());

  useEffect(() => {
    const want = new Set(key ? key.split("\n") : []);
    for (const cwd of want) {
      if (!held.current.has(cwd)) held.current.set(cwd, acquireWatch(cwd));
    }
    for (const [cwd, release] of held.current) {
      if (!want.has(cwd)) {
        release();
        held.current.delete(cwd);
      }
    }
  }, [key]);

  useEffect(() => {
    const map = held.current;
    return () => {
      for (const release of map.values()) release();
      map.clear();
    };
  }, []);
}

/**
 * Fleet lanes for a view. `scope` "active" covers the active terminal's folder;
 * "all" watches every open terminal's folder and also returns `groups`, one
 * per terminal tab.
 */
export function useFleetData(activeCwd: string | null, scope: FleetScope = "active"): {
  lanes: FleetLane[];
  groups: LaneGroup[];
  totalCostCents: number;
  runningCount: number;
} {
  const allSubagents = useFleetStore((s) => s.subagents);
  const sessions = useAgentTrackerStore((s) => s.sessions);
  const tabs = useTabStore((s) => s.tabs);

  const panes = useMemo<PaneInfo[]>(() => {
    const out: PaneInfo[] = [];
    for (const tab of tabs) {
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
  // every sub-agent record's cwd) comes from, so sub-agents nest under their
  // parent. A cwd off the tab store may be stale or missing.
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

  // Only terminal tabs run agents; the other tab types carry a placeholder pane.
  const terminalTabs = useMemo<TerminalTabInfo[]>(
    () =>
      tabs
        .filter((t) => !t.type || t.type === "terminal")
        .map((t) => ({ id: t.id, name: t.name, paneIds: findAllPanes(t.root).map((p) => p.id) })),
    [tabs],
  );

  const watchedCwds = useMemo(() => {
    if (scope === "active") return activeCwd ? [activeCwd] : [];
    const out = new Set<string>();
    if (activeCwd) out.add(activeCwd);
    for (const t of terminalTabs) {
      for (const id of t.paneIds) {
        const cwd = paneMeta[id]?.cwd;
        if (cwd) out.add(cwd);
      }
    }
    return [...out];
  }, [scope, activeCwd, terminalTabs, paneMeta]);

  useWatchedCwds(watchedCwds);

  // The store is shared by every mounted view, so keep only this view's folders.
  const subagents = useMemo(() => {
    const watched = new Set(watchedCwds);
    return allSubagents.filter((s) => watched.has(s.cwd));
  }, [allSubagents, watchedCwds]);

  const baseLanes = useMemo(
    () => buildLanes(sessions, subagents, paneMeta),
    [sessions, subagents, paneMeta],
  );
  const usage = useLaneUsage(baseLanes);
  const lanes = useMemo(() => withUsage(baseLanes, usage), [baseLanes, usage]);

  const grouping = useFleetStore((s) => s.grouping);

  const groups = useMemo<LaneGroup[]>(() => {
    if (scope !== "all") return [];
    if (grouping === "project") return groupLanesByProject(lanes);
    if (grouping === "role") return groupLanesByRole(lanes);
    // Terminal grouping keeps its own shape, including the empty groups it emits
    // for idle tabs; the mapping is a named export so it has its own test.
    return terminalGroupsToLaneGroups(groupLanesByTerminal(lanes, terminalTabs, paneMeta));
  }, [scope, grouping, lanes, terminalTabs, paneMeta]);

  const totalCostCents = useMemo(
    () => lanes.reduce((sum, l) => sum + (l.costCents ?? 0), 0),
    [lanes],
  );
  const runningCount = useMemo(
    () => lanes.filter((l) => l.status === "running").length,
    [lanes],
  );

  return { lanes, groups, totalCostCents, runningCount };
}

const USAGE_REFRESH_MS = 20_000;

/**
 * Claude Code sessions per folder since the earliest Claude lane there started,
 * refreshed while any of them is running.
 */
function useLaneUsage(lanes: FleetLane[]): Record<string, SessionUsage[]> {
  const [usage, setUsage] = useState<Record<string, SessionUsage[]>>({});
  const since = new Map<string, number>();
  let running = false;
  for (const l of lanes) {
    if (l.kind !== "agent" || l.provider !== "claude" || !l.cwd) continue;
    since.set(l.cwd, Math.min(since.get(l.cwd) ?? Infinity, l.startTime));
    if (l.status === "running") running = true;
  }
  const key = [...since].map(([cwd, t]) => `${cwd}@${t}`).sort().join("\n") + (running ? "|live" : "");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = () => {
      Promise.all(
        [...since].map(([cwd, t]) =>
          invoke<UsageReport>("token_usage", { cwd, since: new Date(t - 60_000).toISOString(), until: null })
            .then((r) => [cwd, r.sessions] as const)
            .catch(() => [cwd, []] as const),
        ),
      ).then((entries) => {
        if (!cancelled) setUsage(Object.fromEntries(entries));
      });
    };
    load();
    const timer = running ? setInterval(load, USAGE_REFRESH_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // `since` and `running` are captured in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return usage;
}

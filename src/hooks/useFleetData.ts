import { useEffect, useMemo } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useFleetStore, buildLanes, type SubagentEvent, type PaneMeta, type FleetLane } from "../stores/fleetStore";
import { useAgentTrackerStore } from "../stores/agentTrackerStore";
import { useTabStore, findAllPanes } from "../stores/tabStore";

export function useFleetData(activeCwd: string | null): {
  lanes: FleetLane[];
  totalCostCents: number;
  runningCount: number;
} {
  const subagents = useFleetStore((s) => s.subagents);
  const applyEvent = useFleetStore((s) => s.applyEvent);
  const reset = useFleetStore((s) => s.reset);
  const sessions = useAgentTrackerStore((s) => s.sessions);
  const tabs = useTabStore((s) => s.tabs);

  // One transcript watcher for the active project, shared by every fleet view.
  useEffect(() => {
    if (!activeCwd) return;
    let watchId: number | null = null;
    let cancelled = false;
    reset();
    const channel = new Channel<SubagentEvent>();
    channel.onmessage = (ev) => applyEvent(ev, activeCwd);
    invoke<number>("watch_subagents", { cwd: activeCwd, onEvent: channel })
      .then((id) => {
        if (cancelled) invoke("unwatch_subagents", { id }).catch(() => {});
        else watchId = id;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (watchId !== null) invoke("unwatch_subagents", { id: watchId }).catch(() => {});
    };
  }, [activeCwd, applyEvent, reset]);

  const paneMeta = useMemo(() => {
    const map: Record<string, PaneMeta> = {};
    for (const tab of tabs) {
      // findAllPanes is already exported from tabStore — do not reimplement it.
      for (const pane of findAllPanes(tab.root)) {
        map[pane.id] = {
          tabId: tab.id,
          tabName: tab.name,
          cwd: pane.savedCwd ?? pane.initialCwd ?? null,
        };
      }
    }
    return map;
  }, [tabs]);

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

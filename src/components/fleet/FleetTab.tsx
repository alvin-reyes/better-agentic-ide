import { useEffect, useMemo, useState } from "react";
import FleetTimeline from "./FleetTimeline";
import FleetSummary from "./FleetSummary";
import { useFleetData } from "../../hooks/useFleetData";
import { useTabStore } from "../../stores/tabStore";
import { useAgentTrackerStore } from "../../stores/agentTrackerStore";
import type { FleetLane } from "../../stores/fleetStore";

const RANGES: { label: string; ms: number | null }[] = [
  { label: "5m", ms: 5 * 60 * 1000 },
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "all", ms: null },
];

interface FleetTabProps {
  activeCwd: string | null;
}

export default function FleetTab({ activeCwd }: FleetTabProps) {
  const { lanes, totalCostCents, runningCount } = useFleetData(activeCwd);
  const clearHistory = useAgentTrackerStore((s) => s.clearHistory);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const setActivePaneInTab = useTabStore((s) => s.setActivePaneInTab);
  const [rangeIdx, setRangeIdx] = useState(1);
  const [selected, setSelected] = useState<FleetLane | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (runningCount === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningCount]);

  const from = useMemo(() => {
    const ms = RANGES[rangeIdx].ms;
    if (ms !== null) return now - ms;
    const earliest = lanes.reduce((min, l) => Math.min(min, l.startTime), now);
    return Math.min(earliest, now - 60_000);
  }, [rangeIdx, now, lanes]);

  const visible = lanes.filter((l) => (l.endTime ?? now) >= from);
  const doneCount = visible.filter((l) => l.status !== "running").length;

  // Clicking an agent lane jumps to the pane that owns it.
  const jumpToPane = (lane: FleetLane) => {
    setSelected(lane);
    if (lane.kind === "agent" && lane.tabId && lane.paneId) {
      setActiveTab(lane.tabId);
      setActivePaneInTab(lane.tabId, lane.paneId);
    }
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      backgroundColor: "var(--bg-primary)", overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <b style={{ fontSize: "13px", color: "var(--text-primary)" }}>Fleet</b>
        <div style={{ flex: 1 }}>
          <FleetSummary runningCount={runningCount} doneCount={doneCount} totalCostCents={totalCostCents} />
        </div>
        {RANGES.map((r, i) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(i)}
            style={{
              background: "none", cursor: "pointer", fontSize: "10px",
              padding: "2px 7px", borderRadius: "var(--radius-sm)",
              border: `1px solid ${i === rangeIdx ? "var(--accent)" : "var(--border)"}`,
              color: i === rangeIdx ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {r.label}
          </button>
        ))}
        <button
          onClick={clearHistory}
          style={{
            background: "none", border: "1px solid var(--border)", cursor: "pointer",
            fontSize: "10px", padding: "2px 7px", borderRadius: "var(--radius-sm)",
            color: "var(--text-muted)",
          }}
        >
          Clear history
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", minHeight: 0 }}>
        <FleetTimeline lanes={visible} from={from} to={now} onSelect={jumpToPane} />
      </div>

      {selected && (
        <div style={{
          borderTop: "1px solid var(--border)", padding: "8px 14px",
          fontSize: "11px", color: "var(--text-secondary)", flexShrink: 0,
          display: "flex", gap: "14px", flexWrap: "wrap",
        }}>
          <span><b>{selected.label}</b></span>
          {selected.detail && <span style={{ opacity: 0.7 }}>{selected.detail}</span>}
          {selected.model && <span style={{ opacity: 0.7 }}>model: {selected.model}</span>}
          {selected.tabName && <span style={{ opacity: 0.7 }}>{selected.tabName}</span>}
          <span style={{ opacity: 0.7 }}>
            {new Date(selected.startTime).toLocaleTimeString()}
            {selected.endTime ? ` → ${new Date(selected.endTime).toLocaleTimeString()}` : " → running"}
          </span>
          <button
            onClick={() => setSelected(null)}
            style={{ marginLeft: "auto", background: "none", border: "none",
                     color: "var(--text-muted)", cursor: "pointer" }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

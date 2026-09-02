import { useEffect, useState } from "react";
import FleetTimeline from "./FleetTimeline";
import FleetSummary from "./FleetSummary";
import { useFleetData } from "../../hooks/useFleetData";

const MODAL_RANGE_MS = 15 * 60 * 1000;

interface FleetPanelProps {
  activeCwd: string | null;
  onClose: () => void;
  onExpand: () => void;
}

export default function FleetPanel({ activeCwd, onClose, onExpand }: FleetPanelProps) {
  const { lanes, totalCostCents, runningCount } = useFleetData(activeCwd);
  const [now, setNow] = useState(() => Date.now());

  // Advance the live edge only while something is running.
  useEffect(() => {
    if (runningCount === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [runningCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const from = now - MODAL_RANGE_MS;
  const visible = lanes.filter((l) => (l.endTime ?? now) >= from);
  const doneCount = visible.filter((l) => l.status !== "running").length;

  return (
    <div
      className="subagent-panel-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="subagent-panel" role="dialog" aria-modal="true" aria-labelledby="fleet-panel-title">
        <div className="subagent-panel__header">
          <span id="fleet-panel-title">Fleet{activeCwd ? "" : " (no active terminal)"}</span>
          {/* Both buttons live in one flex box so the header's space-between puts
              the title left and the controls right, instead of centring "↗". */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={onExpand}
              aria-label="Expand fleet to tab"
              className="subagent-panel__close"
              // .subagent-panel__close sets line-height: 0 for its 16px SVG child;
              // a text glyph needs a real line box or the hit target collapses.
              style={{ lineHeight: 1, fontSize: "15px" }}
            >
              ↗
            </button>
            <button onClick={onClose} aria-label="Close fleet panel" className="subagent-panel__close">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        {/* .subagent-panel is max-height: 70vh; overflow: hidden — without an
            explicit scroll container here, lanes past 70vh are silently clipped. */}
        <div style={{ padding: "8px 12px", overflowY: "auto", minHeight: 0 }}>
          <FleetSummary runningCount={runningCount} doneCount={doneCount} totalCostCents={totalCostCents} />
          <FleetTimeline lanes={visible} from={from} to={now} />
        </div>
      </div>
    </div>
  );
}

import FleetTimeline from "./FleetTimeline";
import type { FleetGroup, FleetLane } from "../../stores/fleetStore";

interface FleetGroupsProps {
  groups: FleetGroup[];
  from: number;
  to: number;
  onSelect?: (lane: FleetLane) => void;
  /** Jump to a terminal tab from its section header. */
  onOpenTab?: (tabId: string) => void;
}

function shortPath(path: string): string {
  return path.replace(/^\/(Users|home)\/[^/]+/, "~");
}

/**
 * The all-terminals fleet: one section per terminal tab, each with its own
 * timeline. Every section shares the same time range so bars line up.
 */
export default function FleetGroups({ groups, from, to, onSelect, onOpenTab }: FleetGroupsProps) {
  if (groups.length === 0) {
    return <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>No terminals open.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {groups.map((g) => {
        const visible = g.lanes.filter((l) => (l.endTime ?? to) >= from);
        return (
          <section key={g.tabId ?? "closed"} aria-label={`Fleet for ${g.tabName}`}>
            <div style={{
              display: "flex", alignItems: "center", gap: "10px",
              fontSize: "11px", marginBottom: "6px", color: "var(--text-secondary)",
            }}>
              <b style={{ color: "var(--text-primary)", fontSize: "12px" }}>{g.tabName}</b>
              {g.cwds.length > 0 && (
                <span style={{ opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {g.cwds.map(shortPath).join(", ")}
                </span>
              )}
              <span style={{ marginLeft: "auto", color: g.runningCount > 0 ? "#22c55e" : "var(--text-muted)" }}>
                ● {g.runningCount} running
              </span>
              <span style={{ opacity: 0.75 }}>${(g.costCents / 100).toFixed(2)}</span>
              {g.tabId && onOpenTab && (
                <button
                  onClick={() => onOpenTab(g.tabId as string)}
                  style={{
                    background: "none", border: "1px solid var(--border)", cursor: "pointer",
                    fontSize: "10px", padding: "1px 6px", borderRadius: "var(--radius-sm)",
                    color: "var(--text-muted)",
                  }}
                >
                  Go to tab
                </button>
              )}
            </div>
            {visible.length > 0 ? (
              <FleetTimeline lanes={visible} from={from} to={to} onSelect={onSelect} />
            ) : (
              <div style={{ fontSize: "11px", color: "var(--text-muted)", padding: "4px 0 0 2px" }}>
                No agents in this range.
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

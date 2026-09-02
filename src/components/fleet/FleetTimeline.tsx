import type { FleetLane } from "../../stores/fleetStore";

interface FleetTimelineProps {
  lanes: FleetLane[];
  from: number;
  to: number;
  onSelect?: (lane: FleetLane) => void;
}

const STATUS_COLOR: Record<FleetLane["status"], string> = {
  running: "#22c55e",
  completed: "#4a4a4a",
  cancelled: "#ef4444",
};

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/** Clamp a lane to the visible range and express it as left/width percentages. */
function geometry(lane: FleetLane, from: number, to: number) {
  const span = Math.max(1, to - from);
  const start = Math.max(lane.startTime, from);
  const end = Math.min(lane.endTime ?? to, to);
  const left = (start - from) / span;
  const width = Math.max(0, (end - start) / span);
  return { left: pct(left), width: pct(width) };
}

/** Order lanes so each sub-agent follows its parent. */
function ordered(lanes: FleetLane[]): FleetLane[] {
  const parents = lanes.filter((l) => l.kind === "agent");
  const orphans = lanes.filter((l) => l.kind === "subagent" && l.parentId === null);
  const out: FleetLane[] = [];
  for (const p of parents) {
    out.push(p);
    out.push(...lanes.filter((l) => l.parentId === p.id));
  }
  return [...out, ...orphans];
}

/**
 * Group ordered lanes by project (cwd). Headers are only worth the vertical
 * space when more than one project is in view.
 */
function grouped(lanes: FleetLane[]): { cwd: string | null; lanes: FleetLane[] }[] {
  const rows = ordered(lanes);
  const byCwd = new Map<string | null, FleetLane[]>();
  for (const lane of rows) {
    const list = byCwd.get(lane.cwd) ?? [];
    list.push(lane);
    byCwd.set(lane.cwd, list);
  }
  return [...byCwd.entries()].map(([cwd, ls]) => ({ cwd, lanes: ls }));
}

function projectName(cwd: string | null): string {
  if (!cwd) return "unknown";
  return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

export default function FleetTimeline({ lanes, from, to, onSelect }: FleetTimelineProps) {
  if (lanes.length === 0) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", minHeight: "120px", color: "var(--text-muted)", fontSize: "12px",
      }}>
        No agent activity in this range.
      </div>
    );
  }

  const groups = grouped(lanes);
  const showHeaders = groups.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px 0" }}>
      {groups.map((group) => (
        <div key={group.cwd ?? "unknown"} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {showHeaders && (
            <div
              data-testid="project-header"
              style={{
                fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase",
                color: "var(--text-muted)", opacity: 0.6, marginTop: "6px",
              }}
            >
              {projectName(group.cwd)}
            </div>
          )}
          {group.lanes.map((lane) => {
        const { left, width } = geometry(lane, from, to);
        const isSub = lane.kind === "subagent";
        return (
          <div
            key={lane.id}
            data-testid="lane-row"
            data-kind={lane.kind}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <div style={{
              width: "120px", flexShrink: 0, paddingLeft: isSub ? "14px" : 0,
              fontSize: isSub ? "10px" : "11px",
              color: isSub ? "var(--text-muted)" : "var(--text-secondary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={lane.detail || lane.label}>
              {isSub ? `↳ ${lane.label}` : lane.label}
            </div>
            <div style={{
              flex: 1, height: isSub ? "9px" : "14px",
              backgroundColor: "var(--bg-primary)", borderRadius: "3px", position: "relative",
            }}>
              <div
                data-testid="lane-bar"
                data-lane-id={lane.id}
                onClick={() => onSelect?.(lane)}
                title={`${lane.label}${lane.detail ? ` — ${lane.detail}` : ""}`}
                style={{
                  position: "absolute", top: 0, bottom: 0, left, width,
                  backgroundColor: isSub ? "#a855f7" : STATUS_COLOR[lane.status],
                  opacity: lane.status === "completed" ? 0.55 : 0.85,
                  borderRadius: "3px", cursor: onSelect ? "pointer" : "default",
                }}
              />
            </div>
          </div>
        );
          })}
        </div>
      ))}
    </div>
  );
}

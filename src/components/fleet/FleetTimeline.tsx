import type { CSSProperties } from "react";
import type { FleetLane } from "../../stores/fleetStore";
import { roleColor, roleColorHex } from "../../data/agentColors";
import { getRole } from "../../data/roles";

interface FleetTimelineProps {
  lanes: FleetLane[];
  from: number;
  to: number;
  onSelect?: (lane: FleetLane) => void;
  /**
   * The folder this view is scoped to, so an empty timeline can say which one.
   * "This terminal" watches ~/.claude/projects/<encoded cwd>/, so a terminal in
   * a folder with no Claude Code sessions legitimately has nothing to show —
   * and without naming the folder that is indistinguishable from a bug.
   */
  cwd?: string | null;
}

function pct(n: number): string {
  return `${Math.round(n * 1000) / 10}%`;
}

/**
 * The bar's name for a tooltip and a screen reader: who, which role, what, and
 * its status last, since status is not carried by color.
 */
function laneName(lane: FleetLane): string {
  const role = lane.roleId ? getRole(lane.roleId)?.title : undefined;
  return [lane.label, role ?? "not an ADE role", lane.detail, lane.status].filter(Boolean).join(", ");
}

/**
 * Fill in the role's color (ADR 0007). Status is shape, not color: a running
 * bar has a square, pulsing open end; a cancelled one is hatched in the role's
 * color over the bare track; a completed one is solid and rounded.
 */
function barFill(lane: FleetLane): CSSProperties {
  const hex = roleColorHex(lane.roleId);
  // Longhands only, the same four for every status, so a lane that changes
  // status never mixes a shorthand with its longhands.
  const openEnd = lane.status === "running" ? 0 : "3px";
  const corners: CSSProperties = {
    borderTopLeftRadius: "3px", borderBottomLeftRadius: "3px",
    borderTopRightRadius: openEnd, borderBottomRightRadius: openEnd,
  };
  if (lane.status === "cancelled") {
    return {
      ...corners,
      backgroundColor: "transparent",
      backgroundImage: `repeating-linear-gradient(135deg, ${hex} 0 3px, transparent 3px 6px)`,
    };
  }
  return { ...corners, backgroundColor: hex };
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

/**
 * Order lanes so each sub-agent follows its parent. A sub-agent whose parent
 * isn't in `lanes` (callers pass filtered subsets) goes last, like an
 * unattached one, rather than being dropped.
 */
function ordered(lanes: FleetLane[]): FleetLane[] {
  const parents = lanes.filter((l) => l.kind === "agent");
  const parentIds = new Set(parents.map((p) => p.id));
  const orphans = lanes.filter(
    (l) => l.kind === "subagent" && (l.parentId === null || !parentIds.has(l.parentId)),
  );
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

export default function FleetTimeline({ lanes, from, to, onSelect, cwd }: FleetTimelineProps) {
  if (lanes.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: "6px", height: "100%", minHeight: "120px", padding: "0 16px",
        color: "var(--text-muted)", fontSize: "12px", textAlign: "center",
      }}>
        <span>
          No agent activity{cwd ? <> in <b style={{ color: "var(--text-secondary)" }}>{projectName(cwd)}</b></> : null} in this range.
        </span>
        {cwd && (
          <span style={{ fontSize: "11px" }}>
            Agents appear here when Claude Code runs in this terminal&rsquo;s folder.
            Switch to <b style={{ color: "var(--text-secondary)" }}>All terminals</b> to see every folder.
          </span>
        )}
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
            const name = laneName(lane);
            const barProps = {
              "data-testid": "lane-bar",
              "data-lane-id": lane.id,
              "data-agent-color": roleColor(lane.roleId) ?? "none",
              "data-status": lane.status,
              title: name,
              "aria-label": name,
            };
            const barStyle: CSSProperties = {
              position: "absolute", top: 0, bottom: 0, left, width,
              ...barFill(lane),
            };
            const liveEdge = lane.status === "running" && (
              <span
                data-testid="lane-live-edge"
                className="fleet-live-edge"
                style={{
                  position: "absolute", top: 0, bottom: 0, right: 0, width: "3px",
                  backgroundColor: "var(--text-primary)",
                }}
              />
            );
            return (
              <div
                key={lane.id}
                data-testid="lane-row"
                data-kind={lane.kind}
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <div style={{
                  width: "120px", flexShrink: 0, paddingLeft: isSub ? "14px" : 0,
                  display: "flex", alignItems: "center", gap: "6px",
                }}>
                  <span
                    data-testid="lane-dot"
                    aria-hidden="true"
                    style={{
                      width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                      backgroundColor: roleColorHex(lane.roleId),
                    }}
                  />
                  <span
                    data-testid="lane-label"
                    title={lane.detail || lane.label}
                    style={{
                      fontSize: isSub ? "10px" : "11px",
                      color: isSub ? "var(--text-muted)" : "var(--text-secondary)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {isSub ? `↳ ${lane.label}` : lane.label}
                  </span>
                </div>
                <div style={{
                  flex: 1, height: isSub ? "9px" : "14px",
                  backgroundColor: "var(--bg-primary)", borderRadius: "3px", position: "relative",
                }}>
                  {onSelect ? (
                    // A native button: Tab reaches it and Enter or Space
                    // activate it as a click. No key handler, or a key press
                    // would select twice.
                    <button
                      type="button"
                      className="fleet-lane-bar"
                      {...barProps}
                      onClick={() => onSelect(lane)}
                      style={{
                        ...barStyle,
                        border: "none", padding: 0, margin: 0, font: "inherit",
                        appearance: "none", cursor: "pointer",
                      }}
                    >
                      {liveEdge}
                    </button>
                  ) : (
                    <div role="img" {...barProps} style={barStyle}>
                      {liveEdge}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

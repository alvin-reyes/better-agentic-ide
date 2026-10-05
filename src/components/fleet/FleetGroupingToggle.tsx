import { useFleetStore, type FleetGrouping } from "../../stores/fleetStore";

const OPTIONS: { grouping: FleetGrouping; label: string; title: string }[] = [
  { grouping: "project", label: "Project", title: "Group lanes by the folder they ran in" },
  { grouping: "role", label: "Role", title: "Group lanes by which role ran them" },
  { grouping: "terminal", label: "Terminal", title: "Group lanes by the terminal tab they started in" },
];

/**
 * Choose how the all-terminals fleet buckets its lanes.
 *
 * The data is identical in every case — only the bucket changes — so this is one
 * control rather than three views.
 */
export default function FleetGroupingToggle() {
  const grouping = useFleetStore((s) => s.grouping);
  const setGrouping = useFleetStore((s) => s.setGrouping);
  return (
    <div role="group" aria-label="Fleet grouping" style={{ display: "inline-flex", gap: "2px" }}>
      {OPTIONS.map((o) => {
        const on = o.grouping === grouping;
        return (
          <button
            key={o.grouping}
            onClick={() => setGrouping(o.grouping)}
            aria-pressed={on}
            title={o.title}
            style={{
              background: on ? "var(--accent-subtle)" : "none", cursor: "pointer",
              fontSize: "10px", padding: "2px 8px", borderRadius: "var(--radius-sm)",
              border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
              color: on ? "var(--accent)" : "var(--text-muted)",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

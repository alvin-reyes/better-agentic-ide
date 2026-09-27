import { useFleetStore, type FleetScope } from "../../stores/fleetStore";

const OPTIONS: { scope: FleetScope; label: string }[] = [
  { scope: "active", label: "This terminal" },
  { scope: "all", label: "All terminals" },
];

/** Switch a fleet view between the active terminal and every terminal. */
export default function FleetScopeToggle() {
  const scope = useFleetStore((s) => s.scope);
  const setScope = useFleetStore((s) => s.setScope);
  return (
    <div role="group" aria-label="Fleet scope" style={{ display: "inline-flex", gap: "2px" }}>
      {OPTIONS.map((o) => {
        const on = o.scope === scope;
        return (
          <button
            key={o.scope}
            onClick={() => setScope(o.scope)}
            aria-pressed={on}
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

interface FleetSummaryProps {
  runningCount: number;
  doneCount: number;
  totalCostCents: number;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function FleetSummary({ runningCount, doneCount, totalCostCents }: FleetSummaryProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px",
      fontSize: "11px", color: "var(--text-secondary)",
    }}>
      {/* No green: running is shown by the pulsing dot and the word (ADR 0007). */}
      <span data-testid="fleet-running" style={{ color: "var(--text-secondary)" }}>
        <span aria-hidden="true" className={runningCount > 0 ? "fleet-live-edge" : undefined}>●</span> {runningCount} running
      </span>
      <span style={{ opacity: 0.6 }}>{doneCount} done</span>
      <span style={{ marginLeft: "auto", opacity: 0.75 }}>{formatCost(totalCostCents)}</span>
    </div>
  );
}

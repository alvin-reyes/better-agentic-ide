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
      <span style={{ color: "#22c55e" }}>● {runningCount} running</span>
      <span style={{ opacity: 0.6 }}>{doneCount} done</span>
      <span style={{ marginLeft: "auto", opacity: 0.75 }}>{formatCost(totalCostCents)}</span>
    </div>
  );
}

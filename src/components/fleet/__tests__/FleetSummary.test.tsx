import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FleetSummary from "../FleetSummary";

describe("FleetSummary", () => {
  it("shows running and done counts", () => {
    render(<FleetSummary runningCount={3} doneCount={2} totalCostCents={0} />);
    expect(screen.getByText(/3 running/)).toBeTruthy();
    expect(screen.getByText(/2 done/)).toBeTruthy();
  });

  it("formats sub-dollar cost in cents", () => {
    render(<FleetSummary runningCount={0} doneCount={0} totalCostCents={42} />);
    expect(screen.getByText("$0.42")).toBeTruthy();
  });

  it("formats dollar amounts", () => {
    render(<FleetSummary runningCount={0} doneCount={0} totalCostCents={1234} />);
    expect(screen.getByText("$12.34")).toBeTruthy();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FleetSummary from "../FleetSummary";
import { AGENT_COLOR_HEX } from "../../../data/agentColors";

// jsdom reports a hex set in a style as rgb(...).
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
const FORBIDDEN = [
  "rgb(34, 197, 94)", // the old #22c55e
  ...Object.values(AGENT_COLOR_HEX).map((h) => rgb(h.dark)),
];

/** Every inline color on the "N running" element and inside it. */
function runningColors(el: HTMLElement): string[] {
  return [el, ...el.querySelectorAll<HTMLElement>("*")].flatMap((e) => [e.style.color, e.style.backgroundColor]).filter(Boolean);
}

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

  it("running is not green", () => {
    const { unmount } = render(<FleetSummary runningCount={2} doneCount={0} totalCostCents={0} />);
    const running = screen.getByText(/2 running/).closest("[data-testid='fleet-running']") as HTMLElement;
    expect(running).not.toBeNull();
    expect(running.style.color).toBe("var(--text-secondary)");
    for (const c of runningColors(running)) expect(FORBIDDEN).not.toContain(c);
    expect(running.querySelector(".fleet-live-edge")).not.toBeNull();
    unmount();

    render(<FleetSummary runningCount={0} doneCount={0} totalCostCents={0} />);
    const idle = screen.getByText(/0 running/).closest("[data-testid='fleet-running']") as HTMLElement;
    expect(idle.querySelector(".fleet-live-edge")).toBeNull();
  });
});

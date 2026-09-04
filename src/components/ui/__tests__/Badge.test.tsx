import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Badge from "../Badge";

describe("Badge", () => {
  it("renders its children", () => {
    render(<Badge>running</Badge>);
    expect(screen.getByText("running")).toBeTruthy();
  });

  it("defaults to the neutral tone", () => {
    render(<Badge>idle</Badge>);
    expect(screen.getByText("idle").className.includes("badge--neutral")).toBe(true);
  });

  it("applies the requested tone", () => {
    render(<Badge tone="danger">failed</Badge>);
    expect(screen.getByText("failed").className.includes("badge--danger")).toBe(true);
  });
});

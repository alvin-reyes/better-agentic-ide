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

  it("merges a caller-supplied className rather than replacing", () => {
    render(<Badge className="extra">idle</Badge>);
    const el = screen.getByText("idle");
    expect(el.className.includes("extra")).toBe(true);
    expect(el.className.includes("badge")).toBe(true);
  });

  it("passes arbitrary DOM attributes through", () => {
    render(<Badge id="b1" title="tip" data-kind="status">idle</Badge>);
    const el = screen.getByText("idle");
    expect(el.id).toBe("b1");
    expect(el.title).toBe("tip");
    expect(el.getAttribute("data-kind")).toBe("status");
  });
});

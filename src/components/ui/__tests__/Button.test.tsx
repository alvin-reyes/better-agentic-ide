import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Button from "../Button";

describe("Button", () => {
  it("renders its children", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("defaults to the secondary variant at medium size", () => {
    render(<Button>Save</Button>);
    const el = screen.getByRole("button");
    expect(el.className.includes("ui-btn--secondary")).toBe(true);
    expect(el.className.includes("ui-btn--md")).toBe(true);
  });

  it("applies the requested variant and size", () => {
    render(<Button variant="danger" size="sm">Delete</Button>);
    const el = screen.getByRole("button");
    expect(el.className.includes("ui-btn--danger")).toBe(true);
    expect(el.className.includes("ui-btn--sm")).toBe(true);
  });

  it("marks icon-only buttons for square sizing", () => {
    render(<Button iconOnly aria-label="Close">x</Button>);
    expect(screen.getByRole("button").className.includes("ui-btn--icon")).toBe(true);
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("forwards arbitrary button attributes", () => {
    render(<Button type="submit" title="tip">Go</Button>);
    const el = screen.getByRole("button") as HTMLButtonElement;
    expect(el.type).toBe("submit");
    expect(el.title).toBe("tip");
  });

  it("merges a caller-supplied className rather than replacing", () => {
    render(<Button className="extra">Go</Button>);
    const el = screen.getByRole("button");
    expect(el.className.includes("extra")).toBe(true);
    expect(el.className.includes("ui-btn")).toBe(true);
  });
});

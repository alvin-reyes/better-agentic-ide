import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Row from "../Row";

describe("Row", () => {
  it("renders its children", () => {
    render(<Row>Item</Row>);
    expect(screen.getByText("Item")).toBeTruthy();
  });

  it("exposes an option role with aria-selected", () => {
    render(<Row active>Item</Row>);
    const el = screen.getByRole("option");
    expect(el.getAttribute("aria-selected")).toBe("true");
  });

  it("marks the keyboard cursor separately from the active selection", () => {
    render(<Row selected>Item</Row>);
    const el = screen.getByRole("option");
    expect(el.className.includes("row--selected")).toBe(true);
    expect(el.getAttribute("aria-selected")).toBe("false");
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect}>Item</Row>);
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("does not call onSelect when disabled", () => {
    const onSelect = vi.fn();
    render(<Row disabled onSelect={onSelect}>Item</Row>);
    fireEvent.click(screen.getByRole("option"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("calls onSelect on Enter", () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect}>Item</Row>);
    fireEvent.keyDown(screen.getByRole("option"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("ignores Space bubbling up from a nested control", () => {
    const onSelect = vi.fn();
    render(
      <Row onSelect={onSelect}>
        <input aria-label="Rename" />
      </Row>
    );
    fireEvent.keyDown(screen.getByLabelText("Rename"), { key: " " });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores Enter bubbling up from a nested control", () => {
    const onSelect = vi.fn();
    render(
      <Row onSelect={onSelect}>
        <button>Delete</button>
      </Row>
    );
    fireEvent.keyDown(screen.getByText("Delete"), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

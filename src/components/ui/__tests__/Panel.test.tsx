import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Panel from "../Panel";

describe("Panel", () => {
  it("renders its title and body", () => {
    render(<Panel title="Settings"><p>Body</p></Panel>);
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("renders a footer when given one", () => {
    render(<Panel title="T" footer={<span>Footer</span>}><p>Body</p></Panel>);
    expect(screen.getByText("Footer")).toBeTruthy();
  });

  it("omits the footer element when no footer is given", () => {
    const { container } = render(<Panel title="T"><p>Body</p></Panel>);
    expect(container.querySelector(".panel__footer")).toBe(null);
  });

  it("shows a close button only when onClose is given", () => {
    const { rerender } = render(<Panel title="T"><p>Body</p></Panel>);
    expect(screen.queryByRole("button", { name: "Close" })).toBe(null);
    rerender(<Panel title="T" onClose={() => {}}><p>Body</p></Panel>);
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    render(<Panel title="T" onClose={onClose}><p>Body</p></Panel>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies titleId so an Overlay can label itself", () => {
    render(<Panel title="Settings" titleId="settings-title"><p>Body</p></Panel>);
    expect(screen.getByText("Settings").id).toBe("settings-title");
  });

  it("merges a caller-supplied className rather than replacing", () => {
    const { container } = render(
      <Panel title="T" className="extra"><p>Body</p></Panel>
    );
    const el = container.firstElementChild!;
    expect(el.className.includes("extra")).toBe(true);
    expect(el.className.includes("ui-panel")).toBe(true);
  });

  it("passes arbitrary DOM attributes through", () => {
    const { container } = render(
      <Panel title="T" id="p1" data-surface="settings"><p>Body</p></Panel>
    );
    const el = container.firstElementChild!;
    expect(el.id).toBe("p1");
    expect(el.getAttribute("data-surface")).toBe("settings");
  });
});

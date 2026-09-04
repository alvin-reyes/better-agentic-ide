import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Overlay from "../Overlay";

describe("Overlay", () => {
  it("renders its children", () => {
    render(<Overlay onClose={() => {}}><p>Body</p></Overlay>);
    expect(screen.getByText("Body")).toBeTruthy();
  });

  it("exposes a dialog role", () => {
    render(<Overlay onClose={() => {}}><p>Body</p></Overlay>);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    fireEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when the content is clicked", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    fireEvent.click(screen.getByText("Body"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("honours closeOnEscape=false", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} closeOnEscape={false}><p>Body</p></Overlay>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("honours closeOnBackdrop=false", () => {
    const onClose = vi.fn();
    render(<Overlay onClose={onClose} closeOnBackdrop={false}><p>Body</p></Overlay>);
    fireEvent.click(screen.getByTestId("overlay-backdrop"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes its Escape listener on unmount", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Overlay onClose={onClose}><p>Body</p></Overlay>);
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

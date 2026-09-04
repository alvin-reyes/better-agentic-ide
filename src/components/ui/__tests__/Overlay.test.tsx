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

  it("does not close on a drag that starts inside and ends on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <Overlay onClose={onClose}>
        <input aria-label="Name" defaultValue="text to select" />
      </Overlay>
    );
    const backdrop = screen.getByTestId("overlay-backdrop");
    // Press inside the panel, release out on the scrim: the click's target is
    // their common ancestor — the backdrop — so a naive handler would close.
    fireEvent.mouseDown(screen.getByLabelText("Name"));
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("still closes when the press and the release are both on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <Overlay onClose={onClose}>
        <input aria-label="Name" />
      </Overlay>
    );
    const backdrop = screen.getByTestId("overlay-backdrop");
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("focus trap", () => {
    it("moves focus to the first focusable element on mount", () => {
      render(
        <Overlay onClose={() => {}}>
          <button>First</button>
          <button>Last</button>
        </Overlay>
      );
      expect(document.activeElement).toBe(screen.getByText("First"));
    });

    it("focuses the dialog itself when nothing inside is focusable", () => {
      render(<Overlay onClose={() => {}}><p>Body</p></Overlay>);
      expect(document.activeElement).toBe(screen.getByRole("dialog"));
    });

    it("wraps Tab from the last element back to the first", () => {
      render(
        <Overlay onClose={() => {}}>
          <button>First</button>
          <button>Last</button>
        </Overlay>
      );
      const last = screen.getByText("Last");
      last.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(screen.getByText("First"));
    });

    it("wraps Shift+Tab from the first element back to the last", () => {
      render(
        <Overlay onClose={() => {}}>
          <button>First</button>
          <button>Last</button>
        </Overlay>
      );
      expect(document.activeElement).toBe(screen.getByText("First"));
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(screen.getByText("Last"));
    });

    it("pulls focus back when it has escaped the dialog", () => {
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      render(
        <Overlay onClose={() => {}}>
          <button>First</button>
        </Overlay>
      );
      outside.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(screen.getByText("First"));
      outside.remove();
    });

    it("restores focus to the previously focused element on unmount", () => {
      const trigger = document.createElement("button");
      document.body.appendChild(trigger);
      trigger.focus();
      const { unmount } = render(
        <Overlay onClose={() => {}}>
          <button>First</button>
        </Overlay>
      );
      expect(document.activeElement).toBe(screen.getByText("First"));
      unmount();
      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    });
  });
});

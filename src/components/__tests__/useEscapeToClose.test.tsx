import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useEscapeToClose } from "../useEscapeToClose";

function Panel({ onClose }: { onClose: () => void }) {
  useEscapeToClose(onClose);
  return null;
}

const escape = () => fireEvent.keyDown(window, { key: "Escape" });

describe("useEscapeToClose", () => {
  it("closes only the panel opened last", () => {
    const under = vi.fn();
    const over = vi.fn();
    render(<Panel onClose={under} />);
    const top = render(<Panel onClose={over} />);
    escape();
    expect(over).toHaveBeenCalledOnce();
    expect(under).not.toHaveBeenCalled();

    top.unmount();
    escape();
    expect(under).toHaveBeenCalledOnce();
  });

  it("keeps its place when the panel under it re-renders with a new callback", () => {
    const first = vi.fn();
    const second = vi.fn();
    const over = vi.fn();
    const bottom = render(<Panel onClose={first} />);
    const top = render(<Panel onClose={over} />);
    bottom.rerender(<Panel onClose={second} />);
    escape();
    expect(over).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();

    // The callback in use is the latest one.
    top.unmount();
    escape();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
  });

  it("ignores other keys", () => {
    const onClose = vi.fn();
    render(<Panel onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});

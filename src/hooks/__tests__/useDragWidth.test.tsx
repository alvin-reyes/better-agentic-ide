import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useDragWidth } from "../useDragWidth";

function Panel({ rendered }: { rendered?: number }) {
  const { width, onDragStart } = useDragWidth(280, 720, 600);
  return (
    <aside
      aria-label="panel"
      style={{ width }}
      ref={(el) => {
        // jsdom lays nothing out; stand in for a panel squeezed by flex.
        if (el && rendered !== undefined) el.getBoundingClientRect = () => ({ width: rendered }) as DOMRect;
      }}
    >
      <div role="separator" onMouseDown={onDragStart} />
    </aside>
  );
}

const panel = () => screen.getByRole("complementary", { name: "panel" });

describe("useDragWidth", () => {
  it("starts at the initial width and clamps a drag from the left edge to min..max", () => {
    render(<Panel />);
    expect(panel().style.width).toBe("600px");
    fireEvent.mouseDown(screen.getByRole("separator"), { clientX: 1000 });
    fireEvent.mouseMove(document, { clientX: 950 });
    expect(panel().style.width).toBe("650px");
    fireEvent.mouseMove(document, { clientX: 0 });
    expect(panel().style.width).toBe("720px");
    fireEvent.mouseMove(document, { clientX: 5000 });
    expect(panel().style.width).toBe("280px");
    fireEvent.mouseUp(document);
    fireEvent.mouseMove(document, { clientX: 0 });
    expect(panel().style.width).toBe("280px");
  });

  it("starts the drag from the rendered width when the panel is squeezed", () => {
    // Stored 600, but flex shrank it to 300 on screen: narrowing by 50 must
    // narrow what the user sees, not wait for 600 to fall below the space.
    render(<Panel rendered={300} />);
    fireEvent.mouseDown(screen.getByRole("separator"), { clientX: 1000 });
    fireEvent.mouseMove(document, { clientX: 1050 });
    expect(panel().style.width).toBe("280px");
    fireEvent.mouseMove(document, { clientX: 990 });
    expect(panel().style.width).toBe("310px");
    fireEvent.mouseUp(document);
  });
});

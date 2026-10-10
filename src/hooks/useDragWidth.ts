import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The width of a right-hand side panel resized by dragging its left edge.
 * Not persisted.
 *
 * The drag starts from the panel's rendered width (the handle's parent), not
 * the stored one: when flex has squeezed the panel, the stored width is wider
 * than what is on screen, and a drag from it would do nothing until it fell
 * below the space available.
 */
export function useDragWidth(min: number, max: number, initial: number) {
  const [width, setWidth] = useState(initial);
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);

  const onDragStart = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const rendered = e.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
    const startWidth = rendered > 0 ? rendered : width;
    const onMove = (ev: MouseEvent) => setWidth(Math.round(Math.min(max, Math.max(min, startWidth + startX - ev.clientX))));
    const cleanup = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      cleanupRef.current = null;
    };
    cleanupRef.current?.();
    cleanupRef.current = cleanup;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", cleanup);
  }, [width, min, max]);

  return { width, onDragStart };
}

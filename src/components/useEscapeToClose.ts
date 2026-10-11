import { useEffect, useRef } from "react";

/** Panels listening for Escape, in the order they opened. */
const open: object[] = [];

/**
 * Closes a panel on Escape. Capture phase: the terminal keeps focus and xterm
 * stops Escape bubbling.
 *
 * Only the panel opened last answers, so a dialog over a panel closes alone.
 */
export function useEscapeToClose(onClose: () => void) {
  // Callers pass a new arrow each render. Re-registering on each would move a
  // panel to the top of the stack whenever it re-rendered.
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const entry = {};
    open.push(entry);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open[open.length - 1] !== entry) return;
      e.preventDefault();
      e.stopPropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      open.splice(open.indexOf(entry), 1);
    };
  }, []);
}

import { useEffect } from "react";

/**
 * Closes a panel on Escape. Capture phase: the terminal keeps focus and xterm
 * stops Escape bubbling.
 */
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
}

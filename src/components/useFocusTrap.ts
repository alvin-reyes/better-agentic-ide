import { useEffect, type RefObject } from "react";

/** What Tab stops at inside a dialog. The dialog itself (`tabindex="-1"`) is not one. */
const TABBABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps Tab and Shift+Tab inside a modal dialog: past its last control Tab
 * goes to its first, and the other way round. A dialog with no control keeps
 * focus on itself. Capture phase, as useEscapeToClose listens: the key is
 * handled before anything beneath the dialog sees it.
 *
 * Focus that fell to the page (a focused button that was disabled) is brought
 * back on the next Tab. Focus held by something outside the dialog is left to
 * it: a panel opened on top keeps its own Tab order.
 */
export function useFocusTrap(dialog: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = dialog.current;
      if (e.key !== "Tab" || !el) return;
      const active = document.activeElement;
      const inside = el.contains(active);
      if (!inside && active && active !== document.body) return;
      const stops = Array.from(el.querySelectorAll<HTMLElement>(TABBABLE));
      const first = stops[0] ?? el;
      const last = stops[stops.length - 1] ?? el;
      // Where focus would leave the dialog; anywhere else the browser's own move stays inside.
      const leaving = !inside || stops.length === 0 || (e.shiftKey ? active === first || active === el : active === last);
      if (!leaving) return;
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dialog]);
}

import { useEffect } from "react";
import { focusActiveTerminal } from "./useTerminal";
import { keyboardClaimed } from "../lib/keyboardOwner";

/** A dialog or panel is open over the terminal: keys belong to it. */
const overlayOpen = () => !!document.querySelector('[role="dialog"], [aria-modal="true"], .contracts-panel-overlay');

/** Nothing else has the keyboard (the page itself does), and nothing is open on top. */
const idle = () =>
  (document.activeElement === document.body || document.activeElement === null) &&
  !overlayOpen() &&
  // Panels that are not dialogs and carry no class say so themselves.
  !keyboardClaimed();

/**
 * Keep typing going to the terminal. Focus falls back to the page when the
 * welcome tour or a dialog closes, or the app starts before the terminal is
 * ready. At launch and when the window is re-activated, hand it back to the
 * active terminal; a key typed while the page has focus goes to the terminal
 * too. Clicks elsewhere are left alone, so selecting text still works.
 */
export function useTerminalFocusGuard() {
  useEffect(() => {
    const refocus = () => {
      if (idle()) focusActiveTerminal();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!idle() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (focusActiveTerminal() && e.key.length === 1) {
        // Deliver the key that found no target instead of dropping it.
        const ta = document.activeElement as HTMLTextAreaElement | null;
        if (ta?.classList.contains("xterm-helper-textarea")) {
          e.preventDefault();
          ta.dispatchEvent(new InputEvent("input", { data: e.key, inputType: "insertText", bubbles: true }));
        }
      }
    };
    // The terminal attaches asynchronously at launch; check again once it has.
    const timers = [300, 1000, 2000].map((ms) => window.setTimeout(refocus, ms));
    window.addEventListener("focus", refocus);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("focus", refocus);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}

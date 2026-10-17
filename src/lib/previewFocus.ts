import { useCallback, useRef, useState } from "react";

/**
 * Focus rules for the side panel (Preview panel). Opening a file into the
 * panel never moves focus; ⌘⇧B does, and closing it with focus inside gives
 * focus back to the terminal, as Esc does.
 */

/** The panel's root element, as PreviewPanel renders it. */
export const PREVIEW_PANEL_SELECTOR = '[role="complementary"][aria-label="Preview"]';

/** The terminal's input: what Esc focuses (useKeybindings). */
const TERMINAL_INPUT_SELECTOR = ".xterm-helper-textarea";

/** Before the panel closes: if focus is inside it, move it to the terminal. */
export function closePreviewFocus(panelEl: Element | null): void {
  const active = document.activeElement;
  if (!panelEl || !active || !panelEl.contains(active)) return;
  document.querySelector<HTMLElement>(TERMINAL_INPUT_SELECTOR)?.focus();
}

/**
 * Whether the panel is open, and its focus request, as App holds them.
 * - `toggle` (⌘⇧B, the palette): opening bumps `focusRequest`, so focus goes
 *   into the panel; closing is `close`.
 * - `openForFile` (a clicked file): opens without a request.
 * - `close`: focus inside goes to the terminal first, and the request goes
 *   back to 0. The panel unmounts when closed, so it can't remember what it
 *   served; without the reset, a panel later opened by a click would mount
 *   with the old request and take focus.
 */
export function usePreviewPanel() {
  const [open, setOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;

  const close = useCallback(() => {
    closePreviewFocus(document.querySelector(PREVIEW_PANEL_SELECTOR));
    setOpen(false);
    setFocusRequest(0);
  }, []);
  const toggle = useCallback(() => {
    if (openRef.current) {
      close();
    } else {
      setFocusRequest((n) => n + 1);
      setOpen(true);
    }
  }, [close]);
  const openForFile = useCallback(() => setOpen(true), []);

  return { open, focusRequest, toggle, close, openForFile };
}


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

/**
 * Which panels currently want the keyboard.
 *
 * The terminal focus guard redirects a keystroke to the terminal whenever
 * nothing else holds focus (`document.activeElement === document.body`). That
 * is right at launch and after a dialog closes, and wrong while a panel is
 * open: clicking a non-focusable part of a panel — a toolbar button, a label —
 * leaves focus on the body, and the next keystroke lands in the shell behind.
 *
 * Detecting panels by selector does not work here: Scratchpad, SettingsPanel,
 * CommandPalette and AgentPicker are inline-styled with no class or dialog
 * role, and the Scratchpad is a drawer beside the terminal rather than a modal,
 * so giving it `aria-modal` to be findable would be a lie. So a panel says so
 * instead.
 */
const owners = new Set<string>();

/** Claim the keyboard while `id` is open. Returns the release function. */
export function claimKeyboard(id: string): () => void {
  owners.add(id);
  return () => { owners.delete(id); };
}

/** Whether any panel currently wants the keyboard. */
export function keyboardClaimed(): boolean {
  return owners.size > 0;
}

/** Test seam. */
export function __resetKeyboardOwners(): void {
  owners.clear();
}

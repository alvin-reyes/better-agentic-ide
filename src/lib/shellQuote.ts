/**
 * The one quoter for every word ADE types into a pane's shell (ADR 0008).
 *
 * Maximal runs without `'` or `\` are single-quoted, and each `'` and `\` is
 * escaped outside quotes. Two quoted runs are never adjacent and no backslash
 * appears inside quotes, which is the subset sh, bash, zsh (with or without
 * RC_QUOTES) and fish all read the same way: fish treats `\'` and `\\` as
 * escapes inside single quotes, and RC_QUOTES reads `''` there as a quote.
 *
 * Control characters are not made typeable: callers collapse them first
 * (`UNTYPEABLE` in agentCommand.ts), because a line editor acts on them even
 * inside quotes.
 */
export function shellQuote(value: string): string {
  if (value === "") return "''";
  return value
    .split(/([\\'])/)
    .filter((part) => part !== "")
    .map((part) => (part === "'" ? "\\'" : part === "\\" ? "\\\\" : `'${part}'`))
    .join("");
}

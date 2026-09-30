/** Hints for a scratchpad prompt before it goes to an agent. */

export interface PromptHint {
  id: string;
  message: string;
}

const VAGUE = /\b(make it (better|nicer|work|good)|improve (it|this|things)|fix (it|this|everything|the bug)|clean (it|this) up|do the (rest|thing)|optimi[sz]e (it|this|everything)|you know what i mean|etc\.?$)/i;
const DONE = /\b(should|must|expect|so that|until|done when|acceptance|pass(es)?|returns?|test(s|ed)?|verify|ensure|make sure)\b/i;
const TARGET = /(`[^`]+`|[\w./-]+\.[a-z]{1,5}\b|\/[\w.-]+\/|\b(function|component|endpoint|route|table|class|module|file|page|screen|api|contract)\b)/i;
const MANY = /\b(and also|also|plus|additionally)\b/gi;

export function lintPrompt(text: string): PromptHint[] {
  const t = text.trim();
  // Skip slash commands, short replies and multi-prompt chains' separators.
  if (t.length < 25 || t.startsWith("/")) return [];
  const hints: PromptHint[] = [];
  if (VAGUE.test(t)) hints.push({ id: "vague", message: "Say what \"better\" or \"fixed\" means: the behaviour you expect." });
  if (!TARGET.test(t) && t.length < 600) hints.push({ id: "target", message: "Name the file, function or feature to work on." });
  if (!DONE.test(t) && t.split(/\s+/).length > 12) hints.push({ id: "done", message: "Add how to tell it's done, like a test that should pass or the output you expect." });
  if ((t.match(MANY) ?? []).length >= 3 && !t.includes("---")) hints.push({ id: "split", message: "Several tasks in one prompt. Split them with --- to chain them one at a time." });
  return hints;
}

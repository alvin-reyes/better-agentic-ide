/**
 * Which BMAD version a setup uses. Every entry point asks here: a project that
 * has BMAD keeps its version without a question, and one with neither is asked.
 */
import { create } from "zustand";
import { detectOnDisk, normRoot, setUpProject, type Methodology, type SetupResult } from "./projectSetup";

/**
 * `chosen` is the only answer that sets a project up. Callers treat every
 * other kind as "leave it", so a new kind needs no change in them.
 */
export type MethodologyAnswer =
  /** `asked`: a person picked it, rather than the project already being on it. */
  | { kind: "chosen"; methodology: Methodology; asked: boolean }
  | { kind: "dismissed" };

/** A way to put the question to a person. The default is the dialog. */
export type AskUi = (root: string) => Promise<MethodologyAnswer>;

/** The project the dialog is asking about; MethodologyPromptHost renders it. */
export const useMethodologyPrompt = create<{ request: { root: string } | null }>(() => ({ request: null }));

let waiting: { root: string; promise: Promise<MethodologyAnswer>; resolve: (a: MethodologyAnswer) => void } | null = null;

const askByDialog: AskUi = (root) => {
  if (waiting?.root === root) return waiting.promise;
  // One dialog at a time: a question that is covered by a newer one is over.
  waiting?.resolve({ kind: "dismissed" });
  let resolve!: (a: MethodologyAnswer) => void;
  const promise = new Promise<MethodologyAnswer>((r) => { resolve = r; });
  waiting = { root, promise, resolve };
  useMethodologyPrompt.setState({ request: { root } });
  return promise;
};

/** Answer the open dialog and close it. */
export function settlePrompt(answer: MethodologyAnswer) {
  const open = waiting;
  waiting = null;
  useMethodologyPrompt.setState({ request: null });
  open?.resolve(answer);
}

/**
 * The version to set `root` up on: the one on disk, or the person's answer.
 * The question must be answered; `dismissed` only means another project's
 * question replaced it, or the dialog's host went away.
 *
 * `ask` swaps the dialog for another way of asking (the cd hook's toast).
 */
export async function askMethodology(root: string, opts: { ask?: AskUi } = {}): Promise<MethodologyAnswer> {
  const at = normRoot(root);
  const detected = await detectOnDisk(at).catch((e) => {
    console.warn("BMAD check failed; asking which version", e);
    return null;
  });
  if (detected) return { kind: "chosen", methodology: detected, asked: false };
  return (opts.ask ?? askByDialog)(at);
}

/**
 * Ask, then set up: what the palette's command and both "Set up now" buttons
 * run. Null when no version was chosen.
 */
export async function askAndSetUp(root: string): Promise<SetupResult | null> {
  const answer = await askMethodology(root);
  if (answer.kind !== "chosen") return null;
  const result = await setUpProject(root, answer.methodology);
  window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result }));
  return result;
}

/** "/code/shop" → "shop", on either separator. */
export const projectName = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? root;

/** Test seam: forget any open question. */
export function __resetPromptForTests() {
  waiting = null;
  useMethodologyPrompt.setState({ request: null });
}

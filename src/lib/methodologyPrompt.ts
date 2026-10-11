/**
 * Which BMAD version a setup uses. Every entry point asks here: a project that
 * has BMAD keeps its version without a question, and one with neither is asked.
 */
import { create } from "zustand";
import { otherVersion, pendingSwitches } from "./bmadSwitch";
import {
  detectOnDisk, isSetupCandidate, isSwitching, markKept, normRoot, onProjectHasBmad, setUpProject, type Methodology, type SetupResult,
} from "./projectSetup";

/**
 * `chosen` is the only answer that sets a project up. Callers treat every
 * other kind as "leave it", so a new kind needs no change in them.
 */
export type MethodologyAnswer =
  /**
   * `asked`: a person picked it, rather than the project already being on it.
   * `done`: the project was set up on it while the question was open, so there
   * is nothing left to set up.
   * `switched`: a BMAD switch finished while the question was open; likewise
   * nothing to set up, and no second switch.
   */
  | { kind: "chosen"; methodology: Methodology; asked: boolean; done?: SetupResult; switched?: boolean }
  | { kind: "dismissed" }
  /**
   * Setup can't run here: a BMAD switch is running, or an earlier one didn't
   * finish (or couldn't be checked), so the project may have neither version on
   * disk. `reason` is for the person.
   */
  | { kind: "blocked"; reason: string };

/** A way to put the question to a person. The default is the dialog. */
export type AskUi = (root: string) => Promise<MethodologyAnswer>;

/**
 * What the shared dialog is showing, which MethodologyPromptHost renders:
 * which version to set up (`choose`), keep the version or switch (`keep`), or
 * the switch's confirm step (`confirm`). `back`: New Tab's keep-or-switch
 * question is behind the confirm step, which returns to it; otherwise it closes.
 */
export type PromptRequest =
  | { root: string; mode: "choose" }
  | { root: string; mode: "keep"; methodology: Methodology }
  | { root: string; mode: "confirm"; from: Methodology; to: Methodology; back: boolean };

/**
 * `replans`: bumped when the project behind a confirm step changed under it, so
 * the plan on screen is worked out again.
 */
export const useMethodologyPrompt = create<{ request: PromptRequest | null; replans: number }>(() => ({ request: null, replans: 0 }));

/** How a keep-or-switch question, or a switch asked for on its own, ended. */
export type SwitchAnswer =
  | { kind: "kept" }
  | { kind: "switched" }
  /** Set up on its version by another route while the question was open: nothing is left to set up. */
  | { kind: "setUp"; done: SetupResult }
  | { kind: "dismissed" }
  /** Not asked: another project's switch is running in the dialog. `reason` is for the person. */
  | { kind: "blocked"; reason: string };

let waiting: { root: string; promise: Promise<MethodologyAnswer>; resolve: (a: MethodologyAnswer) => void } | null = null;
let deciding: { root: string; promise: Promise<SwitchAnswer>; resolve: (a: SwitchAnswer) => void } | null = null;

/** One dialog at a time: a question that is covered by a newer one is over. */
function supersede() {
  const [choose, decide] = [waiting, deciding];
  waiting = null;
  deciding = null;
  choose?.resolve({ kind: "dismissed" });
  decide?.resolve({ kind: "dismissed" });
}

/**
 * Why a question about `root` can't take the dialog: another project's switch
 * is running in it. Replaced, a switch that worked would leave New Tab with no
 * answer, and one that failed would have nowhere to say so.
 */
function switchRunningElsewhere(root: string): string | null {
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode !== "confirm" || request.root === root || !isSwitching(request.root)) return null;
  return `A BMAD switch is running in ${projectName(request.root)}. Wait for it to finish.`;
}

const askByDialog: AskUi = (root) => {
  if (waiting?.root === root) return waiting.promise;
  const busy = switchRunningElsewhere(root);
  if (busy) return Promise.resolve({ kind: "blocked", reason: busy });
  supersede();
  let resolve!: (a: MethodologyAnswer) => void;
  const promise = new Promise<MethodologyAnswer>((r) => { resolve = r; });
  waiting = { root, promise, resolve };
  useMethodologyPrompt.setState({ request: { root, mode: "choose" } });
  return promise;
};

/** Answer the open "which version" dialog and close it. */
export function settlePrompt(answer: MethodologyAnswer) {
  const open = waiting;
  waiting = null;
  // Only its own dialog: a keep-or-switch question on screen is someone else's.
  if (useMethodologyPrompt.getState().request?.mode === "choose") useMethodologyPrompt.setState({ request: null });
  open?.resolve(answer);
}

function settleSwitch(answer: SwitchAnswer) {
  const open = deciding;
  deciding = null;
  const mode = useMethodologyPrompt.getState().request?.mode;
  if (mode === "keep" || mode === "confirm") useMethodologyPrompt.setState({ request: null });
  open?.resolve(answer);
}

// A project that got its version by another route while a dialog asks about it
// has its answer: the dialog closes instead of offering the other version, or
// a second switch.
onProjectHasBmad((root, methodology, done) => {
  if (waiting?.root === root) {
    settlePrompt(done
      ? { kind: "chosen", methodology, asked: false, done }
      : { kind: "chosen", methodology, asked: false, switched: true });
  }
  if (deciding?.root !== root) return;
  // A finished switch, whichever dialog ran it: the confirm step's own included.
  if (!done) settleSwitch({ kind: "switched" });
  // A setup ends New Tab's question, which waits to open the folder. A switch
  // asked for on its own is still what its person asked for, but its plan was
  // made before the setup.
  else if (newTabWaits()) settleSwitch({ kind: "setUp", done });
  else useMethodologyPrompt.setState((s) => ({ replans: s.replans + 1 }));
});

/**
 * The version to set up on after `answer`. One that a person picked is checked
 * against the disk again: the question can stay open a long time, and a project
 * that gained BMAD meanwhile keeps the version it has.
 */
export async function versionToSetUp(root: string, answer: Extract<MethodologyAnswer, { kind: "chosen" }>): Promise<Methodology> {
  if (!answer.asked) return answer.methodology;
  return (await detectOnDisk(normRoot(root)).catch(() => null)) ?? answer.methodology;
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
  if (isSwitching(at)) return { kind: "blocked", reason: "A BMAD switch is running." };
  // Fails closed: a check that can't be made is not "nothing pending".
  const pending = await pendingSwitches(at).then(([first]) => first ?? false, () => null);
  if (pending === null) return { kind: "blocked", reason: "Couldn't check for an unfinished BMAD switch." };
  if (pending) {
    const where = `${pending.archive}/ARCHIVE.md`;
    return {
      kind: "blocked",
      reason: pending.status === "unknown"
        ? `A BMAD switch in ${projectName(at)} left a record that couldn't be read. Setup waits until it is resolved: see ${where}.`
        : `A BMAD switch in ${projectName(at)} didn't finish. Setup waits until it is resolved: see ${where}.`,
    };
  }
  const detected = await detectOnDisk(at).catch((e) => {
    console.warn("BMAD check failed; asking which version", e);
    return null;
  });
  if (detected) return { kind: "chosen", methodology: detected, asked: false };
  const answer = await (opts.ask ?? askByDialog)(at);
  // A version someone picked is their answer to "which one" for good.
  if (answer.kind === "chosen" && answer.asked) markKept(at);
  return answer;
}

/**
 * Ask, then set up: what the palette's command and both "Set up now" buttons
 * run. Null when no version was chosen.
 *
 * These work on whatever folder the active pane is in, which can be the home
 * folder: that is refused before the question, which has no way out.
 */
export async function askAndSetUp(root: string): Promise<SetupResult | null> {
  // A string, as Tauri's own rejections are: callers show it as it is.
  if (!isSetupCandidate(normRoot(root))) throw NOT_A_PROJECT;
  const answer = await askMethodology(root);
  // Thrown as the string it is, like NOT_A_PROJECT: callers show it as it is.
  if (answer.kind === "blocked") throw refusal(answer.reason);
  if (answer.kind !== "chosen") return null;
  // Set up, and announced, by whoever got there first.
  if (answer.done) return answer.done;
  if (answer.switched) return null;
  const result = await setUpProject(root, await versionToSetUp(root, answer));
  window.dispatchEvent(new CustomEvent("project-setup-done", { detail: result }));
  return result;
}

const NOT_A_PROJECT = "This folder isn't a project.";

/**
 * Reasons thrown because setting up or switching isn't allowed here (blocked,
 * not a project, no BMAD), as opposed to a step that was tried and failed.
 * Both are strings, so the thrown ones are remembered: a caller shows a
 * refusal as it is, and prefixes a failure with what was being done.
 */
const refusals = new Set<string>();
function refusal(reason: string): string {
  refusals.add(reason);
  return reason;
}

/** Whether `error` is one of the reasons `askAndSetUp` or `switchOnDemand` refused with. */
export const isRefusal = (error: unknown): boolean => typeof error === "string" && refusals.has(error);

/** "/code/shop" → "shop", on either separator. */
export const projectName = (root: string) => root.split(/[\\/]/).filter(Boolean).pop() ?? root;

/** New Tab's question is open, or is behind the confirm step on screen. */
function newTabWaits(): boolean {
  const request = useMethodologyPrompt.getState().request;
  return request?.mode === "keep" || (request?.mode === "confirm" && request.back);
}

function decide(request: PromptRequest): Promise<SwitchAnswer> {
  const busy = switchRunningElsewhere(request.root);
  if (busy) return Promise.resolve({ kind: "blocked", reason: busy });
  supersede();
  let resolve!: (a: SwitchAnswer) => void;
  const promise = new Promise<SwitchAnswer>((r) => { resolve = r; });
  deciding = { root: request.root, promise, resolve };
  useMethodologyPrompt.setState({ request });
  return promise;
}

/**
 * "shop uses BMAD v4. Keep v4 (default) · Switch to v6…": asked from New Tab
 * about a project that already has BMAD, until it is answered once. Like the
 * version question it must be answered; `dismissed` only means another
 * project's question replaced it, or the dialog's host went away.
 */
export function askKeepOrSwitch(root: string, methodology: Methodology): Promise<SwitchAnswer> {
  const at = normRoot(root);
  if (deciding?.root !== at) return decide({ root: at, mode: "keep", methodology });
  // A switch of this project asked for on its own is on screen. New Tab now
  // waits on it too, so its way out is Back to the question, not Cancel:
  // cancelled, New Tab would be left with no answer and no folder opened.
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode === "confirm" && !request.back) useMethodologyPrompt.setState({ request: { ...request, back: true } });
  return deciding.promise;
}

/**
 * The switch's confirm step on its own, for the palette and the board. It has
 * Cancel: nobody was asked a question, so there is nothing that must be answered.
 */
export function askSwitch(root: string, from: Methodology): Promise<SwitchAnswer> {
  const at = normRoot(root);
  if (deciding?.root !== at) return decide({ root: at, mode: "confirm", from, to: otherVersion(from), back: false });
  // The keep-or-switch question about this project is open: this is its Switch.
  startSwitch();
  return deciding.promise;
}

const NO_BMAD = "This project has no BMAD to switch from.";

/** Switch `root` to the other version than it is on, after the confirm step. */
export async function switchOnDemand(root: string): Promise<SwitchAnswer> {
  const at = normRoot(root);
  const from = await detectOnDisk(at);
  // A string, as NOT_A_PROJECT is: callers show it as it is.
  if (!from) throw refusal(NO_BMAD);
  const answer = await askSwitch(at, from);
  // Thrown as the string it is, as askAndSetUp does: callers show it as it is.
  if (answer.kind === "blocked") throw refusal(answer.reason);
  return answer;
}

/** Keep: the project stays on its version, and isn't asked again. */
export function keepVersion() {
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode !== "keep") return;
  markKept(request.root);
  settleSwitch({ kind: "kept" });
}

/** Switch…: on to the confirm step. Nothing has changed yet. */
export function startSwitch() {
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode !== "keep") return;
  const to = otherVersion(request.methodology);
  useMethodologyPrompt.setState({ request: { root: request.root, mode: "confirm", from: request.methodology, to, back: true } });
}

/** Back, or Cancel: leave the confirm step with the project as it was. */
export function leaveConfirm() {
  const request = useMethodologyPrompt.getState().request;
  if (request?.mode !== "confirm") return;
  if (request.back) useMethodologyPrompt.setState({ request: { root: request.root, mode: "keep", methodology: request.from } });
  else settleSwitch({ kind: "dismissed" });
}

/** Nobody is left to answer: whatever is open is over. */
export function dismissPrompts() {
  settlePrompt({ kind: "dismissed" });
  settleSwitch({ kind: "dismissed" });
}

/** Test seam: forget any open question. */
export function __resetPromptForTests() {
  waiting = null;
  deciding = null;
  useMethodologyPrompt.setState({ request: null });
}

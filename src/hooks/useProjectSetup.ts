import { useEffect } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { GuardToast } from "./useContextGuard";
import { STACK_LABELS } from "../lib/projectMethodology";
import { askMethodology, projectName, versionToSetUp, type AskUi, type MethodologyAnswer } from "../lib/methodologyPrompt";
import {
  addStackAgents, foldersUpTo, isComplete, isSettingUp, isSetupCandidate, normRoot, onProjectSetUp, setUpProject, setupDeclined,
  setupRootOf, setupStatus, summarize, undoSetup, wasSetUp,
  type Methodology, type SetupResult,
} from "../lib/projectSetup";

/** Show what a setup wrote, with Undo. */
export function announceSetup(r: SetupResult, show: (t: GuardToast) => void, stackOnly = false) {
  const what = summarize(r.report);
  const failed = r.report.settingsError ? `AI attribution is still on: ${r.report.settingsError}.` : "";
  if (!what && !failed) return;
  const stacks = r.stacks.map((s) => STACK_LABELS[s]).join(", ");
  const added = !what ? "" : stackOnly
    ? `Added ${what} for it. Remove any in Integrations > Agents.`
    : `Added ${what}${stacks ? ` (${stacks} project)` : ""}. Existing files were left as they were.`;
  show({
    title: stackOnly ? `${stacks} detected in ${projectName(r.root)}` : `Set up ${projectName(r.root)}`,
    body: [added, failed].filter(Boolean).join(" "),
    action: { label: "Undo", run: () => { void undoSetup(r); } },
  });
}

/**
 * The open question per project. Its toast can be shown many times (another
 * toast replaces it, and the next run brings it back), and every copy's
 * buttons answer this one question.
 */
const asking = new Map<string, {
  promise: Promise<MethodologyAnswer>;
  answer: (m: Methodology) => void;
  /** The project was set up some other way: the question is over, unanswered. */
  leave: () => void;
  answered: boolean;
}>();

/** The key of a project's question toast, by which it is withdrawn. */
const questionKey = (root: string) => `setup-question:${normRoot(root)}`;

/** What a run is told when the answer isn't its to act on: callers do nothing with it. */
const LEAVE_IT: MethodologyAnswer = { kind: "dismissed" };

/**
 * The cd hook's way of asking which BMAD version: a toast, never a dialog over
 * the terminal someone is typing in. The question must be answered, so the
 * toast has no way out and doesn't time out; one that another toast replaced,
 * or that was withdrawn when the terminal left the project, is shown again by
 * the next run.
 *
 * Only the run that opened the question gets the answer. A later run shows
 * the toast again and is told to leave it, so one answer sets up once however
 * many copies of the toast were clicked.
 */
const askByToast = (show: (t: GuardToast) => void): AskUi => (root) => {
  let open = asking.get(root);
  // Answered, and its setup hasn't finished: there is nothing left to ask.
  if (open?.answered) return Promise.resolve(LEAVE_IT);
  const opened = !open;
  if (!open) {
    let resolve!: (a: MethodologyAnswer) => void;
    const promise = new Promise<MethodologyAnswer>((r) => { resolve = r; });
    const question = {
      promise,
      answered: false,
      answer: (methodology: Methodology) => {
        if (question.answered) return;
        question.answered = true;
        resolve({ kind: "chosen", methodology, asked: true });
      },
      leave: () => {
        question.answered = true;
        resolve(LEAVE_IT);
      },
    };
    asking.set(root, question);
    open = question;
  }
  const { answer } = open;
  show({
    title: `Set up ${projectName(root)} with BMAD?`,
    body: "ADE adds BMAD, the methodology and the role agents. Existing files are left as they were.",
    actions: [
      { label: "v6", run: () => answer("v6") },
      { label: "v4", run: () => answer("v4") },
    ],
    sticky: true,
    key: questionKey(root),
  });
  return opened ? open.promise : Promise.resolve(LEAVE_IT);
};

/**
 * Every git project a terminal opens in is set up once: BMAD, the ADE
 * methodology, the core roles and the agents for its stack. A project with no
 * BMAD is asked which version first, in a toast; nothing is set up until one
 * is picked. On later opens, agents for a stack the project has gained since
 * are added.
 *
 * The question belongs to the project the terminal is in: `withdraw` takes its
 * toast down (by key, so no other toast goes with it) when the terminal leaves
 * the project, when automatic setup is turned off, and when the project is set
 * up some other way.
 */
export function useProjectSetup(cwd: string | null, show: (t: GuardToast) => void, withdraw: (key: string) => void) {
  const enabled = useSettingsStore((s) => s.autoProjectSetup);
  useEffect(() => onProjectSetUp(({ root }) => {
    const open = asking.get(root);
    // An answered question is its own run's to finish; an open one is over.
    if (open && !open.answered) {
      asking.delete(root);
      open.leave();
    }
    withdraw(questionKey(root));
  }), [withdraw]);
  useEffect(() => {
    if (!enabled || !cwd) return;
    let cancelled = false;
    // The project this run put the question up for, if it did.
    let asked: string | null = null;
    const byToast = askByToast(show);
    const ask: AskUi = (root) => {
      // The terminal has left: this run has no place to ask from any more.
      if (cancelled) return Promise.resolve(LEAVE_IT);
      asked = root;
      return byToast(root);
    };
    (async () => {
      const root = await setupRootOf(cwd);
      // Skip projects whose setup the user undid.
      if (cancelled || !isSetupCandidate(root) || setupDeclined(root)) return;
      // And ones the new-tab dialog is setting up right now. That project can
      // be a folder below `root`: New tab sets up the folder that was picked,
      // and until its marker is written this hook resolves the repository
      // above it.
      if (foldersUpTo(cwd, root).some(isSettingUp)) return;
      const status = await setupStatus(root).catch(() => null);
      if (!status || cancelled) return;
      if (wasSetUp(root)) {
        if (!status.stacks.length) return;
        const r = await addStackAgents(root, status.stacks, status.methodology ?? "v6").catch(() => null);
        if (r && !cancelled) announceSetup(r, show, true);
        return;
      }
      // A project that has BMAD is set up where it sits. One with none is
      // only asked about when it is a git repository.
      if (!status.methodology && !status.isGit) return;
      const quiet = isComplete(status);
      // The project's own version, with no question; a project with neither is asked.
      const answer = await askMethodology(root, { ask });
      if (answer.kind !== "chosen") return;
      if (!answer.asked) {
        if (cancelled) return;
        // Not asked for, so a failure stays quiet: the next cd tries again.
        const result = await setUpProject(root, answer.methodology, status.stacks).catch(() => null);
        if (result && !cancelled && !quiet) announceSetup(result, show);
        return;
      }
      // An answer someone clicked stands even if the terminal has moved on
      // since, unless the project was set up some other way while it waited.
      try {
        // And on the version the project has, if it gained one by hand.
        const methodology = await versionToSetUp(root, answer);
        if (isSettingUp(root) || wasSetUp(root)) return;
        const result = await setUpProject(root, methodology, status.stacks).catch((e) => {
          show({ title: "Project setup", body: `Project setup failed: ${e}` });
          return null;
        });
        if (result && !quiet) announceSetup(result, show);
      } finally {
        // Kept until here so a run already under way doesn't ask again while
        // the setup is running. After a failure the next run asks afresh.
        asking.delete(normRoot(root));
      }
    })();
    return () => {
      cancelled = true;
      // The question stays open, without its toast: the next run for the
      // project shows it again.
      if (asked) withdraw(questionKey(asked));
    };
  }, [cwd, enabled, show, withdraw]);
}

/** Test seam: forget every open question. */
export function __resetSetupQuestionsForTests() {
  asking.clear();
}

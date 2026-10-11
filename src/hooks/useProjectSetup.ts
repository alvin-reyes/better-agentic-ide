import { useCallback, useEffect, useRef } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import type { GuardToast } from "./useContextGuard";
import { movedLabel, type SwitchDone } from "../lib/bmadSwitch";
import { joinPath } from "../lib/bmadRuntime/paths";
import { openFileFromTerminal } from "../lib/openFile";
import { STACK_LABELS } from "../lib/projectMethodology";
import { askMethodology, projectName, versionToSetUp, type AskUi, type MethodologyAnswer } from "../lib/methodologyPrompt";
import {
  addStackAgents, foldersUpTo, isComplete, isSettingUp, isSetupCandidate, normRoot, onProjectHasBmad, setUpProject, setupDeclined,
  setupRootOf, setupStatus, summarize, switchBlock, undoSetup, wasSetUp,
  type Methodology, type SetupFailure, type SetupResult, type SwitchBlock,
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
 * Say that a switch went through. Unlike a setup's toast it offers no Undo:
 * undoing the setup would leave the project with no BMAD at all. The way back
 * is in ARCHIVE.md, which it links to.
 */
export function announceSwitch(done: SwitchDone, show: (t: GuardToast) => void) {
  const { archive, archiveDenied } = done.result;
  const guard = archiveDenied
    ? "Agents can't edit the archive: a permission rule in .claude/settings.json stops them."
    : "The permission rule that stops agents editing the archive couldn't be added to .claude/settings.json, so the archive isn't protected from edits.";
  show({
    title: `Switched ${projectName(done.root)} to BMAD ${done.to}`,
    body: `Moved ${movedLabel(done.result)} to ${archive}/. ${guard} Agents already running keep their old role prompt until restarted.`,
    action: { label: "Open ARCHIVE.md", run: () => openFileFromTerminal(joinPath(done.root, `${archive}/ARCHIVE.md`)) },
  });
}

/**
 * The journals of unfinished switches a toast has pointed to this session.
 * The cd hook says so once for each; a route someone asked for says it every time.
 */
const toldPending = new Set<string>();

/**
 * Say why a setup or a switch didn't happen. When an unfinished switch is the
 * reason the toast links to its journal, which is where it is resolved, and
 * so stays up as long as any toast with a button.
 */
export function announceFailure(failed: SetupFailure, show: (t: GuardToast) => void) {
  const { why, title, archiveFile } = failed;
  if (archiveFile) toldPending.add(archiveFile);
  show({
    title: title ?? "Project setup",
    body: why,
    ...(archiveFile ? { action: { label: "Open ARCHIVE.md", run: () => openFileFromTerminal(archiveFile) } } : {}),
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
 * The question belongs to the project the terminal is in. Its toast is taken
 * down (by key, so no other toast goes with it) when the terminal leaves the
 * project, when automatic setup is turned off, and when the project is set up
 * some other way. It is the next run that takes it down, once it knows which
 * project the new folder is in: a `cd` inside the same project leaves the
 * toast mounted where it is, rather than withdrawing it and showing it again.
 */
export function useProjectSetup(cwd: string | null, show: (t: GuardToast) => void, withdraw: (key: string) => void) {
  const enabled = useSettingsStore((s) => s.autoProjectSetup);
  // The project whose question toast this hook has put on screen, if any.
  const questionFor = useRef<string | null>(null);
  const withdrawQuestion = useCallback(() => {
    const root = questionFor.current;
    questionFor.current = null;
    if (root) withdraw(questionKey(root));
  }, [withdraw]);
  useEffect(() => onProjectHasBmad((root) => {
    const open = asking.get(root);
    // An answered question is its own run's to finish; an open one is over.
    if (open && !open.answered) {
      asking.delete(root);
      open.leave();
    }
    if (questionFor.current && normRoot(questionFor.current) === normRoot(root)) questionFor.current = null;
    withdraw(questionKey(root));
  }), [withdraw]);
  // The toast goes when the hook does.
  useEffect(() => withdrawQuestion, [withdrawQuestion]);
  useEffect(() => {
    // No folder, or automatic setup is off: there is no project to ask about.
    if (!enabled || !cwd) {
      withdrawQuestion();
      return;
    }
    let cancelled = false;
    // This run put the question up, or put it up again.
    let asked = false;
    const byToast = askByToast(show);
    const ask: AskUi = (root) => {
      // The terminal has left: this run has no place to ask from any more.
      if (cancelled) return Promise.resolve(LEAVE_IT);
      asked = true;
      questionFor.current = root;
      return byToast(root);
    };
    // A project blocked by an unfinished switch is told why once, not on each
    // cd: after a restart nothing else on screen says so. Any other block (a
    // switch running, a check that failed) stays quiet here.
    const tellBlocked = (block: SwitchBlock) => {
      if (cancelled || !block.archiveFile || toldPending.has(block.archiveFile)) return;
      announceFailure({ why: block.reason, archiveFile: block.archiveFile }, show);
    };
    const run = async (root: string) => {
      // Skip projects whose setup the user undid.
      if (!isSetupCandidate(root) || setupDeclined(root)) return;
      // And ones the new-tab dialog is setting up right now. That project can
      // be a folder below `root`: New tab sets up the folder that was picked,
      // and until its marker is written this hook resolves the repository
      // above it.
      if (foldersUpTo(cwd, root).some(isSettingUp)) return;
      const status = await setupStatus(root).catch(() => null);
      if (!status || cancelled) return;
      if (wasSetUp(root)) {
        const block = await switchBlock(root);
        if (block) return tellBlocked(block);
        if (!status.stacks.length || cancelled) return;
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
      if (answer.kind === "blocked") tellBlocked(answer);
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
    };
    (async () => {
      const root = await setupRootOf(cwd);
      if (cancelled) return;
      // Another project's question leaves with it. The same project's stays.
      if (questionFor.current !== null && normRoot(questionFor.current) !== normRoot(root)) withdrawQuestion();
      await run(root);
      // This run found nothing to ask (set up meanwhile, declined, mid-setup):
      // a question still up for the project has had its day.
      if (!cancelled && !asked && questionFor.current !== null && normRoot(questionFor.current) === normRoot(root)) withdrawQuestion();
    })();
    return () => {
      // The question stays open, and so does its toast until the next run
      // knows whether the terminal is still in the project.
      cancelled = true;
    };
  }, [cwd, enabled, show, withdraw, withdrawQuestion]);
}

/** Test seam: forget every open question, and what has been said about unfinished switches. */
export function __resetSetupQuestionsForTests() {
  asking.clear();
  toldPending.clear();
}

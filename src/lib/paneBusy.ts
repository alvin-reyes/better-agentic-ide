import { binaryFor } from "../data/providers";
import type { Provider } from "./agentCommand";
import type { AgentSession } from "../stores/agentTrackerStore";

/**
 * What `pty_foreground_job` reports about a terminal's foreground process
 * (see `.ade/context/pane-busy.md`). Rust classifies; this side never compares
 * pids or shell names itself.
 *   - `shell`: an interactive shell at its prompt, the pane's own or a nested one.
 *   - `busy`: anything else. `label` names the program for the dialog, and
 *     `names` holds both normalised name candidates (sysinfo's name and the
 *     basename of argv[0]), so a tracked agent can be recognised by its binary.
 *   - `unknown`: there is no foreground process group to judge.
 */
export type Fg =
  | { kind: "unknown" }
  | { kind: "shell" }
  | { kind: "busy"; label: string; names: string[] };

export type PaneSession = Pick<AgentSession, "paneId" | "agentName" | "provider" | "status">;

export interface BusyInputs {
  /** This pane's tracker sessions, oldest first. */
  sessions: readonly PaneSession[];
  /** One sample of the foreground process. Rejects when there is no pty to ask. */
  sample: () => Promise<Fg>;
  wait: (ms: number) => Promise<void>;
  /** The old text heuristic, used only when the terminal cannot answer. */
  fallback: () => string | null;
}

/** How long a busy sample waits before it is believed: a prompt hook is gone by then. */
export const RESAMPLE_MS = 250;

/** Linux truncates a process's `comm` name to 15 characters. */
const COMM_LIMIT = 15;

function nameMatches(candidate: string, listed: string): boolean {
  return candidate === listed || (candidate.length === COMM_LIMIT && listed.startsWith(candidate));
}

/**
 * The name of what is running in a pane, or null when it is free.
 * A running tracked session decides at once. Otherwise the foreground process
 * does, and a busy sample counts only if a second one, RESAMPLE_MS later,
 * agrees. When the terminal cannot answer, the text heuristic decides.
 */
export async function decideBusy({ sessions, sample, wait, fallback }: BusyInputs): Promise<string | null> {
  const running = sessions.find((s) => s.status === "running");
  if (running) return running.agentName;

  const take = () => sample().catch((): Fg => ({ kind: "unknown" }));
  const first = await take();
  if (first.kind === "shell") return null;
  if (first.kind === "unknown") return fallback();

  await wait(RESAMPLE_MS);
  const second = await take();
  if (second.kind === "shell") return null;
  if (second.kind === "unknown") return fallback();

  // Name the agent only when its binary is what is in the foreground: the
  // dialog reads "a live <label> session".
  const last = sessions[sessions.length - 1];
  if (last) {
    const binary = binaryFor(last.provider as Provider);
    if (second.names.some((n) => nameMatches(n, binary))) return last.agentName;
  }
  return second.label;
}

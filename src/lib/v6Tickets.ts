import { readTicketTree, type TicketTree } from "./bmadTicketTree";
import { ticketView } from "./ticketView";
import { findGates } from "./gateDiscovery";
import { parseGate, type Gate } from "./bmadGates";
import type { StoryView } from "./storyState";
import type { Fs } from "./bmadRuntime/fs";
import { joinPath, normalizePath } from "./bmadRuntime/paths";

/**
 * ADE's record that a person approved a ticket: one file per ref holding the
 * date. v6 has no human approval status (`ready-for-dev` is written by agents
 * when their own plan is done), so the human gate lives in `.ade/`, beside the
 * verification gates ADE also owns.
 */
export const APPROVALS_DIR = ".ade/approvals";

export interface V6Tickets {
  tickets: StoryView[];
  epics: { slug: string; title: string; refs: string[] }[];
  /** Gates whose ref matches no ticket. */
  unmatchedGates: Gate[];
  /** Gates for a ticket that has a newer gate. */
  supersededGates: Gate[];
  problems: string[];
}

// The two ways a project can have no tree to read. The map reports a missing
// initiative folder itself, so neither is a problem here.
const NO_TREE = /^(no active initiative\b|active initiative folder not found)/;

async function approvedRefs(projectRoot: string, fs: Fs): Promise<Set<string>> {
  const dir = joinPath(projectRoot, APPROVALS_DIR);
  if (!(await fs.exists(dir))) return new Set();
  return new Set(await fs.list(dir));
}

/** A draft ticket a person approved is approved, and may be dispatched. */
function withApproval(v: StoryView, approved: Set<string>): StoryView {
  if (v.state !== "draft" || !approved.has(v.story.id)) return v;
  return { ...v, state: "approved", dispatchable: true };
}

/**
 * The active initiative's tickets as board rows. "Done" is believed only with
 * a readable PASS or WAIVED gate from `.ade/gates/` behind it (`ticketView`,
 * the same distrust rule as v4), and a draft is approved only by a person's
 * file in `.ade/approvals/`.
 *
 * A tree that fails to read (a malformed `tickets.toml`) is a problem, not a
 * failure: the rest of the board still has something to show.
 */
export async function v6Tickets(root: string, fs: Fs): Promise<V6Tickets> {
  const projectRoot = normalizePath(root);
  const problems: string[] = [];
  let tree: TicketTree | null = null;
  try {
    tree = await readTicketTree(projectRoot, fs);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!NO_TREE.test(message)) problems.push(`Ticket tree could not be read: ${message}`);
  }

  // Gates are read regardless, so an orphan verdict still surfaces.
  // An unreadable `.ade/` is a problem too: only the config fails the build.
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  let gates: Gate[] = [];
  try {
    gates = (await findGates(projectRoot, "v6", fs)).map((g) => parseGate(g.file, g.yaml));
  } catch (e) {
    problems.push(`Gates could not be read: ${message(e)}`);
  }
  let approved = new Set<string>();
  try {
    approved = await approvedRefs(projectRoot, fs);
  } catch (e) {
    problems.push(`Approvals could not be read: ${message(e)}`);
  }
  const tickets = (tree?.tickets ?? [])
    .map((t) => withApproval(ticketView(t, gates), approved))
    .sort((a, b) => a.story.id.localeCompare(b.story.id, undefined, { numeric: true }));

  const ids = new Set(tickets.map((v) => v.story.id));
  const cited = new Set(tickets.map((v) => v.gate?.file).filter(Boolean));
  const spare = gates.filter((g) => !cited.has(g.file));
  return {
    tickets,
    epics: (tree?.epics ?? []).map((e) => ({
      slug: e.slug,
      title: e.title,
      refs: (tree?.tickets ?? []).filter((t) => t.epic === e.slug).map((t) => t.id),
    })),
    unmatchedGates: spare.filter((g) => !ids.has(g.storyId)),
    supersededGates: spare.filter((g) => ids.has(g.storyId)),
    problems: [...problems, ...(tree?.problems ?? [])],
  };
}

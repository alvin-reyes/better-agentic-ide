import { readTicketTree, type TicketTree } from "./bmadTicketTree";
import { ticketView } from "./ticketView";
import { findGates } from "./gateDiscovery";
import { parseGate } from "./bmadGates";
import { executionComplete } from "./storyState";
import type { Artifact, ArtifactId } from "./bmadArtifacts";
import type { BmadPaths } from "./bmadConfig";
import type { BoardState, Stage, StageId } from "../stores/stageBoardStore";
import type { Fs } from "./bmadRuntime/fs";
import { joinPath, normalizePath, pathBasename } from "./bmadRuntime/paths";

/**
 * The stage board for a BMAD v6 project: the same `BoardState` `buildBoard`
 * gives a v4 project, from v6 evidence. The ticket tree comes from the runtime
 * port (through `readTicketTree`), the verdicts from ADE's own `.ade/gates/`,
 * and "done" is believed only with a readable PASS or WAIVED gate behind it
 * (`ticketView`, the same distrust rule as v4).
 *
 * The five stages and their evidence:
 *  - Brainstorming (optional): the initiative doc, `<folder>/<folder>.md`.
 *  - Design: the initiative doc plus at least one epic.
 *  - Audit: at least one gate file, or a plan with a `## Code Review` section.
 *  - Execution and Review: every ticket done — an empty tree is never done.
 */

const NO_INITIATIVE = /^no active initiative\b/;
const CODE_REVIEW = /^##[^\S\n]+Code Review\b/im;

function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

async function isFile(path: string, fs: Fs): Promise<boolean> {
  if (!(await fs.exists(path))) return false;
  try {
    await fs.readText(path);
    return true;
  } catch {
    return false; // a directory, or unreadable
  }
}

/** Plan files (`*-plan.md`) in the initiative folder and its epic folders, absolute. */
async function planFiles(tree: TicketTree, fs: Fs): Promise<string[]> {
  const dirs = [tree.initiative, ...tree.epics.map((e) => joinPath(tree.initiative, e.slug))];
  const out: string[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = await fs.list(dir);
    } catch {
      continue; // an epic the breakdown lists with no folder on disk
    }
    for (const n of names.filter((n) => n.endsWith("-plan.md")).sort()) out.push(joinPath(dir, n));
  }
  return out;
}

/** The first plan carrying a `## Code Review` section, or null. */
async function reviewedPlan(tree: TicketTree, fs: Fs): Promise<string | null> {
  for (const p of await planFiles(tree, fs)) {
    try {
      if (CODE_REVIEW.test((await fs.readText(p)).replace(/\r\n/g, "\n"))) return p;
    } catch {
      // unreadable: not evidence
    }
  }
  return null;
}

export async function buildBoardV6(root: string, fs: Fs): Promise<BoardState> {
  const projectRoot = normalizePath(root);

  // A fresh scaffold has no active initiative yet: that is an empty board, not
  // an error. Anything else (no config, a malformed tree) is a real failure.
  let tree: TicketTree | null;
  try {
    tree = await readTicketTree(projectRoot, fs);
  } catch (e) {
    if (e instanceof Error && NO_INITIATIVE.test(e.message)) tree = null;
    else throw e;
  }

  // Gates are read regardless, so an orphan verdict still surfaces.
  const gates = (await findGates(projectRoot, "v6", fs)).map((g) => parseGate(g.file, g.yaml));
  const tickets = tree?.tickets ?? [];
  const epics = tree?.epics ?? [];
  const views = tickets
    .map((t) => ticketView(t, gates))
    .sort((a, b) => a.story.id.localeCompare(b.story.id, undefined, { numeric: true }));

  const store = tree ? relativeTo(projectRoot, tree.initiative) : "";
  const initiativeDoc = tree ? joinPath(tree.initiative, `${pathBasename(tree.initiative)}.md`) : null;
  const initiativePresent = initiativeDoc ? await isFile(initiativeDoc, fs) : false;
  const initiativeDocRel = initiativeDoc ? relativeTo(projectRoot, initiativeDoc) : "";
  const firstEpic = epics[0];
  const plan = tree && gates.length === 0 ? await reviewedPlan(tree, fs) : null;
  const reviewsPresent = gates.length > 0 || plan !== null;

  const artifact = (id: ArtifactId, label: string, path: string, present: boolean, isDirectory: boolean): Artifact => ({
    id, label, path, present, isDirectory,
  });
  const artifacts: Artifact[] = [
    artifact("brief", "Initiative", initiativeDocRel, initiativePresent, false),
    artifact("prd", "Initiative", initiativeDocRel, initiativePresent, false),
    firstEpic
      ? artifact("architecture", "Epics", joinPath(joinPath(store, firstEpic.slug), `${firstEpic.slug}.md`), true, false)
      : artifact("architecture", "Epics", store, false, true),
    plan
      ? artifact("reviews", "Reviews", relativeTo(projectRoot, plan), true, false)
      : artifact("reviews", "Reviews", ".ade/gates", reviewsPresent, true),
  ];

  const done = executionComplete(views);
  const specs: (Omit<Stage, "complete"> & { own: boolean })[] = [
    { id: "brainstorming", label: "Brainstorming", phase: "Planning", evidence: ["brief"], optional: true, own: initiativePresent },
    { id: "design", label: "Design", phase: "Planning", evidence: ["prd", "architecture"], optional: false, own: initiativePresent && epics.length > 0 },
    { id: "audit", label: "Audit", phase: "Planning", evidence: ["reviews"], optional: false, own: reviewsPresent },
    { id: "execution", label: "Execution", phase: "Dev cycle", evidence: [], optional: false, own: done },
    { id: "review", label: "Review", phase: "Dev cycle", evidence: [], optional: false, own: done },
  ];
  // Completion is monotonic, exactly as in buildBoard: a stage cannot be
  // complete while an earlier one is not.
  const stages: Stage[] = specs.map(({ own, ...s }, i) => ({
    ...s,
    complete: own && specs.slice(0, i).every((p) => p.own),
  }));

  // v6 has no core-config.yaml; these name where the v6 equivalents live.
  // Nothing reads `paths` beyond `usedDefaults` today, but no field is faked.
  const paths: BmadPaths = {
    qaLocation: ".ade",
    prdFile: initiativeDocRel,
    prdSharded: false,
    prdShardedLocation: "",
    architectureFile: firstEpic ? artifacts[2].path : "",
    architectureSharded: false,
    architectureShardedLocation: "",
    devStoryLocation: store,
    usedDefaults: false,
  };

  const storyIds = new Set(views.map((v) => v.story.id));
  const cited = new Set(views.map((v) => v.gate?.file).filter(Boolean));
  const spare = gates.filter((g) => !cited.has(g.file));
  const currentStage: StageId = stages.find((s) => !s.complete)?.id ?? "review";

  return {
    paths,
    artifacts,
    stories: views,
    stages,
    unmatchedGates: spare.filter((g) => !storyIds.has(g.storyId)),
    supersededGates: spare.filter((g) => storyIds.has(g.storyId)),
    currentStage,
    usedDefaults: false,
  };
}

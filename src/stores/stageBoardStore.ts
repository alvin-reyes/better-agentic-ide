import { parseBmadConfig, type BmadPaths } from "../lib/bmadConfig";
import { resolveArtifacts, type Artifact, type ArtifactId } from "../lib/bmadArtifacts";
import { parseStory } from "../lib/bmadStories";
import { parseGate, type Gate } from "../lib/bmadGates";
import { executionComplete, storyView, type StoryView } from "../lib/storyState";
import { BMAD_PHASES } from "../data/bmadPhases";

/**
 * The board's view of a project.
 *
 * Holds no persisted state of its own: the files are the state. That is the
 * whole answer to "nothing survives", and it means there is no second source of
 * truth to drift from the first. Everything here is a pure function of what was
 * read from disk, so the store is tested without mocking Tauri.
 */
export type StageId = "brainstorming" | "design" | "audit" | "execution" | "review";

export interface Stage {
  id: StageId;
  label: string;
  /**
   * BMAD's own two-phase approach, which the five stages sit inside. Taken from
   * BMAD_PHASES rather than retyped, so the constant stays the single source.
   */
  phase: (typeof BMAD_PHASES)[number];
  evidence: ArtifactId[];
  /**
   * True when the stage may be passed without its own evidence.
   *
   * Brainstorming is optional in BMAD's own terms: it is an `optional_steps`
   * entry in the greenfield workflows, and none of the three brownfield
   * workflows produces a brief at all. Requiring one held every brownfield
   * project at the first stage with no way past it.
   */
  optional: boolean;
  complete: boolean;
}

export interface BoardState {
  paths: BmadPaths;
  artifacts: Artifact[];
  stories: StoryView[];
  stages: Stage[];
  /**
   * Gates whose story id matches no story file.
   *
   * A gate is otherwise reachable only through the story it belongs to, so an
   * orphan — a renamed story, or an unsubstituted `{epic}.{story}` placeholder —
   * would be parsed and silently discarded along with its error.
   */
  unmatchedGates: Gate[];
  /** The first incomplete stage. */
  currentStage: StageId;
  usedDefaults: boolean;
}

type StageSpec = Omit<Stage, "complete">;

const STAGES: StageSpec[] = [
  { id: "brainstorming", label: "Brainstorming", phase: "Planning", evidence: ["brief"], optional: true },
  { id: "design", label: "Design", phase: "Planning", evidence: ["prd", "architecture"], optional: false },
  { id: "audit", label: "Audit", phase: "Planning", evidence: ["reviews"], optional: false },
  { id: "execution", label: "Execution", phase: "Dev cycle", evidence: [], optional: false },
  { id: "review", label: "Review", phase: "Dev cycle", evidence: [], optional: false },
];

export function buildBoard(input: {
  config: string | null;
  artifactExists: (path: string) => boolean;
  stories: { file: string; markdown: string }[];
  gates: { file: string; yaml: string }[];
}): BoardState {
  const paths = parseBmadConfig(input.config);
  const artifacts = resolveArtifacts(paths, input.artifactExists);
  const gates = input.gates.map((g) => parseGate(g.file, g.yaml));
  const stories = input.stories
    .map((s) => storyView(parseStory(s.file, s.markdown), gates))
    .sort((a, b) => a.story.id.localeCompare(b.story.id, undefined, { numeric: true }));

  const present = (id: ArtifactId) => artifacts.find((a) => a.id === id)?.present ?? false;
  const done = executionComplete(stories);
  const anyLaterEvidence = (from: number) =>
    STAGES.slice(from + 1).some((s) => s.evidence.length > 0 && s.evidence.every(present));

  const stages: Stage[] = STAGES.map((s, i) => ({
    ...s,
    complete:
      s.id === "execution" || s.id === "review"
        ? done
        : (s.evidence.length > 0 && s.evidence.every(present)) ||
          // An optional stage is passed once the work after it has started: its
          // artifact is still reported absent, so skipping stays visible.
          (s.optional && anyLaterEvidence(i)),
  }));

  const claimed = new Set(stories.map((v) => v.gate?.file).filter(Boolean));

  return {
    paths,
    artifacts,
    stories,
    stages,
    unmatchedGates: gates.filter((g) => !claimed.has(g.file)),
    currentStage: stages.find((s) => !s.complete)?.id ?? "review",
    usedDefaults: paths.usedDefaults,
  };
}

/**
 * Evidence on disk is necessary but not sufficient: an agent can write a stub,
 * and a click alone is how a project reaches Execution with no PRD. The human
 * action lives in the component; this answers whether it may be offered.
 */
export function canAdvance(board: BoardState, from: StageId): boolean {
  return board.stages.find((s) => s.id === from)?.complete ?? false;
}

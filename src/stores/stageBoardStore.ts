import { parseBmadConfig, type BmadPaths } from "../lib/bmadConfig";
import { resolveArtifacts, type Artifact, type ArtifactId } from "../lib/bmadArtifacts";
import { parseStory } from "../lib/bmadStories";
import { parseGate } from "../lib/bmadGates";
import { executionComplete, storyView, type StoryView } from "../lib/storyState";

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
  /** BMAD's own two-phase approach, which the five stages sit inside. */
  phase: "Planning" | "Dev cycle";
  evidence: ArtifactId[];
  complete: boolean;
}

export interface BoardState {
  paths: BmadPaths;
  artifacts: Artifact[];
  stories: StoryView[];
  stages: Stage[];
  /** The first incomplete stage. */
  currentStage: StageId;
  usedDefaults: boolean;
}

const STAGES: { id: StageId; label: string; phase: Stage["phase"]; evidence: ArtifactId[] }[] = [
  { id: "brainstorming", label: "Brainstorming", phase: "Planning", evidence: ["brief"] },
  { id: "design", label: "Design", phase: "Planning", evidence: ["prd", "architecture"] },
  { id: "audit", label: "Audit", phase: "Planning", evidence: ["reviews"] },
  { id: "execution", label: "Execution", phase: "Dev cycle", evidence: [] },
  { id: "review", label: "Review", phase: "Dev cycle", evidence: [] },
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

  const stages: Stage[] = STAGES.map((s) => ({
    ...s,
    complete:
      s.id === "execution" || s.id === "review"
        ? done
        : s.evidence.length > 0 && s.evidence.every(present),
  }));

  return {
    paths,
    artifacts,
    stories,
    stages,
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

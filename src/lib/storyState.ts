import { gateFor, type Gate } from "./bmadGates";
import { isDispatchable, type Story } from "./bmadStories";

/**
 * What a story's state actually is, as opposed to what its file claims.
 *
 * BMAD's development loop names two steps as the human's: "You -> Review and
 * approve story" and "You -> Verify completion", and its knowledge base says
 * each status change requires user verification. Nothing enforces that today,
 * so a file can say Done with nothing behind it.
 *
 * We cannot stop an agent writing Done into a file. We can decline to believe
 * it, which is what "no agent certifies its own work" means in practice.
 */
export type StoryState =
  | "draft" | "approved" | "in-progress" | "review" | "done" | "claimed" | "unknown";

export interface StoryView {
  story: Story;
  gate: Gate | undefined;
  state: StoryState;
  dispatchable: boolean;
  /** Why the state differs from the file, or what the gate said. */
  note: string;
}

const PLAIN: Record<string, StoryState> = {
  Draft: "draft",
  Approved: "approved",
  InProgress: "in-progress",
  Review: "review",
  unknown: "unknown",
};

export function storyView(story: Story, gates: Gate[]): StoryView {
  const gate = gateFor(story.id, gates);
  const dispatchable = isDispatchable(story);

  if (story.status !== "Done") {
    const note = gate?.error ? `gate unreadable: ${gate.error}` : gate?.reason ?? "";
    return { story, gate, state: PLAIN[story.status] ?? "unknown", dispatchable, note };
  }

  // Done is the one status that is not taken at face value.
  if (gate?.verdict === "PASS") {
    return { story, gate, state: "done", dispatchable, note: gate.reason };
  }
  if (gate?.verdict === "WAIVED") {
    return {
      story, gate, state: "done", dispatchable,
      note: `waived: ${gate.reason || "no reason given"}`,
    };
  }
  const why = gate
    ? gate.error
      ? `gate unreadable: ${gate.error}`
      : `gate says ${gate.verdict}`
    : "no gate file";
  return { story, gate, state: "claimed", dispatchable, note: why };
}

/**
 * Execution is complete only when every story is finished.
 *
 * "The story directory exists" is satisfied by a single story, which would let
 * a project leave Execution with the backlog barely started. An empty backlog
 * is not complete either: nothing has been planned yet.
 */
export function executionComplete(views: StoryView[]): boolean {
  return views.length > 0 && views.every((v) => v.state === "done");
}

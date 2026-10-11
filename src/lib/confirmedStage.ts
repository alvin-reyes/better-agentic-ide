import type { Fs } from "./bmadRuntime/fs";
import { joinPath } from "./bmadRuntime/paths";
import { canAdvance, STAGE_ORDER, type BoardState, type StageId } from "../stores/stageBoardStore";

/** The stage a person confirmed: one line, a StageId. */
export const STAGE_FILE = ".ade/stage";

export interface StageView {
  shown: StageId;
  derived: StageId;
  tracked: boolean;
  invalid: boolean;
  claimed: boolean;
  next: StageId | null;
  prev: StageId | null;
}

/**
 * The stage the rail shows, and which moves it may offer.
 *
 * Evidence alone does not advance a tracked project (an agent can write a
 * stub) and the file alone is not believed (an agent can write the file): a
 * tracked stage whose earlier stages lack evidence is claimed, like a story
 * that says Done with no gate. Without a valid file the rail follows the
 * evidence as it always did, so no existing project moves backwards.
 */
export function stageView(board: BoardState, file: string | null): StageView {
  const derived = board.currentStage;
  const value = file?.trim() ?? null;
  const tracked = value !== null && (STAGE_ORDER as string[]).includes(value);
  const shown = tracked ? (value as StageId) : derived;
  const i = STAGE_ORDER.indexOf(shown);
  const claimed = tracked && STAGE_ORDER.indexOf(derived) < i;
  const last = i === STAGE_ORDER.length - 1;
  return {
    shown,
    derived,
    tracked,
    invalid: value !== null && !tracked,
    claimed,
    // Not from a claimed stage: advancing past one the files do not support
    // would compound the claim.
    next: tracked && !claimed && !last && canAdvance(board, shown) ? STAGE_ORDER[i + 1] : null,
    prev: i > 0 ? STAGE_ORDER[i - 1] : null,
  };
}

/** What an unreadable `.ade/stage` reads as: never a StageId, so it is invalid. */
export const UNREADABLE_STAGE = "\u0000unreadable";

/**
 * The raw `.ade/stage`, or null when there is none. A file that exists but
 * cannot be read (a directory, no permission) reads as `UNREADABLE_STAGE`,
 * so the rail falls back to the evidence with a warning instead of failing
 * the whole rebuild.
 */
export async function readStageFile(root: string, fs: Fs): Promise<string | null> {
  const path = joinPath(root, STAGE_FILE);
  if (!(await fs.exists(path))) return null;
  try {
    return await fs.readText(path);
  } catch {
    return UNREADABLE_STAGE;
  }
}

export async function writeStage(root: string, stage: StageId, fs: Fs): Promise<void> {
  await fs.mkdir(joinPath(root, ".ade"));
  await fs.writeText(joinPath(root, STAGE_FILE), `${stage}\n`);
}

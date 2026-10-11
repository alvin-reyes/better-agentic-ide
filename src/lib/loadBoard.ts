import type { Fs } from "./bmadRuntime/fs";
import { joinPath } from "./bmadRuntime/paths";
import { gatesDir, parseBmadConfig } from "./bmadConfig";
import { artifactCandidates } from "./bmadArtifacts";
import { buildBoard, type BoardState } from "../stores/stageBoardStore";

export const V4_CONFIG = ".bmad-core/core-config.yaml";

async function readIfPresent(path: string, fs: Fs): Promise<string | null> {
  if (!(await fs.exists(path))) return null;
  try {
    return await fs.readText(path);
  } catch {
    return null; // a directory, or unreadable
  }
}

/**
 * Files in `dir` (relative to root) whose names pass `keep`, as
 * `{ file, text, error }`, sorted. A file that is listed but cannot be read
 * is kept with empty text and its error, so it still shows on the board.
 */
async function filesIn(root: string, dir: string, keep: (name: string) => boolean, fs: Fs) {
  const abs = joinPath(root, dir);
  if (!(await fs.exists(abs))) return [];
  const out: { file: string; text: string; error?: string }[] = [];
  for (const name of (await fs.list(abs)).filter(keep).sort()) {
    const file = `${dir}/${name}`;
    try {
      out.push({ file, text: await fs.readText(joinPath(abs, name)) });
    } catch (e) {
      out.push({ file, text: "", error: String(e) });
    }
  }
  return out;
}

export type V4Inputs = Parameters<typeof buildBoard>[0] & {
  /** Story and gate files that are listed but could not be read, with why. */
  problems: string[];
};

/**
 * Everything `buildBoard` needs for a v4 project, read through `fs`.
 *
 * `buildBoard` takes a synchronous `artifactExists`, so every candidate path
 * is checked here first and the answer is a lookup.
 */
export async function v4Inputs(root: string, fs: Fs): Promise<V4Inputs> {
  const config = await readIfPresent(joinPath(root, V4_CONFIG), fs);
  const paths = parseBmadConfig(config);

  const present = new Set<string>();
  for (const c of artifactCandidates(paths)) {
    for (const cand of c.candidates) {
      if (await fs.exists(joinPath(root, cand.path))) present.add(cand.path);
    }
  }

  const stories = await filesIn(root, paths.devStoryLocation, (n) => n.endsWith(".md"), fs);
  const gates = await filesIn(root, gatesDir(paths), (n) => /\.ya?ml$/.test(n), fs);
  return {
    config,
    artifactExists: (p) => present.has(p),
    stories: stories.map((s) => ({ file: s.file, markdown: s.text })),
    gates: gates.map((g) => ({ file: g.file, yaml: g.text })),
    problems: [...stories, ...gates].filter((f) => f.error).map((f) => `${f.file}: could not be read: ${f.error}`),
  };
}

/** The five-stage board for a BMAD v4 project. A v6 project has a map instead (`buildV6Map`). */
export async function loadBoard(root: string, fs: Fs): Promise<BoardState> {
  const inputs = await v4Inputs(root, fs);
  const board = buildBoard(inputs);
  return inputs.problems.length ? { ...board, problems: inputs.problems } : board;
}

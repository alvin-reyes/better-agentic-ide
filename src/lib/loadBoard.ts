import type { Fs } from "./bmadRuntime/fs";
import { joinPath } from "./bmadRuntime/paths";
import { gatesDir, parseBmadConfig } from "./bmadConfig";
import { artifactCandidates } from "./bmadArtifacts";
import { buildBoardV6 } from "./boardV6";
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

/** Files in `dir` (relative to root) whose names pass `keep`, as `{ file, text }`, sorted. */
async function filesIn(root: string, dir: string, keep: (name: string) => boolean, fs: Fs) {
  const abs = joinPath(root, dir);
  if (!(await fs.exists(abs))) return [];
  const out: { file: string; text: string }[] = [];
  for (const name of (await fs.list(abs)).filter(keep).sort()) {
    const text = await readIfPresent(joinPath(abs, name), fs);
    if (text !== null) out.push({ file: `${dir}/${name}`, text });
  }
  return out;
}

/**
 * Everything `buildBoard` needs for a v4 project, read through `fs`.
 *
 * `buildBoard` takes a synchronous `artifactExists`, so every candidate path
 * is checked here first and the answer is a lookup.
 */
export async function v4Inputs(root: string, fs: Fs): Promise<Parameters<typeof buildBoard>[0]> {
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
  };
}

/** The board for a project, by its methodology. */
export async function loadBoard(root: string, methodology: "v4" | "v6", fs: Fs): Promise<BoardState> {
  return methodology === "v6" ? buildBoardV6(root, fs) : buildBoard(await v4Inputs(root, fs));
}

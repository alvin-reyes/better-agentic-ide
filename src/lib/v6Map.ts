import type { Fs } from "./bmadRuntime/fs";
import { joinPath, normalizePath } from "./bmadRuntime/paths";
import { activeInitiativeName, outputFolder } from "./bmadRuntime/tickets";
import { readBacklogTree } from "./bmadTicketTree";
import { readFrontmatter } from "./frontmatter";
import { ticketView } from "./ticketView";
import type { Gate } from "./bmadGates";
import type { StoryView } from "./storyState";
import { v6Tickets } from "./v6Tickets";
import {
  classifyFolder, isDirectory, isFile, readFolderDoc, readPlanFile, readRetrospective, relativeTo,
  type DocResult, type V6Doc, type V6Phase,
} from "./v6Kinds";

export interface V6Map {
  /** `{output_folder}`, project-relative, for the watcher. */
  outputFolder: string;
  initiative: { title: string; folder: string } | null;
  initiativeState: "active" | "none" | "missing";
  docs: Record<V6Phase, V6Doc[]>;
  /** Docs and plans written with no initiative active, loose in `{output_folder}`. */
  loose: V6Doc[];
  epics: { slug: string; title: string; refs: string[] }[];
  tickets: StoryView[];
  backlog: StoryView[];
  unmatchedGates: Gate[];
  supersededGates: Gate[];
  problems: string[];
}

const byName = (a: V6Doc, b: V6Doc) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name);

/**
 * Every doc and loose plan directly in `dir`, by kind. One level only: a doc
 * folder is probed for its main and status files, never walked, so a huge
 * `.working/` or `imports/` costs nothing. A symlinked folder is read like
 * any other at this depth and never followed further.
 */
async function scanFolder(projectRoot: string, dir: string, skip: (name: string) => boolean, fs: Fs): Promise<{ found: { phase: V6Phase; r: DocResult }[] }> {
  const found: { phase: V6Phase; r: DocResult }[] = [];
  for (const name of (await fs.list(dir)).sort()) {
    if (skip(name)) continue;
    const abs = joinPath(dir, name);
    if (/^plan-.+\.md$/.test(name)) {
      const r = await readPlanFile(projectRoot, abs, fs);
      if (r) found.push({ phase: "implementation", r });
    } else if (name === "deferred-work.md") {
      found.push({ phase: "implementation", r: { doc: { kind: "deferred", label: "Deferred work", name: "", path: relativeTo(projectRoot, abs), status: "present" }, problem: null } });
    } else {
      const kind = classifyFolder(name);
      if (kind && (await isDirectory(abs, fs))) found.push({ phase: kind.phase, r: await readFolderDoc(projectRoot, abs, kind, fs) });
    }
  }
  return { found };
}

async function initiativeTitle(folder: string, name: string, fs: Fs): Promise<string> {
  const doc = joinPath(folder, `${name}.md`);
  if (!(await isFile(doc, fs))) return name;
  return readFrontmatter(await fs.readText(doc))?.title || name;
}

/**
 * The board for a BMAD v6 project: a map of v6's four phases, not a sequence.
 * v6 says its phases are "not a mandatory sequence" and requires no skill, so
 * nothing here is a current stage; the human gates stay on the tickets.
 *
 * Only a config that cannot be read fails the build. A missing initiative
 * folder, a malformed ticket tree or an unreadable doc is a problem beside
 * whatever else could be shown.
 */
export async function buildV6Map(root: string, fs: Fs): Promise<V6Map> {
  const projectRoot = normalizePath(root);
  const out = await outputFolder(projectRoot, fs);
  const name = await activeInitiativeName(projectRoot, fs);
  const problems: string[] = [];
  const docs: Record<V6Phase, V6Doc[]> = { analysis: [], planning: [], implementation: [], validation: [] };
  const add = (phase: V6Phase, r: DocResult, into: V6Doc[] = docs[phase]) => {
    into.push(r.doc);
    if (r.problem) problems.push(r.problem);
  };

  let initiative: V6Map["initiative"] = null;
  let initiativeState: V6Map["initiativeState"] = "none";
  const folder = name ? normalizePath(joinPath(out, name)) : null;
  if (name && folder) {
    if (await isDirectory(folder, fs)) {
      initiativeState = "active";
      initiative = { title: await initiativeTitle(folder, name, fs), folder: name };
    } else {
      initiativeState = "missing";
      problems.push(`Initiative ${name} not found: ${relativeTo(projectRoot, folder)}`);
    }
  }

  const t = await v6Tickets(projectRoot, fs);
  problems.push(...t.problems);

  if (initiativeState === "active" && folder) {
    for (const { phase, r } of (await scanFolder(projectRoot, folder, () => false, fs)).found) add(phase, r);
    // Specs can sit inside the epic they specify; each epic may have a retrospective.
    for (const e of t.epics) {
      const epicFolder = joinPath(folder, e.slug);
      if (!(await isDirectory(epicFolder, fs))) continue;
      for (const n of (await fs.list(epicFolder)).filter((n) => n.startsWith("spec-")).sort()) {
        const kind = classifyFolder(n);
        const abs = joinPath(epicFolder, n);
        if (kind && (await isDirectory(abs, fs))) add("planning", await readFolderDoc(projectRoot, abs, kind, fs));
      }
      const retro = await readRetrospective(projectRoot, epicFolder, fs);
      if (retro) add("validation", retro);
    }
  }

  const loose: V6Doc[] = [];
  let backlog: StoryView[] = [];
  if (await isDirectory(out, fs)) {
    const skip = (n: string) => n === "backlog" || n === "inbox" || n.startsWith("initiative-") || n === name;
    for (const { phase, r } of (await scanFolder(projectRoot, out, skip, fs)).found) add(phase, r, loose);
    try {
      const tree = await readBacklogTree(projectRoot, fs);
      // No gates: a backlog ref is a file name, which `.ade/gates/` cannot key.
      backlog = (tree?.tickets ?? [])
        .map((ticket) => ticketView(ticket, []))
        .map((v) => ({ ...v, dispatchable: false }));
      problems.push(...(tree?.problems ?? []));
    } catch (e) {
      problems.push(`Backlog could not be read: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const list of Object.values(docs)) list.sort(byName);
  loose.sort(byName);
  return {
    outputFolder: relativeTo(projectRoot, out),
    initiative,
    initiativeState,
    docs,
    loose,
    epics: t.epics,
    tickets: t.tickets,
    backlog,
    unmatchedGates: t.unmatchedGates,
    supersededGates: t.supersededGates,
    problems,
  };
}

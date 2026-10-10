import type { Fs } from "./bmadRuntime/fs";
import { joinPath, normalizePath } from "./bmadRuntime/paths";
import { APPROVALS_DIR } from "./boardV6";

/**
 * The story with its status changed from Draft to Approved, or null when its
 * status is not Draft. Only that word changes: every other byte, line endings
 * and indentation included, is the file as it was. The status is the first
 * non-empty line under `## Status`, as `parseStory` reads it.
 */
export function approveStoryMarkdown(md: string): string | null {
  const lines = md.split("\n");
  const heading = lines.findIndex((l) => /^##\s+Status\s*$/.test(l.replace(/\r$/, "")));
  if (heading < 0) return null;
  for (let i = heading + 1; i < lines.length; i++) {
    const body = lines[i].replace(/\r$/, "");
    if (body.trim() === "") continue;
    if (body.trim().toLowerCase() !== "draft") return null; // another status, or the next heading
    lines[i] = lines[i].replace(/draft/i, "Approved");
    return lines.join("\n");
  }
  return null;
}

/** BMAD's own Draft → Approved, on a v4 story file (path relative to root). */
export async function approveStory(root: string, file: string, fs: Fs): Promise<void> {
  // The story folder comes from core-config.yaml, which a cloned repo
  // controls: only a file strictly under the project root is written.
  const base = normalizePath(root).replace(/\/+$/, "");
  const path = joinPath(root, file);
  if (!path.startsWith(`${base}/`) || path.length <= base.length + 1) throw new Error("Story is outside the project");
  const next = approveStoryMarkdown(await fs.readText(path));
  if (next === null) throw new Error("Story is not a draft");
  await fs.writeText(path, next);
}

/** A ref that names one file directly inside the approvals folder. */
export function isSafeRef(ref: string): boolean {
  return ref !== "" && ref !== "." && ref !== ".." && !/[\\/]/.test(ref);
}

/** Record that a person approved a v6 ticket: `.ade/approvals/<ref>`, holding the date. */
export async function approveTicket(root: string, ref: string, fs: Fs, today = new Date().toISOString().slice(0, 10)): Promise<void> {
  if (!isSafeRef(ref)) throw new Error(`Ticket "${ref}" cannot be approved: its ref is not a file name`);
  const dir = joinPath(root, APPROVALS_DIR);
  await fs.mkdir(dir);
  await fs.writeText(joinPath(dir, ref), `${today}\n`);
}

/**
 * BMAD story files, from `devStoryLocation`.
 *
 * The format is BMAD's story-tmpl: a `# Story {epic}.{n}: {title}` heading, a
 * `## Status` section holding one of five words, and `## Acceptance Criteria`.
 *
 * Anything with a readable name still renders. BMAD's format may change and
 * hand-written stories exist; a story the board cannot see is worse than one it
 * shows as unknown, because the board would then be lying about what the
 * project contains.
 */
export type StoryStatus = "Draft" | "Approved" | "InProgress" | "Review" | "Done" | "unknown";

/** BMAD's own lifecycle, in order. */
export const STORY_STATUSES: StoryStatus[] = ["Draft", "Approved", "InProgress", "Review", "Done"];

export interface Story {
  /** Path relative to the project root. */
  file: string;
  /** "{epic}.{n}", from the heading or the filename. */
  id: string;
  title: string;
  status: StoryStatus;
  /** Exactly what the file said, so an unrecognised value stays visible. */
  rawStatus: string;
  acceptanceCriteria: string[];
}

function section(md: string, heading: RegExp): string {
  const start = md.search(heading);
  if (start < 0) return "";
  const after = md.slice(start);
  const rest = after.slice(after.indexOf("\n") + 1);
  // Any heading ends the section. Capping at three let a #### inside Acceptance
  // Criteria - which real Dev Notes and Testing sections carry - be read as a
  // criterion.
  const next = rest.search(/^#{1,6} /m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/** "2.4.refund-reversal.md" -> { id: "2.4", title: "Refund reversal" } */
function fromFilename(file: string): { id: string; title: string } {
  const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const m = /^(\d+\.\d+)\.(.*)$/.exec(base);
  if (!m) return { id: base, title: base };
  const words = m[2].replace(/[-_]+/g, " ").trim();
  return { id: m[1], title: words.charAt(0).toUpperCase() + words.slice(1) };
}

export function parseStory(file: string, markdown: string): Story {
  const name = fromFilename(file);
  const heading = /^#\s+Story\s+(\d+\.\d+):\s*(.+)$/m.exec(markdown);

  const rawStatus = section(markdown, /^##\s+Status\s*$/m).split("\n")[0].trim();
  const matched = STORY_STATUSES.find((s) => s.toLowerCase() === rawStatus.toLowerCase());

  const acceptanceCriteria = section(markdown, /^##\s+Acceptance Criteria\s*$/m)
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
    .filter(Boolean);

  return {
    file,
    id: heading?.[1] ?? name.id,
    title: heading?.[2].trim() ?? name.title,
    status: matched ?? "unknown",
    rawStatus,
    acceptanceCriteria,
  };
}

/**
 * Approved or beyond. The gate is BMAD's own: its development loop makes
 * "You -> Review and approve story" a human step, and nothing may be handed to
 * an agent before that has happened.
 */
export function isDispatchable(s: Story): boolean {
  const i = STORY_STATUSES.indexOf(s.status);
  return i >= STORY_STATUSES.indexOf("Approved");
}

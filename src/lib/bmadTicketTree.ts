import { parse as parseToml } from "smol-toml";
import type { Fs } from "./bmadRuntime/fs";
import { joinPath, normalizePath, pathBasename } from "./bmadRuntime/paths";
import { activeInitiativeFolder, ticketStatus } from "./bmadRuntime/tickets";

/**
 * A typed view of a BMAD v6 project's ticket tree for the stage board. The
 * tree itself comes from the runtime port (`ticketStatus`, the same `status`
 * view the agent's CLI prints), so the app and the agent never disagree on
 * which tickets exist, how leaves and plans join, or what a ticket's status
 * is. This module only reshapes those rows and adds what the view lacks: each
 * leaf's acceptance criteria and each epic's title.
 */

export interface Ticket {
  /** The leaf file, relative to the project root; null for an entry not pulled yet. */
  file: string | null;
  /** The initiative-unique ref (`<epic id>.<ticket id>`, e.g. `1.1`, `1.6a`); the gate key. */
  id: string;
  /** The raw per-epic id (`1`, `6a`), which repeats across epics. */
  localId: string;
  type: "story" | "spike" | "bug";
  title: string;
  /** The folder holding the ticket: its epic's folder name (`epic-cart`), or the initiative's. */
  parent: string;
  /** The plan's status as the port reports it; null when the ticket has none (no plan). */
  status: string | null;
  /** The port's derived state: planned | backlog | in-progress | review | done | dropped. */
  state: string;
  acceptanceCriteria: string[];
  /** The epic's slug, which in v6 is its folder name (`epic-cart`). */
  epic: string;
}

export interface EpicRow {
  /** The epic's id in the initiative's `tickets.toml` ("" for an epic folder it does not list). */
  id: string;
  /** The folder name, as v6's `[[epic]] slug` names it (`epic-cart`). */
  slug: string;
  title: string;
  ticketCount: number;
}

export interface TicketTree {
  /** Absolute path of the active initiative folder. */
  initiative: string;
  tickets: Ticket[];
  epics: EpicRow[];
  /** What the port flags as needing a fix (a plan naming no ticket, an unknown plan status). */
  problems: string[];
}

const TICKET_TYPES = ["story", "spike", "bug"] as const;
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---(?:\n|$)/;

/** One string per criterion under `## Acceptance Criteria`: a numbered or bulleted item with its
 * indented continuation lines (Given/When/Then), or a lone line such as `Verify: ...`. Bold markers,
 * checkboxes and HTML comments are dropped. */
export function acceptanceCriteria(md: string): string[] {
  const text = md.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(FRONTMATTER_RE, "");
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^##\s+Acceptance Criteria\s*$/i.test(l));
  if (start === -1) return [];
  let end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
  if (end === -1) end = lines.length;
  const body = lines
    .slice(start + 1, end)
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^```[\s\S]*?^```/gm, "");
  const clean = (s: string) => s.replace(/\*\*/g, "").replace(/^\[[ xX]\]\s*/, "").trim();
  const items: string[][] = [];
  for (const line of body.split("\n")) {
    if (!line.trim()) continue;
    const item = /^(?:\d+[.)]|[-*+])\s+(.*)$/.exec(line);
    if (item) items.push([clean(item[1])]);
    else if (/^\s/.test(line) && items.length) items[items.length - 1].push(clean(line));
    else items.push([clean(line)]);
  }
  return items.map((parts) => parts.filter(Boolean).join("\n")).filter(Boolean);
}

/** `title:` from a container doc's frontmatter, unquoted. */
function frontmatterTitle(md: string): string | null {
  const block = FRONTMATTER_RE.exec(md.replace(/\r\n/g, "\n"))?.[0] ?? "";
  const m = /^title:\s*(.+?)\s*$/m.exec(block);
  if (!m) return null;
  const v = m[1].replace(/\s+#.*$/, "");
  return /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v || null;
}

const words = (slug: string) => {
  const bare = slug.replace(/^epic-/, "").replace(/-/g, " ");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
};

function relativeTo(root: string, path: string): string {
  const prefix = root.endsWith("/") ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

async function readIfFile(path: string, fs: Fs): Promise<string | null> {
  try {
    return (await fs.exists(path)) ? await fs.readText(path) : null;
  } catch {
    return null; // a directory, or unreadable
  }
}

/** Epic titles: the initiative breakdown's `[[epic]] title`, else the epic doc's frontmatter title. */
async function epicTitles(initiative: string, fs: Fs): Promise<Record<string, string>> {
  const text = await readIfFile(joinPath(initiative, "tickets.toml"), fs);
  if (text === null) return {};
  const out: Record<string, string> = {};
  // The port has already parsed and validated this file; a failure here cannot happen first.
  const data = parseToml(text) as { epic?: { slug?: unknown; title?: unknown }[] };
  for (const e of data.epic ?? []) {
    if (typeof e.slug === "string" && typeof e.title === "string" && e.title) out[e.slug] = e.title;
  }
  return out;
}

/** Read the active initiative's ticket tree. Throws the port's error (no config, no active
 * initiative, a malformed tree) as an `Error` whose message is what `tickets.py status` prints. */
export async function readTicketTree(root: string, fs: Fs): Promise<TicketTree> {
  const projectRoot = normalizePath(root);
  const view = await ticketStatus(projectRoot, fs);
  const folder = await activeInitiativeFolder(projectRoot, fs);
  const initiativeName = pathBasename(folder);

  const tickets: Ticket[] = [];
  for (const row of (view.tickets ?? []) as Record<string, any>[]) {
    const epic = String(row.epic);
    const dir = epic === initiativeName ? folder : joinPath(folder, epic);
    const leafPath = row.file ? joinPath(dir, String(row.file)) : null;
    const leaf = leafPath ? await readIfFile(leafPath, fs) : null;
    const localId = row.id === null || row.id === undefined ? "" : String(row.id);
    const ref = row.ref ?? (localId ? `${epic}/${localId}` : String(row.file ?? ""));
    tickets.push({
      file: leafPath ? relativeTo(projectRoot, leafPath) : null,
      id: String(ref),
      localId,
      type: ((TICKET_TYPES as readonly string[]).includes(row.type) ? row.type : "story") as Ticket["type"],
      title: String(row.title ?? ""),
      parent: epic,
      status: row.status ? String(row.status) : null,
      state: String(row.state ?? ""),
      acceptanceCriteria: leaf ? acceptanceCriteria(leaf) : [],
      epic,
    });
  }

  const titles = await epicTitles(folder, fs);
  const epics: EpicRow[] = [];
  for (const e of (view.epics ?? []) as Record<string, any>[]) {
    const slug = String(e.slug);
    const doc = await readIfFile(joinPath(joinPath(folder, slug), `${slug}.md`), fs);
    epics.push({
      id: e.id === null || e.id === undefined ? "" : String(e.id),
      slug,
      title: titles[slug] ?? (doc ? frontmatterTitle(doc) : null) ?? words(slug),
      ticketCount: tickets.filter((t) => t.epic === slug).length,
    });
  }

  return { initiative: folder, tickets, epics, problems: (view.problems ?? []) as string[] };
}

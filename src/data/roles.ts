/**
 * The role catalog.
 *
 * The definitions are NOT here. They are markdown files vendored from the
 * ade-setup repository under `vendor/ade-setup/agents/`, and this module parses
 * them. That is deliberate: the same prose used to live here, in ade-setup, and
 * in the sub-agent bodies, and the three drifted — QA declared stewardship of
 * `tests/**` while its own body forbade editing tests, two ids named jobs that
 * already existed under other names, and a stale BMAD line had to be patched by
 * hand in two repositories on the same afternoon. A catalog that holds no prose
 * cannot disagree with the prose.
 *
 * Re-vendor with `npm run sync:agents`; the pinned ref is in
 * `vendor/ade-setup/VERSION`.
 */

export interface Role {
  /** Stable id, from the filename. Referenced by curated pairs and persisted sessions. */
  id: string;
  title: string;
  /**
   * The definition, verbatim. This is what a provider CLI is handed, so it must
   * not be recomposed from parsed parts — anything this parser does not model
   * would be silently dropped from the agent's instructions.
   */
  body: string;
  /**
   * Artifact globs this role is steward of, parsed from "## What you own".
   *
   * These declare stewardship, not exclusive ownership — globs may and do
   * overlap by design. The intent is that overlap resolves to the most specific
   * matching glob for a given path. For example: `docs/prd.md`
   * (product-manager) beats `docs/**` (technical-writer), so the Product
   * Manager owns the PRD and the Technical Writer owns the rest of docs;
   * `docs/runbooks/**` (sre) beats `docs/**` for the same reason. Test files are
   * deliberately unclaimed: the Developer authors them test-first as part of the
   * implementation, and QA must not edit what it measures.
   *
   * "Most specific" is not yet a defined metric here, and two globs can be
   * incomparable under any obvious one. Settling that tie-break belongs to the
   * enforcement subsystem, which is the first thing that will actually have to
   * decide. Nothing in this subsystem reads `owns` for anything but display.
   */
  owns: string[];
  /** First paragraph of the body, plain, for one-line display. */
  summary: string;
}

/** Eager and inlined at build time, so the app carries no runtime dependency on the repo. */
const SOURCES = import.meta.glob("../../vendor/ade-setup/agents/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/**
 * Display order: the delivery flow first, then the company roles around it,
 * then the advisory ones. Ids only — prose stays in the markdown. An id that is
 * vendored but missing here still appears, after these, so a new definition is
 * never silently hidden; `roles.test.ts` fails when that happens.
 */
const ORDER = [
  "analyst", "product-manager", "designer", "architect", "product-owner",
  "scrum-master", "developer", "qa", "devops", "adversarial-reviewer",
  "security-engineer", "sre", "release-manager", "engineering-manager",
  "support-engineer", "solutions-engineer",
  "brainstorming-architect", "technical-writer", "advisor",
];

/** The boundaries section carries three different headings across the catalog. */
const SECTION = /^## .+$/m;

function section(body: string, heading: RegExp): string {
  const start = body.search(heading);
  if (start < 0) return "";
  const after = body.slice(start);
  const head = after.indexOf("\n");
  const rest = after.slice(head + 1);
  const next = rest.search(SECTION);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/** Boilerplate that is an instruction to the agent, not a description of the role. */
const PREAMBLE = /^Follow the project rules\b/;

function parseRole(path: string, body: string): Role {
  const id = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const title = /^#\s+(.+)$/m.exec(body)?.[1].trim() ?? id;

  const owns = Array.from(
    section(body, /^## What you own$/m).matchAll(/^- `([^`]+)`\s*$/gm),
    (m) => m[1],
  );

  // The first real paragraph: skip the heading and the "Follow the project
  // rules" line, which 8 of the 19 files open with.
  const summary = body
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !PREAMBLE.test(p))
    ?.replace(/\*\*/g, "")
    .replace(/\s*\n\s*/g, " ") ?? "";

  return { id, title, body: body.trim() + "\n", owns, summary };
}

const PARSED = Object.entries(SOURCES).map(([path, body]) => parseRole(path, body));

export const ROLES: Role[] = [...PARSED].sort((a, b) => {
  const ia = ORDER.indexOf(a.id);
  const ib = ORDER.indexOf(b.id);
  if (ia < 0 && ib < 0) return a.id.localeCompare(b.id);
  if (ia < 0) return 1;
  if (ib < 0) return -1;
  return ia - ib;
});

/** The declared display order, for the test that keeps it in step with the catalog. */
export const ROLE_ORDER = ORDER;

export function getRole(id: string): Role | undefined {
  return ROLES.find((r) => r.id === id);
}

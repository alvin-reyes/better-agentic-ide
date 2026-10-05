import type { BmadPaths } from "./bmadConfig";

/**
 * Which BMAD artifacts exist in a project.
 *
 * Pure: it is handed an `exists` predicate rather than touching the disk, so it
 * can be tested without fixtures and the store owns all I/O. Parsing is the
 * part most likely to be wrong, so it is the part with no dependencies.
 */
export type ArtifactId =
  | "brief" | "prd" | "architecture" | "backlog"
  | "reviews" | "threatModel" | "securityReview";

export interface Artifact {
  id: ArtifactId;
  label: string;
  /** The path that resolved, or the first candidate when none did. */
  path: string;
  present: boolean;
  isDirectory: boolean;
}

/**
 * Candidates per artifact, most canonical first.
 *
 * Two spellings exist for several of these: ADE's roles declare they own
 * `docs/brief.md`, while BMAD's greenfield workflow creates `project-brief.md`.
 * Reporting a stage incomplete because of a filename is worse than accepting
 * two names for one thing, so both are candidates.
 */
/** A place an artifact might be, and whether that place is a directory. */
export interface Candidate {
  path: string;
  directory: boolean;
}

const file = (path: string): Candidate => ({ path, directory: false });
const dir = (path: string): Candidate => ({ path, directory: true });

/**
 * The architecture filenames BMAD's own workflows create.
 *
 * `creates:` across the six bundled workflows yields architecture.md,
 * fullstack-architecture.md, front-end-architecture.md and
 * brownfield-architecture.md. Looking only for the configured spelling means
 * Design never completes on a project BMAD itself built with greenfield-fullstack.
 */
const ARCHITECTURE_ALIASES = [
  "docs/fullstack-architecture.md",
  "docs/front-end-architecture.md",
  "docs/brownfield-architecture.md",
];

export function artifactCandidates(p: BmadPaths) {
  const prd: Candidate[] = p.prdSharded
    ? [dir(p.prdShardedLocation), file(p.prdFile)]
    : [file(p.prdFile), dir(p.prdShardedLocation)];
  const architecture: Candidate[] = (p.architectureSharded
    ? [dir(p.architectureShardedLocation), file(p.architectureFile)]
    : [file(p.architectureFile), dir(p.architectureShardedLocation)]
  ).concat(ARCHITECTURE_ALIASES.map(file));

  return [
    { id: "brief" as const, label: "Brief", candidates: [
      file("docs/brief.md"), file("docs/project-brief.md"),
      file("docs/brainstorming-session-results.md"),
    ] },
    { id: "prd" as const, label: "PRD", candidates: prd },
    { id: "architecture" as const, label: "Architecture", candidates: architecture },
    { id: "backlog" as const, label: "Backlog", candidates: [file("docs/backlog.md")] },
    { id: "reviews" as const, label: "Reviews", candidates: [dir("docs/reviews")] },
    { id: "threatModel" as const, label: "Threat model", candidates: [file("docs/threat-model.md")] },
    { id: "securityReview" as const, label: "Security review", candidates: [file("docs/security-review.md")] },
  ];
}

export function resolveArtifacts(p: BmadPaths, exists: (path: string) => boolean): Artifact[] {
  return artifactCandidates(p).map((c) => {
    // isDirectory belongs to the candidate that resolved, not to the artifact:
    // inferring it from position reported a sharded docs/prd/ as a file whenever
    // the config still said prdSharded: false.
    const hit = c.candidates.find((x) => exists(x.path)) ?? null;
    const shown = hit ?? c.candidates[0];
    return {
      id: c.id,
      label: c.label,
      path: shown.path,
      present: hit !== null,
      isDirectory: shown.directory,
    };
  });
}

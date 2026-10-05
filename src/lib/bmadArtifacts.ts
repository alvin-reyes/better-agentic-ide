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
export function artifactCandidates(p: BmadPaths) {
  return [
    { id: "brief" as const, label: "Brief", directory: false,
      paths: ["docs/brief.md", "docs/project-brief.md", "docs/brainstorming-session-results.md"] },
    { id: "prd" as const, label: "PRD", directory: p.prdSharded,
      paths: p.prdSharded ? [p.prdShardedLocation, p.prdFile] : [p.prdFile, p.prdShardedLocation] },
    { id: "architecture" as const, label: "Architecture", directory: p.architectureSharded,
      paths: p.architectureSharded
        ? [p.architectureShardedLocation, p.architectureFile]
        : [p.architectureFile, p.architectureShardedLocation] },
    { id: "backlog" as const, label: "Backlog", directory: false, paths: ["docs/backlog.md"] },
    { id: "reviews" as const, label: "Reviews", directory: true, paths: ["docs/reviews"] },
    { id: "threatModel" as const, label: "Threat model", directory: false, paths: ["docs/threat-model.md"] },
    { id: "securityReview" as const, label: "Security review", directory: false, paths: ["docs/security-review.md"] },
  ];
}

export function resolveArtifacts(p: BmadPaths, exists: (path: string) => boolean): Artifact[] {
  return artifactCandidates(p).map((c) => {
    const hit = c.paths.find(exists);
    return {
      id: c.id,
      label: c.label,
      path: hit ?? c.paths[0],
      present: hit !== undefined,
      // A sharded artifact resolves to a directory; the fallback spelling may not be.
      isDirectory: hit ? hit === c.paths[0] && c.directory : c.directory,
    };
  });
}

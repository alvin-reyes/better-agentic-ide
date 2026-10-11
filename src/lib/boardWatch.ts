import type { BmadPaths } from "./bmadConfig";

export const WATCH_EXTENSIONS = ["md", "yml", "yaml", "toml"];

/**
 * The extensions to watch in `dir`; empty means every file. `.ade/` is
 * watched whole: `.ade/stage` and `.ade/approvals/<ref>` carry no real
 * extension (`1.2` reads as extension `2`), and an agent can write them as
 * easily as a story. The folder is small and holds only ADE's own state.
 */
export function watchExtensions(dir: string): string[] {
  return /(^|[\\/])\.ade[\\/]*$/.test(dir) ? [] : WATCH_EXTENSIONS;
}

const parent = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/**
 * Normalize a relative path segment-wise, ensuring it never escapes the project.
 * Returns the normalized path, or null if absolute, escaping, or normalizes to empty.
 */
const normalizePath = (rel: string): string | null => {
  // Reject absolute paths
  if (rel.startsWith("/")) return null;

  // Split and process segments
  const segments = rel.split("/");
  const stack: string[] = [];

  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      // Skip empty and current-dir segments
      continue;
    } else if (segment === "..") {
      // Try to collapse: pop from stack if possible, otherwise we're escaping
      if (stack.length > 0) {
        stack.pop();
      } else {
        // .. with no parent means we're escaping the project root
        return null;
      }
    } else {
      stack.push(segment);
    }
  }

  // If nothing is left, the path normalized to empty (root)
  if (stack.length === 0) return null;

  return stack.join("/");
};

/**
 * The folders whose changes can change the board.
 *
 * Never the project root: the watcher has no skip list, so a recursive watch
 * there registers all of node_modules, target and .git (inotify limits on
 * Linux) and turns `npm install` into a storm of rebuilds from vendored
 * Markdown. A file at the top level is caught by the focus refresh instead.
 */
export function watchTargets(root: string, methodology: "v4" | "v6", paths: BmadPaths | null): string[] {
  const rel =
    methodology === "v6"
      ? ["_bmad", "_bmad-output", ".ade"]
      : [
          ".bmad-core",
          ".ade",
          "docs", // the brief, backlog, reviews and BMAD's own architecture spellings
          ...(paths
            ? [
                paths.devStoryLocation,
                paths.qaLocation,
                paths.prdSharded ? paths.prdShardedLocation : parent(paths.prdFile),
                paths.architectureSharded ? paths.architectureShardedLocation : parent(paths.architectureFile),
              ]
            : []),
        ];

  const cleaned = [
    ...new Set(
      rel
        .map((r) => normalizePath(r))
        .filter((r): r is string => r !== null),
    ),
  ];
  const inside = (a: string, b: string) => a !== b && a.startsWith(`${b}/`);
  const kept = cleaned.filter((r) => !cleaned.some((o) => inside(r, o)));
  const ordered = methodology === "v6" ? kept : [kept[0], kept[1], ...kept.slice(2).sort()];
  return ordered.map((r) => `${root.replace(/\/+$/, "")}/${r}`);
}

import type { BmadPaths } from "./bmadConfig";

export const WATCH_EXTENSIONS = ["md", "yml", "yaml", "toml"];

const parent = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

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

  const cleaned = [...new Set(rel.map((r) => r.replace(/^\.\/|\/+$/g, "")).filter((r) => r && r !== "."))];
  const inside = (a: string, b: string) => a !== b && a.startsWith(`${b}/`);
  const kept = cleaned.filter((r) => !cleaned.some((o) => inside(r, o)));
  const ordered = methodology === "v6" ? kept : [kept[0], kept[1], ...kept.slice(2).sort()];
  return ordered.map((r) => `${root.replace(/\/+$/, "")}/${r}`);
}

/**
 * Where BMAD keeps things in this project.
 *
 * Every path is configurable in `.bmad-core/core-config.yaml`, so none of them
 * may be hardcoded: a board looking for `docs/prd.md` reports "missing" on a
 * project that configured BMAD differently, which is worse than saying nothing.
 *
 * Parsed by hand rather than with a YAML library. The file is two levels deep
 * with scalar values, the app ships no YAML dependency, and adding one to read
 * eight keys is not worth the bytes.
 */
export interface BmadPaths {
  qaLocation: string;
  prdFile: string;
  prdSharded: boolean;
  prdShardedLocation: string;
  architectureFile: string;
  architectureSharded: boolean;
  architectureShardedLocation: string;
  devStoryLocation: string;
  /** True when no config was found and these are the documented defaults. */
  usedDefaults: boolean;
}

/** BMAD's own defaults, from the vendored core-config.yaml. */
export const BMAD_DEFAULTS: BmadPaths = {
  qaLocation: "docs/qa",
  prdFile: "docs/prd.md",
  prdSharded: true,
  prdShardedLocation: "docs/prd",
  architectureFile: "docs/architecture.md",
  architectureSharded: true,
  architectureShardedLocation: "docs/architecture",
  devStoryLocation: "docs/stories",
  usedDefaults: false,
};

/** `key: value` at any indentation, ignoring comments and quotes. */
function scalars(yaml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of yaml.split("\n")) {
    const line = raw.replace(/#.*$/, "");
    const m = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[3].trim().replace(/^["']|["']$/g, "");
    if (value) out.set(m[2], value);
  }
  return out;
}

export function parseBmadConfig(yaml: string | null): BmadPaths {
  if (yaml === null) return { ...BMAD_DEFAULTS, usedDefaults: true };
  const s = scalars(yaml);
  // An empty or comment-only file supplies nothing. Saying the paths came from
  // a config when none of them did sends anyone debugging to the wrong file.
  if (s.size === 0) return { ...BMAD_DEFAULTS, usedDefaults: true };
  const str = (k: string, fallback: string) => s.get(k) ?? fallback;
  // YAML spells true as true/True/TRUE/yes/on; matching only the lowercase one
  // read `prdSharded: True` as false and looked for a PRD that is not there.
  const bool = (k: string, fallback: boolean) => {
    const v = s.get(k);
    return v === undefined ? fallback : /^(true|yes|on)$/i.test(v);
  };
  return {
    qaLocation: str("qaLocation", BMAD_DEFAULTS.qaLocation),
    prdFile: str("prdFile", BMAD_DEFAULTS.prdFile),
    prdSharded: bool("prdSharded", BMAD_DEFAULTS.prdSharded),
    prdShardedLocation: str("prdShardedLocation", BMAD_DEFAULTS.prdShardedLocation),
    architectureFile: str("architectureFile", BMAD_DEFAULTS.architectureFile),
    architectureSharded: bool("architectureSharded", BMAD_DEFAULTS.architectureSharded),
    architectureShardedLocation: str(
      "architectureShardedLocation",
      BMAD_DEFAULTS.architectureShardedLocation,
    ),
    devStoryLocation: str("devStoryLocation", BMAD_DEFAULTS.devStoryLocation),
    usedDefaults: false,
  };
}

/** Gates live under qaLocation, which defaults to docs/qa — not a top-level gates/. */
export function gatesDir(p: BmadPaths): string {
  return `${p.qaLocation}/gates`;
}

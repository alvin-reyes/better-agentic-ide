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

/**
 * `key: value` at any indentation.
 *
 * The comment is stripped after the quotes are located, not before: a path may
 * legitimately contain `#`, and cutting at the first one turned
 * `"docs/a#b/prd.md"` into `docs/a`. Same ordering defect as the gate parser.
 */
function scalars(yaml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of yaml.split("\n")) {
    // [^\S\n] rather than \s: the latter matches the line break, so a key with
    // no value captured the following line.
    const m = /^(\s*)([A-Za-z_][\w-]*):[^\S\n]*(.*)$/.exec(raw);
    if (!m) continue;

    let value = m[3];
    let quote: string | null = null;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "#") {
        value = value.slice(0, i);
        break;
      }
    }
    value = value.trim().replace(/^(["'])(.*)\1$/, "$2");
    if (value) out.set(m[2], value);
  }
  return out;
}

/** The keys that actually name a path, for deciding whether a config said anything. */
const PATH_KEYS = [
  "qaLocation", "prdFile", "prdSharded", "prdShardedLocation",
  "architectureFile", "architectureSharded", "architectureShardedLocation",
  "devStoryLocation",
];

export function parseBmadConfig(yaml: string | null): BmadPaths {
  if (yaml === null) return { ...BMAD_DEFAULTS, usedDefaults: true };
  const s = scalars(yaml);
  // A file that sets no path supplies nothing this cares about - the vendored
  // config also carries markdownExploder, slashPrefix and devDebugLog. Claiming
  // the paths came from a config when none of them did sends anyone debugging
  // to the wrong file.
  if (!PATH_KEYS.some((k) => s.has(k))) return { ...BMAD_DEFAULTS, usedDefaults: true };
  const str = (k: string, fallback: string) => s.get(k) ?? fallback;
  // YAML spells true as true/True/TRUE/yes/on; matching only the lowercase one
  // read `prdSharded: True` as false and looked for a PRD that is not there.
  const bool = (k: string, fallback: boolean) => {
    const v = s.get(k);
    if (v === undefined) return fallback;
    if (/^(true|yes|on)$/i.test(v)) return true;
    if (/^(false|no|off)$/i.test(v)) return false;
    // Unreadable is not false: reading `prdSharded: maybe` as false sent the
    // resolver looking for a single file that a sharded project does not have.
    return fallback;
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

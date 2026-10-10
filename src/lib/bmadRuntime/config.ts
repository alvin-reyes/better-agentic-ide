import { parse as parseToml } from "smol-toml";
import type { Fs } from "./fs";

type Toml = Record<string, unknown>;

const KEYED_MERGE_FIELDS = ["code", "id"] as const;

/**
 * The field that identifies every item of both arrays, or null when the arrays
 * are plain lists. Like the Python, `code` wins over `id`, a field must be
 * present on *every* item to identify one, and an identifier that is not a
 * non-empty string is refused rather than coerced.
 */
function keyedMergeField(items: unknown[]): "code" | "id" | null {
  if (
    items.length === 0 ||
    !items.every((item) => item !== null && typeof item === "object" && !Array.isArray(item))
  ) {
    return null;
  }
  const records = items as Record<string, unknown>[];
  for (const field of KEYED_MERGE_FIELDS) {
    if (!records.every((item) => field in item)) continue;
    for (const item of records) {
      const value = item[field];
      if (typeof value !== "string") {
        throw new Error(`keyed array identifier \`${field}\` must be a string, got ${typeof value}`);
      }
      if (!value) throw new Error(`keyed array identifier \`${field}\` must not be empty`);
    }
    return field;
  }
  return null;
}

/** Merge b into a: keys replace; arrays keyed-merge by code/id, else append. */
export function deepMerge(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    const field = keyedMergeField([...a, ...b]);
    if (field === null) return [...a, ...b];
    // A matching identifier replaces its item where it stands; a new one appends.
    const merged = a.map((item) => ({ ...item }));
    const indexByKey = new Map<string, number>();
    a.forEach((item, index) => indexByKey.set(item[field], index));
    for (const item of b) {
      const copy = { ...item };
      const key: string = copy[field];
      const at = indexByKey.get(key);
      if (at === undefined) {
        indexByKey.set(key, merged.length);
        merged.push(copy);
      } else {
        merged[at] = copy;
      }
    }
    return merged;
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v);
    return out;
  }
  return b;
}

async function readLayer(fs: Fs, p: string): Promise<Toml | null> {
  if (!(await fs.exists(p))) return null;
  return parseToml(await fs.readText(p)) as Toml;
}

/** Merge `_bmad/config.toml` ← `_bmad/custom/config.toml` ← `_bmad/custom/config.user.toml`. */
export async function loadCentralConfig(projectRoot: string, fs: Fs): Promise<Toml> {
  const base = await readLayer(fs, `${projectRoot}/_bmad/config.toml`);
  if (!base) throw new Error(`no _bmad/config.toml under ${projectRoot}`);
  let out = deepMerge({}, base);
  const team = await readLayer(fs, `${projectRoot}/_bmad/custom/config.toml`);
  if (team) out = deepMerge(out, team);
  const user = await readLayer(fs, `${projectRoot}/_bmad/custom/config.user.toml`);
  if (user) out = deepMerge(out, user);
  return out;
}

/** Merge `{skillRoot}/customize.toml` ← `_bmad/custom/<skill>.toml` ← `<skill>.user.toml`. */
export async function resolveCustomization(
  projectRoot: string,
  skillRoot: string,
  skill: string,
  fs: Fs,
): Promise<Toml> {
  const base = await readLayer(fs, `${skillRoot}/customize.toml`);
  if (!base) throw new Error(`no customize.toml at the root of skill ${skill} (${skillRoot})`);
  let out = deepMerge({}, base);
  const skillLayer = await readLayer(fs, `${projectRoot}/_bmad/custom/${skill}.toml`);
  if (skillLayer) out = deepMerge(out, skillLayer);
  const userLayer = await readLayer(fs, `${projectRoot}/_bmad/custom/${skill}.user.toml`);
  if (userLayer) out = deepMerge(out, userLayer);
  return out;
}

import type { Fs } from "./fs";
import { errorText, isFile, missingPathError, pyJson, pyRepr } from "./knowledge";
import { csvDictRows } from "./compat";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-advanced-elicitation/scripts/pick_methods.py` — serve
 * the elicitation method catalog (a CSV of num, category, method_name,
 * description, output_pattern) without loading it all into context, with an
 * `--extra` JSON overlay merged into every command. The goldens in
 * `__tests__/goldens/helpers/pickMethods-*.json` are the contract.
 *
 * Two substitutions. The pin defaulted `--file` to the catalog beside the
 * script; a bundled runtime has no script folder, so `--file` is required and
 * a call site that omits it is refused (capture.sh's header) — every real call
 * site passes it. And `random` draws from this runtime's PRNG, so no draw is a
 * golden; helpers.test.ts checks the draw's shape instead.
 */

const FIELDS = ["num", "category", "method_name", "description", "output_pattern"];
const REQUIRED_FIELDS = ["category", "method_name", "description", "output_pattern"];

type Row = Record<string, string>;

function loadCatalog(text: string): Row[] {
  // utf-8-sig: a BOM-prefixed catalog (Excel "CSV UTF-8", Notepad) still reads.
  const body = text.replace(/^﻿/, "");
  return csvDictRows(body).map((row) => {
    const out: Row = {};
    for (const field of FIELDS) out[field] = (row[field] ?? "").trim();
    return out;
  });
}

function loadExtra(text: string): Row[] {
  const data: unknown = JSON.parse(text.replace(/^﻿/, ""));
  if (!Array.isArray(data)) throw new Error("--extra must be a JSON array of objects");
  const rows: Row[] = [];
  data.forEach((item: unknown, index: number) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`each --extra entry must be a JSON object, got: ${pyRepr(item)}`);
    }
    const entry = item as Record<string, unknown>;
    const row: Row = {};
    for (const field of FIELDS) row[field] = String(entry[field] ?? "").trim();
    row.code = String(entry.code ?? "").trim(); // kept for traceability
    for (const field of REQUIRED_FIELDS) {
      if (!row[field]) {
        const name = row.method_name || row.code || "unnamed";
        throw new Error(`--extra entry ${index + 1} (${name}) is missing ${field}`);
      }
    }
    rows.push(row);
  });
  return rows;
}

/** Extras replace a row with the same method_name, else append; every row
 * stays addressable by a unique num. */
export function mergeExtra(rows: Row[], extras: Row[]): Row[] {
  const merged = rows.map((row) => ({ ...row }));
  const index = new Map<string, number>();
  merged.forEach((row, i) => index.set(row.method_name.toLowerCase(), i));
  for (const extra of extras) {
    const key = extra.method_name.toLowerCase();
    const at = index.get(key);
    if (at !== undefined) {
      const replaced = { ...extra };
      replaced.num = replaced.num || merged[at].num;
      merged[at] = replaced;
    } else {
      index.set(key, merged.length);
      merged.push({ ...extra });
    }
  }
  let nextNum = Math.max(0, ...merged.filter((row) => /^\d+$/.test(row.num)).map((row) => Number(row.num))) + 1;
  const seen = new Map<string, string>();
  for (const row of merged) {
    if (!row.num) {
      row.num = String(nextNum);
      nextNum += 1;
    }
    const owner = seen.get(row.num);
    if (owner !== undefined) throw new Error(`num ${row.num} is used by both ${owner} and ${row.method_name}`);
    seen.set(row.num, row.method_name);
  }
  return merged;
}

function categories(rows: Row[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function filterCats(rows: Row[], cats: string[] | null): Row[] {
  if (!cats?.length) return rows;
  const wanted = new Set(cats.map((cat) => cat.toLowerCase()));
  return rows.filter((row) => wanted.has(row.category.toLowerCase()));
}

/** `find`: by method_name or by num, case-insensitively. */
function find(rows: Row[], names: string[]): { found: Row[]; missing: string[] } {
  const byKey = new Map<string, Row>();
  for (const row of rows) {
    byKey.set(row.method_name.toLowerCase(), row);
    if (row.num && !byKey.has(row.num)) byKey.set(row.num, row);
  }
  const found: Row[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const row = byKey.get(name.trim().toLowerCase());
    if (row) found.push(row);
    else missing.push(name);
  }
  return { found, missing };
}

function exclude(rows: Row[], names: string[] | null): Row[] {
  if (!names?.length) return rows;
  const skip = new Set(names.map((name) => name.trim().toLowerCase()));
  return rows.filter((row) => !skip.has(row.method_name.toLowerCase()));
}

/** `spread_sample`: category diversity first, one per category round-robin. */
export function spreadSample(rows: Row[], n: number, random: () => number): Row[] {
  const byCat = new Map<string, Row[]>();
  for (const row of rows) byCat.set(row.category, [...(byCat.get(row.category) ?? []), row]);
  const shuffle = (items: unknown[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  };
  let buckets = [...byCat.values()];
  shuffle(buckets);
  for (const bucket of buckets) shuffle(bucket);
  const out: Row[] = [];
  while (buckets.length && out.length < n) {
    const exhausted: Row[][] = [];
    for (const bucket of buckets) {
      if (out.length >= n) break;
      out.push(bucket.pop()!);
      if (!bucket.length) exhausted.push(bucket);
    }
    buckets = buckets.filter((bucket) => !exhausted.includes(bucket));
  }
  return out;
}

/** `random.sample`, drawing `n` distinct rows. */
export function sample(rows: Row[], n: number, random: () => number): Row[] {
  const pool = [...rows];
  const out: Row[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const at = Math.floor(random() * pool.length);
    out.push(pool.splice(at, 1)[0]);
  }
  return out;
}

function fmtCategories(cats: [string, number][], asJson: boolean): string {
  if (asJson) return pyJson(cats.map(([category, count]) => ({ category, count })), { ensureAscii: true });
  return cats.map(([category, count]) => `${category}\t${count}`).join("\n");
}

function fmtRows(rows: Row[], asJson: boolean): string {
  if (asJson) {
    return pyJson(
      rows.map((row) => Object.fromEntries(FIELDS.map((field) => [field, row[field]]))),
      { ensureAscii: true },
    );
  }
  return rows.map((row) => FIELDS.map((field) => row[field]).join("\t")).join("\n");
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function pickMethods(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "pick_methods";
  let file: string | null = null;
  let extra: string | null = null;
  let asJson = false;
  let command: string | null = null;
  let categoriesArg: string[] = [];
  let all = false;
  let names: string[] = [];
  let drawCount = 1;
  let excludeArgs: string[] = [];
  let spread = false;

  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--file") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --file: expected one argument");
      file = taken;
    } else if (flag === "--extra") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --extra: expected one argument");
      extra = taken;
    } else if (flag === "--json" && inline === null) asJson = true;
    else if (flag === "--skill-root") {
      if (value() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else if (command === null && ["categories", "list", "show", "random"].includes(argv[i])) {
      command = argv[i];
    } else if (command === "list" && flag === "--category") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "list" && flag === "--all" && inline === null) all = true;
    else if (command === "random" && flag === "-n") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument -n: expected one argument");
      const parsed = Number.parseInt(taken, 10);
      if (Number.isNaN(parsed)) return usageError(script, `argument -n: invalid int value: '${taken}'`);
      drawCount = parsed;
    } else if (command === "random" && flag === "--category") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "random" && flag === "--exclude") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --exclude: expected one argument");
      excludeArgs.push(taken);
    } else if (command === "random" && flag === "--spread" && inline === null) spread = true;
    else if (command === "show") names.push(argv[i]);
    else return usageError(script, `unrecognized arguments: ${argv[i]}`);
  }

  if (file === null) {
    return usageError(script, "--file is required (the pin defaulted to the catalog beside the script)");
  }
  if (!(await isFile(fs, file))) {
    return { stdout: `error: method file not found: ${file}\n`, exitCode: 2 };
  }
  let rows = loadCatalog(await fs.readText(file));
  if (extra !== null) {
    try {
      rows = mergeExtra(rows, loadExtra(await fs.readText(extra)));
    } catch (error) {
      const text = errorText(error);
      const message = text.startsWith("--extra ") ? text : (await fs.exists(extra)) ? text : missingPathError(extra);
      return { stdout: `error: could not read --extra: ${message}\n`, exitCode: 2 };
    }
  }

  if (command === null) return usageError(script, "the following arguments are required: cmd");
  if (command === "categories") return { stdout: fmtCategories(categories(rows), asJson) + "\n", exitCode: 0 };
  if (command === "list") {
    if (!categoriesArg.length && !all) {
      return {
        stdout:
          "error: `list` needs --category (one or more) — or --all to dump the whole " +
          "catalog on purpose. Use `categories` for the cheap map, or `random` to draw blind.\n",
        exitCode: 2,
      };
    }
    return { stdout: fmtRows(filterCats(rows, categoriesArg), asJson) + "\n", exitCode: 0 };
  }
  if (command === "show") {
    const { found, missing } = find(rows, names);
    if (!found.length) return { stdout: missing.map((name) => `# not found: ${name}`).join("\n") + "\n", exitCode: 1 };
    return { stdout: fmtRows(found, asJson) + "\n", exitCode: 0 };
  }
  // random
  const pool = exclude(filterCats(rows, categoriesArg), excludeArgs);
  if (!pool.length) return { stdout: "# no methods match\n", exitCode: 1 };
  const n = Math.max(0, Math.min(drawCount, pool.length)); // clamp: never crash on a negative or oversized -n
  const picks = spread ? spreadSample(pool, n, Math.random) : sample(pool, n, Math.random);
  return { stdout: fmtRows(picks, asJson) + "\n", exitCode: 0 };
}

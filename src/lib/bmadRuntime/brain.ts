import { md5 } from "@noble/hashes/legacy";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { Fs } from "./fs";
import { errorText, isFile, pyJson, pyRepr } from "./knowledge";
import { absolutePath, csvDictRows, htmlEscape, pyRound } from "./compat";
import { SELECTOR_TEMPLATE } from "./brainTemplate";
import { splitFlag, usageError, type PortResult } from "./compat";
import { normalizePath } from "./paths";

/**
 * Port of `skills/bmad-brainstorming/scripts/brain.py` — serve the
 * brainstorming technique library (a CSV of category, technique_name,
 * description, detail, provenance, good_for, audience) without loading it all
 * into context, with a JSON `--extra` overlay merged into every command and an
 * offline "browse all" page generated on demand. The goldens in
 * `__tests__/goldens/helpers/brain-*.json` are the contract, the generated
 * page included.
 *
 * The icon sidecar (`brain-icons.json`, beside the catalog) and the
 * md5-derived fallback hue for a category it does not carry are the Python's:
 * `@noble/hashes` is already a bundled dependency of this runtime (render.ts
 * hashes with it), so `md5` here is the same digest `hashlib` computed.
 *
 * Two substitutions. The pin defaulted `--file` to the catalog beside the
 * script; a bundled runtime has no script folder, so `--file` is required and
 * a call site that omits it is refused (every real call site passes it), and
 * `random` draws from this runtime's PRNG, so no draw is a golden.
 */

const FIELDS = ["category", "technique_name", "description", "detail", "provenance", "good_for", "audience"];
const REQUIRED_FIELDS = ["category", "technique_name", "description"];

type Row = Record<string, string>;

function loadCatalog(text: string): Row[] {
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
    for (const field of REQUIRED_FIELDS) {
      if (!row[field]) throw new Error(`--extra entry ${index + 1} (${row.technique_name || "unnamed"}) is missing ${field}`);
    }
    rows.push(row);
  });
  return rows;
}

/** Extras replace a shipped row with the same technique_name, else append. */
export function mergeTechniques(rows: Row[], extras: Row[]): Row[] {
  const merged = rows.map((row) => ({ ...row }));
  const index = new Map<string, number>();
  merged.forEach((row, i) => index.set(row.technique_name.toLowerCase(), i));
  for (const extra of extras) {
    const key = extra.technique_name.toLowerCase();
    const at = index.get(key);
    if (at !== undefined) merged[at] = extra;
    else {
      index.set(key, merged.length);
      merged.push(extra);
    }
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

function find(rows: Row[], names: string[]): { found: Row[]; missing: string[] } {
  const byName = new Map<string, Row>();
  for (const row of rows) byName.set(row.technique_name.toLowerCase(), row);
  const found: Row[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const row = byName.get(name.trim().toLowerCase());
    if (row) found.push(row);
    else missing.push(name);
  }
  return { found, missing };
}

/** `resolve_detail`: a row's detail file, only from inside the catalog folder. */
export async function resolveDetail(fs: Fs, row: Row, csvDir: string): Promise<string | null> {
  if (!row.detail) return null;
  const base = csvDir.replace(/\/+$/, "");
  // `base` is absolute (from `absolute_path`), so the fold keeps its root: a
  // Windows catalog stays `C:/…` instead of growing a leading slash.
  const path = normalizePath(`${base}/${row.detail}`);
  if (path !== base && !path.startsWith(`${base}/`)) return null; // reported on stderr, not fatal
  if (!(await isFile(fs, path))) return null;
  return (await fs.readText(path)).trim();
}

function fmtCategories(cats: [string, number][], asJson: boolean): string {
  if (asJson) return pyJson(cats.map(([category, count]) => ({ category, count })), { ensureAscii: true });
  return cats.map(([category, count]) => `${category}\t${count}`).join("\n");
}

function fmtList(rows: Row[], asJson: boolean): string {
  if (asJson) {
    return pyJson(
      rows.map((row) => ({ category: row.category, technique_name: row.technique_name, description: row.description })),
      { ensureAscii: true },
    );
  }
  return rows.map((row) => `${row.category}\t${row.technique_name}\t${row.description}`).join("\n");
}

async function fmtShow(fs: Fs, rows: Row[], csvDir: string, asJson: boolean): Promise<string> {
  if (asJson) {
    const out: Record<string, string>[] = [];
    for (const row of rows) {
      const detail = await resolveDetail(fs, row, csvDir);
      const entry: Record<string, string> = {
        category: row.category,
        technique_name: row.technique_name,
        description: row.description,
      };
      if (detail) entry.detail = detail;
      out.push(entry);
    }
    return pyJson(out, { ensureAscii: true });
  }
  const blocks: string[] = [];
  for (const row of rows) {
    let block = `## ${row.technique_name}  [${row.category}]\n${row.description}`;
    const detail = await resolveDetail(fs, row, csvDir);
    if (detail) block += `\n\n${detail}`;
    blocks.push(block);
  }
  return blocks.join("\n\n");
}

/** `pretty`: a category slug as a display name — Python's `str.title()`, an
 * apostrophe counting as a word boundary included. */
function pretty(cat: string): string {
  let out = "";
  let previousWasLetter = false;
  for (const ch of cat.replace(/_/g, " ").replace(/-/g, " ").toLowerCase()) {
    const isLetter = /[a-z]/.test(ch);
    out += isLetter && !previousWasLetter ? ch.toUpperCase() : ch;
    previousWasLetter = isLetter;
  }
  return out;
}

// --- card visuals -------------------------------------------------------------

const CHIP = '<rect x="1.5" y="1.5" width="41" height="41" rx="12" fill="currentColor" fill-opacity="0.12"/>';
const FALLBACK_GLYPH =
  '<circle cx="22" cy="22" r="11" fill="currentColor" fill-opacity="0.16"/>' +
  '<circle cx="22" cy="22" r="11" stroke="currentColor" stroke-width="1.6" fill="none"/>' +
  '<circle cx="22" cy="22" r="3.4" fill="currentColor"/>';
const FALLBACK_TECH =
  '<rect x="15" y="15" width="14" height="14" rx="2.5" transform="rotate(45 22 22)" ' +
  'fill="none" stroke="currentColor" stroke-width="2"/><circle cx="22" cy="22" r="2.4" fill="currentColor"/>';

interface Icons {
  categories: Record<string, { hue?: string; glyph?: string }>;
  techniques: Record<string, string>;
}

async function loadIcons(fs: Fs, csvDir: string): Promise<Icons> {
  try {
    const data = JSON.parse(await fs.readText(`${csvDir}/brain-icons.json`)) as Record<string, unknown>;
    return {
      categories: (data.categories ?? {}) as Icons["categories"],
      techniques: (data.techniques ?? {}) as Icons["techniques"],
    };
  } catch {
    return { categories: {}, techniques: {} };
  }
}

/** `colorsys.hls_to_rgb`: hue in [0,1), lightness, saturation. */
export function hlsToRgb(hue: number, lightness: number, saturation: number): [number, number, number] {
  if (saturation === 0) return [lightness, lightness, lightness];
  const m2 = lightness <= 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const m1 = 2 * lightness - m2;
  const channel = (h: number): number => {
    const value = ((h % 1) + 1) % 1;
    if (value < 1 / 6) return m1 + (m2 - m1) * value * 6;
    if (value < 0.5) return m2;
    if (value < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - value) * 6;
    return m1;
  };
  return [channel(hue + 1 / 3), channel(hue), channel(hue - 1 / 3)];
}

function hslHex(deg: number, saturation: number, lightness: number): string {
  const [r, g, b] = hlsToRgb((((deg % 360) + 360) % 360) / 360, lightness, saturation);
  const hex = (value: number) => Math.max(0, pyRound(value * 255)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** `category_style`: the sidecar's hue and glyph, or a hash-derived hue. */
export function categoryStyle(icons: Icons, cat: string): { hue: string; glyph: string } {
  const style = icons.categories[cat];
  if (style?.hue) return { hue: style.hue, glyph: style.glyph || FALLBACK_GLYPH };
  // `int(md5(cat).hexdigest(), 16) % 360` over the whole 128-bit digest: a
  // modular fold, because the digest does not fit this runtime's numbers.
  const digest = bytesToHex(md5(utf8ToBytes(cat)));
  let deg = 0;
  for (const digit of digest) deg = (deg * 16 + Number.parseInt(digit, 16)) % 360;
  return { hue: hslHex(deg, 0.58, 0.52), glyph: FALLBACK_GLYPH };
}

function techIcon(icons: Icons, name: string): string {
  return icons.techniques[name] ?? FALLBACK_TECH;
}

const CLASSIC_GROUP = "Proven & Professional";
const LEAD_HUE = "#3d4f73";
const CATEGORY_GROUPS: [string, string[]][] = [
  ["Structured & Analytical", ["structured", "deep"]],
  ["Creative & Generative", ["creative", "biomimetic", "cultural", "speculative_future", "quantum"]],
  ["Wild & Playful", ["wild", "absurdist", "theatrical", "constraint"]],
  ["Introspective & Personal", ["introspective_delight", "collaborative"]],
];
const GOAL_LABELS: [string, string][] = [
  ["feature", "Build a feature"],
  ["novel", "Novel concept"],
  ["strategy", "Strategy"],
  ["planning", "Planning"],
  ["diagnosis", "Diagnose"],
  ["personal", "Personal / life"],
  ["unstuck", "Get unstuck"],
];

function goodForLabel(good: string): string {
  const parts = good
    .split("|")
    .filter(Boolean)
    .map((tag) => GOAL_LABELS.find(([key]) => key === tag)?.[1] ?? tag);
  return parts.length ? "Great for: " + parts.join(" · ") : "";
}

function svg(inner: string): string {
  return `<svg class="ico" viewBox="0 0 44 44" xmlns="http://www.w3.org/2000/svg">${CHIP}${inner}</svg>`;
}

function card(icons: Icons, row: Row, lead = false): string {
  const name = htmlEscape(row.technique_name);
  const desc = htmlEscape(row.description);
  const { hue, glyph } = categoryStyle(icons, row.category);
  const display = htmlEscape(pretty(row.category));
  const good = htmlEscape(row.good_for ?? "");
  const provenance = htmlEscape(row.provenance ?? "");
  const style = lead ? ` style="--c:${hue}"` : "";
  const leadAttr = lead ? ' data-lead="1"' : "";
  const label = goodForLabel(row.good_for ?? "");
  const labelHtml = label ? `<span class="gf">${htmlEscape(label)}</span>` : "";
  return (
    `<label class="tech"${style}><input type="checkbox" ` +
    `data-name="${name}" data-cat="${display}" data-desc="${desc}" data-good="${good}" data-prov="${provenance}"${leadAttr}>` +
    `<span class="ic2">${svg(glyph)}${svg(techIcon(icons, row.technique_name))}</span>` +
    `<span><span class="n">${name}</span><span class="d">${desc}</span>${labelHtml}</span></label>`
  );
}

function inventCard(display: string, glyph: string): string {
  return (
    `<label class="tech invent"><input type="checkbox" data-invent="${display}">` +
    `<span class="ic2">${svg(glyph)}</span>` +
    `<span><span class="n">✨ Invent a ${display} technique</span>` +
    `<span class="d">Make up a brand-new technique on the fly, in the spirit of ${display}</span></span></label>`
  );
}

/** `html_doc`: the self-contained browse-all page, deterministic ordering. */
export function htmlDoc(icons: Icons, rows: Row[]): string {
  const groups = new Map<string, Row[]>();
  for (const row of rows) groups.set(row.category, [...(groups.get(row.category) ?? []), row]);

  const body: string[] = [];
  const chips: string[] = [];
  const addSection = (cat: string): void => {
    const { hue, glyph } = categoryStyle(icons, cat);
    const display = htmlEscape(pretty(cat));
    const cards = (groups.get(cat) ?? []).map((row) => card(icons, row));
    cards.push(inventCard(display, glyph));
    chips.push(`<button type="button" class="chip" data-cat="${display}" style="--cc:${hue}">${display}</button>`);
    body.push(
      `<section data-cat="${display}" style="--c:${hue}"><h2>${display}<span class="cnt">${
        (groups.get(cat) ?? []).length
      }</span></h2><div class="grid">${cards.join("")}</div></section>`,
    );
  };

  const classics = rows.filter((row) => (row.provenance ?? "").toLowerCase() === "classic");
  if (classics.length) {
    const display = htmlEscape(CLASSIC_GROUP);
    const leadCards = classics.map((row) => card(icons, row, true)).join("");
    chips.push(`<button type="button" class="chip" data-cat="${display}" style="--cc:${LEAD_HUE}">${display}</button>`);
    body.push(
      `<section data-cat="${display}" style="--c:${LEAD_HUE}"><h2>${display}<span class="cnt">${classics.length}</span></h2><div class="grid">${leadCards}</div></section>`,
    );
  }

  const placed = new Set<string>();
  for (const [title, cats] of CATEGORY_GROUPS) {
    const present = cats.filter((cat) => groups.has(cat));
    if (!present.length) continue;
    const { hue } = categoryStyle(icons, present[0]);
    body.push(`<h2 class="grouphdr" style="--c:${hue}">${htmlEscape(title)}</h2>`);
    for (const cat of present) {
      addSection(cat);
      placed.add(cat);
    }
  }
  const leftover = [...groups.keys()].filter((cat) => !placed.has(cat)).sort();
  if (leftover.length) {
    body.push('<h2 class="grouphdr" style="--c:#8a8f9e">More</h2>');
    for (const cat of leftover) addSection(cat);
  }

  const presentGoals = new Set<string>();
  for (const row of rows) for (const tag of (row.good_for ?? "").split("|")) if (tag) presentGoals.add(tag);
  let goalbar = "";
  if (presentGoals.size) {
    const ordered = [
      ...GOAL_LABELS.filter(([key]) => presentGoals.has(key)).map(([key]) => key),
      ...[...presentGoals].filter((tag) => !GOAL_LABELS.some(([key]) => key === tag)).sort(),
    ];
    const goalChips = ordered
      .map((tag) => {
        const label = GOAL_LABELS.find(([key]) => key === tag)?.[1] ?? tag;
        return `<button type="button" class="goal" data-goal="${htmlEscape(tag)}">${htmlEscape(label)}</button>`;
      })
      .join("");
    goalbar = `<div class="bar"><span class="glabel">Great for</span><div class="goals" id="goals">${goalChips}</div></div>`;
  }

  const total = htmlEscape(`${rows.length} techniques across ${groups.size} categories.`);
  return SELECTOR_TEMPLATE.split("{{BODY}}")
    .join(body.join("\n"))
    .split("{{CHIPS}}")
    .join(chips.join(""))
    .split("{{GOALBAR}}")
    .join(goalbar)
    .split("{{TOTAL}}")
    .join(total);
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function brain(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "brain";
  let file: string | null = null;
  let extra: string | null = null;
  let skillRoot: string | null = null;
  let asJson = false;
  let command: string | null = null;
  let categoriesArg: string[] = [];
  let all = false;
  let names: string[] = [];
  let outPath: string | null = null;
  let drawCount = 1;

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
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --skill-root: expected one argument");
      // The patched call sites name the skill's own folder, which is where the
      // pin read its icon sidecar from (`DEFAULT_FILE.parent`).
      skillRoot = taken;
    } else if (command === null && ["categories", "list", "show", "random", "html"].includes(argv[i])) {
      command = argv[i];
    } else if (command === "list" && flag === "--category") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --category: expected one argument");
      categoriesArg.push(taken);
    } else if (command === "list" && flag === "--all" && inline === null) all = true;
    else if (command === "show") names.push(argv[i]);
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
    } else if (command === "html" && flag === "--out") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --out: expected one argument");
      outPath = taken;
    } else {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    }
  }

  if (file === null) {
    return usageError(script, "--file is required (the pin defaulted to the catalog beside the script)");
  }
  if (!(await isFile(fs, file))) {
    return { stdout: `error: technique file not found: ${file}\n`, exitCode: 2 };
  }
  let rows = loadCatalog(await fs.readText(file));
  if (extra !== null) {
    if (!(await isFile(fs, extra))) {
      return { stdout: `error: --extra file not found: ${extra}\n`, exitCode: 2 };
    }
    try {
      rows = mergeTechniques(rows, loadExtra(await fs.readText(extra)));
    } catch (error) {
      const text = errorText(error);
      return { stdout: `error: could not read --extra: ${text}\n`, exitCode: 2 };
    }
  }
  // `args.file.resolve().parent`: the folder the detail paths resolve from.
  const csvDir = absolutePath(file).slice(0, absolutePath(file).lastIndexOf("/")) || "/";
  // The icon sidecar sat beside the pin's own default catalog, inside the
  // skill's `assets/`: a call site that names its skill folder gets that
  // sidecar, and a run with no skill root falls back to the catalog's own
  // folder, which is all a bundled runtime can see.
  const iconDir =
    skillRoot !== null
      ? `${absolutePath(skillRoot)}/assets`
      : csvDir;

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
    return { stdout: fmtList(filterCats(rows, categoriesArg), asJson) + "\n", exitCode: 0 };
  }
  if (command === "show") {
    const { found, missing } = find(rows, names);
    if (!found.length) return { stdout: missing.map((name) => `# not found: ${name}`).join("\n") + "\n", exitCode: 1 };
    return { stdout: (await fmtShow(fs, found, csvDir, asJson)) + "\n", exitCode: 0 };
  }
  if (command === "random") {
    const pool = filterCats(rows, categoriesArg);
    if (!pool.length) return { stdout: "# no techniques match\n", exitCode: 1 };
    const n = Math.max(0, Math.min(drawCount, pool.length));
    const picks: Row[] = [];
    const remaining = [...pool];
    for (let i = 0; i < n && remaining.length; i++) {
      picks.push(remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0]);
    }
    return { stdout: fmtList(picks, asJson) + "\n", exitCode: 0 };
  }
  if (outPath === null) {
    return {
      stdout:
        "error: `html` needs --out PATH — it writes the selection page to a file and " +
        "never prints the catalog to stdout (which would defeat the point).\n",
      exitCode: 2,
    };
  }
  // A slashless `--out brain.html` has no folder to create: slicing before the
  // last `/` would turn it into the junk folder `brain.htm`.
  const cut = outPath.lastIndexOf("/");
  const parent = cut > 0 ? outPath.slice(0, cut) : "";
  if (parent && !(await fs.exists(parent))) await fs.mkdir(parent);
  await fs.writeText(outPath, htmlDoc(await loadIcons(fs, iconDir), rows));
  return { stdout: `wrote ${outPath} (${rows.length} techniques, ${categories(rows).length} categories)\n`, exitCode: 0 };
}

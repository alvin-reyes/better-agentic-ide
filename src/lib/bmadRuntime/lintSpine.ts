import type { Fs } from "./fs";
import { isDirectory, pyJson, pyRepr } from "./knowledge";
import { absolutePath, splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-architecture/scripts/lint_spine.py` — the mechanical
 * half of spine decision-integrity: placeholders, AD identifiers and required
 * AD fields, and Stack rows with no version pinned. Findings travel in the
 * JSON and the exit code is always 0, exactly as the goldens in
 * `__tests__/goldens/helpers/lintSpine*.json` record (a missing spine is a
 * finding-shaped error in the JSON too, not a refusal).
 */

const AD_HEADING = /^#{2,4}\s*AD-(\d+)\b(.*)$/gm;
const HEADING = /^#{1,6}\s/m;
const FENCE = /```[\s\S]*?```/g;
const PLACEHOLDER_WORD = /\b(TBD|TODO|FIXME|XXX)\b/g;
const SIMILAR_TO = /similar to AD-\d+/gi;
const TEMPLATE_TOKEN = /\{[a-z_][a-z0-9_ /.-]*\}/g;
/** The same token pattern for a one-shot search (the `g` flag would carry
 * `lastIndex` between calls). */
const TEMPLATE_TOKEN_ONE = /\{[a-z_][a-z0-9_ /.-]*\}/;

interface Finding {
  category: string;
  severity: string;
  detail: string;
  location: string;
}

/** `split_frontmatter`: line-exact `---` fences, and the body's offset. */
export function splitFrontmatter(text: string): { frontmatter: string; body: string; offset: number } {
  const lines = text.split("\n");
  if (lines.length && lines[0] === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        return { frontmatter: lines.slice(1, i).join("\n"), body: lines.slice(i + 1).join("\n"), offset: i + 1 };
      }
    }
  }
  return { frontmatter: "", body: text, offset: 0 };
}

/** `blank_fences`: keep every line number outside the fence where it was. */
export function blankFences(text: string): string {
  return text.replace(FENCE, (block) => "\n".repeat((block.match(/\n/g) ?? []).length));
}

function lineOf(text: string, index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) if (text[i] === "\n") count += 1;
  return count + 1;
}

const PLACEHOLDER_RULES: [RegExp, string, string][] = [
  [PLACEHOLDER_WORD, "placeholder marker", "high"],
  [SIMILAR_TO, "unresolved cross-reference", "high"],
  [TEMPLATE_TOKEN, "possible unfilled template token (verify)", "low"],
];

function findPlaceholders(body: string, offset: number, name: string): Finding[] {
  const findings: Finding[] = [];
  const scan = blankFences(body);
  for (const [regex, label, severity] of PLACEHOLDER_RULES) {
    for (const match of scan.matchAll(regex)) {
      findings.push({
        category: "placeholder",
        severity,
        detail: `${label}: ${pyRepr(match[0])}`,
        location: `${name} (line ${offset + lineOf(scan, match.index)})`,
      });
    }
  }
  return findings;
}

/** Unfilled tokens in the frontmatter, outside the body the other pass scans. */
function findFrontmatterPlaceholders(frontmatter: string, name: string): Finding[] {
  const findings: Finding[] = [];
  for (const [regex, label, severity] of [PLACEHOLDER_RULES[0], PLACEHOLDER_RULES[2]]) {
    for (const match of frontmatter.matchAll(regex)) {
      findings.push({
        category: "placeholder",
        severity,
        detail: `frontmatter ${label}: ${pyRepr(match[0])}`,
        location: `${name} frontmatter (line ${1 + lineOf(frontmatter, match.index)})`,
      });
    }
  }
  return findings;
}

/** `_table_cells`: a markdown row in cells, the outer pipes dropped. */
function tableCells(row: string): string[] {
  let text = row.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|")) text = text.slice(0, -1);
  return text.split("|").map((cell) => cell.trim());
}

function findAdIssues(body: string, offset: number, name: string): Finding[] {
  const findings: Finding[] = [];
  const scan = blankFences(body);
  const seen = new Map<number, number>();
  let previous: number | null = null;
  for (const match of scan.matchAll(AD_HEADING)) {
    const num = Number(match[1]);
    const fileLine = offset + lineOf(scan, match.index);
    const location = `${name} AD-${num} (line ${fileLine})`;
    if (seen.has(num)) {
      findings.push({
        category: "ad_id",
        severity: "high",
        detail: `AD-${num} id reused (also at line ${seen.get(num)})`,
        location,
      });
    } else seen.set(num, fileLine);
    if (previous !== null && num <= previous) {
      findings.push({
        category: "ad_id",
        severity: "high",
        detail: `AD-${num} is non-monotonic (follows AD-${previous}); ids must ascend and never renumber`,
        location,
      });
    }
    previous = previous === null ? num : Math.max(previous, num);

    // The block runs from this heading to the next heading of any level.
    const start = match.index + match[0].length;
    const next = HEADING.exec(scan.slice(start));
    const block = next ? scan.slice(start, start + next.index) : scan.slice(start);
    const low = block.toLowerCase();
    const missing = ["binds", "prevents", "rule"].filter((field) => !low.includes(field));
    if (missing.length) {
      findings.push({
        category: "ad_fields",
        severity: "high",
        detail: `AD-${num} missing required field(s): ${missing.join(", ")}`,
        location,
      });
    }
  }
  return findings;
}

/** A `## Stack` table row that names a dependency but pins no version. */
function findUnpinnedStack(body: string, offset: number, name: string): Finding[] {
  const findings: Finding[] = [];
  let inStack = false;
  let headerSeen = false;
  let nameIdx = 0;
  let versionIdx = 1;
  const scan = blankFences(body);
  scan.split("\n").forEach((raw, i) => {
    if (HEADING.test(raw)) {
      inStack = /^##\s+Stack\b/.test(raw);
      headerSeen = false;
      nameIdx = 0;
      versionIdx = 1;
      return;
    }
    if (!inStack || !raw.trimStart().startsWith("|")) return;
    if ([...raw.trim()].every((ch) => "|-: ".includes(ch))) return; // separator row
    const cells = tableCells(raw);
    if (!headerSeen) {
      headerSeen = true;
      cells.forEach((cell, j) => {
        if (cell.toLowerCase() === "name") nameIdx = j;
        else if (cell.toLowerCase() === "version") versionIdx = j;
      });
      return;
    }
    const dep = nameIdx < cells.length ? cells[nameIdx] : "";
    const version = versionIdx < cells.length ? cells[versionIdx] : "";
    if (!dep || TEMPLATE_TOKEN_ONE.test(dep)) return;
    if (!version || TEMPLATE_TOKEN_ONE.test(version)) {
      findings.push({
        category: "version_pin",
        severity: "medium",
        detail: `Stack entry ${pyRepr(dep)} has no version`,
        location: `${name} (line ${offset + i + 1})`,
      });
    }
  });
  return findings;
}

/** `lint(text, name)`: every mechanical check over one spine's text. */
export function lintSpineText(text: string, name = "spine"): Record<string, unknown> {
  const { frontmatter, body, offset } = splitFrontmatter(text);
  const findings: Finding[] = [];
  findings.push(...findFrontmatterPlaceholders(frontmatter, name));
  findings.push(...findPlaceholders(body, offset, name));
  findings.push(...findAdIssues(body, offset, name));
  findings.push(...findUnpinnedStack(body, offset, name));
  const bySeverity: Record<string, number> = {};
  for (const finding of findings) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  return {
    ok: findings.length === 0,
    spine: name,
    total_findings: findings.length,
    by_severity: bySeverity,
    findings,
  };
}

/**
 * The uniform port shape: the Python's stdout and exit code out. `--skill-root`
 * is accepted and ignored (the Python never read its own location).
 */
export async function lintSpine(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "lint_spine";
  const positionals: string[] = [];
  const ignored = "--skill-root";
  let workspace: string | null = null;
  let output: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    const value = () => inline ?? argv[++i];
    if (flag === "--workspace") {
      const taken = value();
      if (taken === undefined) return usageError(script, "argument --workspace: expected one argument");
      workspace = taken;
    } else if (flag === "-o" || flag === "--output") {
      const taken = value();
      if (taken === undefined) return usageError(script, `argument ${flag}: expected one argument`);
      output = taken;
    } else if (flag === ignored) {
      if (value() === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  if (workspace === null) return usageError(script, "the following arguments are required: --workspace");
  if (positionals.length) return usageError(script, `unrecognized arguments: ${positionals[0]}`);

  // `Path(args.workspace).resolve()`.
  const folder = absolutePath(workspace);
  const spinePath = `${folder}/${folder.slice(folder.lastIndexOf("/") + 1)}.md`;
  let result: Record<string, unknown>;
  if (!(await fs.exists(spinePath))) {
    result = { ok: false, error: `${spinePath} not found`, findings: [], total_findings: 0 };
  } else if (await isDirectory(fs, spinePath)) {
    result = { ok: false, error: `could not read ${spinePath}: [Errno 21] Is a directory: '${spinePath}'`, findings: [], total_findings: 0 };
  } else {
    try {
      result = lintSpineText(await fs.readText(spinePath), spinePath.slice(spinePath.lastIndexOf("/") + 1));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      result = { ok: false, error: `could not read ${spinePath}: ${text}`, findings: [], total_findings: 0 };
    }
  }

  const out = pyJson(result, { indent: 2, ensureAscii: true });
  if (output !== null) {
    const parent = output.slice(0, output.lastIndexOf("/"));
    if (parent && parent !== "/" && !(await fs.exists(parent))) await fs.mkdir(parent);
    await fs.writeText(output, out + "\n");
    return { stdout: "", exitCode: 0 };
  }
  return { stdout: out + "\n", exitCode: 0 };
}

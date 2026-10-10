import type { Fs } from "./fs";
import { compareStrings, errorText, missingPathError, pyJson, pyRepr } from "./knowledge";
import { addMonths, asciiFold, compareDates, formatDate, htmlEscape, parseDate, today, type PyDate } from "./compat";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-deep-recon/scripts/recon_kit.py` — the deterministic
 * helpers bmad-deep-recon leans on: citation cross-checking, memlog tallying,
 * staleness windows, run-folder slugs and the escaped source appendix. Every
 * subcommand prints one JSON object (`indent=2`, non-ASCII kept literal) and
 * answers 0 for a clean pass, 1 for findings, 2 for a refusal — exactly as the
 * goldens in `__tests__/goldens/helpers/reconKit-*.json` record.
 *
 * Two divergences a bundle cannot share, both outside any captured shape: a
 * malformed `--windows` JSON reports this runtime's parse error rather than
 * `json.loads`'s, and `-` (the Python read stdin) is refused, because the
 * runtime has no stdin to read.
 */

const MARKER_RE = /\[(\d+)\](?!\()/g;
const MD_LINK_RE = /\[([^\]]*)\]\(((?:[^\s()]|\([^\s()]*\))+)\)/;
const BARE_URL_RE = /https?:\/\/(?:\([^\s()]*\)|[^\s()|\]])+/;
const ROW_ID_RE = /^\[(\d+)\]$/;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
const ENTRY_RE = /^- (?:\(([\p{L}\p{N}_-]+)(?: by [^)]*)?\)\s*)?(.*)$/u;

function out(payload: unknown, exitCode: number): PortResult {
  return { stdout: `${pyJson(payload, { indent: 2 })}\n`, exitCode };
}

function refusal(message: string): PortResult {
  return { stdout: `error: ${message}\n`, exitCode: 2 };
}

/** The file's text, or the OSError text the Python's `main` turned into a
 * refusal: `error: <text>`, exit 2. */
type Read = { ok: true; text: string } | { ok: false; message: string };

async function readText(fs: Fs, pathArg: string): Promise<Read> {
  if (pathArg === "-") return { ok: false, message: "stdin is not available to the bundled runtime; pass a path" };
  try {
    return { ok: true, text: await fs.readText(pathArg) };
  } catch (error) {
    return { ok: false, message: (await fs.exists(pathArg)) ? errorText(error) : missingPathError(pathArg) };
  }
}

/** `strip_fences`: blank fenced blocks, pairing them CommonMark-style. */
export function stripFences(text: string): string {
  const lines: string[] = [];
  let openFence: [string, number] | null = null;
  for (const line of text.split("\n")) {
    const fence = FENCE_RE.exec(line);
    if (openFence === null) {
      if (fence) openFence = [fence[1][0], fence[1].length];
      lines.push(fence ? "" : line);
      continue;
    }
    const marker = fence ? fence[1] : "";
    if (marker.slice(0, 1) === openFence[0] && marker.length >= openFence[1] && line.trim() === marker) openFence = null;
    lines.push("");
  }
  return lines.join("\n");
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

/** Source-appendix rows: markdown table rows whose first cell is `[n]`. */
export function appendixRows(text: string): Map<number, string[]> {
  const rows = new Map<number, string[]>();
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (!stripped.startsWith("|")) continue;
    const cells = tableCells(stripped);
    if (cells.length < 2) continue;
    const match = ROW_ID_RE.exec(cells[0]);
    if (match) rows.set(Number(match[1]), cells);
  }
  return rows;
}

function cmdCitations(text: string): PortResult {
  const scannable = stripFences(text);
  const rows = appendixRows(scannable);
  const markers = new Set<number>();
  for (const line of scannable.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith("|")) {
      const cells = tableCells(stripped);
      if (cells.length && ROW_ID_RE.test(cells[0])) continue; // a row is not a citation of itself
    }
    for (const match of line.matchAll(MARKER_RE)) markers.add(Number(match[1]));
  }
  const dangling = [...markers].filter((n) => !rows.has(n)).sort((a, b) => a - b);
  const orphaned = [...rows.keys()].filter((n) => !markers.has(n)).sort((a, b) => a - b);
  const ok = !dangling.length && !orphaned.length;
  return out(
    {
      markers: [...markers].sort((a, b) => a - b),
      appendix_rows: [...rows.keys()].sort((a, b) => a - b),
      dangling_markers: dangling,
      orphaned_rows: orphaned,
      ok,
    },
    ok ? 0 : 1,
  );
}

function cmdTally(text: string): PortResult {
  const body = text.startsWith("---") ? text.split("---").slice(0, 3).slice(-1)[0] : text;
  const byType = new Map<string, number>();
  const byRef = new Map<number, string>();
  const unrefStatus = new Map<string, number>();
  let entries = 0;
  for (const line of body.split("\n")) {
    if (!line.startsWith("- ")) continue;
    const match = ENTRY_RE.exec(line);
    if (!match) continue;
    entries += 1;
    const entryType = match[1] ?? "note";
    byType.set(entryType, (byType.get(entryType) ?? 0) + 1);
    if (entryType !== "claim") continue;
    const status = /status=([\w-]+)/.exec(match[2]);
    const ref = /ref=\[?(\d+)\]?/.exec(match[2]);
    if (ref) byRef.set(Number(ref[1]), status ? status[1] : "unknown"); // last status wins per ref
    else {
      const key = status ? status[1] : "unknown";
      unrefStatus.set(key, (unrefStatus.get(key) ?? 0) + 1);
    }
  }
  const claims = new Map(unrefStatus);
  for (const status of byRef.values()) claims.set(status, (claims.get(status) ?? 0) + 1);
  const sorted = (map: Map<string, number>) =>
    Object.fromEntries([...map.entries()].sort((a, b) => compareStrings(a[0], b[0])));
  return out(
    {
      entries,
      by_type: sorted(byType),
      claims: sorted(claims),
      claims_total: [...claims.values()].reduce((sum, n) => sum + n, 0),
    },
    0,
  );
}

interface Claim {
  [field: string]: unknown;
}

function cmdStaleness(text: string, windowsArg: string, todayArg: string | null): PortResult {
  let windows: Map<string, number>;
  let reference: PyDate;
  try {
    const rawWindows: unknown = JSON.parse(windowsArg);
    if (rawWindows === null || typeof rawWindows !== "object" || Array.isArray(rawWindows)) {
      throw new Error("--windows must be a JSON object of class -> months");
    }
    windows = new Map(
      Object.entries(rawWindows as Record<string, unknown>).map(([key, value]) => {
        const months = Number(value);
        if (!Number.isInteger(months)) throw new Error(`--windows values must be whole months, got ${pyRepr(value)}`);
        return [key.toLowerCase(), months];
      }),
    );
    reference = todayArg ? parseDate(todayArg) : today();
  } catch (error) {
    return refusal(errorText(error));
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return refusal(errorText(error));
  }
  const claims = payload !== null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>).claims : payload;
  if (!Array.isArray(claims) || !claims.every((claim) => claim !== null && typeof claim === "object" && !Array.isArray(claim))) {
    return refusal('claims must be a JSON array of objects, or {"claims": [...]}');
  }

  const results: Record<string, unknown>[] = [];
  const noWindow = new Set<string>();
  let staleCount = 0;
  let earliest: PyDate | null = null;
  for (const claim of claims as Claim[]) {
    const claimClass = String(claim.class ?? "").toLowerCase();
    let published: PyDate;
    try {
      published = parseDate(String(claim.pub_date));
    } catch (error) {
      // The Python's own line for a bad claim carries no `error: ` prefix.
      return { stdout: `error in claim ${pyRepr(claim)}: ${errorText(error)}\n`, exitCode: 2 };
    }
    const months = windows.get(claimClass);
    if (months === undefined) {
      noWindow.add(claimClass);
      results.push({ ...claim, recheck: null, stale: null });
      continue;
    }
    const recheck = addMonths(published, months);
    const stale = compareDates(recheck, reference) <= 0;
    if (stale) staleCount += 1;
    if (earliest === null || compareDates(recheck, earliest) < 0) earliest = recheck;
    results.push({ ...claim, recheck: formatDate(recheck), stale });
  }
  return out(
    {
      today: formatDate(reference),
      claims: results,
      stale_count: staleCount,
      earliest_recheck: earliest === null ? null : formatDate(earliest),
      no_window_classes: [...noWindow].sort(compareStrings),
    },
    staleCount ? 1 : 0,
  );
}

export function slugify(text: string, maxLen = 40): string {
  const folded = asciiFold(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return folded.replace(/-{2,}/g, "-").slice(0, maxLen).replace(/-+$/, "");
}

function cmdSlug(topic: string, type: string, pattern: string, dateArg: string | null): PortResult {
  const slug = slugify(topic);
  if (!slug) return refusal("topic slugified to an empty string");
  const folder = pattern
    .split("{research_type}")
    .join(type)
    .split("{topic_slug}")
    .join(slug)
    .split("{date}")
    .join(dateArg ?? formatDate(today()));
  return out({ topic_slug: slug, folder }, 0);
}

/** A URL that is http(s) with a host, else null — `urlparse`'s check. */
export function safeUrl(raw: string): string | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/.exec(raw);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  return (scheme === "http" || scheme === "https") && match[2] ? raw : null;
}

/** `cell_html`: escape a cell, link only a validated http(s) URL. */
export function cellHtml(cell: string, invalid: string[]): string {
  const link = MD_LINK_RE.exec(cell);
  if (link) {
    const url = safeUrl(link[2]);
    const label = htmlEscape(link[1] || link[2]);
    if (url) {
      return (
        htmlEscape(cell.slice(0, link.index)) +
        `<a href="${htmlEscape(url)}" target="_blank" rel="noopener">${label}</a>` +
        htmlEscape(cell.slice(link.index + link[0].length))
      );
    }
    invalid.push(link[2]);
    return htmlEscape(cell.split(link[0]).join(link[1] || link[2]));
  }
  const bare = BARE_URL_RE.exec(cell);
  if (bare) {
    const url = safeUrl(bare[0]);
    if (url) {
      const escaped = htmlEscape(url);
      return (
        htmlEscape(cell.slice(0, bare.index)) +
        `<a href="${escaped}" target="_blank" rel="noopener">${escaped}</a>` +
        htmlEscape(cell.slice(bare.index + bare[0].length))
      );
    }
    invalid.push(bare[0]);
  }
  return htmlEscape(cell);
}

function cmdEscapeSources(text: string): PortResult {
  const rows = appendixRows(stripFences(text));
  if (!rows.size) return refusal("no source-appendix table rows found");
  const invalid: string[] = [];
  const bodyRows: string[] = [];
  for (const n of [...rows.keys()].sort((a, b) => a - b)) {
    const cells = rows.get(n)!;
    const tds = cells.slice(1).map((cell) => `<td>${cellHtml(cell, invalid)}</td>`).join("");
    bodyRows.push(`<tr id="src-${n}"><td>[${n}]</td>${tds}</tr>`);
  }
  const table = '<table class="sources"><tbody>' + bodyRows.join("") + "</tbody></table>";
  return out({ rows: rows.size, invalid_urls: invalid, html: table }, invalid.length ? 1 : 0);
}

/**
 * The uniform port shape: the Python's stdout and exit code out. `recon_kit`
 * takes `--skill-root` from the patched call sites and ignores it, exactly as
 * the Python would have (it never read its own location).
 */
export async function reconKit(argv: string[], fs: Fs): Promise<PortResult> {
  // The patched call sites write `--skill-root <path> <command> …`, so the
  // global flag is taken wherever it appears before the command is known; the
  // Python never read its own location and argparse refused the flag outright.
  const rest: string[] = [];
  let command: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill-root") {
      if ((inline ?? argv[++i]) === undefined) {
        return usageError("recon_kit", "argument --skill-root: expected one argument");
      }
      continue;
    }
    if (command === null) command = argv[i];
    else rest.push(argv[i]);
  }
  if (command === null) return usageError("recon_kit", "the following arguments are required: cmd");

  const positionals: string[] = [];
  let windows: string | null = null;
  let todayArg: string | null = null;
  let type: string | null = null;
  let pattern = "research-{topic_slug}";
  let dateArg: string | null = null;
  for (let i = 0; i < rest.length; i++) {
    const [flag, inline] = splitFlag(rest[i]);
    const value = () => inline ?? rest[++i];
    if (flag === "--skill-root") {
      if (value() === undefined) return usageError("recon_kit", "argument --skill-root: expected one argument");
    } else if (flag === "--windows") {
      windows = value() ?? null;
      if (windows === null) return usageError("recon_kit", "argument --windows: expected one argument");
    } else if (flag === "--today") {
      todayArg = value() ?? null;
    } else if (flag === "--type") {
      type = value() ?? null;
    } else if (flag === "--pattern") {
      pattern = value() ?? pattern;
    } else if (flag === "--date") {
      dateArg = value() ?? null;
    } else if (rest[i].startsWith("-") && rest[i] !== "-") {
      return usageError("recon_kit", `unrecognized arguments: ${rest[i]}`);
    } else positionals.push(rest[i]);
  }

  const read = async (): Promise<Read> => {
    const path = positionals[0];
    if (path === undefined) return { ok: false, message: "the following arguments are required: file" };
    return readText(fs, path);
  };

  switch (command) {
    case "citations":
    case "tally":
    case "escape-sources":
    case "staleness": {
      if (positionals[0] === undefined) return usageError("recon_kit", "the following arguments are required: file");
      const file = await read();
      // A read failure is the Python's own `error: <OSError>` line, not an
      // argparse usage error; a missing positional is the other one.
      if (!file.ok) return refusal(file.message);
      if (command === "staleness" && windows === null) {
        return usageError("recon_kit", "the following arguments are required: --windows");
      }
      if (command === "citations") return cmdCitations(file.text);
      if (command === "tally") return cmdTally(file.text);
      if (command === "escape-sources") return cmdEscapeSources(file.text);
      return cmdStaleness(file.text, windows!, todayArg);
    }
    case "slug": {
      const topic = positionals[0];
      if (topic === undefined) return usageError("recon_kit", "the following arguments are required: topic");
      if (type === null) return usageError("recon_kit", "the following arguments are required: --type");
      return cmdSlug(topic, type, pattern, dateArg);
    }
    default:
      return usageError("recon_kit", `invalid choice: ${pyRepr(command)}`);
  }
}

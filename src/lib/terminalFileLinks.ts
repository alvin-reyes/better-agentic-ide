import { invoke } from "@tauri-apps/api/core";
import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

/**
 * Clickable file paths in terminal output: whatever Claude (or any command)
 * prints — "Write(docs/plan.md)", "Saved report to ./out/report.pdf",
 * "src/App.tsx:42:7" — becomes a link when it names a file that exists.
 */

export interface PathCandidate {
  /** Offset of the path in the text. */
  start: number;
  /** Offset just past the path (before any :line:col suffix). */
  end: number;
  path: string;
}

// Runs of characters that can be part of a path. Brackets, quotes and commas
// end a path, so "Write(docs/plan.md)" and "`a.md`," yield just the path.
const TOKEN = /[^\s`'"()<>[\]{}|,;]+/g;
const TRAILING = /[.:!?]+$/;
const LINE_COL = /(:\d+){1,2}$/;
const HAS_EXT = /\.[A-Za-z0-9]{1,10}$/;

/** Path-like tokens in a line of terminal text. */
export function findPathCandidates(text: string): PathCandidate[] {
  const out: PathCandidate[] = [];
  for (const m of text.matchAll(TOKEN)) {
    let token = m[0];
    const start = m.index ?? 0;
    if (token.includes("://") || token.startsWith("-") || token.startsWith("@")) continue;
    token = token.replace(TRAILING, "").replace(LINE_COL, "").replace(TRAILING, "");
    if (token.length < 3) continue;
    // A path has a folder separator or a file extension. Anything else
    // ("hello", "3.14") is left to the existence check to reject.
    const looksLikePath = token.includes("/") || HAS_EXT.test(token);
    if (!looksLikePath || /^v?[\d.]+$/.test(token)) continue;
    out.push({ start, end: start + token.length, path: token });
  }
  return out;
}

const CACHE_MS = 4000;
const cache = new Map<string, { at: number; resolved: string | null }>();

/** Absolute paths for the candidates that exist, via one backend call. */
async function resolveExisting(paths: string[], cwd: string | null): Promise<(string | null)[]> {
  const now = Date.now();
  const key = (p: string) => `${cwd ?? ""}\0${p}`;
  const missing = paths.filter((p) => {
    const hit = cache.get(key(p));
    return !hit || now - hit.at > CACHE_MS;
  });
  if (missing.length > 0) {
    try {
      const got = await invoke<(string | null)[]>("resolve_file_paths", { paths: missing, cwd });
      missing.forEach((p, i) => cache.set(key(p), { at: now, resolved: got[i] ?? null }));
    } catch {
      return paths.map(() => null);
    }
  }
  if (cache.size > 2000) cache.clear();
  return paths.map((p) => cache.get(key(p))?.resolved ?? null);
}

/**
 * The logical line containing buffer row `y` (0-based): long output wraps
 * over several rows, and a path split across them should still be one link.
 */
function logicalLine(term: Terminal, y: number) {
  const buf = term.buffer.active;
  let first = y;
  while (first > 0 && buf.getLine(first)?.isWrapped) first--;
  let last = y;
  while (buf.getLine(last + 1)?.isWrapped) last++;
  let text = "";
  const rowStarts: number[] = [];
  for (let r = first; r <= last; r++) {
    rowStarts.push(text.length);
    text += buf.getLine(r)?.translateToString(r === last) ?? "";
  }
  // Offset in `text` -> 1-based buffer cell {x, y}.
  const toCell = (offset: number) => {
    let i = rowStarts.length - 1;
    while (i > 0 && rowStarts[i] > offset) i--;
    return { x: offset - rowStarts[i] + 1, y: first + i + 1 };
  };
  return { text, toCell, first, last };
}

// A character that can end a path on one row and continue it on the next.
// Narrower than TOKEN: a row starting with a bullet (⏺, ⎿, ❯) is new output.
const PATH_EDGE = /[\w.~/\\-]/;

/**
 * Rows of terminal text joined the way a reader sees them. Soft-wrapped rows
 * join as they are. A row whose text ends in a path character joins the next
 * row's text after its indent when that starts with one: Claude Code wraps
 * long lines itself (carriage return, cursor down, indent), so a long path,
 * a brainstorm document's in particular, arrives as two unrelated rows. The
 * existence check rejects a join that names no file, and the caller keeps the
 * unjoined line's paths too, so a wrong join costs nothing.
 *
 * `toCell` maps an offset in `text` to its row (an index into `rows`) and its
 * 1-based column.
 */
export function stitchRows(rows: { text: string; wrapped: boolean }[]) {
  let text = "";
  const segments: { at: number; row: number; col: number }[] = [];
  rows.forEach((r, i) => {
    if (i === 0 || r.wrapped) {
      segments.push({ at: text.length, row: i, col: 0 });
      text += r.text;
      return;
    }
    const trimmed = text.replace(/ +$/, "");
    const indent = r.text.length - r.text.trimStart().length;
    const rest = r.text.slice(indent);
    if (PATH_EDGE.test(trimmed.slice(-1)) && PATH_EDGE.test(rest.charAt(0))) {
      text = trimmed;
      segments.push({ at: text.length, row: i, col: indent });
      text += rest;
    } else {
      text += "\n";
      segments.push({ at: text.length, row: i, col: 0 });
      text += r.text;
    }
  });
  const toCell = (offset: number) => {
    let s = segments.length - 1;
    while (s > 0 && segments[s].at > offset) s--;
    return { x: offset - segments[s].at + segments[s].col + 1, row: segments[s].row };
  };
  return { text, toCell };
}

/** How many rows either side of the hovered one a broken path may span. */
const STITCH_ROWS = 4;

type CellRange = { start: { x: number; y: number }; end: { x: number; y: number } };
const before = (a: CellRange["start"], b: CellRange["start"]) => a.y < b.y || (a.y === b.y && a.x < b.x);
/** Two cell ranges share a cell. */
function overlaps(a: CellRange, b: CellRange): boolean {
  return !before(a.end, b.start) && !before(b.end, a.start);
}

/**
 * Register the provider on a terminal. `getCwd` gives the folder relative
 * paths resolve against; `open` receives the absolute path of a clicked file.
 */
export function registerFileLinks(
  term: Terminal,
  getCwd: () => Promise<string | null>,
  open: (path: string) => void,
): void {
  const provider: ILinkProvider = {
    provideLinks(lineNumber, callback) {
      type Found = { path: string; start: { x: number; y: number }; end: { x: number; y: number } };
      // Each found path, as 1-based cells, kept only when it covers this row.
      const covering = (path: string, start: Found["start"], end: Found["end"]): Found[] =>
        lineNumber < start.y || lineNumber > end.y ? [] : [{ path, start, end }];

      const line = logicalLine(term, lineNumber - 1);
      const plain = findPathCandidates(line.text).flatMap((c) => covering(c.path, line.toCell(c.start), line.toCell(c.end - 1)));

      // The same rows again, with paths Claude Code broke across rows joined.
      const buf = term.buffer.active;
      const first = Math.max(0, lineNumber - 1 - STITCH_ROWS);
      const last = Math.min(buf.length - 1, lineNumber - 1 + STITCH_ROWS);
      const rows = [];
      for (let r = first; r <= last; r++) {
        const row = buf.getLine(r);
        rows.push({ text: row?.translateToString(true) ?? "", wrapped: r > first && !!row?.isWrapped });
      }
      const stitched = stitchRows(rows);
      const cell = (offset: number) => {
        const { x, row } = stitched.toCell(offset);
        return { x, y: first + row + 1 };
      };
      const joined = findPathCandidates(stitched.text)
        .flatMap((c) => covering(c.path, cell(c.start), cell(c.end - 1)))
        .filter((j) => j.start.y !== j.end.y && !plain.some((p) => p.path === j.path));

      const candidates = [...joined, ...plain];
      if (candidates.length === 0) {
        callback(undefined);
        return;
      }
      (async () => {
        const cwd = await getCwd().catch(() => null);
        const resolved = await resolveExisting(candidates.map((c) => c.path), cwd);
        const found = candidates.flatMap((c, i) => (resolved[i] ? [{ ...c, abs: resolved[i] as string, isJoined: i < joined.length }] : []));
        // A joined path that names a file wins over the fragments it is made of.
        const winners = found.filter((f) => f.isJoined || !found.some((j) => j.isJoined && overlaps(j, f)));
        const links: ILink[] = winners.map((f) => ({
          range: { start: f.start, end: f.end },
          text: f.path,
          decorations: { underline: true, pointerCursor: true },
          activate: () => open(f.abs),
        }));
        callback(links.length > 0 ? links : undefined);
      })();
    },
  };
  term.registerLinkProvider(provider);
}

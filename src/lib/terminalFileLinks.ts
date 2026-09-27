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
      const { text, toCell } = logicalLine(term, lineNumber - 1);
      const candidates = findPathCandidates(text);
      if (candidates.length === 0) {
        callback(undefined);
        return;
      }
      (async () => {
        const cwd = await getCwd().catch(() => null);
        const resolved = await resolveExisting(candidates.map((c) => c.path), cwd);
        const links: ILink[] = [];
        candidates.forEach((c, i) => {
          const abs = resolved[i];
          if (!abs) return;
          const start = toCell(c.start);
          const end = toCell(c.end - 1);
          // Report each link once, from the row it starts on or covers.
          if (lineNumber < start.y || lineNumber > end.y) return;
          links.push({
            range: { start, end },
            text: c.path,
            decorations: { underline: true, pointerCursor: true },
            activate: () => open(abs),
          });
        });
        callback(links.length > 0 ? links : undefined);
      })();
    },
  };
  term.registerLinkProvider(provider);
}

/** Kinds the preview panel renders beside the terminal. */
export function opensInPreview(path: string): boolean {
  return /\.(md|markdown|html?|pdf|png|jpe?g|gif|svg|webp|bmp|ico)$/i.test(path);
}

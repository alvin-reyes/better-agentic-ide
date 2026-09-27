import { marked } from "marked";

/**
 * Markdown to HTML (unsanitized: callers sanitize).
 *
 * marked's lexer is quadratic in document size under JavaScriptCore, the
 * engine behind the macOS and Linux webviews: a 1.7 MB file took 14 minutes
 * and froze the app, while V8 parses it in a third of a second. Parsing in
 * small chunks keeps the total linear. Chunks end only where a block can't
 * continue: at a blank line, outside fenced code, before a line that starts
 * a new top-level block (not indented, not a list item, not a table row).
 * Reference-style link definitions are repeated into every chunk so links
 * still resolve across chunk boundaries.
 */

const CHUNK_TARGET = 4000;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const LINK_DEF = /^ {0,3}\[[^\]]+\]:\s*\S/;
// Lines that can continue the block before a blank line.
const CONTINUES = /^(\s|[-*+] |\d+[.)] |\||>|<\/)/;

export function splitMarkdown(md: string, target = CHUNK_TARGET): string[] {
  const lines = md.split("\n");
  const chunks: string[] = [];
  const defs: string[] = [];
  let cur: string[] = [];
  let size = 0;
  let fence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE.exec(line);
    if (fence) {
      if (f && line.trim().startsWith(fence)) fence = null;
    } else if (f) {
      fence = f[1][0].repeat(3);
    } else if (LINK_DEF.test(line)) {
      defs.push(line);
    }
    cur.push(line);
    size += line.length + 1;
    const next = lines[i + 1];
    const boundary =
      !fence && line.trim() === "" && next !== undefined && next.trim() !== "" && !CONTINUES.test(next);
    if (boundary && size >= target) {
      chunks.push(cur.join("\n"));
      cur = [];
      size = 0;
    }
  }
  if (cur.length) chunks.push(cur.join("\n"));
  if (chunks.length > 1 && defs.length) {
    const tail = "\n\n" + defs.join("\n") + "\n";
    return chunks.map((c) => c + tail);
  }
  return chunks;
}

export function markdownToHtml(md: string): string {
  return splitMarkdown(md)
    .map((c) => marked.parse(c, { async: false }) as string)
    .join("");
}

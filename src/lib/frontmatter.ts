/**
 * The top-level `key: value` pairs of a Markdown file's frontmatter, for the
 * v6 board map.
 *
 * Lenient on purpose. The repo has no YAML library, and v6 docs hold nested
 * maps (UX design tokens) and free text with colons (run logs). The map needs
 * only top-level scalars, so everything else is skipped rather than parsed,
 * and a real doc never reads as broken. The one failure is an opening fence
 * that is never closed: then nothing after it can be trusted as either
 * frontmatter or body.
 */
export function readFrontmatter(text: string): Record<string, string> | null {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trimEnd() !== "---") return {};
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === "---");
  if (end === -1) return null;

  const out: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    // Column 0 only: an indented line belongs to a nested value.
    const m = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    out[m[1]] = quoted ? quoted[2] : value;
  }
  return out;
}

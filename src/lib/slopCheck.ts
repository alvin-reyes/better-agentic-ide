/**
 * The slop check on a project's added lines. The rules are the ADE plugin's
 * (claude-plugin/plugins/ade/scripts/slop-patterns.tsv), shared with its Stop
 * hook, so ADE and Claude Code flag the same things.
 */
import RULES_TSV from "../../claude-plugin/plugins/ade/scripts/slop-patterns.tsv?raw";

export interface SlopRule {
  id: string;
  scope: "code" | "docs" | "all";
  pattern: RegExp;
  message: string;
}

export interface SlopFinding {
  file: string;
  line: number | null;
  rule: string;
  message: string;
  text: string;
}

/** POSIX ERE as the hook's awk reads it, in JavaScript. */
const toJs = (ere: string) => new RegExp(ere.replace(/\[\[:space:\]\]/g, "\\s"));

export function parseRules(tsv: string): SlopRule[] {
  return tsv
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const [id, scope, pattern, message] = l.split("\t");
      return { id, scope: scope as SlopRule["scope"], pattern: toJs(pattern), message };
    });
}

export const SLOP_RULES = parseRules(RULES_TSV);

const DOCS = /\.(md|mdx|txt|rst)$/;
// .bmad-core is BMAD's scaffold, which ADE installs.
const SKIP = [/(^|\/)(node_modules|vendor|dist|build|target|\.bmad-core)\//, /(\.lock|lock\.json|\.min\.js|\.snap)$/, /slop-patterns\.tsv$/];

/** Findings in the added lines of a `git diff -U0` (plus new files as all-added). */
export function checkDiff(diff: string, rules: SlopRule[] = SLOP_RULES): SlopFinding[] {
  const out: SlopFinding[] = [];
  let file = "";
  let line: number | null = null;
  let skip = false;
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("+++ ")) {
      file = raw.slice(4).replace(/^b\//, "");
      skip = file === "/dev/null" || SKIP.some((re) => re.test(file));
      line = 1;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (!raw.startsWith("+") || !file) continue;
    const text = raw.slice(1);
    const here = line;
    if (line !== null) line++;
    if (skip) continue;
    const docs = DOCS.test(file);
    const low = text.toLowerCase();
    const rule = rules.find((r) => (r.scope === "all" || (r.scope === "docs") === docs) && r.pattern.test(low));
    if (rule) out.push({ file, line: here, rule: rule.id, message: rule.message, text: text.trim().slice(0, 140) });
  }
  return out;
}

/** A prompt asking the agent to fix the findings. */
export function fixPrompt(findings: SlopFinding[]): string {
  const list = findings
    .slice(0, 30)
    .map((f) => `${f.file}${f.line ? `:${f.line}` : ""} ${f.message}: ${f.text}`)
    .join("; ");
  return `Clean up slop in the current changes: ${list}. Finish or remove stubs and TODOs, delete debug output and commented-out code, cut comments that restate the code, and use plain words in docs. Leave anything that is intended and tell me which.`;
}

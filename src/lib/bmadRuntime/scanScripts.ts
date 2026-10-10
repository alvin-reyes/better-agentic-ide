import type { Fs } from "./fs";
import { compareStrings, isDirectory, isFile, pyJson } from "./knowledge";
import { splitFlag, usageError, type PortResult } from "./compat";

/**
 * Port of `skills/bmad-toolsmith/scripts/scan_scripts.py` — lint a skill's
 * `scripts/*.py` for the repository's script conventions: the PEP 723 header
 * and its floor, a test beside the script, network imports, model ids in
 * string literals, `_bmad/custom` literals, and a file that does not parse.
 * The goldens in `__tests__/goldens/helpers/scanScripts-*.json` are the
 * contract.
 *
 * The Python parsed with `ast`; a bundled runtime has no Python parser. The
 * port tokenizes instead — strings, comments, brackets, imports — which
 * reproduces every rule and the two tokenizer-level syntax errors with the
 * interpreter's own wording (`unterminated string literal (detected at line
 * N)`, `'(' was never closed`). A grammar-level error (a bad `def`, a stray
 * `else`) is not detected: that is the documented divergence at capture.sh,
 * and no golden carries one.
 */

const FLOOR: [number, number] = [3, 11];
const REQUIRES_RE = /^#\s*requires-python\s*=\s*"([^"]*)"/;
const VERSION_RE = />=\s*(\d+)\.(\d+)/;
const CUSTOM_IO_RE = new RegExp(["_bmad/" + "custom", "\\." + "user\\." + "toml"].join("|"));
const NETWORK_MODULES = ["urllib.request", "requests", "httpx", "socket", "http.client", "aiohttp"];
const NETWORK_ROOTS = ["requests", "httpx", "socket", "aiohttp"];
const MODEL_ID_RE = /\b(?:claude|gpt|gemini)-(?:[a-z]+-)*\d[a-z0-9.-]*\b/i;

function finding(path: string, line: number, rule: string, text: string, fix: string): Record<string, unknown> {
  return { path, line, rule, text: text.trim().slice(0, 200), fix };
}

/** `pep723_floor`: the `# /// script` block, its body's requires-python. */
export function pep723Floor(content: string): { hasBlock: boolean; requires: string | null } {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== "# /// script") continue;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j] === "# ///") {
        for (const line of body) {
          const requires = REQUIRES_RE.exec(line);
          if (requires) return { hasBlock: true, requires: requires[1] };
        }
        return { hasBlock: true, requires: null };
      }
      if (!/^#( .*)?$/.test(lines[j])) break;
      body.push(lines[j]);
    }
    break;
  }
  return { hasBlock: false, requires: null };
}

function floorOk(requires: string): boolean {
  const match = VERSION_RE.exec(requires);
  if (!match) return false;
  // A tuple comparison: `>=3.9` is below the floor, and a string compare of
  // the pair would say otherwise.
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > FLOOR[0] || (major === FLOOR[0] && minor >= FLOOR[1]);
}

interface Token {
  kind: "string" | "import" | "error";
  line: number;
  text: string;
  /** For an import: the module names the node exposes to `ast`. */
  names?: string[];
  /** For an error: the interpreter's message. */
  message?: string;
}

/**
 * A Python tokenizer good enough for the lint: it walks the source tracking
 * comments, single- and triple-quoted strings (every prefix and escape),
 * brackets and indentation, and yields each string literal and each import
 * statement at its own line — or a tokenizer-level syntax error, with the
 * message CPython prints for it.
 */
export function tokenizePython(source: string): Token[] {
  const tokens: Token[] = [];
  const brackets: { ch: string; line: number }[] = [];
  let line = 1;

  let i = 0;
  let atLineStart = true;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\n") {
      line += 1;
      i += 1;
      atLineStart = true;
      continue;
    }
    if (ch === "\\" && source[i + 1] === "\n") {
      line += 1;
      i += 2;
      atLineStart = false;
      continue;
    }
    if (atLineStart && /[ \t]/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    // A string literal, with its prefix.
    const prefix = /^[rRbBuUfF]{0,3}/.exec(source.slice(i))![0];
    const quoteAt = i + prefix.length;
    const quoteCh = source[quoteAt];
    if (quoteCh === '"' || quoteCh === "'") {
      const raw = /[rR]/.test(prefix);
      const triple = source.startsWith(quoteCh.repeat(3), quoteAt);
      const start = quoteAt + (triple ? 3 : 1);
      const startLine = line;
      let j = start;
      let value = "";
      let closed = false;
      while (j < source.length) {
        if (!raw && source[j] === "\\") {
          const next = source[j + 1];
          if (next === "\n") line += 1;
          value += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : (next ?? "");
          j += 2;
          continue;
        }
        if (source.startsWith(triple ? quoteCh.repeat(3) : quoteCh, j)) {
          closed = true;
          j += triple ? 3 : 1;
          break;
        }
        if (source[j] === "\n") {
          if (!triple) break;
          line += 1;
        }
        value += source[j];
        j += 1;
      }
      if (!closed) {
        return [
          ...tokens,
          { kind: "error", line: startLine, text: "", message: `unterminated string literal (detected at line ${startLine})` },
        ];
      }
      tokens.push({ kind: "string", line: startLine, text: value });
      i = j;
      atLineStart = false;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      brackets.push({ ch, line });
      i += 1;
      atLineStart = false;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      const open = brackets.pop();
      if (!open) {
        return [...tokens, { kind: "error", line, text: "", message: "unmatched ')'" }];
      }
      i += 1;
      atLineStart = false;
      continue;
    }
    // An import statement, at the start of a logical line.
    if (atLineStart && /^(?:import|from)\b/.test(source.slice(i))) {
      const startLine = line;
      let j = i;
      let depth = 0;
      while (j < source.length) {
        const c = source[j];
        if (c === "#" && depth === 0) break;
        if (c === "\n" && depth === 0 && source[j - 1] !== "\\") break;
        if (c === "\n") line += 1;
        if ("([{".includes(c)) depth += 1;
        if (")]}".includes(c)) depth -= 1;
        j += 1;
      }
      const statement = source.slice(i, j).replace(/\\\n/g, " ").replace(/\n/g, " ");
      const names = importNames(statement);
      if (names === null) {
        return [...tokens, { kind: "error", line: startLine, text: "", message: "invalid syntax" }];
      }
      tokens.push({ kind: "import", line: startLine, text: statement, names });
      i = j;
      atLineStart = false;
      continue;
    }
    i += 1;
    if (!/[ \t]/.test(ch)) atLineStart = false;
  }

  if (brackets.length) {
    const open = brackets[brackets.length - 1];
    // CPython names the offending bracket where the block opened.
    return [...tokens, { kind: "error", line: open.line, text: "", message: `'${open.ch}' was never closed` }];
  }
  return tokens;
}

/** The `ast` node's name list: `import a.b, c` / `from x import a, b`. */
function importNames(statement: string): string[] | null {
  const text = statement.trim();
  if (text.startsWith("import")) {
    const body = text.slice("import".length).trim().replace(/\s+/g, " ");
    if (!body) return null;
    const parts = body.split(",").map((part) => part.trim());
    const names: string[] = [];
    for (const part of parts) {
      const alias = part.split(/\s+as\s+/)[0].trim();
      if (!/^[A-Za-z_][\w.]*$/.test(alias)) return null;
      names.push(alias);
    }
    return names;
  }
  if (!text.startsWith("from")) return null;
  const match = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(text);
  if (!match) return null;
  const module = match[1];
  const body = match[2].replace(/[()]/g, "").trim();
  const names = [module];
  for (const part of body.split(",")) {
    const alias = part.split(/\s+as\s+/)[0].trim();
    if (!alias) continue;
    names.push(`${module}.${alias}`);
  }
  return names;
}

function scanSource(source: string, rel: string, hasTest: boolean): Record<string, unknown>[] {
  const findings: Record<string, unknown>[] = [];
  const { hasBlock, requires } = pep723Floor(source);
  if (!hasBlock) {
    findings.push(finding(rel, 1, "pep723-missing", rel.split("/").pop()!, 'add `# /// script` with requires-python = ">=3.11"'));
  } else if (requires === null || !floorOk(requires)) {
    findings.push(finding(rel, 1, "pep723-floor", requires ?? "(none)", 'set requires-python = ">=3.11"'));
  }
  if (!hasTest) {
    const stem = rel.split("/").pop()!.replace(/\.[^.]*$/, "");
    findings.push(finding(rel, 1, "test-missing", rel.split("/").pop()!, `add scripts/tests/test_${stem}.py (unittest)`));
  }

  const tokens = tokenizePython(source);
  const error = tokens.find((token) => token.kind === "error");
  if (error) {
    findings.push(finding(rel, error.line, "syntax-error", error.message!, "fix the syntax"));
    return findings;
  }
  for (const token of tokens) {
    if (token.kind === "import") {
      for (const name of token.names!) {
        if (NETWORK_MODULES.includes(name) || matchesNetworkRoot(name)) {
          findings.push(finding(rel, token.line, "network-call", name, "work offline, or say in the docstring why not"));
          break;
        }
      }
      continue;
    }
    const value = token.text;
    if (CUSTOM_IO_RE.test(value)) {
      findings.push(
        finding(
          rel,
          token.line,
          "custom-io",
          value,
          "drop it: resolve_customization.py reads overrides and the bmad-customize skill writes them",
        ),
      );
    }
    const match = MODEL_ID_RE.exec(value);
    if (match) {
      findings.push(finding(rel, token.line, "model-id", match[0], "take the model from the caller, never a list"));
    }
  }
  return findings;
}

function matchesNetworkRoot(name: string): boolean {
  return NETWORK_ROOTS.includes(name.split(".")[0]);
}

/** `scan_script`: one script's info and findings, its test looked up beside it. */
export async function scanOneScript(
  fs: Fs,
  path: string,
  scriptsDir: string,
): Promise<{ info: Record<string, unknown>; findings: Record<string, unknown>[] }> {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const rel = `scripts/${name}`;
  const content = await fs.readText(path);
  const { hasBlock, requires } = pep723Floor(content);
  const stem = name.replace(/\.[^.]*$/, "");
  const hasTest = await isFile(fs, `${scriptsDir}/tests/test_${stem}.py`);
  const info = { path: rel, has_pep723: hasBlock, floor: requires, has_test: hasTest };
  return { info, findings: scanSource(content, rel, hasTest) };
}

export async function scanScriptsTree(fs: Fs, skillRoot: string): Promise<Record<string, unknown>> {
  const scriptsDir = `${skillRoot}/scripts`;
  const scripts: Record<string, unknown>[] = [];
  const findings: Record<string, unknown>[] = [];
  if (await isDirectory(fs, scriptsDir)) {
    const names = (await fs.list(scriptsDir)).filter((name) => name.endsWith(".py")).sort(compareStrings);
    for (const name of names) {
      const result = await scanOneScript(fs, `${scriptsDir}/${name}`, scriptsDir);
      scripts.push(result.info);
      findings.push(...result.findings);
    }
  }
  findings.sort(
    (a, b) =>
      compareStrings(a.path as string, b.path as string) ||
      (a.line as number) - (b.line as number) ||
      compareStrings(a.rule as string, b.rule as string),
  );
  return { skill: skillRoot.slice(skillRoot.lastIndexOf("/") + 1), scripts, findings };
}

/** The uniform port shape: the Python's stdout and exit code out. */
export async function scanScripts(argv: string[], fs: Fs): Promise<PortResult> {
  const script = "scan_scripts";
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = splitFlag(argv[i]);
    if (flag === "--skill-root") {
      const value = inline ?? argv[++i];
      if (value === undefined) return usageError(script, "argument --skill-root: expected one argument");
    } else if (argv[i].startsWith("-") && argv[i] !== "-") {
      return usageError(script, `unrecognized arguments: ${argv[i]}`);
    } else positionals.push(argv[i]);
  }
  const skill = positionals[0];
  if (skill === undefined) return usageError(script, "the following arguments are required: skill");
  if (!(await isDirectory(fs, skill))) return usageError(script, `not a directory: ${skill}`);
  const result = await scanScriptsTree(fs, skill);
  return {
    stdout: `${pyJson(result, { indent: 2, ensureAscii: true })}\n`,
    exitCode: (result.findings as unknown[]).length ? 1 : 0,
  };
}

/**
 * Test-only reference tokenizers and real-shell runners for the shell quoter
 * (ADR 0008). Shared by every test that checks a command ADE types is
 * fish-safe; not a test file itself (vitest runs only `*.test.ts`).
 *
 * The tokenizers read only what `shellQuote` emits: bare characters, single-
 * quoted runs, backslash escapes outside quotes, the operators `;`, `&&` and
 * `|`, and a `#` comment at word start. They do not model double quotes or
 * `$( … )`: anything else unquoted throws "unmodelled", so a test never passes
 * on a construct the tokenizer cannot actually read.
 *
 * Fish alone also reads `\a`, `\b` and `\ ` outside quotes, and rejects a
 * trailing backslash. The quoter never emits those, but when fish ends a
 * single-quoted run somewhere other than where POSIX does, the run's content
 * lands outside quotes, so the check against real fish reaches them.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

type Dialect = "posix" | "zshRcQuotes" | "fish";

const OPERATORS = [";", "&&", "|"];
/** Characters that mean something unquoted and that the tokenizers do not model. */
const UNMODELLED = new Set([..."$`\"()<>*?[]{}~!&\t\n\r"]);

function tokenize(text: string, dialect: Dialect): string[] {
  const tokens: string[] = [];
  let word = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) tokens.push(word);
    word = "";
    inWord = false;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === " ") {
      endWord();
      i++;
    } else if (c === "#" && !inWord) {
      // A comment runs to the end of the line, and the input is one line.
      break;
    } else if (c === "'") {
      inWord = true;
      i++;
      for (;;) {
        if (i >= text.length) throw new Error(`unterminated quote in ${JSON.stringify(text)}`);
        const d = text[i];
        if (d === "'") {
          if (dialect === "zshRcQuotes" && text[i + 1] === "'") {
            word += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (dialect === "fish" && d === "\\" && (text[i + 1] === "'" || text[i + 1] === "\\")) {
          word += text[i + 1];
          i += 2;
          continue;
        }
        word += d;
        i++;
      }
    } else if (c === "\\") {
      const next = text[i + 1];
      if (next === undefined) {
        // sh, bash and zsh drop a backslash at the end of the input; fish rejects it.
        if (dialect === "fish") throw new Error(`incomplete escape in ${JSON.stringify(text)}`);
        i++;
        continue;
      }
      inWord = true;
      if (dialect === "fish") {
        if (next === "a") word += "\x07";
        else if (next === "b") word += "\b";
        else if (next === "'" || next === "\\" || next === " ") word += next;
        else throw new Error(`unmodelled fish escape \\${next}`);
      } else {
        word += next;
      }
      i += 2;
    } else {
      const op = OPERATORS.find((o) => text.startsWith(o, i));
      if (op) {
        endWord();
        tokens.push(op);
        i += op.length;
      } else if (UNMODELLED.has(c)) {
        throw new Error(`unmodelled unquoted ${JSON.stringify(c)} in ${JSON.stringify(text)}`);
      } else {
        inWord = true;
        word += c;
        i++;
      }
    }
  }
  endWord();
  return tokens;
}

/** How sh and bash read the text. */
export const tokenizePosix = (text: string) => tokenize(text, "posix");
/** How zsh reads it with RC_QUOTES set: POSIX, plus `''` inside quotes is a `'`. */
export const tokenizeZshRcQuotes = (text: string) => tokenize(text, "zshRcQuotes");
/** How fish reads it: `\'` and `\\` are escapes inside single quotes. */
export const tokenizeFish = (text: string) => tokenize(text, "fish");

/** A small seeded PRNG (mulberry32), so generated corpora are the same every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RealShell {
  /** A name for messages: sh, bash, zsh, zsh -o RC_QUOTES, fish. */
  name: string;
  program: string;
  /** Arguments before the script; each ends with `-c`. No user config is read. */
  args: string[];
}

/**
 * The shells ADE's commands must be safe in, each run with no user config.
 * RC_QUOTES is set on the command line: a `setopt` inside the `-c` string
 * would come after the string had been parsed.
 */
export const REAL_SHELLS: RealShell[] = [
  { name: "sh", program: "sh", args: ["-c"] },
  { name: "bash", program: "bash", args: ["--norc", "--noprofile", "-c"] },
  { name: "zsh", program: "zsh", args: ["-f", "-c"] },
  { name: "zsh -o RC_QUOTES", program: "zsh", args: ["-f", "-o", "RC_QUOTES", "-c"] },
  { name: "fish", program: "fish", args: ["--no-config", "-c"] },
];

/** The absolute path of `program` on PATH, or null. */
export function findOnPath(program: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, program);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

/**
 * Whether `shell` can run here. On CI every shell is required, so a broken
 * install step fails the test instead of passing silently; locally a missing
 * one is skipped, and the reason is printed.
 */
export function shellAvailable(shell: RealShell): boolean {
  if (findOnPath(shell.program)) return true;
  if (process.env.CI) throw new Error(`${shell.program} not found on CI: every shell is required there`);
  console.warn(`${shell.program} not found: verified by the reference tokenizer only`);
  return false;
}

/** Run `script` in `shell` from `cwd`, with `input` on stdin. */
export function runShell(shell: RealShell, script: string, cwd: string, input = "") {
  const r = spawnSync(shell.program, [...shell.args, script], {
    cwd,
    input,
    encoding: "utf8",
    timeout: 120_000,
  });
  if (r.error) throw r.error;
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

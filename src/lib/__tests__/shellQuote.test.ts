import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { shellQuote } from "../shellQuote";
import {
  REAL_SHELLS, runShell, seeded, shellAvailable, tokenizeFish, tokenizePosix, tokenizeZshRcQuotes,
  type RealShell,
} from "./shellTokenize";

/** Values that have broken, or could break, a shell quoter. No control characters: callers collapse those. */
const HOSTILE = [
  "'", "''", "\\", "\\\\", "\\'", "a\\'; touch X; #", "$(touch X)", "`touch X`", "$HOME", "\"",
  ";&|<>(){}*?[]~!#", " ", "'lead", "trail'", "\\lead", "trail\\", "", "café ünï 日本 …",
  "it's", "/tmp/my proj", "a'\\'b", "\\\\'\\'", "''''", "x; touch X", "a\\\\'; touch X; #",
];

function randomCorpus(count: number, seed: number): string[] {
  const alphabet = [..."'\\\"$`();&|!#~* abcXYZ019"];
  const rand = seeded(seed);
  return Array.from({ length: count }, () => {
    const len = 1 + Math.floor(rand() * 12);
    return Array.from({ length: len }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
  });
}

const CORPUS = [...HOSTILE, ...randomCorpus(500, 0x5eed)];

/** What the quoter replaced, kept here only to show the defect it had. */
const oldShellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

describe("shellQuote", () => {
  it("means the same word in sh, zsh with RC_QUOTES, and fish", () => {
    for (const v of CORPUS) {
      const q = shellQuote(v);
      expect(tokenizePosix(q), `posix: ${q}`).toEqual([v]);
      expect(tokenizeZshRcQuotes(q), `zsh RC_QUOTES: ${q}`).toEqual([v]);
      expect(tokenizeFish(q), `fish: ${q}`).toEqual([v]);
    }
  });

  it("keeps to the subset every shell reads the same way", () => {
    for (const v of CORPUS) {
      const q = shellQuote(v);
      let i = 0;
      let lastWasQuoted = false;
      while (i < q.length) {
        if (q[i] === "'") {
          const end = q.indexOf("'", i + 1);
          expect(end, `unterminated run in ${q}`).toBeGreaterThan(i);
          const run = q.slice(i + 1, end);
          expect(run.includes("\\"), `a backslash inside quotes in ${q}`).toBe(false);
          // Only the empty string is an empty run, and only on its own.
          expect(run.length > 0 || q === "''", `an empty run in ${q}`).toBe(true);
          expect(lastWasQuoted, `two quoted runs side by side in ${q}`).toBe(false);
          lastWasQuoted = true;
          i = end + 1;
        } else {
          expect(q[i], `unexpected bare character in ${q}`).toBe("\\");
          expect(["'", "\\"], `a backslash escaping something else in ${q}`).toContain(q[i + 1]);
          lastWasQuoted = false;
          i += 2;
        }
      }
    }
  });

  it("the reference tokenizers read each shell's quoting exactly", () => {
    const old = oldShellQuote("a\\'; touch X; #");
    expect(old).toBe("'a\\'\\''; touch X; #'");
    // fish ends the string early and runs `touch X`.
    expect(tokenizeFish(old)).toEqual(["a''", ";", "touch", "X", ";"]);
    // sh and bash read one word (real bash --norc printed [a\'; touch X; #] on 2026-10-17).
    expect(tokenizePosix(old)).toEqual(["a\\'; touch X; #"]);

    expect(tokenizePosix("'\\\\'")).toEqual(["\\\\"]);
    expect(tokenizeFish("'\\\\'")).toEqual(["\\"]);
    expect(() => tokenizePosix("'a\\'b'")).toThrow(/unterminated/);
    expect(tokenizeFish("'a\\'b'")).toEqual(["a'b"]);
    expect(tokenizePosix("'a''b'")).toEqual(["ab"]);
    expect(tokenizeZshRcQuotes("'a''b'")).toEqual(["a'b"]);
  });

  it("ordinary values quote as before", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote("/tmp/my proj")).toBe("'/tmp/my proj'");
    expect(shellQuote("")).toBe("''");
    // Output changes only for a value with a backslash or a leading or trailing quote.
    for (const v of ["/Users/x/.ade/roles/dev.md", "Fix O'Brien's cart", "a b $c `d`", "story 1.2 (cart)"]) {
      expect(shellQuote(v)).toBe(oldShellQuote(v));
    }
  });
});

/**
 * The tokenizers' own grammar: words of plain `a`/`b`, single-quoted runs of
 * `a`, `b`, space and `\`, and outside quotes only `\'` or `\\`. Adjacent runs
 * are allowed, so `''` and a `\` before a closing quote both occur, which is
 * exactly where the shells read the same text differently.
 */
function grammarCorpus(count: number, seed: number): string[] {
  const rand = seeded(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const part = () => {
    const kind = rand();
    if (kind < 0.35) return Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(["a", "b"])).join("");
    if (kind < 0.8) return `'${Array.from({ length: Math.floor(rand() * 5) }, () => pick(["a", "b", " ", "\\"])).join("")}'`;
    return pick(["\\'", "\\\\"]);
  };
  const word = () => Array.from({ length: 1 + Math.floor(rand() * 4) }, part).join("");
  return Array.from({ length: count }, () => Array.from({ length: 1 + Math.floor(rand() * 3) }, word).join(" "));
}

const PINNED_DIVERGENCES = ["'\\\\'", "'a\\'b'", "'a''b'"];

type Reading = string[] | "syntax error";
const read = (tokenize: (t: string) => string[], text: string): Reading => {
  try {
    return tokenize(text);
  } catch {
    return "syntax error";
  }
};

/**
 * Every case through one shell process: each line is read raw and `eval`ed,
 * which parses it exactly as `-c` would, and a syntax error fails only that
 * case. One process per shell, not one per case, keeps this fast on a loaded
 * machine.
 */
function realReadings(shell: RealShell, cases: string[], cwd: string): Reading[] {
  const posixDriver = `while IFS= read -r s; do echo @@; eval "printf '%s\\n' $s" || echo @@ERR; done`;
  const fishDriver = `while read -l --line s; echo @@; eval "printf '%s\\n' $s"; or echo @@ERR; end`;
  const { stdout } = runShell(shell, shell.program === "fish" ? fishDriver : posixDriver, cwd, cases.join("\n") + "\n");
  const blocks = stdout.split("@@\n").slice(1);
  expect(blocks.length, `${shell.name} ran ${blocks.length} of ${cases.length} cases`).toBe(cases.length);
  return blocks.map((b) => {
    const lines = b.split("\n").slice(0, -1);
    return lines[lines.length - 1] === "@@ERR" ? "syntax error" : lines;
  });
}

const TOKENIZER_FOR: Record<string, (t: string) => string[]> = {
  bash: tokenizePosix,
  zsh: tokenizePosix,
  "zsh -o RC_QUOTES": tokenizeZshRcQuotes,
  fish: tokenizeFish,
};

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "ade-quote-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("against real shells", () => {
  it("the reference tokenizers agree with the real shells", () => {
    const cases = [...PINNED_DIVERGENCES, ...grammarCorpus(300, 0xa11ce)];
    for (const shell of REAL_SHELLS.filter((s) => s.name in TOKENIZER_FOR)) {
      if (!shellAvailable(shell)) continue;
      withTempDir((dir) => {
        const real = realReadings(shell, cases, dir);
        cases.forEach((c, i) => {
          expect(real[i], `${shell.name} read ${JSON.stringify(c)}`).toEqual(read(TOKENIZER_FOR[shell.name], c));
        });
      });
    }
  }, 300_000);

  it("real shells print the value and run nothing", () => {
    const zshRc = REAL_SHELLS.find((s) => s.name === "zsh -o RC_QUOTES")!;
    for (const shell of REAL_SHELLS) {
      if (!shellAvailable(shell)) continue;
      withTempDir((dir) => {
        if (shell === zshRc) {
          // Proves the option is really on, so the run below tests RC_QUOTES.
          expect(runShell(shell, "printf '%s' 'a''b'", dir).stdout).toBe("a'b");
        }
        const script = `printf '%s\\n' ${CORPUS.map(shellQuote).join(" ")}`;
        const { stdout, stderr } = runShell(shell, script, dir);
        expect(stdout.split("\n").slice(0, -1), `${shell.name}: ${stderr}`).toEqual(CORPUS);
        expect(existsSync(join(dir, "X")), `${shell.name} ran an injected command`).toBe(false);
      });
    }
  }, 300_000);
});

describe("the one quoter", () => {
  /** Places that may escape quotes for something other than a shell, and why. */
  const EXEMPT: Record<string, string> = {
    "src/lib/shellQuote.ts": "the quoter itself",
    "src/lib/bmadRuntime/cli.ts": "Python repr() of refusal text, not a shell word",
    "src/lib/bmadRuntime/memlog.ts": "Python repr() of log text, not a shell word",
    "src/lib/bmadRuntime/render.ts": "Python repr() in rendered templates, not a shell word",
    "src/lib/bmadRuntime/initSkill.ts": "a YAML single-quoted scalar, not a shell word",
    "src/lib/bmadRuntime/compat.ts": "HTML attribute escaping, not a shell word",
  };
  const SRC = resolve(__dirname, "..", "..");
  const ROOT = resolve(SRC, "..");

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === "__tests__" ? [] : sources(p);
      return /\.tsx?$/.test(name) ? [p] : [];
    });
  }

  it("there is one shell quoter", () => {
    const found: string[] = [];
    for (const file of sources(SRC)) {
      const rel = relative(ROOT, file).split("\\").join("/");
      if (rel in EXEMPT) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, n) => {
        const handRolled = /\.replace\(\/['"]\/g/.test(line);
        const typed = /(writePty|runInNewTab|runInNewTabPane)\(/.test(line) && /['"][^'"\s]*\$\{/.test(line);
        if (handRolled || typed) found.push(`${rel}:${n + 1}: ${line.trim()}`);
      });
    }
    expect(found, "quote shell words with shellQuote (ADR 0008)").toEqual([]);
  });
});

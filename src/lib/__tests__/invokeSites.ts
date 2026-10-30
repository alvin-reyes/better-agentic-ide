import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The frontend's `invoke()` call sites, parsed from the sources under `src/`
 * (tests excluded). Shared by `tauriCommandContract.test.ts` and
 * `vaultGetCallers.test.ts`, so both read the call sites the same way.
 */

export const REPO = resolve(__dirname, "../../..");
export const SRC = resolve(REPO, "src");

export function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...tsFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export interface InvokeCall {
  file: string;
  command: string;
  args: string[];
  /** The argument object's source text, if the call has one. */
  raw: string;
}

export function parseInvokeCalls(): InvokeCall[] {
  const calls: InvokeCall[] = [];

  for (const file of tsFiles(SRC)) {
    const source = readFileSync(file, "utf8");
    // invoke("name", { ... }) — object literal may span lines. Stops at the
    // first closing brace at the call's own nesting level.
    const re = /invoke(?:<[^>]*>)?\(\s*["'`](\w+)["'`]\s*(?:,\s*\{([\s\S]*?)\n?\s*\}\s*\))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const [, command, rawArgs] = m;
      const args: string[] = [];
      if (rawArgs) {
        // Top-level keys only: skip anything nested inside braces/brackets/parens.
        let depth = 0;
        let atKeyPosition = true;
        const tokens = rawArgs.split(/([{}[\]()]|,)/);
        for (const token of tokens) {
          if (/[{[(]/.test(token)) depth++;
          else if (/[}\])]/.test(token)) depth--;
          else if (token === ",") atKeyPosition = depth === 0;
          else if (atKeyPosition && depth === 0) {
            const key = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(token)?.[1] ?? // key: value
              /^\s*([A-Za-z_$][\w$]*)\s*$/.exec(token)?.[1]; // shorthand
            if (key) args.push(key);
            atKeyPosition = false;
          }
        }
      }
      calls.push({ file: file.replace(REPO + "/", ""), command, args, raw: rawArgs ?? "" });
    }
  }

  return calls;
}

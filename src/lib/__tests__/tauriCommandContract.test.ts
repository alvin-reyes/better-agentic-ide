import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Guards the contract between the frontend's `invoke()` calls and the Rust
 * commands they target. Tauri binds arguments by name and resolves commands by
 * name, so both a typo'd argument key and an unregistered command fail only at
 * runtime — silently, if the caller swallows the rejection.
 *
 * Two real bugs motivated this:
 *   - `src-tauri/src/main.rs` defined its own Builder instead of delegating to
 *     `better_terminal_lib::run()`, so 18 of 22 commands were absent from the
 *     shipped binary.
 *   - `EditorTab.tsx` sent `contents` where the command takes `content`, so
 *     every editor save failed deserialization.
 */

const REPO = resolve(__dirname, "../../..");
const SRC = resolve(REPO, "src");
const TAURI_SRC = resolve(REPO, "src-tauri/src");

/** Tauri v2 converts snake_case Rust parameters to camelCase for JS callers. */
function toCamel(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Parameters injected by Tauri, never supplied by the caller. */
function isInjected(param: string): boolean {
  return (
    param.startsWith("state:") ||
    param.startsWith("app:") ||
    param.startsWith("window:") ||
    param.startsWith("webview:")
  );
}

function rustFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...rustFiles(full));
    else if (entry.endsWith(".rs")) out.push(full);
  }
  return out;
}

function tsFiles(dir: string): string[] {
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

/** name -> accepted camelCase argument keys, parsed from `#[tauri::command]` fns. */
function parseRustCommands(): Map<string, Set<string>> {
  const commands = new Map<string, Set<string>>();

  for (const file of rustFiles(TAURI_SRC)) {
    const source = readFileSync(file, "utf8");
    const re = /#\[tauri::command\]\s*(?:pub\s+)?fn\s+(\w+)\s*\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const [, name, rawParams] = m;
      const args = new Set<string>();
      for (const raw of rawParams.split(",")) {
        const param = raw.trim();
        if (!param || isInjected(param)) continue;
        const paramName = param.split(":")[0].trim();
        if (paramName) args.add(toCamel(paramName));
      }
      commands.set(name, args);
    }
  }

  return commands;
}

/** Commands reachable at runtime: those in the generate_handler! the binary runs. */
function parseRegisteredCommands(): Set<string> {
  const lib = readFileSync(resolve(TAURI_SRC, "lib.rs"), "utf8");
  const block = /generate_handler!\[([\s\S]*?)\]/.exec(lib);
  if (!block) return new Set();
  return new Set(
    block[1]
      .split(",")
      .map((entry) => entry.trim().split("::").pop() ?? "")
      .filter(Boolean)
  );
}

interface InvokeCall {
  file: string;
  command: string;
  args: string[];
}

function parseInvokeCalls(): InvokeCall[] {
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
      calls.push({ file: file.replace(REPO + "/", ""), command, args });
    }
  }

  return calls;
}

const rustCommands = parseRustCommands();
const registered = parseRegisteredCommands();
const invokeCalls = parseInvokeCalls();

describe("tauri command contract", () => {
  it("finds the Rust commands, the handler registration, and the invoke calls", () => {
    expect(rustCommands.size).toBeGreaterThan(0);
    expect(registered.size).toBeGreaterThan(0);
    expect(invokeCalls.length).toBeGreaterThan(0);
  });

  it("delegates from the binary entry point to the library's run()", () => {
    const main = readFileSync(resolve(TAURI_SRC, "main.rs"), "utf8");
    expect(
      /better_terminal_lib::run\(\)/.test(main),
      "src-tauri/src/main.rs must call better_terminal_lib::run(). Defining a " +
        "second tauri::Builder here shadows lib.rs's handler list, so every " +
        "command registered there is missing from the shipped binary."
    ).toBe(true);
  });

  it("registers every command the frontend invokes", () => {
    for (const call of invokeCalls) {
      expect(
        registered.has(call.command),
        `${call.file} invokes "${call.command}", which is not in lib.rs's generate_handler! list`
      ).toBe(true);
    }
  });

  it("passes argument names the Rust commands accept", () => {
    for (const call of invokeCalls) {
      const accepted = rustCommands.get(call.command);
      if (!accepted) continue; // covered by the registration test above
      for (const arg of call.args) {
        expect(
          accepted.has(arg),
          `${call.file} passes "${arg}" to "${call.command}", which accepts ` +
            `{${[...accepted].join(", ")}}. Tauri binds by name, so a mismatch ` +
            `rejects the call at runtime.`
        ).toBe(true);
      }
    }
  });
});

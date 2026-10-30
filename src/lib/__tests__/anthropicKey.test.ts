import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type Call = { cmd: string; args: Record<string, unknown> };

const tauri = vi.hoisted(() => ({
  /** Every invoke, in order. */
  calls: [] as Call[],
  /** Every invoke and every flushNow, in order. */
  events: [] as string[],
  /** The mock keychain. A missing name rejects with "not found", as `vault_get` does. */
  vault: new Map<string, string>(),
  /** Per-command overrides of the default answer. */
  on: {} as Record<string, (args: Record<string, unknown>) => unknown>,
  /** Make `invoke` itself throw, as it does outside Tauri. */
  noTauri: false,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args: Record<string, unknown> = {}) => {
    if (tauri.noTauri) throw new TypeError("window.__TAURI_INTERNALS__ is undefined");
    tauri.calls.push({ cmd, args });
    tauri.events.push(cmd);
    const override = tauri.on[cmd];
    if (override) return Promise.resolve().then(() => override(args));
    switch (cmd) {
      case "vault_get": {
        const v = tauri.vault.get(args.name as string);
        return v === undefined ? Promise.reject("not found") : Promise.resolve(v);
      }
      case "vault_set":
        tauri.vault.set(args.name as string, args.value as string);
        return Promise.resolve(null);
      case "state_write":
        return Promise.resolve(null);
      case "state_scrub_secrets":
        return Promise.resolve(0);
      default:
        return Promise.reject(new Error(`unexpected command: ${cmd}`));
    }
  }),
}));

vi.mock("../persistence", () => ({
  flushNow: vi.fn(async () => {
    tauri.events.push("flushNow");
  }),
}));

import {
  ANTHROPIC_KEY_NOTE,
  ANTHROPIC_VAULT_NAME,
  LEGACY_FIELD,
  hasSavedCopy,
  lastMoveError,
  moveAnthropicKeyToVault,
  removeSavedCopy,
} from "../anthropicKey";

const KEY = "better-terminal-settings";
const K = "sk-ant-K";
const NAME = "ADE_ORCHESTRATOR_ANTHROPIC_KEY";

const saved = (o: Record<string, unknown>) => localStorage.setItem(KEY, JSON.stringify(o));
const stored = () => localStorage.getItem(KEY);
const cmds = () => tauri.calls.map((c) => c.cmd);
const written = () => {
  const w = tauri.calls.find((c) => c.cmd === "state_write");
  return w ? JSON.parse((w.args.entries as Record<string, string>)[KEY]) : undefined;
};

beforeEach(() => {
  tauri.calls.length = 0;
  tauri.events.length = 0;
  tauri.vault.clear();
  tauri.on = {};
  tauri.noTauri = false;
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("moveAnthropicKeyToVault", () => {
  it("B2: writes the vault, reads it back, writes the stripped settings, then scrubs", async () => {
    saved({ [LEGACY_FIELD]: K, fontSize: 14 });
    await expect(moveAnthropicKeyToVault()).resolves.toBe("moved");

    expect(tauri.calls).toEqual([
      { cmd: "vault_get", args: { name: NAME } },
      { cmd: "vault_set", args: { name: NAME, value: K, note: ANTHROPIC_KEY_NOTE } },
      { cmd: "vault_get", args: { name: NAME } },
      { cmd: "state_write", args: { entries: { [KEY]: JSON.stringify({ fontSize: 14 }) } } },
      { cmd: "state_scrub_secrets", args: { atBoot: true } },
    ]);
    expect(ANTHROPIC_KEY_NOTE).toBe("Orchestrator: Anthropic API key. Not exported to terminals.");
    expect(tauri.vault.get(NAME)).toBe(K);
    expect(stored()).not.toContain(LEGACY_FIELD);
    expect(stored()).not.toContain(K);
    expect(JSON.parse(stored()!)).toEqual({ fontSize: 14 });
    expect(lastMoveError()).toBeNull();
  });

  it("B3: a second run writes nothing and still scrubs", async () => {
    saved({ [LEGACY_FIELD]: K, fontSize: 14 });
    await moveAnthropicKeyToVault();
    tauri.calls.length = 0;

    await expect(moveAnthropicKeyToVault()).resolves.toBe("nothing");
    expect(cmds()).toEqual(["state_scrub_secrets"]);
    expect(tauri.calls[0].args).toEqual({ atBoot: true });
  });

  it("B3: after a crash past the vault write, it strips without writing the vault", async () => {
    saved({ [LEGACY_FIELD]: K, fontSize: 14 });
    tauri.vault.set(NAME, K);

    await expect(moveAnthropicKeyToVault()).resolves.toBe("stripped");
    expect(cmds()).toEqual(["vault_get", "state_write", "state_scrub_secrets"]);
    expect(written()).toEqual({ fontSize: 14 });
    expect(stored()).not.toContain(K);
  });

  describe("B4: a failure leaves the key where it was and records why", () => {
    const expectUntouched = (before: string | null) => {
      expect(stored()).toBe(before);
      expect(cmds()).not.toContain("state_write");
      expect(cmds()).not.toContain("state_scrub_secrets");
    };

    it("the first vault_get rejects with anything but not found", async () => {
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      tauri.on.vault_get = () => Promise.reject("The system keychain isn't available: locked");
      await expect(moveAnthropicKeyToVault()).resolves.toBe("failed");
      expectUntouched(before);
      expect(cmds()).not.toContain("vault_set");
      expect(lastMoveError()).toContain("The system keychain isn't available: locked");
    });

    it("vault_set rejects", async () => {
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      tauri.on.vault_set = () => Promise.reject("The system keychain isn't available: denied");
      await expect(moveAnthropicKeyToVault()).resolves.toBe("failed");
      expectUntouched(before);
      expect(lastMoveError()).toContain("denied");
    });

    it("the read-back rejects", async () => {
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      let gets = 0;
      tauri.on.vault_get = () => (++gets === 1 ? Promise.reject("not found") : Promise.reject("read failed"));
      await expect(moveAnthropicKeyToVault()).resolves.toBe("failed");
      expectUntouched(before);
      expect(lastMoveError()).toContain("read failed");
    });

    it("the read-back differs", async () => {
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      let gets = 0;
      tauri.on.vault_get = () => (++gets === 1 ? Promise.reject("not found") : "sk-ant-OTHER");
      await expect(moveAnthropicKeyToVault()).resolves.toBe("failed");
      expectUntouched(before);
      expect(lastMoveError()).toMatch(/different/i);
    });

    it("steps 3-4 take longer than 5 s", async () => {
      vi.useFakeTimers();
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      tauri.on.vault_get = () => new Promise(() => {}); // never answers
      const result = moveAnthropicKeyToVault();
      await vi.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toBe("failed");
      expectUntouched(before);
      expect(lastMoveError()).toMatch(/5 s/);
    });

    it("steps 3-4 share one 5 s bound", async () => {
      vi.useFakeTimers();
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      const slow = <T,>(v: () => T) => new Promise<T>((r) => setTimeout(() => r(v()), 3000));
      let gets = 0;
      tauri.on.vault_get = () => slow(() => (++gets === 1 ? Promise.reject("not found") : K));
      tauri.on.vault_set = () => slow(() => null);
      const result = moveAnthropicKeyToVault();
      await vi.advanceTimersByTimeAsync(5000);
      await expect(result).resolves.toBe("failed");
      await vi.advanceTimersByTimeAsync(10000);
      expectUntouched(before);
    });

    it("invoke throws (not under Tauri)", async () => {
      saved({ [LEGACY_FIELD]: K });
      const before = stored();
      tauri.noTauri = true;
      await expect(moveAnthropicKeyToVault()).resolves.toBe("failed");
      expect(stored()).toBe(before);
      expect(lastMoveError()).toContain("__TAURI_INTERNALS__");
    });
  });

  it("B5: a failed disk write after a verified vault write keeps the field and skips the scrub", async () => {
    saved({ [LEGACY_FIELD]: K, fontSize: 14 });
    const before = stored();
    tauri.on.state_write = () => Promise.reject("disk full");
    await expect(moveAnthropicKeyToVault()).resolves.toBe("failed");
    expect(tauri.vault.get(NAME)).toBe(K);
    expect(stored()).toBe(before);
    expect(cmds()).not.toContain("state_scrub_secrets");
    expect(lastMoveError()).toContain("disk full");
  });

  it("B5: a slow disk write is never timed out", async () => {
    vi.useFakeTimers();
    saved({ [LEGACY_FIELD]: K, fontSize: 14 });
    tauri.on.state_write = () => new Promise((r) => setTimeout(() => r(null), 30_000));
    const result = moveAnthropicKeyToVault();
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(result).resolves.toBe("moved");
    expect(cmds()).toContain("state_scrub_secrets");
    expect(stored()).not.toContain(K);
  });

  it("B6: an empty field is removed with no vault call", async () => {
    saved({ [LEGACY_FIELD]: "", fontSize: 14 });
    await expect(moveAnthropicKeyToVault()).resolves.toBe("stripped");
    expect(cmds()).toEqual(["state_write", "state_scrub_secrets"]);
    expect(written()).toEqual({ fontSize: 14 });
    expect(JSON.parse(stored()!)).toEqual({ fontSize: 14 });
  });

  it.each([
    ["not JSON", "{not json"],
    ["an array", "[1,2]"],
    ["a number", "42"],
    ["null", "null"],
  ])("B6: settings that are %s cause no write and no vault call", async (_, raw) => {
    localStorage.setItem(KEY, raw);
    await expect(moveAnthropicKeyToVault()).resolves.toBe("nothing");
    expect(cmds()).toEqual(["state_scrub_secrets"]);
    expect(stored()).toBe(raw);
  });

  it("B6: no saved settings at all is nothing to move", async () => {
    await expect(moveAnthropicKeyToVault()).resolves.toBe("nothing");
    expect(cmds()).toEqual(["state_scrub_secrets"]);
  });

  it("B6: a different value already in the vault is kept, and the field is removed", async () => {
    saved({ [LEGACY_FIELD]: "sk-ant-K1", fontSize: 14 });
    tauri.vault.set(NAME, "sk-ant-K2");
    await expect(moveAnthropicKeyToVault()).resolves.toBe("stripped");
    expect(cmds()).not.toContain("vault_set");
    expect(tauri.vault.get(NAME)).toBe("sk-ant-K2");
    expect(written()).toEqual({ fontSize: 14 });
    expect(stored()).not.toContain("sk-ant-K1");
  });

  it("a scrub failure is logged, not fatal", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    saved({ [LEGACY_FIELD]: K });
    tauri.on.state_scrub_secrets = () => Promise.reject("busy");
    await expect(moveAnthropicKeyToVault()).resolves.toBe("moved");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("removeSavedCopy", () => {
  const failMove = async (o: Record<string, unknown>) => {
    saved(o);
    tauri.on.vault_get = () => Promise.reject("The system keychain isn't available: no Secret Service");
    await moveAnthropicKeyToVault();
    tauri.on = {};
    tauri.calls.length = 0;
    tauri.events.length = 0;
  };

  it("B11: flushes first, writes disk, re-reads localStorage, then scrubs snapshots only", async () => {
    await failMove({ [LEGACY_FIELD]: K, fontSize: 14 });
    expect(lastMoveError()).toContain("no Secret Service");
    expect(hasSavedCopy()).toBe(true);

    // Another window saves while the disk write is in flight.
    tauri.on.state_write = () => {
      saved({ ...JSON.parse(stored()!), fontSize: 20 });
      return null;
    };
    await removeSavedCopy();

    expect(tauri.events).toEqual(["flushNow", "state_write", "state_scrub_secrets"]);
    expect(written()).toEqual({ fontSize: 14 });
    expect(tauri.calls[1].args).toEqual({ atBoot: false });
    expect(JSON.parse(stored()!)).toEqual({ fontSize: 20 });
    expect(cmds().some((c) => c.startsWith("vault_"))).toBe(false);
    expect(hasSavedCopy()).toBe(false);
  });

  it("B11: a failed disk write leaves localStorage untouched, returns the error and skips the scrub", async () => {
    await failMove({ [LEGACY_FIELD]: K, fontSize: 14 });
    const before = stored();
    tauri.on.state_write = () => Promise.reject("disk full");

    await expect(removeSavedCopy()).rejects.toBe("disk full");
    expect(stored()).toBe(before);
    expect(cmds()).not.toContain("state_scrub_secrets");
    expect(hasSavedCopy()).toBe(true);
  });
});

describe("hasSavedCopy", () => {
  it("is true only while localStorage holds a non-empty old field", () => {
    expect(hasSavedCopy()).toBe(false);
    saved({ fontSize: 1 });
    expect(hasSavedCopy()).toBe(false);
    saved({ [LEGACY_FIELD]: "" });
    expect(hasSavedCopy()).toBe(false);
    saved({ [LEGACY_FIELD]: K });
    expect(hasSavedCopy()).toBe(true);
    localStorage.setItem(KEY, "{broken");
    expect(hasSavedCopy()).toBe(false);
  });
});

// B10: read the sources.
const REPO = resolve(__dirname, "../../..");
const SRC = resolve(REPO, "src");
const read = (rel: string) => readFileSync(resolve(REPO, rel), "utf8");

/** Module specifiers of a file's static `import`/`export … from` statements. */
function staticImports(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(?:type\s+)?(?:[^;'"]*?\sfrom\s+)?["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.push(m[1]);
  return out;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__") out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** Every module reachable from `file` through static imports (relative ones only). */
function reachable(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const spec of staticImports(readFileSync(file, "utf8"))) {
    if (!spec.startsWith(".")) continue;
    const base = resolve(file, "..", spec);
    const next = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });
    if (next) reachable(next, seen);
  }
  return seen;
}

describe("B10: import rules and naming", () => {
  it("the import parser sees what it should", () => {
    expect(staticImports('import { a } from "./x";\nimport "./y";\nexport { b } from "./z";\nimport type { T } from "./t";'))
      .toEqual(["./x", "./y", "./z", "./t"]);
    expect(staticImports('const m = await import("./dyn");')).toEqual([]);
  });

  it("anthropicKey.ts imports only @tauri-apps/api/core", () => {
    expect(staticImports(read("src/lib/anthropicKey.ts"))).toEqual(["@tauri-apps/api/core"]);
  });

  it("boot.ts imports only core, persistence, sync and anthropicKey", () => {
    const imports = staticImports(read("src/lib/boot.ts"));
    const allowed = ["@tauri-apps/api/core", "./persistence", "./sync", "./anthropicKey"];
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) expect(allowed, `boot.ts imports ${spec}`).toContain(spec);
    for (const banned of ["settingsStore", "./anthropic", "projectSetup", "App"]) {
      expect(imports.some((s) => s === banned || s.endsWith(`/${banned}`)), `boot.ts imports ${banned}`).toBe(false);
    }
  });

  it("neither boot.ts nor anthropicKey.ts reaches settingsStore, anthropic.ts, projectSetup or App statically", () => {
    for (const entry of ["src/lib/boot.ts", "src/lib/anthropicKey.ts"]) {
      const files = [...reachable(resolve(REPO, entry))].map((f) => f.replace(SRC + "/", ""));
      for (const banned of ["stores/settingsStore.ts", "lib/anthropic.ts", "lib/projectSetup.ts", "App.tsx"]) {
        expect(files, `${entry} reaches ${banned}`).not.toContain(banned);
      }
    }
  });

  it("no source names the old field except LEGACY_FIELD's definition", () => {
    const hits: string[] = [];
    for (const file of sourceFiles(SRC)) {
      read(file.replace(REPO + "/", ""))
        .split("\n")
        .forEach((line, i) => {
          if (/anthropicApiKey|setAnthropicApiKey/.test(line)) hits.push(`${file.replace(REPO + "/", "")}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([`src/lib/anthropicKey.ts:${definitionLine()}: export const LEGACY_FIELD = "anthropicApiKey";`]);
  });

  it("ANTHROPIC_VAULT_NAME equals the Rust literal, which is on the app-only list", () => {
    const rust = read("src-tauri/src/vault.rs");
    const literal = /pub const ORCHESTRATOR_ANTHROPIC_KEY: &str = "([^"]+)";/.exec(rust)?.[1];
    const appOnly = /const APP_ONLY: &\[&str\] = &\[([^\]]*)\];/.exec(rust)?.[1] ?? "";
    expect(literal).toBe(NAME);
    expect(ANTHROPIC_VAULT_NAME).toBe(literal);
    expect(appOnly).toContain(`"${NAME}"`);
  });
});

function definitionLine(): number {
  return read("src/lib/anthropicKey.ts").split("\n").findIndex((l) => l.includes('LEGACY_FIELD = "anthropicApiKey"')) + 1;
}

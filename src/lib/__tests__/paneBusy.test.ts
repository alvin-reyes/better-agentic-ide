import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { decideBusy, RESAMPLE_MS, type Fg, type BusyInputs, type PaneSession } from "../paneBusy";

const session = (provider: string, agentName: string, status: PaneSession["status"]): PaneSession => ({
  paneId: "p1",
  provider,
  agentName,
  status,
});

const busy = (label: string, names: string[] = [label]): Fg => ({ kind: "busy", label, names });
const SHELL: Fg = { kind: "shell" };
const UNKNOWN: Fg = { kind: "unknown" };

/** Inputs whose samples come from `samples` in order; a string entry rejects. */
function inputs(sessions: PaneSession[], samples: (Fg | string)[], fallback: string | null = "Claude") {
  const sample = vi.fn(async () => {
    const next = samples.shift();
    if (next === undefined) throw new Error("sampled more often than expected");
    if (typeof next === "string") throw new Error(next);
    return next;
  });
  const wait = vi.fn(async () => {});
  const fallbackFn = vi.fn(() => fallback);
  const all: BusyInputs = { sessions, sample, wait, fallback: fallbackFn };
  return { all, sample, wait, fallback: fallbackFn };
}

describe("decideBusy", () => {
  it("a pane is busy by tracked session or foreground program, for any provider", async () => {
    // A running Hermes session is enough: nothing is sampled.
    const running = inputs([session("hermes", "Hermes Architect", "running")], []);
    expect(await decideBusy(running.all)).toBe("Hermes Architect");
    expect(running.sample).not.toHaveBeenCalled();

    // An Ollama agent waiting at its prompt: its session went idle, the program is still there.
    const ollama = inputs([session("ollama", "Ollama Developer", "completed")], [busy("ollama"), busy("ollama")]);
    expect(await decideBusy(ollama.all)).toBe("Ollama Developer");
    expect(ollama.wait).toHaveBeenCalledWith(RESAMPLE_MS);
    expect(RESAMPLE_MS).toBe(250);

    // A shell at its prompt is idle.
    expect(await decideBusy(inputs([], [SHELL]).all)).toBeNull();

    // No answer from the terminal (Windows, no pty): the text heuristic decides.
    const unknown = inputs([], [UNKNOWN], "Claude");
    expect(await decideBusy(unknown.all)).toBe("Claude");
    expect(unknown.fallback).toHaveBeenCalledTimes(1);
    const rejected = inputs([], ["no pty"], null);
    expect(await decideBusy(rejected.all)).toBeNull();
    expect(rejected.fallback).toHaveBeenCalledTimes(1);
  });

  it("a brief foreground program is not busy", async () => {
    // A prompt hook running git: gone by the re-sample.
    const hook = inputs([], [busy("git"), SHELL], "Claude");
    expect(await decideBusy(hook.all)).toBeNull();
    expect(hook.sample).toHaveBeenCalledTimes(2);
    expect(hook.fallback).not.toHaveBeenCalled();

    // The pane closed during the wait: the re-sample fails, and the fallback answers.
    const closed = inputs([], [busy("vim"), "PTY not found"], "Claude");
    expect(await decideBusy(closed.all)).toBe("Claude");
    const unknownAfter = inputs([], [busy("vim"), UNKNOWN], null);
    expect(await decideBusy(unknownAfter.all)).toBeNull();
    expect(unknownAfter.fallback).toHaveBeenCalledTimes(1);

    // Still there after the wait: busy, under the program's own name.
    expect(await decideBusy(inputs([], [busy("vim"), busy("vim")]).all)).toBe("vim");
  });

  it("the agent is named only when it is the foreground program", async () => {
    // Hermes on macOS may show as its Python interpreter: that matches no provider binary.
    const python = busy("python3.12", ["python3.12", "python3.12"]);
    const hermes = inputs([session("hermes", "Hermes Architect", "completed")], [python, python]);
    expect(await decideBusy(hermes.all)).toBe("python3.12");

    // macOS names Claude's process after its resolved executable; argv[0] is still claude.
    const claude = busy("claude", ["2.1.301", "claude"]);
    const mac = inputs([session("claude", "Code Reviewer", "completed")], [claude, claude]);
    expect(await decideBusy(mac.all)).toBe("Code Reviewer");

    // DeepSeek runs the claude binary.
    const deep = inputs([session("deepseek", "DeepSeek Dev", "completed")], [claude, claude]);
    expect(await decideBusy(deep.all)).toBe("DeepSeek Dev");

    // The most recent session is the one that counts.
    const two = inputs(
      [session("ollama", "Old Ollama", "completed"), session("claude", "New Claude", "completed")],
      [busy("ollama"), busy("ollama")],
    );
    expect(await decideBusy(two.all)).toBe("ollama");

    // vim after an agent finished: the dialog reads "a live vim session".
    const vim = inputs([session("claude", "Code Reviewer", "completed")], [busy("vim"), busy("vim")]);
    expect(await decideBusy(vim.all)).toBe("vim");
  });

  it("the text heuristic is only a fallback", () => {
    const src = resolve(__dirname, "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          if (entry !== "__tests__") walk(full);
        } else if (/\.tsx?$/.test(entry)) files.push(full);
      }
    };
    walk(src);
    const callers = files.filter((f) => readFileSync(f, "utf8").includes("hasActiveProcess("));
    expect(callers.map((f) => f.slice(src.length + 1))).toEqual(["hooks/useTerminal.ts"]);

    const terminal = readFileSync(join(src, "hooks/useTerminal.ts"), "utf8");
    const calls = terminal.match(/(?<!function )hasActiveProcess\(/g) ?? [];
    expect(calls).toHaveLength(1);
    const paneBusy = terminal.slice(terminal.indexOf("async function paneBusy("));
    expect(paneBusy.slice(0, paneBusy.indexOf("\n}\n"))).toContain("fallback: () => hasActiveProcess(paneId)");
    expect(terminal).not.toMatch(/export \{[^}]*\bhasActiveProcess\b/);
  });
});

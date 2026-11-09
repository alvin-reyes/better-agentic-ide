import { invoke } from "@tauri-apps/api/core";

/**
 * The settings every Claude Code launch ADE makes carries on its command
 * line, from `launch_rules` in src-tauri/src/claude_settings.rs. Orgo's ask
 * rules come from src-tauri/src/orgo_rules.rs, the one place they are kept.
 * The same for every folder, so it takes none. See
 * .ade/context/orgo-permission-rules.md.
 */
export interface LaunchRules {
  /** Ask rules: Orgo's computer lifecycle tools always ask, in every mode. Never empty. */
  ask: string[];
  /** Deny rules for Continuous launches. Empty until Story 1b. */
  continuousDeny: string[];
  /**
   * The CLI library's command guard, as a PreToolUse hook command for an
   * interactive and for a headless (`-p`) session, both built in Rust. Null
   * until that guard ships; while it is null a launch carries only `permissions`.
   */
  guard: { interactive: string; headless: string } | null;
}

/** Why a launch was refused when the rules could not be loaded. */
export const RULES_UNAVAILABLE = "ADE couldn't load its permission rules, so the agent was not started";

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** The rules, or null when the answer isn't their shape. An empty `ask` would launch agents with no rules. */
function checked(r: unknown): LaunchRules | null {
  if (typeof r !== "object" || r === null) return null;
  const { ask, continuousDeny, guard } = r as Record<string, unknown>;
  if (!isStrings(ask) || ask.length === 0 || !isStrings(continuousDeny)) return null;
  if (guard === null) return { ask: [...ask], continuousDeny: [...continuousDeny], guard: null };
  if (typeof guard !== "object") return null;
  const { interactive, headless } = guard as Record<string, unknown>;
  if (typeof interactive !== "string" || typeof headless !== "string") return null;
  return { ask: [...ask], continuousDeny: [...continuousDeny], guard: { interactive, headless } };
}

let cached: Promise<LaunchRules> | null = null;

/**
 * The rules, loaded once. Only a load that succeeds is kept: a rejected or
 * malformed one is cleared, so the next launch tries again. Rejects (and
 * every caller refuses to launch) when the rules can't be loaded, rather
 * than starting an agent without them.
 */
export function loadLaunchRules(): Promise<LaunchRules> {
  if (!cached) {
    const load = invoke<unknown>("launch_rules").then((r) => {
      const rules = checked(r);
      if (!rules) throw new Error("malformed rules");
      return rules;
    });
    cached = load;
    load.catch(() => {
      if (cached === load) cached = null;
    });
  }
  return cached;
}

export function __resetLaunchRulesForTests() {
  cached = null;
}

import { invoke } from "@tauri-apps/api/core";

/**
 * The permission rules every Claude Code launch ADE makes carries on its
 * command line, from `orgo_launch_rules` in src-tauri/src/orgo_rules.rs, the
 * one place they are kept. The same for every folder, so it takes none. See
 * .ade/context/orgo-permission-rules.md.
 */
export interface LaunchRules {
  /** Ask rules: Orgo's computer lifecycle tools always ask, in every mode. */
  ask: string[];
}

/** Why a launch was refused when the rules could not be loaded. */
export const RULES_UNAVAILABLE = "ADE couldn't load its permission rules, so the agent was not started";

let cached: Promise<LaunchRules> | null = null;

/**
 * The rules, loaded once. Only a load that succeeds is kept: a rejected one
 * is cleared, so the next launch tries again. Rejects (and every caller
 * refuses to launch) when the rules can't be loaded, rather than starting an
 * agent without them.
 */
export function loadLaunchRules(): Promise<LaunchRules> {
  if (!cached) {
    const load = invoke<LaunchRules>("orgo_launch_rules").then((r) => {
      if (!Array.isArray(r?.ask) || !r.ask.every((x) => typeof x === "string")) throw new Error("malformed rules");
      return { ask: [...r.ask] };
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

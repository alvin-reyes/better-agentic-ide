/**
 * Agent colors, keyed by role id (ADR 0007).
 *
 * The one source of truth for every agent color: the `color:` line ADE writes
 * into `.claude/agents/*.md`, each curated profile's color, the picker, the
 * fleet lanes and the website (held to this map by a test). Claude Code accepts
 * only eight color names, so the nineteen roles share them.
 *
 * The app's themes are all dark, so the app uses `dark` hexes only. They are
 * for fills, borders and dots: never draw text in an agent color, they do not
 * all reach 4.5:1 on every theme surface. `light` is for the website's light
 * theme.
 */

export const AGENT_COLOR_NAMES = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan"] as const;

export type AgentColorName = (typeof AGENT_COLOR_NAMES)[number];

export interface AgentColorHex {
  dark: string;
  light: string;
}

export const ROLE_COLORS: Record<string, AgentColorName> = {
  "adversarial-reviewer": "red",
  architect: "blue",
  "product-manager": "purple",
  designer: "pink",
  "scrum-master": "cyan",
  developer: "green",
  qa: "yellow",
  devops: "orange",
  "security-engineer": "red",
  sre: "orange",
  "technical-writer": "purple",
  analyst: "purple",
  advisor: "purple",
  "brainstorming-architect": "blue",
  "solutions-engineer": "blue",
  "product-owner": "cyan",
  "engineering-manager": "cyan",
  "support-engineer": "yellow",
  "release-manager": "orange",
};

export const AGENT_COLOR_HEX: Record<AgentColorName, AgentColorHex> = {
  red: { dark: "#ff7b72", light: "#cf222e" },
  blue: { dark: "#58a6ff", light: "#0969da" },
  green: { dark: "#3fb950", light: "#1a7f37" },
  yellow: { dark: "#d29922", light: "#9a6700" },
  purple: { dark: "#bc8cff", light: "#8250df" },
  orange: { dark: "#f0883e", light: "#bc4c00" },
  pink: { dark: "#f778ba", light: "#bf3989" },
  cyan: { dark: "#39c5cf", light: "#1b7c83" },
};

/** For anything that is not one of the nineteen roles. */
export const NEUTRAL_HEX: AgentColorHex = { dark: "#9da5ae", light: "#59636e" };

/** The role's color name, or null when the id is not a role. */
export function roleColor(roleId: string | null | undefined): AgentColorName | null {
  if (!roleId || !Object.prototype.hasOwnProperty.call(ROLE_COLORS, roleId)) return null;
  return ROLE_COLORS[roleId];
}

/** The role's dark hex, or the neutral's when the id is not a role. */
export function roleColorHex(roleId: string | null | undefined): string {
  const name = roleColor(roleId);
  return name ? AGENT_COLOR_HEX[name].dark : NEUTRAL_HEX.dark;
}

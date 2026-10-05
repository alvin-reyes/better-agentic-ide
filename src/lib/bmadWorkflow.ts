/**
 * BMAD workflows name their agents differently from ADE's roles.
 *
 * A workflow says `pm`, `po`, `sm`, `ux-expert`; the nineteen roles are
 * `product-manager`, `product-owner`, `scrum-master`, `designer`. The story
 * template uses a third spelling again. Without one table owning the
 * translation, a workflow step silently spawns nothing.
 */
export const WORKFLOW_AGENT_TO_ROLE: Record<string, string> = {
  analyst: "analyst",
  pm: "product-manager",
  po: "product-owner",
  sm: "scrum-master",
  dev: "developer",
  qa: "qa",
  architect: "architect",
  "ux-expert": "designer",
};

/**
 * The role for a workflow agent, or null when there is none.
 *
 * Compound names appear in the shipped workflows (`analyst/pm`,
 * `pm/architect`) to mean either will do; the first is used. `various` is
 * BMAD's placeholder for "whichever role owns the flagged document" and
 * deliberately has no mapping — inventing one would spawn the wrong agent.
 */
export function roleIdForWorkflowAgent(agent: string): string | null {
  const first = agent.split("/")[0].trim();
  return WORKFLOW_AGENT_TO_ROLE[first] ?? null;
}

/** Every `agent:` named in a workflow YAML, in order, deduplicated. */
export function workflowAgents(yaml: string): string[] {
  const seen = new Set<string>();
  for (const m of yaml.matchAll(/^\s*-?\s*agent:\s*([^\s#]+)/gm)) seen.add(m[1].trim());
  return [...seen];
}

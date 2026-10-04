/**
 * Files the ADE Claude Code plugin (claude-plugin/plugins/ade) generates from
 * the agent catalog, so the picker and the plugin stay in step:
 * Web3 engineers become sub-agents Claude can delegate to, and architects
 * (interactive brainstorming partners) become skills you invoke yourself.
 * Regenerate with `npm run gen:plugin`; scripts/pluginContent.test.ts (outside tsc, it uses Node APIs) fails when they drift.
 */
import { AGENT_CATALOG, type CatalogAgent } from "../data/curatedAgents";
import { getRole } from "../data/roles";
import { getDomain } from "../data/domains";
import { composeRoleMarkdown } from "./agentComposition";

export interface PluginFile {
  /** Relative to the plugin root. */
  path: string;
  content: string;
}

/**
 * The role definition this agent launches with, used as the plugin file's
 * body. It is composed from the role and domain rather than lifted out of a
 * `claude "..."` string: the per-provider command strings were retired with
 * agentProfiles.ts, and composing here is what the picker itself does, so the
 * plugin and the app cannot drift apart.
 */
export function rolePrompt(agent: CatalogAgent): string {
  const role = getRole(agent.roleId);
  if (!role) throw new Error(`Unknown role "${agent.roleId}" for ${agent.id}`);
  const domain = agent.domainId ? getDomain(agent.domainId) : undefined;
  return withoutProjectSections(composeRoleMarkdown(role, domain)).trim();
}

/**
 * Drop the sections that only make sense inside an ADE project.
 *
 * A definition tells its role to prefer `/BMad:tasks:apply-qa-fixes` and to
 * read `.ade/knowledge/<role>.md`. Both are true in a project ADE set up, where
 * BMAD is installed and the knowledge store exists. The plugin is installed
 * from the marketplace by people who may never have run ADE and have neither,
 * and pointing them at a command and a file that do not exist is worse than
 * saying nothing: it reads as a capability they are failing to find.
 */
const PROJECT_SECTIONS = ["## BMAD tasks", "## Project knowledge"];

function withoutProjectSections(body: string): string {
  return PROJECT_SECTIONS.reduce((acc, heading) => {
    const start = acc.indexOf(heading);
    if (start < 0) return acc;
    const rest = acc.slice(start + 1);
    const next = rest.search(/^## /m);
    return next < 0 ? acc.slice(0, start) : acc.slice(0, start) + rest.slice(next);
  }, body);
}

const yaml = (s: string) => JSON.stringify(s);

/** Engineers outside the Web3 category that also ship as sub-agents. */
export const SUB_AGENT_IDS = new Set(["backend-go", "backend-rust"]);

/** An agent as a Claude Code sub-agent file (frontmatter + role prompt). */
export function agentMarkdown(p: CatalogAgent): string {
  return `---\nname: ${p.id}\ndescription: ${yaml(`${p.name}: ${p.description}. Use for ${p.keywords.slice(0, 6).join(", ")} work.`)}\n---\n\n${rolePrompt(p)}\n`;
}

function agentFile(p: CatalogAgent): PluginFile {
  return { path: `agents/${p.id}.md`, content: agentMarkdown(p) };
}

function architectSkill(p: CatalogAgent): PluginFile {
  return {
    path: `skills/${p.id}/SKILL.md`,
    content:
      `---\nname: ${p.id}\ndescription: ${yaml(`${p.name}: ${p.description}.`)}\ndisable-model-invocation: true\nargument-hint: "[what you want to design]"\n---\n\n` +
      `${rolePrompt(p)}\n\nThe topic: $ARGUMENTS\n`,
  };
}

export function generatedPluginFiles(profiles: CatalogAgent[] = AGENT_CATALOG): PluginFile[] {
  return [
    ...profiles.filter((p) => SUB_AGENT_IDS.has(p.id) || p.category === "Web3").map(agentFile),
    ...profiles.filter((p) => p.category === "Architects").map(architectSkill),
  ];
}

/**
 * Files the ADE Claude Code plugin (claude-plugin/plugins/ade) generates from
 * the agent picker's profiles, so the picker and the plugin stay in step:
 * Web3 engineers become sub-agents Claude can delegate to, and architects
 * (interactive brainstorming partners) become skills you invoke yourself.
 * Regenerate with `npm run gen:plugin`; scripts/pluginContent.test.ts (outside tsc, it uses Node APIs) fails when they drift.
 */
import { AGENT_PROFILES, type AgentProfile } from "../data/agentProfiles";

export interface PluginFile {
  /** Relative to the plugin root. */
  path: string;
  content: string;
}

/** The role prompt inside `claude "..."`. */
export function rolePrompt(profile: AgentProfile): string {
  const cmd = profile.providers.claude;
  const m = /^claude "([\s\S]*)"$/.exec(cmd);
  if (!m) throw new Error(`Unexpected claude command for ${profile.id}`);
  return m[1];
}

const yaml = (s: string) => JSON.stringify(s);

/** Engineers outside the Web3 category that also ship as sub-agents. */
export const SUB_AGENT_IDS = new Set(["backend-go", "backend-rust"]);

/** A profile as a Claude Code sub-agent file (frontmatter + role prompt). */
export function agentMarkdown(p: AgentProfile): string {
  return `---\nname: ${p.id}\ndescription: ${yaml(`${p.name}: ${p.description}. Use for ${p.keywords.slice(0, 6).join(", ")} work.`)}\n---\n\n${rolePrompt(p)}\n`;
}

function agentFile(p: AgentProfile): PluginFile {
  return { path: `agents/${p.id}.md`, content: agentMarkdown(p) };
}

function architectSkill(p: AgentProfile): PluginFile {
  return {
    path: `skills/${p.id}/SKILL.md`,
    content:
      `---\nname: ${p.id}\ndescription: ${yaml(`${p.name}: ${p.description}.`)}\ndisable-model-invocation: true\nargument-hint: "[what you want to design]"\n---\n\n` +
      `${rolePrompt(p)}\n\nThe topic: $ARGUMENTS\n`,
  };
}

export function generatedPluginFiles(profiles: AgentProfile[] = AGENT_PROFILES): PluginFile[] {
  return [
    ...profiles.filter((p) => SUB_AGENT_IDS.has(p.id) || p.category === "Web3").map(agentFile),
    ...profiles.filter((p) => p.category === "Architects").map(architectSkill),
  ];
}

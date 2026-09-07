import { CURATED_AGENTS } from "../data/curatedAgents";
import { roleFileName } from "./agentComposition";
import type { Provider } from "./agentCommand";

export const ROLE_DIR = "~/.ade/roles";

export interface AgentSpec {
  roleId: string;
  domainId?: string;
  provider: Provider;
}

export function specFromCurated(id: string, provider: Provider): AgentSpec | undefined {
  const curated = CURATED_AGENTS.find((a) => a.id === id);
  if (!curated) return undefined;
  return { roleId: curated.roleId, domainId: curated.domainId, provider };
}

export function rolePathFor(spec: AgentSpec): string {
  return `${ROLE_DIR}/${roleFileName(spec.roleId, spec.domainId)}`;
}

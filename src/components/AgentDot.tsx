import { tabAgentState, useAgentStatusStore } from "../stores/agentStatusStore";
import { useTabStore } from "../stores/tabStore";

const LABEL = {
  needsYou: "An agent here needs you",
  waiting: "An agent here is waiting for you",
} as const;

/**
 * Agent status on a tab or its Fleet card: a dot when one of the tab's
 * agents needs you or is waiting for you. Nothing otherwise.
 */
export default function AgentDot({ tabId }: { tabId: string }) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId));
  const state = useAgentStatusStore((s) => (tab ? tabAgentState(tab, s.byPty) : null));
  if (state !== "needsYou" && state !== "waiting") return null;
  return <span className="agent-dot" data-state={state} title={LABEL[state]} aria-label={LABEL[state]} role="img" />;
}

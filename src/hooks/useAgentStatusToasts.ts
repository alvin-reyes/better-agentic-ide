import { useEffect, useRef } from "react";
import { needsYouToasts, useAgentStatusStore } from "../stores/agentStatusStore";
import { findAllPanes, useTabStore } from "../stores/tabStore";
import type { GuardToast } from "./useContextGuard";

/** The tab of this window that holds the PTY, if any. */
function tabOfPty(ptyId: number) {
  return useTabStore.getState().tabs.find((t) => findAllPanes(t.root).some((p) => p.ptyId === ptyId));
}

/**
 * A toast when a pane becomes needs you while it isn't in view: in view is in
 * the active tab of a focused window. One per pane until it leaves needs you;
 * its button brings the tab forward.
 */
export function useAgentStatusToasts(showToast: (t: GuardToast) => void) {
  const handled = useRef(new Set<number>());
  useEffect(() => {
    const check = (byPty: Parameters<typeof needsYouToasts>[0]) => {
      const inView = (ptyId: number) =>
        document.hasFocus() && tabOfPty(ptyId)?.id === useTabStore.getState().activeTabId;
      const { show, handled: next } = needsYouToasts(byPty, handled.current, inView);
      handled.current = next;
      for (const ptyId of show) {
        const tab = tabOfPty(ptyId);
        if (!tab) continue;
        showToast({
          title: "An agent needs you",
          body: `${tab.name} is waiting for an answer.`,
          key: `agent-needs-you-${ptyId}`,
          action: { label: "Open tab", run: () => useTabStore.getState().setActiveTab(tab.id) },
        });
      }
    };
    check(useAgentStatusStore.getState().byPty);
    return useAgentStatusStore.subscribe((s, prev) => {
      if (s.byPty !== prev.byPty) check(s.byPty);
    });
  }, [showToast]);
}

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { useTabStore } from "../stores/tabStore";
import { contextShare, overThreshold, fmtTokens, type UsageReport } from "../lib/tokenUsage";
import { sendToActiveTerminal } from "../lib/terminalCommands";
import { hasActiveProcess, isPaneActive } from "./useTerminal";

const CHECK_EVERY_MS = 30_000;

export interface GuardToast {
  title: string;
  body: string;
  action?: { label: string; command: string };
}

/**
 * Watch the active terminal's Claude Code session and act once its context
 * passes the threshold: offer /compact, or send it when the agent is idle.
 * Each session is handled once until its context drops back below.
 */
export function useContextGuard(cwd: string | null, notify: (t: GuardToast) => void) {
  const guard = useSettingsStore((s) => s.contextGuard);
  const handled = useRef(new Set<string>());
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!guard.enabled || !cwd) return;
    let cancelled = false;

    const check = async () => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const report = await invoke<UsageReport>("token_usage", { cwd, since }).catch(() => null);
      if (cancelled || !report) return;
      const latest = report.sessions[0];
      const over = overThreshold(report.sessions, guard.threshold);
      if (!over) {
        // Compacted or cleared: warn again next time it fills up.
        if (latest) handled.current.delete(latest.id);
        return;
      }
      if (handled.current.has(over.id)) return;
      handled.current.add(over.id);

      const pct = Math.round(contextShare(over) * 100);
      const size = fmtTokens(over.contextTokens);
      const pane = useTabStore.getState().getActivePane();
      const idleAgent = pane && !isPaneActive(pane.id) && hasActiveProcess(pane.id) === "Claude";
      if (guard.autoCompact && idleAgent && (await sendToActiveTerminal("/compact", true))) {
        notifyRef.current({ title: "Context compacted", body: `The session had reached ${pct}% of its window (${size} tokens), so ADE sent /compact.` });
        return;
      }
      notifyRef.current({
        title: `Context at ${pct}%`,
        body: `Every turn resends ${size} tokens. /compact summarizes the conversation and keeps going.`,
        action: { label: "Send /compact", command: "/compact" },
      });
    };

    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cwd, guard.enabled, guard.threshold, guard.autoCompact]);
}

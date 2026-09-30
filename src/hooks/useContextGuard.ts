import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";
import { contextWindow, fmtTokens } from "../lib/tokenUsage";

const CHECK_EVERY_MS = 30_000;

export interface GuardToast {
  title: string;
  body: string;
  /** A command typed into the active terminal for review (never run), or a callback. */
  action?: { label: string; command?: string; run?: () => void };
}

interface LatestContext {
  sessionId: string;
  model: string;
  contextTokens: number;
  at: string | null;
}

/**
 * Watch the newest Claude Code session in the active terminal's folder and
 * warn once its context passes the threshold. Each session warns once until
 * its context drops back below. Compacting is left to the user (or to Claude
 * Code's own auto-compact setting): the transcript can't say which terminal
 * a session runs in, or whether it's waiting on a prompt.
 */
export function useContextGuard(cwd: string | null, notify: (t: GuardToast) => void) {
  const guard = useSettingsStore((s) => s.contextGuard);
  const warned = useRef(new Set<string>());
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => {
    if (!guard.enabled || !cwd) return;
    let cancelled = false;

    const check = async () => {
      const latest = await invoke<LatestContext | null>("latest_context", { cwd }).catch(() => null);
      if (cancelled || !latest) return;
      const share = latest.contextTokens / contextWindow(latest.model);
      if (share < guard.threshold) {
        // Compacted or cleared: warn again next time it fills up.
        warned.current.delete(latest.sessionId);
        return;
      }
      if (warned.current.has(latest.sessionId)) return;
      warned.current.add(latest.sessionId);
      notifyRef.current({
        title: `Context at ${Math.round(share * 100)}%`,
        body: `The Claude session in this folder resends ${fmtTokens(latest.contextTokens)} tokens every turn. /compact summarizes it and keeps going.`,
        action: { label: "Type /compact", command: "/compact" },
      });
    };

    void check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [cwd, guard.enabled, guard.threshold]);
}

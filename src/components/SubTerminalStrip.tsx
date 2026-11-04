import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTabStore, findAllPanes, type View } from "../stores/tabStore";
import { usePaneCwd } from "../stores/paneMetaStore";
import { tabCwd, tabLabel } from "../lib/tabDisplay";
import { focusActiveTerminal } from "../hooks/useTerminal";

/** The id of the content area the strip's entries control (App sets it). */
export const SUB_TERMINAL_CONTENT_ID = "tab-content";
/** Background adds this close together are announced as one. */
const MERGE_MS = 1000;

// Hover, selection, the focus ring and the flash need pseudo-classes, so the
// strip carries its own rules (the UX spec's Look).
const STRIP_CSS = `
.subterm-strip { display: flex; align-items: center; height: 30px; padding: 0 12px; background: var(--bg-primary); border-bottom: 1px solid var(--border); gap: 2px; user-select: none; flex-shrink: 0; }
.subterm-scroller { display: flex; align-items: center; gap: 2px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; min-width: 0; flex: 1 1 auto; height: 100%; }
.subterm-scroller::-webkit-scrollbar { display: none; }
.subterm-divider { width: 1px; height: 16px; background: var(--border); margin: 0 6px 0 4px; flex-shrink: 0; }
.subterm-entry { display: flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: var(--radius-sm); color: var(--text-secondary); font-family: var(--font-ui); font-size: var(--text-sm); cursor: pointer; flex-shrink: 0; position: relative; white-space: nowrap; outline: none; }
.subterm-entry:hover { background: var(--bg-tertiary); }
.subterm-entry[aria-selected="true"] { background: var(--bg-elevated); color: var(--text-primary); font-weight: 500; }
.subterm-entry[aria-selected="true"]::after { content: ""; position: absolute; left: 8px; right: 8px; bottom: 0; height: 2px; border-radius: 1px; background: var(--accent); }
.subterm-entry:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.subterm-name { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 560px) { .subterm-name { max-width: 96px; } }
@keyframes subterm-flash { from { background-color: var(--accent-subtle); } to { background-color: transparent; } }
`;

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
};

function prefersReducedMotion(): boolean {
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The folder of a view's active pane, if known. */
function viewCwd(view: View, cwds: Record<string, string>): string | null {
  const panes = findAllPanes(view.root);
  const pane = panes.find((p) => p.id === view.activePaneId) ?? panes[0];
  return (pane && (cwds[pane.id] || pane.savedCwd || pane.initialCwd)) || null;
}

const tooltip = (name: string, cwd: string | null) => (cwd ? `${name} — ${cwd}` : name);

/**
 * The views of a terminal tab: its own terminal, pinned first, then each
 * sub-terminal in order. Rendered only while the tab has a sub-terminal.
 * Mounted for the tab in sight whether or not it shows, so an entry added in
 * the background while it is mounted flashes once.
 */
export default function SubTerminalStrip({ tabId }: { tabId: string }) {
  const tab = useTabStore((s) => s.tabs.find((t) => t.id === tabId));
  const showView = useTabStore((s) => s.showView);
  const cwds = usePaneCwd((s) => s.cwds);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [flashing, setFlashing] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(tab?.viewOrder ?? []);
  const entryRefs = useRef(new Map<string, HTMLDivElement>());

  const viewOrder = tab?.viewOrder;
  const shown = tab?.shownView;

  // A view that appears while mounted and is not shown was added in the background.
  useEffect(() => {
    if (!viewOrder) return;
    const fresh = viewOrder.filter((id) => !seen.current!.has(id));
    if (fresh.length === 0) return;
    for (const id of fresh) seen.current!.add(id);
    const background = fresh.filter((id) => id !== shown);
    if (background.length > 0 && !prefersReducedMotion()) {
      setFlashing((prev) => new Set([...prev, ...background]));
    }
  }, [viewOrder, shown]);

  // The roving focus follows the selection when it changes, and the
  // selected entry is scrolled into view.
  useEffect(() => {
    setFocusId(null);
    if (shown) entryRefs.current.get(shown)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [shown]);

  if (!tab || !viewOrder || viewOrder.length < 2 || !shown) return null;

  const ownCwd = tabCwd(tab, cwds);
  const label = tabLabel(tab, ownCwd);
  const rovingId = focusId && viewOrder.includes(focusId) ? focusId : shown;

  const show = (viewId: string) => {
    showView(tabId, viewId);
    focusActiveTerminal();
  };
  const moveFocus = (viewId: string) => {
    setFocusId(viewId);
    entryRefs.current.get(viewId)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, viewId: string) => {
    const idx = viewOrder.indexOf(viewId);
    const target =
      e.key === "ArrowRight" ? viewOrder[idx + 1]
      : e.key === "ArrowLeft" ? viewOrder[idx - 1]
      : e.key === "Home" ? viewOrder[0]
      : e.key === "End" ? viewOrder[viewOrder.length - 1]
      : undefined;
    if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      if (target) moveFocus(target);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show(viewId);
    }
  };

  const entry = (viewId: string, name: string, title: string, own: boolean) => {
    const selected = viewId === shown;
    const flash = flashing.has(viewId);
    return (
      <div
        key={viewId}
        ref={(el) => { if (el) entryRefs.current.set(viewId, el); else entryRefs.current.delete(viewId); }}
        role="tab"
        className="subterm-entry"
        aria-selected={selected}
        aria-controls={SUB_TERMINAL_CONTENT_ID}
        tabIndex={viewId === rovingId ? 0 : -1}
        title={title}
        data-flash={flash || undefined}
        style={flash ? { animation: "subterm-flash 1.2s ease-out 1" } : undefined}
        onAnimationEnd={() => setFlashing((prev) => { const next = new Set(prev); next.delete(viewId); return next; })}
        onFocus={() => setFocusId(viewId)}
        onClick={() => show(viewId)}
        onKeyDown={(e) => onKeyDown(e, viewId)}
      >
        {own && (
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: selected ? 0.9 : 0.4 }}>
            <path d="M5.5 4L9.5 8L5.5 12" stroke={selected ? "var(--accent)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="subterm-name">{name}</span>
      </div>
    );
  };

  return (
    <>
      <style>{STRIP_CSS}</style>
      <div
      className="subterm-strip"
      role="tablist"
      aria-label={`Terminals in ${label}`}
      // Focus leaving the strip: the selected entry is the way back in.
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusId(null); }}
    >
        {entry(viewOrder[0], label, tooltip(label, ownCwd), true)}
        <div className="subterm-divider" aria-hidden="true" />
        <div className="subterm-scroller" data-sub-scroller>
          {viewOrder.slice(1).map((id) => {
            const view = tab.views[id];
            if (!view) return null;
            const name = view.name ?? "Terminal";
            return entry(id, name, tooltip(name, viewCwd(view, cwds)), false);
          })}
        </div>
      </div>
    </>
  );
}

/**
 * The window's one live region for sub-terminals: a background add says
 * "Sub-terminal <name> opened in <tab>", adds within a second of the first
 * are merged, and an add with focus says nothing (the focus move is heard).
 */
export function SubTerminalAnnouncer() {
  // Each announcement is a new node: a live region reads changes, so the
  // same words set twice would otherwise be heard once.
  const [said, setSaid] = useState({ text: "", n: 0 });
  useEffect(() => {
    const pending = new Map<string, { names: string[]; timer: number }>();
    const unsubscribe = useTabStore.subscribe((state, prev) => {
      for (const t of state.tabs) {
        const before = prev.tabs.find((p) => p.id === t.id);
        if (!before || before.viewOrder === t.viewOrder) continue;
        for (const id of t.viewOrder) {
          if (before.viewOrder.includes(id)) continue;
          if (state.activeTabId === t.id && t.shownView === id) continue; // added with focus
          const name = t.views[id]?.name ?? "Terminal";
          const batch = pending.get(t.id);
          if (batch) {
            batch.names.push(name);
            continue;
          }
          const names = [name];
          const timer = window.setTimeout(() => {
            pending.delete(t.id);
            const now = useTabStore.getState().tabs.find((x) => x.id === t.id);
            if (!now) return;
            const label = tabLabel(now, tabCwd(now, usePaneCwd.getState().cwds));
            const text = names.length === 1 ? `Sub-terminal ${names[0]} opened in ${label}` : `${names.length} sub-terminals opened in ${label}`;
            setSaid((prev) => ({ text, n: prev.n + 1 }));
          }, MERGE_MS);
          pending.set(t.id, { names, timer });
        }
      }
    });
    return () => {
      unsubscribe();
      for (const b of pending.values()) window.clearTimeout(b.timer);
    };
  }, []);
  return <div aria-live="polite" style={VISUALLY_HIDDEN}>{said.text && <span key={said.n}>{said.text}</span>}</div>;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useTabStore, findAllPanes } from "../stores/tabStore";
import { usePaneCwd, baseName } from "../stores/paneMetaStore";
import { isPaneActive } from "../hooks/useTerminal";
import { matchTabs, tabCwd, tabLabel, tabProject } from "../lib/tabDisplay";
import { useEscapeToClose } from "./useEscapeToClose";

const home = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, "~");

/** Find a tab by name, folder or project and jump to it. */
export default function TabSwitcher({ onClose }: { onClose: () => void }) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const { cwds, projects, attention } = usePaneCwd();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEscapeToClose(onClose);

  const items = useMemo(
    () =>
      tabs.map((t, i) => {
        const cwd = tabCwd(t, cwds);
        return {
          tab: t,
          index: i,
          label: tabLabel(t, cwd),
          cwd,
          project: tabProject(t, cwds, projects),
          busy: findAllPanes(t.root).some((p) => isPaneActive(p.id)),
        };
      }),
    [tabs, cwds, projects],
  );
  const shown = useMemo(() => matchTabs(items, query), [items, query]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const open = (id: string) => {
    setActiveTab(id);
    onClose();
  };

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="contracts-panel tab-switcher" role="dialog" aria-label="Go to tab">
        <input
          className="tab-switcher__search"
          autoFocus
          placeholder="Go to tab: name, folder or project"
          aria-label="Search tabs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            else if (e.key === "Enter" && shown[cursor]) { e.preventDefault(); open(shown[cursor].tab.id); }
          }}
        />
        <ul className="tab-switcher__list" ref={listRef} role="listbox" aria-label="Open tabs">
          {shown.map((it, i) => (
            <li
              key={it.tab.id}
              role="option"
              aria-selected={i === cursor}
              data-active={it.tab.id === activeTabId || undefined}
              onMouseEnter={() => setCursor(i)}
              onClick={() => open(it.tab.id)}
            >
              <span className="tab-switcher__color" style={{ background: it.tab.color ?? "transparent" }} />
              <span className="tab-switcher__num">{it.index + 1}</span>
              <span className="tab-switcher__name">{it.label}</span>
              {it.cwd && <span className="tab-switcher__path" title={it.cwd}>{home(it.cwd)}</span>}
              {it.project && it.cwd !== it.project && <span className="tab-switcher__project">{baseName(it.project)}</span>}
              {it.busy ? (
                <span className="tab-switcher__status" data-state="busy" title="Producing output">working</span>
              ) : attention[it.tab.id] ? (
                <span className="tab-switcher__status" data-state="done" title="Finished while you were in another tab">done</span>
              ) : null}
            </li>
          ))}
          {shown.length === 0 && <li className="tab-switcher__empty">No tab matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}

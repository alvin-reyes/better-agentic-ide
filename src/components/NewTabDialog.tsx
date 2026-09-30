import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePaneCwd, baseName } from "../stores/paneMetaStore";
import { forgetProject, newProjectTab, openProjectTab, recentProjects } from "../lib/newTab";
import { useEscapeToClose } from "./useEscapeToClose";

const home = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, "~");

/** "Plain terminal or a project?" when opening a new tab. */
export default function NewTabDialog({ onClose }: { onClose: () => void }) {
  const addTab = useTabStore((s) => s.addTab);
  const setAskOnNewTab = useSettingsStore((s) => s.setAskOnNewTab);
  const openProjects = usePaneCwd((s) => s.projects);
  const [recents, setRecents] = useState(recentProjects);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEscapeToClose(onClose);

  // Remembered projects first, then ones open in other tabs.
  const projects = useMemo(() => {
    const seen = new Set(recents);
    // A folder outside any git repo is its own "project"; the home folder isn't one.
    const others = [...new Set(Object.values(openProjects))].filter((p) => !seen.has(p) && home(p) !== "~" && p !== "/");
    return [...recents, ...others].slice(0, 9);
  }, [recents, openProjects]);

  // Rows: plain terminal, new project, open project, then recent projects.
  const FIXED = 3;
  const rows = FIXED + projects.length;

  const plain = () => { addTab(); onClose(); };
  const project = (path: string) => { openProjectTab(path); onClose(); };
  const browse = async () => {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false, title: "Open a project folder" });
      if (typeof picked === "string") project(picked);
    } catch (e) {
      setError(String(e));
    }
  };
  const create = async () => {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false, title: "Choose or create a folder for the new project" });
      if (typeof picked === "string") {
        await newProjectTab(picked);
        onClose();
      }
    } catch (e) {
      setError(String(e));
    }
  };
  const choose = (i: number) => (i === 0 ? plain() : i === 1 ? create() : i === 2 ? browse() : project(projects[i - FIXED]));

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-label="New tab"
        tabIndex={-1}
        ref={(el) => el?.focus()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % rows); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + rows) % rows); }
          else if (e.key === "Enter") { e.preventDefault(); choose(cursor); }
          else if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); plain(); }
          else if (e.key.toLowerCase() === "o" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); browse(); }
          else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); create(); }
          else if (/^[1-9]$/.test(e.key) && projects[+e.key - 1]) { e.preventDefault(); project(projects[+e.key - 1]); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>New tab</h2>
          <span className="contracts-panel__root" />
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        <ul className="new-tab-list" role="listbox" aria-label="Start in">
          <li role="option" aria-selected={cursor === 0} onMouseEnter={() => setCursor(0)} onClick={plain}>
            <span className="new-tab-icon" aria-hidden="true">›_</span>
            <span className="new-tab-main"><b>Terminal</b><small>A shell in your home folder</small></span>
            <kbd>T</kbd>
          </li>
          <li role="option" aria-selected={cursor === 1} onMouseEnter={() => setCursor(1)} onClick={create}>
            <span className="new-tab-icon" aria-hidden="true">+</span>
            <span className="new-tab-main"><b>New project…</b><small>Pick or create a folder: git, BMAD, the methodology and all agents</small></span>
            <kbd>N</kbd>
          </li>
          <li role="option" aria-selected={cursor === 2} onMouseEnter={() => setCursor(2)} onClick={browse}>
            <span className="new-tab-icon" aria-hidden="true">⌂</span>
            <span className="new-tab-main"><b>Open project…</b><small>An existing folder; ADE adds what's missing</small></span>
            <kbd>O</kbd>
          </li>
          {projects.length > 0 && <li className="new-tab-heading" aria-hidden="true">Recent projects</li>}
          {projects.map((p, i) => (
            <li
              key={p}
              role="option"
              aria-selected={cursor === i + FIXED}
              onMouseEnter={() => setCursor(i + FIXED)}
              onClick={() => project(p)}
              title={p}
            >
              <span className="new-tab-icon" aria-hidden="true">▣</span>
              <span className="new-tab-main"><b>{baseName(p)}</b><small>{home(p)}</small></span>
              {recents.includes(p) && (
                <button
                  className="new-tab-forget"
                  aria-label={`Forget ${baseName(p)}`}
                  title="Remove from recents"
                  onClick={(e) => { e.stopPropagation(); forgetProject(p); setRecents(recentProjects()); }}
                >
                  ✕
                </button>
              )}
              <kbd>{i + 1}</kbd>
            </li>
          ))}
        </ul>
        {error && <div className="integrations-msg" data-kind="error" role="alert">{error}</div>}
        <label className="new-tab-foot">
          <input type="checkbox" onChange={(e) => setAskOnNewTab(!e.target.checked)} />
          Don't ask again: always open a plain terminal (change it in Settings → Terminal)
        </label>
      </div>
    </div>
  );
}

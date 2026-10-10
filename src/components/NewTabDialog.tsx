import { useCallback, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { usePaneCwd, baseName } from "../stores/paneMetaStore";
import { detectOnDisk, isSetupCandidate, setupDeclined, type Methodology } from "../lib/projectSetup";
import { forgetProject, newProjectTab, openProjectTab, recentProjects } from "../lib/newTab";
import { useEscapeToClose } from "./useEscapeToClose";

const home = (p: string) => p.replace(/^\/(Users|home)\/[^/]+/, "~");

/** "Plain terminal or a project?" when opening a new tab. */
export default function NewTabDialog({ onClose }: { onClose: () => void }) {
  const addTab = useTabStore((s) => s.addTab);
  const setAskOnNewTab = useSettingsStore((s) => s.setAskOnNewTab);
  const autoSetup = useSettingsStore((s) => s.autoProjectSetup);
  const openProjects = usePaneCwd((s) => s.projects);
  const [recents, setRecents] = useState(recentProjects);
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The folder waiting on the methodology question, and the detection in
  // flight that decides whether it is asked at all.
  const [asking, setAsking] = useState<{ path: string; isNew: boolean } | null>(null);
  const [checking, setChecking] = useState(false);

  // A stable ref callback: an inline arrow has a new identity every render, so
  // React would re-run it after each keystroke and state change and pull focus
  // back off whatever is inside — the "ask on new tab" checkbox, for one.
  const focusOnMount = useCallback((el: HTMLDivElement | null) => el?.focus(), []);
  useEscapeToClose(onClose);

  // Remembered projects first, then ones open in other tabs.
  const projects = useMemo(() => {
    const seen = new Set(recents);
    // A folder outside any git repo is its own "project"; the home folder isn't one.
    const others = [...new Set(Object.values(openProjects))].filter((p) => !seen.has(p) && home(p) !== "~" && p !== "/");
    return [...recents, ...others].slice(0, 9);
  }, [recents, openProjects]);

  // Rows: plain terminal, new project, open project, then recent projects.
  // While the methodology question is up, its two answers are the whole list.
  const FIXED = 3;
  const rows = asking ? 2 : FIXED + projects.length;

  const plain = () => { addTab(); onClose(); };

  /** Open a picked folder, on the chosen methodology where there is one. */
  const openPicked = async (path: string, isNew: boolean, methodology?: Methodology) => {
    try {
      if (isNew) await newProjectTab(path, methodology);
      else openProjectTab(path, methodology);
      onClose();
    } catch (e) {
      setError(String(e));
    }
  };

  /**
   * Open a picked folder. When automatic setup will run and the project has
   * neither methodology on disk, ask which one first; a project already on one
   * opens straight away, staying on it.
   */
  const pick = async (path: string, isNew: boolean) => {
    if (checking) return;
    if (!autoSetup || !isSetupCandidate(path) || setupDeclined(path)) { void openPicked(path, isNew); return; }
    setChecking(true);
    try {
      const detected = await detectOnDisk(path).catch(() => null);
      if (detected) { void openPicked(path, isNew, detected); return; }
      setCursor(0);
      setAsking({ path, isNew });
    } finally {
      setChecking(false);
    }
  };

  const project = (path: string) => { void pick(path, false); };
  const browse = async () => {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false, title: "Open a project folder" });
      if (typeof picked === "string") await pick(picked, false);
    } catch (e) {
      setError(String(e));
    }
  };
  const create = async () => {
    setError(null);
    try {
      const picked = await open({ directory: true, multiple: false, title: "Choose or create a folder for the new project" });
      if (typeof picked === "string") await pick(picked, true);
    } catch (e) {
      setError(String(e));
    }
  };
  /** Answer the methodology question and open the folder on it. */
  const answer = (methodology: Methodology) => {
    if (!asking) return;
    const { path, isNew } = asking;
    setAsking(null);
    void openPicked(path, isNew, methodology);
  };
  const choose = (i: number) => {
    if (asking) { answer(i === 1 ? "v4" : "v6"); return; }
    i === 0 ? plain() : i === 1 ? create() : i === 2 ? browse() : project(projects[i - FIXED]);
  };

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="contracts-panel new-tab-dialog"
        role="dialog"
        aria-label={asking ? "Project setup" : "New tab"}
        tabIndex={-1}
        ref={focusOnMount}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => (c + 1) % rows); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => (c - 1 + rows) % rows); }
          else if (e.key === "Enter") { e.preventDefault(); choose(cursor); }
          else if (asking) return;
          else if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); plain(); }
          else if (e.key.toLowerCase() === "o" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); browse(); }
          else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); create(); }
          else if (/^[1-9]$/.test(e.key) && projects[+e.key - 1]) { e.preventDefault(); project(projects[+e.key - 1]); }
        }}
      >
        <div className="contracts-panel__header">
          <h2>{asking ? "Set up project" : "New tab"}</h2>
          <span className="contracts-panel__root" title={asking?.path}>{asking && home(asking.path)}</span>
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close" title="Close (Esc)">✕</button>
        </div>
        {asking ? (
          <>
            <p className="new-tab-ask">Methodology: BMAD v6 (default) or BMAD v4</p>
            <ul className="new-tab-list" role="listbox" aria-label="Methodology">
              <li role="option" aria-selected={cursor === 0} onMouseEnter={() => setCursor(0)} onClick={() => choose(0)}>
                <span className="new-tab-icon" aria-hidden="true">▣</span>
                <span className="new-tab-main"><b>BMAD v6 (default)</b><small>Skills, _bmad/ and the runtime — the current BMAD</small></span>
                <kbd>↵</kbd>
              </li>
              <li role="option" aria-selected={cursor === 1} onMouseEnter={() => setCursor(1)} onClick={() => choose(1)}>
                <span className="new-tab-icon" aria-hidden="true">▤</span>
                <span className="new-tab-main"><b>BMAD v4</b><small>Classic .bmad-core/ and the /BMad commands</small></span>
              </li>
            </ul>
          </>
        ) : (
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
        )}
        {error && <div className="integrations-msg" data-kind="error" role="alert">{error}</div>}
        {!asking && (
          <label className="new-tab-foot">
            <input type="checkbox" onChange={(e) => setAskOnNewTab(!e.target.checked)} />
            Don't ask again: always open a plain terminal (change it in Settings → Terminal)
          </label>
        )}
      </div>
    </div>
  );
}

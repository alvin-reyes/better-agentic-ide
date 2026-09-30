import { create } from "zustand";

/**
 * Live facts about panes and tabs that the tab bar shows but that aren't
 * saved with the session: each pane's folder (polled by TerminalPane), the
 * project it belongs to, and tabs whose output finished while you were away.
 */
interface PaneMeta {
  cwds: Record<string, string>;
  /** Project root for a folder: the nearest parent with a .git, or the folder itself. */
  projects: Record<string, string>;
  attention: Record<string, true>;
  collapsedGroups: Record<string, true>;
  setCwd: (paneId: string, cwd: string) => void;
  setProject: (cwd: string, root: string) => void;
  markAttention: (tabId: string) => void;
  clearAttention: (tabId: string) => void;
  toggleGroup: (project: string) => void;
}

export const usePaneCwd = create<PaneMeta>((set) => ({
  cwds: {},
  projects: {},
  attention: {},
  collapsedGroups: {},
  setCwd: (paneId, cwd) => set((s) => (s.cwds[paneId] === cwd ? s : { cwds: { ...s.cwds, [paneId]: cwd } })),
  setProject: (cwd, root) => set((s) => (s.projects[cwd] === root ? s : { projects: { ...s.projects, [cwd]: root } })),
  markAttention: (tabId) => set((s) => (s.attention[tabId] ? s : { attention: { ...s.attention, [tabId]: true } })),
  clearAttention: (tabId) =>
    set((s) => {
      if (!s.attention[tabId]) return s;
      const { [tabId]: _, ...rest } = s.attention;
      return { attention: rest };
    }),
  toggleGroup: (project) =>
    set((s) => {
      const { [project]: was, ...rest } = s.collapsedGroups;
      return { collapsedGroups: was ? rest : { ...rest, [project]: true } };
    }),
}));

/** "/Users/me/code/acme-api" → "acme-api". */
export const baseName = (path: string) => path.replace(/\/+$/, "").split("/").pop() || path;

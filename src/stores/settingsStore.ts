import { create } from "zustand";
import type { Provider } from "../data/agentProfiles";

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  bgSurface: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  green: string;
  border: string;
  borderStrong: string;
  // Terminal-specific
  termBg: string;
  termFg: string;
  termCursor: string;
  termBlack: string;
  termRed: string;
  termGreen: string;
  termYellow: string;
  termBlue: string;
  termMagenta: string;
  termCyan: string;
  termWhite: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  colors: ThemeColors;
}

export const themePresets: ThemePreset[] = [
  {
    id: "github-dark",
    name: "GitHub Dark",
    colors: {
      bgPrimary: "#0d1117",
      bgSecondary: "#161b22",
      bgTertiary: "#1c2128",
      bgElevated: "#21262d",
      bgSurface: "#30363d",
      textPrimary: "#e6edf3",
      textSecondary: "#8b949e",
      textMuted: "#484f58",
      accent: "#58a6ff",
      green: "#3fb950",
      border: "rgba(240, 246, 252, 0.1)",
      borderStrong: "rgba(240, 246, 252, 0.15)",
      termBg: "#0d1117",
      termFg: "#e6edf3",
      termCursor: "#58a6ff",
      termBlack: "#484f58",
      termRed: "#ff7b72",
      termGreen: "#3fb950",
      termYellow: "#d29922",
      termBlue: "#58a6ff",
      termMagenta: "#bc8cff",
      termCyan: "#39d353",
      termWhite: "#b1bac4",
    },
  },
  {
    id: "dracula",
    name: "Dracula",
    colors: {
      bgPrimary: "#282a36",
      bgSecondary: "#21222c",
      bgTertiary: "#2d2f3d",
      bgElevated: "#343746",
      bgSurface: "#44475a",
      textPrimary: "#f8f8f2",
      textSecondary: "#b0b8d1",
      textMuted: "#6272a4",
      accent: "#bd93f9",
      green: "#50fa7b",
      border: "rgba(248, 248, 242, 0.1)",
      borderStrong: "rgba(248, 248, 242, 0.15)",
      termBg: "#282a36",
      termFg: "#f8f8f2",
      termCursor: "#f8f8f2",
      termBlack: "#21222c",
      termRed: "#ff5555",
      termGreen: "#50fa7b",
      termYellow: "#f1fa8c",
      termBlue: "#bd93f9",
      termMagenta: "#ff79c6",
      termCyan: "#8be9fd",
      termWhite: "#f8f8f2",
    },
  },
  {
    id: "monokai",
    name: "Monokai Pro",
    colors: {
      bgPrimary: "#2d2a2e",
      bgSecondary: "#221f22",
      bgTertiary: "#363337",
      bgElevated: "#403e41",
      bgSurface: "#5b595c",
      textPrimary: "#fcfcfa",
      textSecondary: "#c1c0c0",
      textMuted: "#727072",
      accent: "#ffd866",
      green: "#a9dc76",
      border: "rgba(252, 252, 250, 0.1)",
      borderStrong: "rgba(252, 252, 250, 0.15)",
      termBg: "#2d2a2e",
      termFg: "#fcfcfa",
      termCursor: "#fcfcfa",
      termBlack: "#403e41",
      termRed: "#ff6188",
      termGreen: "#a9dc76",
      termYellow: "#ffd866",
      termBlue: "#fc9867",
      termMagenta: "#ab9df2",
      termCyan: "#78dce8",
      termWhite: "#fcfcfa",
    },
  },
  {
    id: "nord",
    name: "Nord",
    colors: {
      bgPrimary: "#2e3440",
      bgSecondary: "#272c36",
      bgTertiary: "#353b49",
      bgElevated: "#3b4252",
      bgSurface: "#434c5e",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      textMuted: "#4c566a",
      accent: "#88c0d0",
      green: "#a3be8c",
      border: "rgba(236, 239, 244, 0.1)",
      borderStrong: "rgba(236, 239, 244, 0.15)",
      termBg: "#2e3440",
      termFg: "#eceff4",
      termCursor: "#d8dee9",
      termBlack: "#3b4252",
      termRed: "#bf616a",
      termGreen: "#a3be8c",
      termYellow: "#ebcb8b",
      termBlue: "#81a1c1",
      termMagenta: "#b48ead",
      termCyan: "#88c0d0",
      termWhite: "#e5e9f0",
    },
  },
  {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    colors: {
      bgPrimary: "#1e1e2e",
      bgSecondary: "#181825",
      bgTertiary: "#252536",
      bgElevated: "#313244",
      bgSurface: "#45475a",
      textPrimary: "#cdd6f4",
      textSecondary: "#bac2de",
      textMuted: "#585b70",
      accent: "#89b4fa",
      green: "#a6e3a1",
      border: "rgba(205, 214, 244, 0.1)",
      borderStrong: "rgba(205, 214, 244, 0.15)",
      termBg: "#1e1e2e",
      termFg: "#cdd6f4",
      termCursor: "#f5e0dc",
      termBlack: "#45475a",
      termRed: "#f38ba8",
      termGreen: "#a6e3a1",
      termYellow: "#f9e2af",
      termBlue: "#89b4fa",
      termMagenta: "#cba6f7",
      termCyan: "#94e2d5",
      termWhite: "#bac2de",
    },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    colors: {
      bgPrimary: "#002b36",
      bgSecondary: "#001f27",
      bgTertiary: "#073642",
      bgElevated: "#0a4050",
      bgSurface: "#586e75",
      textPrimary: "#fdf6e3",
      textSecondary: "#93a1a1",
      textMuted: "#586e75",
      accent: "#268bd2",
      green: "#859900",
      border: "rgba(253, 246, 227, 0.1)",
      borderStrong: "rgba(253, 246, 227, 0.15)",
      termBg: "#002b36",
      termFg: "#839496",
      termCursor: "#839496",
      termBlack: "#073642",
      termRed: "#dc322f",
      termGreen: "#859900",
      termYellow: "#b58900",
      termBlue: "#268bd2",
      termMagenta: "#d33682",
      termCyan: "#2aa198",
      termWhite: "#eee8d5",
    },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    colors: {
      bgPrimary: "#1a1b26",
      bgSecondary: "#16161e",
      bgTertiary: "#1f2030",
      bgElevated: "#24283b",
      bgSurface: "#414868",
      textPrimary: "#c0caf5",
      textSecondary: "#a9b1d6",
      textMuted: "#565f89",
      accent: "#7aa2f7",
      green: "#9ece6a",
      border: "rgba(192, 202, 245, 0.1)",
      borderStrong: "rgba(192, 202, 245, 0.15)",
      termBg: "#1a1b26",
      termFg: "#c0caf5",
      termCursor: "#c0caf5",
      termBlack: "#414868",
      termRed: "#f7768e",
      termGreen: "#9ece6a",
      termYellow: "#e0af68",
      termBlue: "#7aa2f7",
      termMagenta: "#bb9af7",
      termCyan: "#7dcfff",
      termWhite: "#c0caf5",
    },
  },
  {
    id: "one-dark",
    name: "One Dark",
    colors: {
      bgPrimary: "#282c34",
      bgSecondary: "#21252b",
      bgTertiary: "#2c313a",
      bgElevated: "#333842",
      bgSurface: "#3e4451",
      textPrimary: "#abb2bf",
      textSecondary: "#9da5b4",
      textMuted: "#5c6370",
      accent: "#61afef",
      green: "#98c379",
      border: "rgba(171, 178, 191, 0.1)",
      borderStrong: "rgba(171, 178, 191, 0.15)",
      termBg: "#282c34",
      termFg: "#abb2bf",
      termCursor: "#528bff",
      termBlack: "#3e4451",
      termRed: "#e06c75",
      termGreen: "#98c379",
      termYellow: "#e5c07b",
      termBlue: "#61afef",
      termMagenta: "#c678dd",
      termCyan: "#56b6c2",
      termWhite: "#abb2bf",
    },
  },
];

export interface WorkspacePreset {
  id: string;
  name: string;
  tabs: { name: string; splits: "none" | "horizontal" | "vertical" }[];
  savedAt: number;
}

const SETTINGS_KEY = "better-terminal-settings";
const WORKSPACES_KEY = "better-terminal-workspaces";

interface Settings {
  themeId: string;
  customColors: Partial<ThemeColors> | null;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
  cursorStyle: "bar" | "block" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  defaultProvider: Provider;
}

interface SettingsStore extends Settings {
  showSettings: boolean;
  settingsTab: "theme" | "terminal" | "workspace";
  workspaces: WorkspacePreset[];

  setShowSettings: (show: boolean) => void;
  setSettingsTab: (tab: "theme" | "terminal" | "workspace") => void;
  setTheme: (id: string) => void;
  setCustomColor: (key: keyof ThemeColors, value: string) => void;
  clearCustomColors: () => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setLineHeight: (height: number) => void;
  setCursorStyle: (style: "bar" | "block" | "underline") => void;
  setCursorBlink: (blink: boolean) => void;
  setScrollback: (lines: number) => void;
  setDefaultProvider: (provider: Provider) => void;
  getActiveTheme: () => ThemeColors;

  saveWorkspace: (name: string, tabs: { name: string; splits: "none" | "horizontal" | "vertical" }[]) => void;
  deleteWorkspace: (id: string) => void;
}

function loadSettings(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

function loadWorkspaces(): WorkspacePreset[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistWorkspaces(w: WorkspacePreset[]) {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(w));
}

const defaults: Settings = {
  themeId: "github-dark",
  customColors: null,
  fontSize: 14,
  fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", monospace',
  lineHeight: 1.35,
  cursorStyle: "bar",
  cursorBlink: true,
  scrollback: 10000,
  defaultProvider: "claude" as Provider,
};

const saved = loadSettings();
const initial: Settings = { ...defaults, ...saved };

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...initial,
  showSettings: false,
  settingsTab: "theme",
  workspaces: loadWorkspaces(),

  setShowSettings: (show) => set({ showSettings: show }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),

  setTheme: (id) => {
    set({ themeId: id, customColors: null });
    const s = get();
    persistSettings(s);
    applyThemeToDOM(get().getActiveTheme());
  },

  setCustomColor: (key, value) => {
    set((s) => ({
      customColors: { ...(s.customColors || {}), [key]: value },
    }));
    const s = get();
    persistSettings(s);
    applyThemeToDOM(get().getActiveTheme());
  },

  clearCustomColors: () => {
    set({ customColors: null });
    const s = get();
    persistSettings(s);
    applyThemeToDOM(get().getActiveTheme());
  },

  setFontSize: (fontSize) => {
    set({ fontSize });
    persistSettings(get());
  },

  setFontFamily: (fontFamily) => {
    set({ fontFamily });
    persistSettings(get());
  },

  setLineHeight: (lineHeight) => {
    set({ lineHeight });
    persistSettings(get());
  },

  setCursorStyle: (cursorStyle) => {
    set({ cursorStyle });
    persistSettings(get());
  },

  setCursorBlink: (cursorBlink) => {
    set({ cursorBlink });
    persistSettings(get());
  },

  setScrollback: (scrollback) => {
    set({ scrollback });
    persistSettings(get());
  },

  setDefaultProvider: (defaultProvider) => {
    set({ defaultProvider });
    persistSettings(get());
  },

  getActiveTheme: () => {
    const s = get();
    const preset = themePresets.find((t) => t.id === s.themeId) || themePresets[0];
    if (s.customColors) {
      return { ...preset.colors, ...s.customColors };
    }
    return preset.colors;
  },

  saveWorkspace: (name, tabs) => {
    const ws: WorkspacePreset = {
      id: Date.now().toString(36),
      name,
      tabs,
      savedAt: Date.now(),
    };
    const updated = [ws, ...get().workspaces];
    set({ workspaces: updated });
    persistWorkspaces(updated);
  },

  deleteWorkspace: (id) => {
    const updated = get().workspaces.filter((w) => w.id !== id);
    set({ workspaces: updated });
    persistWorkspaces(updated);
  },
}));

export function applyThemeToDOM(colors: ThemeColors) {
  const root = document.documentElement;
  root.style.setProperty("--bg-primary", colors.bgPrimary);
  root.style.setProperty("--bg-secondary", colors.bgSecondary);
  root.style.setProperty("--bg-tertiary", colors.bgTertiary);
  root.style.setProperty("--bg-elevated", colors.bgElevated);
  root.style.setProperty("--bg-surface", colors.bgSurface);
  root.style.setProperty("--text-primary", colors.textPrimary);
  root.style.setProperty("--text-secondary", colors.textSecondary);
  root.style.setProperty("--text-muted", colors.textMuted);
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-subtle", colors.accent + "26");
  root.style.setProperty("--accent-hover", colors.accent + "40");
  root.style.setProperty("--green", colors.green);
  root.style.setProperty("--green-subtle", colors.green + "26");
  root.style.setProperty("--border", colors.border);
  root.style.setProperty("--border-strong", colors.borderStrong);
}

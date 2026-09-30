import { IS_MAC, modLabel, shortcutLabel as L } from "./shortcuts";

export interface ShortcutItem {
  keys: string;
  action: string;
  /** Label for the compact shortcut bar. */
  short: string;
}

const MOD = modLabel();

/** Every app shortcut, grouped, with labels for this platform (⌘ on macOS, Ctrl+Shift elsewhere). */
export const SHORTCUT_GROUPS: { group: string; items: ShortcutItem[] }[] = [
  {
    group: "Tabs & panes",
    items: [
      { keys: L("newTab"), action: "New tab", short: "New tab" },
      { keys: L("closeTab"), action: "Close tab", short: "Close tab" },
      { keys: `${MOD}1-9`, action: "Switch tab", short: "Switch tab" },
      { keys: `${modLabel(true)}[ / ]`, action: "Previous / next tab", short: "Prev/next tab" },
      { keys: L("renameTab"), action: "Rename tab", short: "Rename tab" },
      { keys: L("splitHorizontal"), action: "Split side by side", short: "Split horiz" },
      { keys: L("splitVertical"), action: "Split top and bottom", short: "Split vert" },
      { keys: L("closePane"), action: "Close pane", short: "Close pane" },
      { keys: IS_MAC ? "⌘←→" : "Ctrl+Shift+Left/Right", action: "Switch pane", short: "Switch pane" },
      { keys: L("zoomPane"), action: "Zoom pane", short: "Zoom pane" },
      { keys: L("find"), action: "Find in terminal", short: "Find" },
    ],
  },
  {
    group: "Scratchpad",
    items: [
      { keys: L("scratchpad"), action: "Open scratchpad", short: "Scratchpad" },
      { keys: L("send"), action: "Send to terminal", short: "Send to term" },
      { keys: L("saveNote"), action: "Save note", short: "Save note" },
      { keys: L("sendEnter"), action: "Send Enter to terminal", short: "Send Enter ↵" },
      { keys: L("copy"), action: "Copy scratchpad text", short: "Copy text" },
    ],
  },
  {
    group: "Agents",
    items: [
      { keys: L("agentPicker"), action: "Agent picker", short: "Agents" },
      { keys: L("fleet"), action: "Fleet view", short: "Fleet" },
      { keys: L("orchestrator"), action: "Orchestrator", short: "Orchestrator" },
    ],
  },
  {
    group: "Panels & tools",
    items: [
      { keys: L("shortcuts"), action: "Keyboard shortcuts", short: "Shortcuts" },
      { keys: L("palette"), action: "Command palette", short: "Commands" },
      { keys: L("fileBrowser"), action: "File browser", short: "Files" },
      { keys: L("preview"), action: "Preview panel", short: "Preview" },
      { keys: L("contracts"), action: "Contracts panel", short: "Contracts" },
      { keys: L("tokens"), action: "Tokens panel", short: "Tokens" },
      { keys: L("settings"), action: "Settings", short: "Settings" },
      { keys: "Esc", action: "Close panel / back to terminal", short: "Close panel" },
    ],
  },
];

export const ALL_SHORTCUTS: ShortcutItem[] = SHORTCUT_GROUPS.flatMap((g) => g.items);

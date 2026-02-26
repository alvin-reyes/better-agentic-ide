import { useEffect } from "react";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { refreshAllTerminals, getPtyCwd } from "./useTerminal";

interface KeybindingActions {
  toggleScratchpad: () => void;
  closeScratchpad: () => void;
  sendScratchpad: () => void;
  copyScratchpad: () => void;
  saveNoteScratchpad: () => void;
  sendEnterToTerminal: () => void;
  toggleCommandPalette: () => void;
  toggleAgentPicker: () => void;
  requestCloseTab: (tabId: string) => void;
  requestClosePane: (tabId: string, paneId: string) => void;
  isScratchpadOpen: boolean;
}

export function useKeybindings(actions: KeybindingActions) {
  const { addTab, setActiveTab, renameTab, splitPane, focusNextPane, focusPrevPane, tabs, activeTabId } =
    useTabStore();

  // Watch for settings changes and refresh terminals
  useEffect(() => {
    let prev = JSON.stringify(useSettingsStore.getState());
    const unsub = useSettingsStore.subscribe((state) => {
      const next = JSON.stringify({
        themeId: state.themeId,
        customColors: state.customColors,
        fontSize: state.fontSize,
        fontFamily: state.fontFamily,
        lineHeight: state.lineHeight,
        cursorStyle: state.cursorStyle,
        cursorBlink: state.cursorBlink,
        scrollback: state.scrollback,
      });
      if (next !== prev) {
        prev = next;
        refreshAllTerminals();
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const alt = e.altKey;

      // Cmd+P: Command palette
      if (meta && !shift && !alt && e.key === "p") {
        e.preventDefault();
        actions.toggleCommandPalette();
        return;
      }

      // Cmd+,: Open settings
      if (meta && !shift && !alt && e.key === ",") {
        e.preventDefault();
        const s = useSettingsStore.getState();
        s.setShowSettings(!s.showSettings);
        return;
      }

      // Cmd+R: Rename active tab (dispatches event to TabBar's inline rename)
      if (meta && !shift && !alt && e.key === "r") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("rename-active-tab"));
        return;
      }

      // Cmd+Shift+A: Open agent picker
      if (meta && shift && !alt && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        actions.toggleAgentPicker();
        return;
      }

      // Cmd+J: Toggle scratchpad
      if (meta && !shift && !alt && e.key === "j") {
        e.preventDefault();
        actions.toggleScratchpad();
        return;
      }

      // Cmd+Enter: Send scratchpad to terminal
      if (meta && !shift && !alt && e.key === "Enter" && actions.isScratchpadOpen) {
        e.preventDefault();
        actions.sendScratchpad();
        return;
      }

      // Cmd+Shift+Enter: Copy scratchpad to clipboard
      if (meta && shift && !alt && e.key === "Enter" && actions.isScratchpadOpen) {
        e.preventDefault();
        actions.copyScratchpad();
        return;
      }

      // Cmd+S: Save scratchpad as note
      if (meta && !shift && !alt && e.key === "s" && actions.isScratchpadOpen) {
        e.preventDefault();
        actions.saveNoteScratchpad();
        return;
      }

      // Cmd+T: New tab
      if (meta && !shift && !alt && e.key === "t") {
        e.preventDefault();
        addTab();
        return;
      }

      // Cmd+E: Send Enter to terminal
      if (meta && !shift && !alt && e.key === "e") {
        e.preventDefault();
        actions.sendEnterToTerminal();
        return;
      }

      // Cmd+Shift+W: Close active split pane (with confirmation if process running)
      if (meta && shift && !alt && (e.key === "w" || e.key === "W")) {
        e.preventDefault();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) actions.requestClosePane(activeTabId, tab.activePaneId);
        return;
      }

      // Cmd+W: Close tab (with confirmation if process running)
      if (meta && !shift && !alt && e.key === "w") {
        e.preventDefault();
        actions.requestCloseTab(activeTabId);
        return;
      }

      // Cmd+1-9: Switch to tab
      if (meta && !shift && !alt && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
          setActiveTab(tabs[idx].id);
        }
        return;
      }

      // Cmd+Shift+[: Previous tab
      if (meta && shift && !alt && e.key === "[") {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx > 0) setActiveTab(tabs[idx - 1].id);
        return;
      }

      // Cmd+Shift+]: Next tab
      if (meta && shift && !alt && e.key === "]") {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1].id);
        return;
      }

      // Cmd+D: Split horizontally
      if (meta && !shift && !alt && e.key === "d") {
        e.preventDefault();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) {
          getPtyCwd(tab.activePaneId).then((cwd) => {
            splitPane(activeTabId, tab.activePaneId, "horizontal", cwd);
          });
        }
        return;
      }

      // Cmd+Shift+Enter: Zoom/unzoom pane
      if (meta && shift && !alt && e.key === "Enter" && !actions.isScratchpadOpen) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("toggle-zoom-pane"));
        return;
      }

      // Cmd+Shift+D: Split vertically
      if (meta && shift && !alt && e.key === "D") {
        e.preventDefault();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) {
          getPtyCwd(tab.activePaneId).then((cwd) => {
            splitPane(activeTabId, tab.activePaneId, "vertical", cwd);
          });
        }
        return;
      }

      // Cmd+Arrow Left/Right: Navigate between panes (when scratchpad is closed)
      if (meta && !shift && !alt && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !actions.isScratchpadOpen) {
        e.preventDefault();
        if (e.key === "ArrowRight") {
          focusNextPane(activeTabId);
        } else {
          focusPrevPane(activeTabId);
        }
        return;
      }

      // Escape: Close open panels (settings > scratchpad) and focus terminal
      if (!meta && !shift && !alt && e.key === "Escape") {
        const settings = useSettingsStore.getState();
        if (settings.showSettings) {
          settings.setShowSettings(false);
          return;
        }
        if (actions.isScratchpadOpen) {
          actions.closeScratchpad();
        }
        // Always try to focus the terminal
        const xtermEl = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
        xtermEl?.focus();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions, addTab, setActiveTab, renameTab, splitPane, focusNextPane, focusPrevPane, tabs, activeTabId]);
}

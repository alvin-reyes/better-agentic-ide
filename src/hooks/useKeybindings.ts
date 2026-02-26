import { useEffect } from "react";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";
import { refreshAllTerminals } from "./useTerminal";

interface KeybindingActions {
  toggleScratchpad: () => void;
  toggleBrainstorm: () => void;
  closeScratchpad: () => void;
  closeBrainstorm: () => void;
  sendScratchpad: () => void;
  copyScratchpad: () => void;
  saveNoteScratchpad: () => void;
  sendEnterToTerminal: () => void;
  isScratchpadOpen: boolean;
  isBrainstormOpen: boolean;
}

export function useKeybindings(actions: KeybindingActions) {
  const { addTab, closeTab, setActiveTab, renameTab, splitPane, tabs, activeTabId } =
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

      // Cmd+B: Toggle brainstorm panel
      if (meta && !shift && !alt && e.key === "b") {
        e.preventDefault();
        actions.toggleBrainstorm();
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

      // Cmd+W: Close tab
      if (meta && !shift && !alt && e.key === "w") {
        e.preventDefault();
        closeTab(activeTabId);
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
        if (tab) splitPane(activeTabId, tab.activePaneId, "horizontal");
        return;
      }

      // Cmd+Shift+D: Split vertically
      if (meta && shift && !alt && e.key === "D") {
        e.preventDefault();
        const tab = tabs.find((t) => t.id === activeTabId);
        if (tab) splitPane(activeTabId, tab.activePaneId, "vertical");
        return;
      }

      // Escape: Close open panels (settings > brainstorm > scratchpad) and focus terminal
      if (!meta && !shift && !alt && e.key === "Escape") {
        const settings = useSettingsStore.getState();
        if (settings.showSettings) {
          settings.setShowSettings(false);
          return;
        }
        if (actions.isBrainstormOpen) {
          actions.closeBrainstorm();
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
  }, [actions, addTab, closeTab, setActiveTab, renameTab, splitPane, tabs, activeTabId]);
}

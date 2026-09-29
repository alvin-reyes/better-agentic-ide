import { useEffect } from "react";
import { useTabStore } from "../stores/tabStore";
import { useSettingsStore } from "../stores/settingsStore";

type SettingsState = ReturnType<typeof useSettingsStore.getState>;

/** The settings a live terminal picks up from refreshAllTerminals(). */
const terminalSettingsKey = (s: SettingsState) =>
  JSON.stringify([s.themeId, s.customColors, s.fontSize, s.fontFamily, s.lineHeight, s.cursorStyle, s.cursorBlink, s.scrollback]);
import { refreshAllTerminals, getPtyCwd } from "./useTerminal";
import { SHORTCUTS, matches, tabNumber, pageTab, type ShortcutId } from "../lib/shortcuts";

interface KeybindingActions {
  toggleScratchpad: () => void;
  closeScratchpad: () => void;
  sendScratchpad: () => void;
  copyScratchpad: () => void;
  saveNoteScratchpad: () => void;
  sendEnterToTerminal: () => void;
  toggleCommandPalette: () => void;
  toggleAgentPicker: () => void;
  togglePreview: () => void;
  toggleFleet: () => void;
  toggleFileBrowser: () => void;
  openOrchestrator: () => void;
  toggleContracts: () => void;
  toggleTokens: () => void;
  requestCloseTab: (tabId: string) => void;
  requestClosePane: (tabId: string, paneId: string) => void;
  isScratchpadOpen: boolean;
}

export function useKeybindings(actions: KeybindingActions) {
  const { addTab, setActiveTab, splitPane, focusNextPane, focusPrevPane, tabs, activeTabId } = useTabStore();

  useEffect(() => {
    let prev = terminalSettingsKey(useSettingsStore.getState());
    return useSettingsStore.subscribe((state) => {
      const next = terminalSettingsKey(state);
      if (next !== prev) {
        prev = next;
        refreshAllTerminals();
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const is = (id: ShortcutId) => matches(e, SHORTCUTS[id]);
      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      // Where the keystroke happened. Shortcuts that clash with editing text
      // (copy, caret moves) belong to the scratchpad or text field while
      // you're typing in it; elsewhere they act on panes.
      const inScratchpad = e.target instanceof Element && !!e.target.closest("[data-scratchpad]");
      // A text field other than the terminal's own input.
      const inTextField =
        e.target instanceof HTMLElement &&
        !e.target.classList.contains("xterm-helper-textarea") &&
        (e.target.matches("input, textarea, select") || e.target.isContentEditable);
      const inEditor = e.target instanceof Element && !!e.target.closest(".monaco-editor");
      const activeTab = tabs.find((t) => t.id === activeTabId);
      const activeIdx = tabs.findIndex((t) => t.id === activeTabId);

      if (is("palette")) return run(actions.toggleCommandPalette);
      if (is("settings")) {
        return run(() => {
          const s = useSettingsStore.getState();
          s.setShowSettings(!s.showSettings);
        });
      }
      // Rename dispatches to TabBar's inline rename.
      if (is("renameTab")) return run(() => window.dispatchEvent(new CustomEvent("rename-active-tab")));
      if (is("agentPicker")) return run(actions.toggleAgentPicker);
      if (is("preview")) return run(actions.togglePreview);
      if (is("fileBrowser")) return run(actions.toggleFileBrowser);
      if (is("fleet")) return run(actions.toggleFleet);
      if (is("orchestrator")) return run(actions.openOrchestrator);
      if (is("contracts")) return run(actions.toggleContracts);
      if (is("tokens")) return run(actions.toggleTokens);
      if (is("scratchpad")) return run(actions.toggleScratchpad);
      if (is("send") && actions.isScratchpadOpen) return run(actions.sendScratchpad);
      // ⌘⇧↵ copies while typing in the scratchpad and zooms the pane elsewhere.
      if (is("copy") && actions.isScratchpadOpen && inScratchpad) return run(actions.copyScratchpad);
      // Not while typing in the code editor, where ⌘S is Monaco's "save file".
      if (is("saveNote") && actions.isScratchpadOpen && !inEditor) return run(actions.saveNoteScratchpad);
      if (is("newTab")) return run(() => addTab());
      if (is("sendEnter")) return run(actions.sendEnterToTerminal);
      if (is("closePane")) {
        return run(() => {
          if (activeTab) actions.requestClosePane(activeTabId, activeTab.activePaneId);
        });
      }
      if (is("closeTab")) return run(() => actions.requestCloseTab(activeTabId));

      const n = tabNumber(e);
      if (n !== null) {
        return run(() => {
          if (n <= tabs.length) setActiveTab(tabs[n - 1].id);
        });
      }
      const step = is("prevTab") ? -1 : is("nextTab") ? 1 : pageTab(e);
      if (step !== null) {
        return run(() => {
          const next = tabs[activeIdx + step];
          if (next) setActiveTab(next.id);
        });
      }

      if (is("splitHorizontal") || is("splitVertical")) {
        const direction = is("splitHorizontal") ? "horizontal" : "vertical";
        return run(() => {
          if (!activeTab) return;
          getPtyCwd(activeTab.activePaneId).then((cwd) => {
            splitPane(activeTabId, activeTab.activePaneId, direction, cwd);
          });
        });
      }
      if (is("zoomPane") && !inScratchpad && !inTextField) {
        return run(() => window.dispatchEvent(new CustomEvent("toggle-zoom-pane")));
      }
      // Pane navigation, except where the arrows move a caret.
      if ((is("paneLeft") || is("paneRight")) && !inScratchpad && !inTextField) {
        return run(() => (is("paneRight") ? focusNextPane(activeTabId) : focusPrevPane(activeTabId)));
      }

      // Escape closes settings, else the scratchpad, and focuses the terminal.
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Escape") {
        const settings = useSettingsStore.getState();
        if (settings.showSettings) {
          settings.setShowSettings(false);
          return;
        }
        if (actions.isScratchpadOpen) {
          actions.closeScratchpad();
        }
        document.querySelector<HTMLTextAreaElement>(".xterm-helper-textarea")?.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [actions, addTab, setActiveTab, splitPane, focusNextPane, focusPrevPane, tabs, activeTabId]);
}

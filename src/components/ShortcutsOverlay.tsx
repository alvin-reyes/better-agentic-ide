import { useMemo, useState } from "react";
import { SHORTCUT_GROUPS } from "../lib/shortcutList";
import { shortcutLabel } from "../lib/shortcuts";
import { useSettingsStore } from "../stores/settingsStore";
import { useEscapeToClose } from "./useEscapeToClose";

/** Every keyboard shortcut, grouped and searchable. */
export default function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const showBar = useSettingsStore((s) => s.showShortcutBar);
  const setShowBar = useSettingsStore((s) => s.setShowShortcutBar);
  useEscapeToClose(onClose);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SHORTCUT_GROUPS;
    return SHORTCUT_GROUPS
      .map((g) => ({ ...g, items: g.items.filter((i) => `${i.action} ${i.keys} ${g.group}`.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="contracts-panel-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="contracts-panel shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
        <div className="contracts-panel__header">
          <h2>Keyboard shortcuts</h2>
          <input
            className="shortcuts-search"
            autoFocus
            placeholder="Search shortcuts"
            aria-label="Search shortcuts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="contracts-panel__close" onClick={onClose} aria-label="Close keyboard shortcuts" title="Close (Esc)">✕</button>
        </div>
        <div className="contracts-panel__body">
          {groups.length === 0 && <div className="contracts-empty">No shortcut matches “{query}”.</div>}
          <div className="shortcuts-groups">
            {groups.map((g) => (
              <section key={g.group}>
                <h3>{g.group}</h3>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.short}>
                      <span>{i.action}</span>
                      <kbd>{i.keys}</kbd>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="shortcuts-footer">
            <label>
              <input type="checkbox" checked={showBar} onChange={(e) => setShowBar(e.target.checked)} />
              Show the shortcut bar at the bottom of the window
            </label>
            <span>Open this list with {shortcutLabel("shortcuts")}. Every command is also in the palette ({shortcutLabel("palette")}).</span>
          </div>
        </div>
      </div>
    </div>
  );
}

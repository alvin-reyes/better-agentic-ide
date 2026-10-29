import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useFileHoverStore } from "../stores/fileHoverStore";
import { useSettingsStore } from "../stores/settingsStore";
import { CARD_HEIGHT, CARD_WIDTH, formatModified, formatSize, placeCard, stripAnsi } from "../lib/filePeek";
import type { HoverContent } from "../lib/hoverPreview";

/** Lines of a text file the card shows. */
const MAX_LINES = 16;

const fileName = (abs: string) => abs.split(/[\\/]/).pop() || abs;

function details({ size, modifiedMs }: HoverContent): string {
  const modified = formatModified(modifiedMs, Date.now());
  return modified ? `${formatSize(size)} · modified ${modified}` : formatSize(size);
}

const secondary = { fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" } as const;

function Note({ children }: { children: string }) {
  return <div style={{ ...secondary, marginTop: "8px" }}>{children}</div>;
}

/** The first lines, as text nodes: markup in a file never becomes elements. */
function TextBody({ text, truncated }: { text: string; truncated: boolean }) {
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const { lines, more } = useMemo(() => {
    const all = stripAnsi(text).split("\n");
    // A final newline ends the last line; it doesn't start another.
    if (all[all.length - 1] === "") all.pop();
    return { lines: all.slice(0, MAX_LINES), more: truncated || all.length > MAX_LINES };
  }, [text, truncated]);
  if (lines.length === 0 && !more) return <Note>Empty file</Note>;
  return (
    <div
      style={{
        marginTop: "8px",
        padding: "6px 8px",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        borderRadius: "var(--radius)",
        fontFamily,
        fontSize: "11px",
        lineHeight: 1.4,
        tabSize: 4,
      }}
    >
      <div data-testid="hover-text">
        {lines.map((line, i) => (
          <div key={i} style={{ whiteSpace: "pre", overflow: "hidden", minHeight: "1.4em" }}>
            {line}
          </div>
        ))}
      </div>
      {more && <div style={{ color: "var(--text-secondary)" }}>…</div>}
    </div>
  );
}

/**
 * The preview card for a file link under the pointer, in a portal so it can
 * overflow its pane. It never takes the pointer or focus: keys and clicks
 * always reach the terminal underneath.
 */
export default function FileHoverCard() {
  const card = useFileHoverStore((s) => s.card);
  if (!card) return null;
  const { content } = card;
  const body = content?.body;
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        ...placeCard(card.point, { width: window.innerWidth, height: window.innerHeight }),
        zIndex: 2000,
        width: `${CARD_WIDTH}px`,
        maxHeight: `${CARD_HEIGHT}px`,
        boxSizing: "border-box",
        overflow: "hidden",
        padding: "12px",
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-lg)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {fileName(card.abs)}
      </div>
      {card.state === "loading" && <div style={secondary}>Loading…</div>}
      {card.state === "error" && <div style={secondary}>Can't preview: {card.error}</div>}
      {content && <div style={secondary}>{details(content)}</div>}
      {body?.type === "text" && <TextBody text={body.text} truncated={body.truncated} />}
      {body?.type === "binary" && <Note>Binary file</Note>}
    </div>,
    document.body,
  );
}

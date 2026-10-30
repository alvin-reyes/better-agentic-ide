import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useFileHoverStore } from "../stores/fileHoverStore";
import { useSettingsStore } from "../stores/settingsStore";
import { CARD_HEIGHT, CARD_WIDTH, formatModified, formatSize, placeCard, stripAnsi } from "../lib/filePeek";
import type { HoverContent } from "../lib/hoverPreview";

/** The card's body width: 320 less 24 px of padding and 2 px of border. */
const BODY_WIDTH = CARD_WIDTH - 26;

/** Lines of a text file the card shows. */
const MAX_LINES = 16;

const fileName = (abs: string) => abs.split(/[\\/]/).pop() || abs;

function details({ size, modifiedMs, body }: HoverContent): string {
  const modified = formatModified(modifiedMs, Date.now());
  const parts = [formatSize(size)];
  if (modified) parts.push(`modified ${modified}`);
  if (body.type === "image" && body.width !== undefined && body.height !== undefined) parts.push(`${body.width} × ${body.height}`);
  return parts.join(" · ");
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
 * A `blob:` URL for `blob` while the caller is mounted. It is made in an
 * effect keyed on the Blob, so a re-render never makes another, and revoked
 * in that effect's cleanup.
 */
function useObjectUrl(blob: Blob): string | null {
  const [made, setMade] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setMade({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  // Until the effect runs for a new Blob, the old URL is already revoked.
  return made?.blob === blob ? made.url : null;
}

// Light and dark squares behind an image, so a dark or transparent one stays
// visible on any theme: the one fixed color in an image body.
const CHECKERBOARD = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #d0d0d0 25%, transparent 25%), linear-gradient(-45deg, #d0d0d0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d0d0d0 75%), linear-gradient(-45deg, transparent 75%, #d0d0d0 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
} as const;

/** An image, SVG included, only ever as an `<img>` of a `blob:` URL: its markup never enters the DOM. */
function ImageBody({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return (
    <div style={{ marginTop: "8px", width: `${BODY_WIDTH}px`, height: "200px", borderRadius: "var(--radius)", overflow: "hidden", ...CHECKERBOARD }}>
      {url && <img src={url} decoding="async" alt="" style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />}
    </div>
  );
}

/** Why an image body was not sent, or null. */
function notPreviewed(body: HoverContent["body"]): string | null {
  if (body.type === "tooLarge") return `Too large to preview (over ${formatSize(body.limit)})`;
  if (body.type !== "skipped") return null;
  if (body.reason === "pixels") return `Too large to preview (${body.width} × ${body.height})`;
  if (body.reason === "noSize") return "Can't read image size";
  if (body.reason === "svgFeatures") return "SVG not previewed";
  return null;
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
  const unsent = body ? notPreviewed(body) : null;
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
      {body?.type === "image" && <ImageBody blob={body.blob} />}
      {unsent && <Note>{unsent}</Note>}
    </div>,
    document.body,
  );
}

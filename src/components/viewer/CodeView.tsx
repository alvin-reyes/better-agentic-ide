import MonacoWrapper from "../editor/MonacoWrapper";
import { formatSize, PANEL_TEXT_MAX_BYTES, type TextHead } from "../../lib/textHead";
import { Status } from "./shared";

/**
 * A text file in the side panel: read-only Monaco, with what the panel
 * couldn't show said in place. Loaded with React.lazy from PreviewPanel, so
 * Monaco stays out of the panel's own chunk.
 *
 * *Open in tab* is offered only when the tab can show the same file: it reads
 * the whole file as UTF-8, so not for truncated, lossy or binary heads.
 */
export default function CodeView({
  path,
  head,
  focusOnMount,
  onOpenInTab,
}: {
  path: string;
  head: TextHead;
  /** Focus the editor once it has mounted (⌘⇧B), never on a plain open. */
  focusOnMount: boolean;
  onOpenInTab: () => void;
}) {
  const name = path.split("/").pop() || path;

  if (head.binary) {
    return <Status>Binary file ({formatSize(head.size)}), not shown.</Status>;
  }

  const notes: string[] = [];
  if (head.truncated) {
    notes.push(`Showing the first ${formatSize(PANEL_TEXT_MAX_BYTES)} of ${formatSize(head.size)}.`);
    notes.push("Too large to open in a tab");
  }
  if (head.lossy) notes.push("Not UTF-8 text, can't be edited in a tab");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "4px 12px",
        borderBottom: "1px solid var(--border)",
        fontSize: "11px",
        color: "var(--text-muted)",
        flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          {notes.length === 0
            ? <span>Read-only</span>
            : notes.map((n) => <Status key={n} inline>{n}</Status>)}
        </div>
        {notes.length === 0 && (
          <button
            onClick={onOpenInTab}
            title="Open in a tab, where it can be edited"
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              padding: "2px 8px",
              fontSize: "11px",
              cursor: "pointer",
              color: "var(--text-secondary)",
              flexShrink: 0,
            }}
          >
            Open in tab
          </button>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <MonacoWrapper
          key={path}
          filePath={path}
          content={head.text}
          readOnly
          autoFocus={focusOnMount}
          ariaLabel={`${name}, read-only`}
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import MonacoWrapper from "../editor/MonacoWrapper";
import { formatSize, PANEL_TEXT_MAX_BYTES, type TextHead } from "../../lib/textHead";
import type { PreviewReveal } from "../../stores/tabStore";
import { Status } from "./shared";

/** Lines in `text`, counted without building an array of a 2 MiB string. */
function lineCount(text: string): number {
  let n = 1;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return n;
}

/**
 * A text file in the side panel: read-only Monaco, with what the panel
 * couldn't show said in place. Loaded with React.lazy from PreviewPanel, so
 * Monaco stays out of the panel's own chunk.
 *
 * *Open in tab* is offered only when the tab can show the same file: it reads
 * the whole file as UTF-8, so not for truncated, lossy or binary heads.
 *
 * A `reveal` (a `path:line` click) goes to the editor only when it is for
 * this file; the editor applies it once and reports back with `onRevealed`.
 */
export default function CodeView({
  path,
  head,
  reveal,
  onRevealed,
  focusOnMount,
  onFocused,
  onOpenInTab,
}: {
  path: string;
  head: TextHead;
  /** The tab's pending reveal, for whatever file it names. */
  reveal?: PreviewReveal | null;
  /** The editor has applied the reveal with this nonce. */
  onRevealed?: (nonce: number) => void;
  /** Focus the editor once it has mounted (⌘⇧B), never on a plain open. */
  focusOnMount: boolean;
  /** The editor has taken that focus: the request is spent. */
  onFocused?: () => void;
  onOpenInTab: () => void;
}) {
  const name = path.split("/").pop() || path;
  const mine = reveal && reveal.path === path ? reveal : undefined;
  // A line past the part a truncated file shows, from the latest reveal for
  // this file. Kept after the tab's reveal is cleared, until the next one.
  const [pastShown, setPastShown] = useState<{ nonce: number; line: number | null } | null>(null);
  if (mine && pastShown?.nonce !== mine.nonce) {
    const past = head.truncated && mine.line > lineCount(head.text) ? mine.line : null;
    setPastShown({ nonce: mine.nonce, line: past });
  }

  if (head.binary) {
    return <Status>Binary file ({formatSize(head.size)}), not shown.</Status>;
  }

  const notes: string[] = [];
  if (head.truncated) {
    notes.push(`Showing the first ${formatSize(PANEL_TEXT_MAX_BYTES)} of ${formatSize(head.size)}.`);
    notes.push("Too large to open in a tab");
  }
  if (head.lossy) notes.push("Not UTF-8 text, can't be edited in a tab");
  if (head.truncated && pastShown?.line != null) {
    notes.push(`Line ${pastShown.line} is past the part shown (first ${formatSize(PANEL_TEXT_MAX_BYTES)})`);
  }

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
          onFocused={onFocused}
          reveal={mine}
          onRevealed={onRevealed}
          ariaLabel={`${name}, read-only`}
        />
      </div>
    </div>
  );
}

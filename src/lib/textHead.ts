/**
 * What `read_text_head` returns (`.ade/context/side-panel-files.md`), and the
 * side panel's read cap. Kept apart from CodeView so PreviewPanel can use it
 * without pulling Monaco into its chunk.
 */
export interface TextHead {
  text: string;
  size: number;
  truncated: boolean;
  binary: boolean;
  lossy: boolean;
}

/** The side panel shows at most the first 2 MiB of a text file. */
export const PANEL_TEXT_MAX_BYTES = 2 * 1024 * 1024;

/** "2.0 MB", "48.3 MB", "12.5 KB", "300 bytes" (binary units, as the cap). */
export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

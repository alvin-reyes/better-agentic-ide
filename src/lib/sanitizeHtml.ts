import DOMPurify from "dompurify";

/**
 * Sanitize HTML produced from a user's files (rendered markdown, converted
 * .docx) before it touches the DOM.
 *
 * tauri.conf.json sets `"csp": null`, so injected script would run on the same
 * origin as Tauri IPC and could reach `invoke` (e.g. write to a PTY). A README
 * with `<img onerror=...>` or a `javascript:` link must not be able to do that.
 * DOMPurify strips scripts, event-handler attributes and unsafe URL schemes.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true },
    FORBID_TAGS: ["style", "form", "iframe", "object", "embed"],
  });
}

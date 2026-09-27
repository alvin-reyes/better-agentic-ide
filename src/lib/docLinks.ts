import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Links and images inside rendered documents (markdown, docx, orchestrator
 * chat). The webview is the app itself: following a link would replace the
 * whole app with that page, and relative paths resolve against the app's
 * origin rather than the document's folder.
 */

/** Links that belong in the system browser or mail client. */
export function isExternalUrl(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href);
}

/** src/href values that already point at loadable content. */
export function isAbsoluteUrl(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//");
}

/** Directory of a file path ("/a/b/c.md" -> "/a/b"). */
export function dirname(path: string): string {
  const i = path.replace(/\\/g, "/").lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

/**
 * Resolve a document-relative reference to a file path. Drops any #fragment
 * or ?query and URL-decodes it ("my%20shot.png"). Absolute paths are kept.
 */
export function resolveDocPath(dir: string, ref: string): string {
  let rel = ref.split("#")[0].split("?")[0];
  try {
    rel = decodeURIComponent(rel);
  } catch {
    // Not valid percent-encoding: use as written.
  }
  const parts = (rel.startsWith("/") ? rel : `${dir}/${rel}`).replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return "/" + out.join("/");
}

/** GitHub-style heading id, so "#section-name" links find their heading. */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * Stop any link from navigating the app window. Components that handle their
 * own links (relative files, #anchors) call preventDefault first; anything
 * left that points outside opens in the system browser.
 */
export function installLinkGuard(): void {
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || !(e.target instanceof Element)) return;
    const a = e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    e.preventDefault();
    if (isExternalUrl(href)) openUrl(href).catch(() => {});
  });
}

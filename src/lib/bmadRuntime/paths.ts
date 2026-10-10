/**
 * The path primitives every port shares. The Python's spec was `pathlib`, whose
 * roots are the host's: a POSIX port only ever saw `/`-rooted paths, so the
 * ports written against it treated anything else as relative and glued it onto
 * the working directory — which on Windows turned an absolute `C:\…` into
 * `D:\cwd/C:\…` (the e2e's `not a folder` refusal). These helpers read the same
 * three roots `Path.is_absolute()` does — `/`, a drive letter (`C:\a`, `C:/a`)
 * and a UNC share (`\\server\share`) — and fold Windows separators to the `/`
 * the runtime's strings (and its JSON, which the goldens pin) already use:
 * `C:\a\b` becomes `C:/a/b`, a form `node:fs` accepts on Windows too.
 */

/** `Path.is_absolute()`, host roots included: POSIX, drive letter, UNC. */
export function isAbsolutePath(p: string): boolean {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/** Windows separators folded to the runtime's `/`. */
export function toForwardSlashes(p: string): string {
  return p.includes("\\") ? p.replace(/\\/g, "/") : p;
}

/**
 * Split a path into its root — `/`, `C:/`, `//` (UNC) or `` for a relative
 * path — and the separators-normalized remainder, so a rejoin keeps the root's
 * shape instead of growing a leading slash (`C:/a`, never `/C:/a`).
 */
export function splitPathRoot(text: string): { root: string; rest: string } {
  // A UNC share is told apart by the backslashes it arrived with: `\\srv\x`.
  const unc = text.startsWith("\\\\");
  const p = toForwardSlashes(text);
  const drive = /^([A-Za-z]:)\//.exec(p);
  if (drive) return { root: `${drive[1]}/`, rest: p.slice(drive[0].length) };
  if (unc) return { root: "//", rest: p.replace(/^\/+/, "") };
  if (p.startsWith("/")) return { root: "/", rest: p.replace(/^\/+/, "") };
  return { root: "", rest: p };
}

/**
 * A lexical `Path.resolve()` on the runtime's string paths: separators folded,
 * dot segments collapsed, the root kept (`C:\a\..\b` resolves to `C:/b`).
 * Relative input stays relative; `relativeEmpty` is what an empty result
 * answers, where callers differ (`.` in the ticket store, `` elsewhere). On
 * POSIX paths it is the same simple fold the ports always did, byte for byte.
 */
export function normalizePath(text: string, relativeEmpty = ""): string {
  const { root, rest } = splitPathRoot(text);
  const parts: string[] = [];
  for (const segment of rest.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (root === "") parts.push("..");
      continue;
    }
    parts.push(segment);
  }
  const joined = parts.join("/");
  if (root !== "") return `${root}${joined}`;
  return joined === "" ? relativeEmpty : joined;
}

/**
 * `os.path.join()`, one path at a time: an absolute child replaces the base
 * (a Windows-absolute `C:\…` included, the e2e's bug), a relative one is
 * appended and the result folded.
 */
export function joinPath(base: string, child: string): string {
  if (child === "") return normalizePath(base);
  if (isAbsolutePath(child)) return normalizePath(child);
  const trimmed = toForwardSlashes(base).replace(/\/+$/, "");
  return normalizePath(trimmed === "" ? child : `${trimmed}/${child}`);
}

/** `Path(p).parent`, separators folded; the root's parent is itself. */
export function pathDirname(p: string): string {
  const trimmed = toForwardSlashes(p).replace(/\/+$/, "");
  // A drive root is its own parent; `C:` is drive-relative, a different path.
  if (/^[A-Za-z]:$/.test(trimmed)) return `${trimmed}/`;
  const cut = trimmed.lastIndexOf("/");
  const parent = cut <= 0 ? "/" : trimmed.slice(0, cut);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}

/** `Path(p).name`, separators folded. */
export function pathBasename(p: string): string {
  const trimmed = toForwardSlashes(p).replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  return cut === -1 ? trimmed : trimmed.slice(cut + 1);
}

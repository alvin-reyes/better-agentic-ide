/** Minimal filesystem surface so the runtime port is testable without Tauri or Node. */
export interface Fs {
  readText(p: string): Promise<string>;
  writeText(p: string, body: string): Promise<void>;
  list(p: string): Promise<string[]>;
  exists(p: string): Promise<boolean>;
  mkdir(p: string): Promise<void>;
  delete(p: string): Promise<void>;
}

function withoutTrailingSlash(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

function parentDirectory(p: string): string {
  const cut = p.lastIndexOf("/");
  return cut <= 0 ? "/" : p.slice(0, cut);
}

/**
 * In-memory Fs for tests. Behavior mirrors realFs: list returns the immediate
 * children (files and directories) of a directory, mkdir creates every parent
 * along the path, a write into a directory that does not exist rejects, and
 * delete removes a file, rejecting like unlink (ENOENT for a missing file,
 * EISDIR for a directory).
 */
export function memFs(): Fs {
  const files = new Map<string, string>();
  const directories = new Set<string>(["/"]);

  // A directory exists once mkdir recorded it, or once a file lives under it.
  const isDirectory = (p: string) => {
    if (directories.has(p)) return true;
    const prefix = p === "/" ? "/" : `${p}/`;
    for (const key of files.keys()) if (key.startsWith(prefix)) return true;
    return false;
  };

  return {
    readText: async (p) => {
      const key = withoutTrailingSlash(p);
      const body = files.get(key);
      if (body === undefined) throw new Error(`no such file: ${key}`);
      return body;
    },
    writeText: async (p, body) => {
      const key = withoutTrailingSlash(p);
      const parent = parentDirectory(key);
      if (!isDirectory(parent)) throw new Error(`ENOENT: no such directory: ${parent}`);
      files.set(key, body);
    },
    list: async (p) => {
      const dir = withoutTrailingSlash(p);
      if (!isDirectory(dir)) throw new Error(`ENOENT: no such directory: ${dir}`);
      const prefix = dir === "/" ? "/" : `${dir}/`;
      const children = new Set<string>();
      // Every file and every recorded directory contributes its first path segment.
      for (const key of [...files.keys(), ...directories]) {
        if (!key.startsWith(prefix)) continue;
        const segment = key.slice(prefix.length).split("/", 1)[0];
        if (segment) children.add(segment);
      }
      return [...children];
    },
    exists: async (p) => {
      const key = withoutTrailingSlash(p);
      return files.has(key) || isDirectory(key);
    },
    mkdir: async (p) => {
      const parts = withoutTrailingSlash(p).split("/").filter(Boolean);
      let current = "";
      for (const part of parts) {
        current += `/${part}`;
        directories.add(current);
      }
    },
    delete: async (p) => {
      const key = withoutTrailingSlash(p);
      if (!files.has(key)) {
        if (isDirectory(key)) throw new Error(`EISDIR: cannot delete a directory: ${key}`);
        throw new Error(`ENOENT: no such file: ${key}`);
      }
      files.delete(key);
    },
  };
}

export function realFs(): Fs {
  return {
    readText: (p) => import("node:fs/promises").then((f) => f.readFile(p, "utf8")),
    writeText: (p, body) => import("node:fs/promises").then((f) => f.writeFile(p, body)),
    list: (p) => import("node:fs/promises").then((f) => f.readdir(p)),
    exists: (p) => import("node:fs/promises").then((f) => f.access(p).then(() => true, () => false)),
    // `mkdir` with `recursive: true` resolves to the first created path; discard it for Promise<void>.
    mkdir: (p) => import("node:fs/promises").then((f) => f.mkdir(p, { recursive: true }).then(() => undefined)),
    delete: (p) => import("node:fs/promises").then((f) => f.unlink(p)),
  };
}

/** Minimal filesystem surface so the runtime port is testable without Tauri or Node. */
export interface Fs {
  readText(p: string): Promise<string>;
  writeText(p: string, body: string): Promise<void>;
  list(p: string): Promise<string[]>;
  exists(p: string): Promise<boolean>;
  mkdir(p: string): Promise<void>;
}

export function memFs(): Fs {
  const files = new Map<string, string>();
  const mkdir = async (p: string) => { files.set(p.endsWith("/") ? p : p + "/", ""); };
  return {
    readText: async (p) => files.get(p) ?? Promise.reject(new Error(`no such file: ${p}`)),
    writeText: async (p, body) => { files.set(p, body); },
    list: async (p) =>
      [...files.keys()]
        .filter((k) => k.startsWith(p + "/") && !k.endsWith("/"))
        .map((k) => k.slice(p.length + 1)),
    exists: async (p) => files.has(p) || files.has(p + "/"),
    mkdir,
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
  };
}

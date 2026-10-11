import { invoke } from "@tauri-apps/api/core";
import type { Fs } from "./bmadRuntime/fs";

/**
 * The runtime's `Fs` over Tauri commands, so the board engines run in the
 * webview unchanged.
 *
 * `append` and `delete` are refused rather than backed by commands: the panel
 * reads through the engines and writes whole files, and a generic delete in
 * the webview is a capability nothing here needs. An engine change that starts
 * calling them fails its tests instead of quietly gaining one.
 *
 * `list_directory` skips node_modules, .git, target and dist, none of which
 * hold anything the engines read.
 */
interface Entry {
  name: string;
}

const refused = (method: string) => async (): Promise<never> => {
  throw new Error(`${method} is not available in the board panel`);
};

export const tauriFs: Fs = {
  readText: (p) => invoke<string>("read_file", { path: p }),
  writeText: async (p, body) => {
    await invoke("write_text_file", { path: p, content: body });
  },
  list: async (p) => (await invoke<Entry[]>("list_directory", { path: p })).map((e) => e.name),
  exists: (p) => invoke<boolean>("path_exists", { path: p }),
  mkdir: async (p) => {
    await invoke("create_directory", { path: p });
  },
  isSymlink: (p) => invoke<boolean>("path_is_symlink", { path: p }),
  append: refused("append"),
  delete: refused("delete"),
};

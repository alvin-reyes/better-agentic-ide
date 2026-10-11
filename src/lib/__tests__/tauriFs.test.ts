import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as [string, Record<string, unknown>][]);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    calls.push([cmd, args]);
    switch (cmd) {
      case "read_file": return "body";
      case "list_directory":
        return [
          { name: "a.md", path: "/p/a.md", is_dir: false, size: 1, extension: "md", is_hidden: false },
          { name: ".ade", path: "/p/.ade", is_dir: true, size: 0, extension: null, is_hidden: true },
        ];
      case "path_exists": return true;
      case "path_is_symlink": return false;
      case "create_directory": return args.path;
      case "write_text_file": return undefined;
      default: throw new Error(`unexpected ${cmd}`);
    }
  }),
}));

import { tauriFs } from "../tauriFs";

describe("tauriFs", () => {
  beforeEach(() => { calls.length = 0; });

  it("maps each read method to its command with the argument names Tauri binds", async () => {
    expect(await tauriFs.readText("/p/a.md")).toBe("body");
    expect(await tauriFs.exists("/p")).toBe(true);
    expect(await tauriFs.isSymlink("/p")).toBe(false);
    expect(calls).toEqual([
      ["read_file", { path: "/p/a.md" }],
      ["path_exists", { path: "/p" }],
      ["path_is_symlink", { path: "/p" }],
    ]);
  });

  it("lists names only, hidden entries included", async () => {
    expect(await tauriFs.list("/p")).toEqual(["a.md", ".ade"]);
  });

  it("writes with `content`, the name write_text_file takes", async () => {
    await tauriFs.writeText("/p/x.md", "hi");
    await tauriFs.mkdir("/p/d");
    expect(calls).toEqual([
      ["write_text_file", { path: "/p/x.md", content: "hi" }],
      ["create_directory", { path: "/p/d" }],
    ]);
  });

  it("refuses append and delete rather than exposing them to the webview", async () => {
    await expect(tauriFs.append("/p/x", "y")).rejects.toThrow("append is not available in the board panel");
    await expect(tauriFs.delete("/p/x")).rejects.toThrow("delete is not available in the board panel");
    expect(calls).toEqual([]);
  });
});

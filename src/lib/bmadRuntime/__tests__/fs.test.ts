import { describe, expect, it } from "vitest";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { memFs, realFs } from "../fs";

describe("realFs", () => {
  it("round-trips through a real temp directory", async () => {
    const fs = realFs();
    const root = await mkdtemp(join(tmpdir(), "bmad-runtime-fs-"));
    try {
      const nested = join(root, "a", "b");
      await fs.mkdir(nested);
      await fs.writeText(join(nested, "f.txt"), "hello");
      await fs.writeText(join(root, "top.txt"), "top");

      expect(await fs.readText(join(nested, "f.txt"))).toBe("hello");
      expect((await fs.list(root)).sort()).toEqual(["a", "top.txt"]);
      expect(await fs.exists(nested)).toBe(true);
      expect(await fs.exists(join(nested, "f.txt"))).toBe(true);
      expect(await fs.exists(join(root, "missing"))).toBe(false);
      await expect(fs.writeText(join(root, "missing", "x.txt"), "x")).rejects.toThrow();

      await fs.delete(join(nested, "f.txt"));
      expect(await fs.exists(join(nested, "f.txt"))).toBe(false);
      expect(await fs.list(nested)).toEqual([]);
      await expect(fs.delete(join(nested, "f.txt"))).rejects.toThrow(/ENOENT/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("appends to a real file in place, creating a missing one", async () => {
    // `appendFile`'s O_APPEND, which memlog's `append` needs so two processes
    // appending at the same instant both land.
    const fs = realFs();
    const root = await mkdtemp(join(tmpdir(), "bmad-runtime-append-"));
    try {
      const log = join(root, "log.md");
      await fs.writeText(log, "one\n");
      await fs.append(log, "two\n");
      await fs.append(log, "three\n");
      expect(await fs.readText(log)).toBe("one\ntwo\nthree\n");
      await fs.append(join(root, "missing.md"), "fresh\n");
      expect(await fs.readText(join(root, "missing.md"))).toBe("fresh\n");
      await expect(fs.append(join(root, "nodir", "x.md"), "x")).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("isSymlink tells a link from what it points at, and a missing path from both", async () => {
    const fs = realFs();
    const root = await mkdtemp(join(tmpdir(), "bmad-runtime-link-"));
    try {
      await fs.mkdir(join(root, "target"));
      await symlink(join(root, "target"), join(root, "link"), "dir");
      expect(await fs.isSymlink(join(root, "link"))).toBe(true);
      expect(await fs.isSymlink(join(root, "target"))).toBe(false);
      expect(await fs.isSymlink(join(root, "missing"))).toBe(false);
      expect(await memFs().isSymlink("/anything")).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid UTF-8 instead of decoding it with replacement", async () => {
    // The Python's `read_text(encoding="utf-8")` raises on these bytes, so the
    // validation ports must see a rejection too: a replacement-character
    // decode would let validate_manifests/roster/knowledge answer VALID where
    // the interpreter exits 1.
    const fs = realFs();
    const root = await mkdtemp(join(tmpdir(), "bmad-runtime-utf8-"));
    try {
      const bad = join(root, "bad.json");
      await writeFile(bad, Buffer.from([0xff, 0xfe]));
      await expect(fs.readText(bad)).rejects.toThrow();

      // Valid multi-byte UTF-8 still decodes, so the fatal decoder is not
      // refusing the encodable.
      const good = join(root, "good.json");
      await writeFile(good, "héllo — ✓\n", "utf8");
      expect(await fs.readText(good)).toBe("héllo — ✓\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("memFs", () => {
  it("round-trips text and lists directories", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a");
    await fs.writeText("/p/a/f.txt", "hello");
    expect(await fs.readText("/p/a/f.txt")).toBe("hello");
    expect(await fs.exists("/p/a")).toBe(true);
    expect(await fs.list("/p/a")).toEqual(["f.txt"]);
  });

  it("list returns immediate children: files and directories", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a/b");
    await fs.writeText("/p/a/f.txt", "f");
    await fs.writeText("/p/a/b/deep.txt", "deep");
    await fs.writeText("/p/top.txt", "top");

    expect((await fs.list("/p")).sort()).toEqual(["a", "top.txt"]);
    expect((await fs.list("/p/a")).sort()).toEqual(["b", "f.txt"]);
    expect(await fs.list("/p/a/b")).toEqual(["deep.txt"]);
  });

  it("exists reports a directory that holds a member file", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a/b");
    await fs.writeText("/p/a/b/f.txt", "f");

    expect(await fs.exists("/p/a/b")).toBe(true);
    expect(await fs.exists("/p/a")).toBe(true);
    expect(await fs.exists("/p/a/b/f.txt")).toBe(true);
    expect(await fs.exists("/p/a/missing")).toBe(false);
  });

  it("mkdir creates every parent directory", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a/b/c");

    expect(await fs.exists("/p")).toBe(true);
    expect(await fs.exists("/p/a")).toBe(true);
    expect(await fs.exists("/p/a/b")).toBe(true);
    // A write into a parent the recursive mkdir created must succeed.
    await fs.writeText("/p/a/b/f.txt", "f");
    expect(await fs.readText("/p/a/b/f.txt")).toBe("f");
    // mkdir is idempotent, like realFs mkdir with recursive: true.
    await fs.mkdir("/p/a/b/c");
    expect((await fs.list("/p/a/b")).sort()).toEqual(["c", "f.txt"]);
  });

  it("writeText rejects when the parent directory is missing", async () => {
    const fs = memFs();
    await expect(fs.writeText("/p/a/f.txt", "f")).rejects.toThrow(/ENOENT/);
    await expect(fs.readText("/p/a/f.txt")).rejects.toThrow(/no such file/);
    await expect(fs.list("/p/a")).rejects.toThrow(/ENOENT/);
  });

  it("append adds at the end, creating a missing file like realFs", async () => {
    const fs = memFs();
    await fs.mkdir("/p/ws");
    await fs.writeText("/p/ws/log.md", "one\n");
    await fs.append("/p/ws/log.md", "two\n");
    await fs.append("/p/ws/log.md", "three\n");
    expect(await fs.readText("/p/ws/log.md")).toBe("one\ntwo\nthree\n");
    await fs.append("/p/ws/missing.md", "fresh\n");
    expect(await fs.readText("/p/ws/missing.md")).toBe("fresh\n");
    await expect(fs.append("/p/nodir/x.md", "x")).rejects.toThrow(/ENOENT/);
  });

  it("delete removes a file and rejects like unlink", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a");
    await fs.writeText("/p/a/f.txt", "f");
    await fs.delete("/p/a/f.txt");
    expect(await fs.exists("/p/a/f.txt")).toBe(false);
    expect(await fs.exists("/p/a")).toBe(true);
    expect(await fs.list("/p/a")).toEqual([]);
    await expect(fs.readText("/p/a/f.txt")).rejects.toThrow(/no such file/);
    await expect(fs.delete("/p/a/f.txt")).rejects.toThrow(/ENOENT/);
    await expect(fs.delete("/p/a")).rejects.toThrow(/EISDIR/);
  });
});

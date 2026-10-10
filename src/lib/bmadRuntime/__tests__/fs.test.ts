import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
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
});

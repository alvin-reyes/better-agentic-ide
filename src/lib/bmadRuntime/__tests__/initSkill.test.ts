import { describe, expect, it } from "vitest";
import { parseSkillFrontmatter, walkFiles } from "../initSkill";
import { memFs, type Fs } from "../fs";

/** A tree whose `scripts/self` links back to the project folder, the way a
 * checkout's `scripts/self -> ..` does: `list` follows the link (that is what
 * the host does), `isSymlink` names it, and the listing stops answering after
 * 200 folders so a missing cycle guard fails the assertion instead of hanging
 * the test. */
function treeWithSelfLink(): { fs: Fs; link: string; visited: string[] } {
  const link = "/p/scripts/self";
  const through = (p: string) => (p === link ? "/p" : p.startsWith(`${link}/`) ? `/p${p.slice(link.length)}` : p);
  const base = memFs();
  const visited: string[] = [];
  const fs: Fs = {
    ...base,
    readText: (p) => base.readText(through(p)),
    writeText: (p, body) => base.writeText(through(p), body),
    append: (p, body) => base.append(through(p), body),
    exists: (p) => base.exists(through(p)),
    mkdir: (p) => base.mkdir(through(p)),
    delete: (p) => base.delete(through(p)),
    isSymlink: async (p) => p === link,
    list: async (p) => {
      visited.push(p);
      if (visited.length > 200) return [];
      const entries = await base.list(through(p));
      return p === "/p/scripts" && !entries.includes("self") ? [...entries, "self"] : entries;
    },
  };
  return { fs, link, visited };
}

describe("initSkill's own pieces", () => {
  it("lists a symlinked directory without descending into it, as rglob does", async () => {
    const { fs, link, visited } = treeWithSelfLink();
    await fs.mkdir("/p/scripts");
    await fs.mkdir("/p");
    await fs.writeText("/p/scripts/run.py", "print(1)\n");
    await fs.writeText("/p/readme.md", "# p\n");

    const files = await walkFiles(fs, "/p/scripts");
    // Python's `rglob("*")` yields the link and never walks into it, so the
    // files behind it are not reported.
    expect(files).toEqual(["/p/scripts/run.py"]);
    expect(visited.filter((p) => p.startsWith(`${link}/`))).toEqual([]);
  });

  /** A frontmatter key is a dict key: `__proto__` and `constructor` are fields
   * like any other, and the check that reports undeclared keys must see them. */
  it("keeps a frontmatter key that Object.prototype also carries", () => {
    const { meta } = parseSkillFrontmatter("---\nname: demo\n__proto__: sneaky\nconstructor: plain\n---\n\n# Demo\n");
    expect(meta).not.toBeNull();
    expect(Object.keys(meta!)).toEqual(["name", "__proto__", "constructor"]);
    expect(meta!["__proto__"]).toBe("sneaky");
    expect(meta!.constructor).toBe("plain");
  });
});

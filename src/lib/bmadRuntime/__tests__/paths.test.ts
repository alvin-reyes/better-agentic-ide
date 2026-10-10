import { describe, expect, it } from "vitest";
import { isAbsolutePath, joinPath, normalizePath, pathBasename, pathDirname, splitPathRoot, toForwardSlashes } from "../paths";

/**
 * The Windows-shaped cases the e2e's `not a folder:
 * D:\…\src-tauri/C:\Users\…` refusal came from: a drive-rooted or UNC path is
 * absolute, and joining must not prefix it with the base. The POSIX rows pin the
 * behavior the goldens were captured against, byte for byte.
 */
describe("path primitives", () => {
  it("reads POSIX, drive-rooted and UNC paths as absolute", () => {
    expect(isAbsolutePath("/p")).toBe(true);
    expect(isAbsolutePath("/p/x")).toBe(true);
    expect(isAbsolutePath("C:\\Users\\x")).toBe(true);
    expect(isAbsolutePath("C:/Users/x")).toBe(true);
    expect(isAbsolutePath("\\\\srv\\share\\x")).toBe(true);
    expect(isAbsolutePath("//srv/share/x")).toBe(true);
    expect(isAbsolutePath("p/x")).toBe(false);
    expect(isAbsolutePath("./p")).toBe(false);
    expect(isAbsolutePath("C:")).toBe(false); // drive-relative, as in Python
    expect(isAbsolutePath("")).toBe(false);
  });

  it("folds Windows separators to the runtime's /", () => {
    expect(toForwardSlashes("C:\\Users\\x")).toBe("C:/Users/x");
    expect(toForwardSlashes("/p/x")).toBe("/p/x");
  });

  it("keeps the root's shape when splitting", () => {
    expect(splitPathRoot("/p/x")).toEqual({ root: "/", rest: "p/x" });
    expect(splitPathRoot("C:/Users/x")).toEqual({ root: "C:/", rest: "Users/x" });
    expect(splitPathRoot("C:\\Users\\x")).toEqual({ root: "C:/", rest: "Users/x" });
    expect(splitPathRoot("\\\\srv\\share\\x")).toEqual({ root: "//", rest: "srv/share/x" });
    expect(splitPathRoot("p/x")).toEqual({ root: "", rest: "p/x" });
  });

  it("resolves dot segments without growing a leading slash on a Windows root", () => {
    expect(normalizePath("/p/a/../b")).toBe("/p/b");
    expect(normalizePath("C:\\Users\\x\\..\\y")).toBe("C:/Users/y");
    expect(normalizePath("c:/a/b/./c")).toBe("c:/a/b/c");
    expect(normalizePath("\\\\srv\\share\\a\\..\\b")).toBe("//srv/share/b");
    expect(normalizePath("a/./b")).toBe("a/b");
    expect(normalizePath("a/..")).toBe("");
    expect(normalizePath("a/..", ".")).toBe(".");
    expect(normalizePath("p/../..")).toBe("..");
    expect(normalizePath("/p/../..")).toBe("/");
  });

  it("returns an absolute child unchanged in shape, base ignored", () => {
    // The e2e's exact shape: joining must not prepend `D:\a\repo`.
    expect(joinPath("D:\\a\\repo", "C:\\Users\\x\\_bmad-output/backlog")).toBe("C:/Users/x/_bmad-output/backlog");
    expect(joinPath("D:\\a\\repo", "C:\\Users\\x\\_bmad-output/backlog")).not.toContain("D:");
    expect(joinPath("/p", "C:/Users/x")).toBe("C:/Users/x");
    expect(joinPath("/p", "/other")).toBe("/other");
  });

  it("joins a relative child onto either host's base", () => {
    expect(joinPath("/p", "backlog")).toBe("/p/backlog");
    expect(joinPath("D:\\a\\repo", "backlog")).toBe("D:/a/repo/backlog");
    expect(joinPath("D:\\a\\repo\\", "sub\\backlog")).toBe("D:/a/repo/sub/backlog");
    expect(joinPath("/p", "")).toBe("/p");
  });

  it("parents and names a drive root without a drive-relative `C:`", () => {
    expect(pathDirname("/a/b")).toBe("/a");
    expect(pathDirname("/a")).toBe("/");
    expect(pathDirname("C:\\a\\b")).toBe("C:/a");
    expect(pathDirname("C:/a")).toBe("C:/");
    expect(pathDirname("C:/")).toBe("C:/"); // its own parent: the walk-up ends
    expect(pathBasename("/a/b")).toBe("b");
    expect(pathBasename("C:\\a\\b")).toBe("b");
  });
});

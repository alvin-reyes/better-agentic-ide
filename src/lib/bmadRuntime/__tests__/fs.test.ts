import { describe, expect, it } from "vitest";
import { memFs } from "../fs";

describe("memFs", () => {
  it("round-trips text and lists directories", async () => {
    const fs = memFs();
    await fs.mkdir("/p/a");
    await fs.writeText("/p/a/f.txt", "hello");
    expect(await fs.readText("/p/a/f.txt")).toBe("hello");
    expect(await fs.exists("/p/a")).toBe(true);
    expect(await fs.list("/p/a")).toEqual(["f.txt"]);
  });
});

import { describe, expect, it } from "vitest";
import { readFrontmatter } from "../frontmatter";

describe("readFrontmatter", () => {
  it("reads top-level key: value pairs", () => {
    expect(readFrontmatter("---\nstatus: draft\ntitle: Cart total\n---\n# Body\n")).toEqual({ status: "draft", title: "Cart total" });
  });

  it("returns an empty map when there is no frontmatter", () => {
    expect(readFrontmatter("# Just a doc\nstatus: not frontmatter\n")).toEqual({});
  });

  it("returns null when the opening fence is never closed", () => {
    expect(readFrontmatter("---\nstatus: draft\n# Body with no closing fence\n")).toBeNull();
  });

  it("skips indented lines, list items and comments, so nested maps cannot break it", () => {
    const text = "---\nstatus: final\ntokens:\n  color:\n    primary: '#fff'\n- stray\n# a comment\nname: ux\n---\n";
    expect(readFrontmatter(text)).toEqual({ status: "final", tokens: "", name: "ux" });
  });

  it("keeps a value that contains colons whole, and strips one pair of quotes", () => {
    expect(readFrontmatter('---\ngoal: ship it: soon\ntitle: "Pay: later"\nother: \'x\'\n---\n')).toEqual({
      goal: "ship it: soon",
      title: "Pay: later",
      other: "x",
    });
  });

  it("accepts CRLF line endings and a byte order mark", () => {
    expect(readFrontmatter("﻿---\r\nstatus: complete\r\n---\r\n")).toEqual({ status: "complete" });
  });
});

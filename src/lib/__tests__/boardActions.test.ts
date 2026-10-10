import { describe, expect, it } from "vitest";
import { memFs } from "../bmadRuntime/fs";
import { approveStory, approveStoryMarkdown, approveTicket, isSafeRef } from "../boardActions";

const STORY = "# Story 1.1: Cart\n\n## Status\n\nDraft\n\n## Acceptance Criteria\n\n1. Draft totals add up\n";

describe("approveStoryMarkdown", () => {
  it("changes only the status line", () => {
    expect(approveStoryMarkdown(STORY)).toBe(STORY.replace("\n\nDraft\n\n", "\n\nApproved\n\n"));
  });

  it("keeps CRLF line endings and indentation byte for byte", () => {
    const crlf = "# Story 1.1: Cart\r\n\r\n## Status\r\n\r\n  draft\r\n\r\n## Tasks\r\n- Draft it\r\n";
    expect(approveStoryMarkdown(crlf)).toBe(crlf.replace("  draft\r\n", "  Approved\r\n"));
  });

  it.each([
    ["an approved story", STORY.replace("\nDraft\n", "\nApproved\n")],
    ["no Status section", "# Story 1.1: Cart\n\nDraft\n"],
    ["an empty Status section", "## Status\n\n## Tasks\n"],
  ])("returns null for %s", (_, md) => {
    expect(approveStoryMarkdown(md)).toBeNull();
  });
});

describe("approveStory", () => {
  it("rewrites the file, and refuses a story that is not a draft", async () => {
    const fs = memFs();
    await fs.mkdir("/p/docs/stories");
    await fs.writeText("/p/docs/stories/1.1.cart.md", STORY);
    await approveStory("/p", "docs/stories/1.1.cart.md", fs);
    expect(await fs.readText("/p/docs/stories/1.1.cart.md")).toContain("## Status\n\nApproved\n");
    await expect(approveStory("/p", "docs/stories/1.1.cart.md", fs)).rejects.toThrow("Story is not a draft");
  });

  // devStoryLocation comes from core-config.yaml, which a cloned repo controls.
  it.each([
    ["a parent-relative path", "../x.md", "/x.md"],
    ["a path that climbs out through a subfolder", "docs/../../x.md", "/x.md"],
    ["an absolute path", "/etc/x.md", "/etc/x.md"],
    ["a sibling folder sharing the root's prefix", "../p2/x.md", "/p2/x.md"],
  ])("refuses %s, writing nothing", async (_, file, abs) => {
    const fs = memFs();
    await fs.mkdir("/p");
    await fs.mkdir("/etc");
    await fs.mkdir("/p2");
    await fs.writeText(abs, STORY);
    await expect(approveStory("/p", file, fs)).rejects.toThrow("Story is outside the project");
    expect(await fs.readText(abs)).toBe(STORY);
  });
});

describe("approveTicket", () => {
  it("writes .ade/approvals/<ref> with the date", async () => {
    const fs = memFs();
    await fs.mkdir("/p");
    await approveTicket("/p", "1.6a", fs, "2026-10-10");
    expect(await fs.readText("/p/.ade/approvals/1.6a")).toBe("2026-10-10\n");
  });

  it.each(["", ".", "..", "a/b", "..\\x", "../1.1"])("refuses the unsafe ref %j", async (ref) => {
    expect(isSafeRef(ref)).toBe(false);
    const fs = memFs();
    await fs.mkdir("/p");
    await expect(approveTicket("/p", ref, fs, "2026-10-10")).rejects.toThrow(/cannot be approved/);
  });
});

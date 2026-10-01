import { describe, it, expect } from "vitest";
import { agentCatalog } from "../projectMethodology";

/**
 * The role bodies are double-quoted strings, where a backtick needs no escape.
 * Written as \\` they emitted a literal backslash into every generated agent
 * file, so paths rendered as \`docs/architecture.md\` instead of code spans —
 * 30 of them across six of the eight agents. Harmless to run, but it is noise
 * in a prompt the agent reads every time, and it renders wrong anywhere the
 * file is displayed as Markdown.
 */
const BACKSLASH_BACKTICK = "\\`";

describe("generated agent files are clean Markdown", () => {
  const files = agentCatalog().map((e) => e.file);

  it("generates agent files at all, so this test is not vacuous", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never emits a backslash before a backtick", () => {
    const bad = files
      .filter((f) => f.content.includes(BACKSLASH_BACKTICK))
      .map((f) => `${f.path} (${f.content.split(BACKSLASH_BACKTICK).length - 1})`);
    expect(bad, `escaped backticks leak into: ${bad.join(", ")}`).toEqual([]);
  });

  it("still uses code spans, so the fix did not just delete the backticks", () => {
    const withSpans = files.filter((f) => /`[^`\n]+`/.test(f.content));
    expect(withSpans.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Story 9, T8 (R6): the guide's terminals page documents what a typed
// command does that the guard can't see, and how to pass a secret (D3).
// It is documentation, not a question asked of the user (D1).
const page = readFileSync(join(__dirname, "../../../docs/guide/terminal.md"), "utf8").replace(/\r\n/g, "\n");

/** The section under `## heading`, up to the next `## `. */
function section(text: string, heading: string): string | null {
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start < 0) return null;
  const rest = text.slice(start + 1);
  const next = rest.indexOf("\n## ", 3);
  return next < 0 ? rest : rest.slice(0, next);
}

describe("the guide's terminals page", () => {
  it("the_guide_documents_aliases_and_secrets", () => {
    const body = section(page, "Opening terminals from a terminal");
    expect(body, "the section exists").not.toBeNull();
    const text = body!.toLowerCase();
    for (const word of ["sub-terminal", "alias", "rc", "secret", "$ade_hook_bin", "guard"]) {
      expect(text, word).toContain(word);
    }
  });

  // Review finding M1: the known typing failure a reader can cause.
  it("the_guide_names_the_echo_off_start_up_prompt", () => {
    const text = section(page, "Opening terminals from a terminal")!.toLowerCase();
    expect(text).toContain("read -s");
    expect(text).toContain("echo off");
  });
});

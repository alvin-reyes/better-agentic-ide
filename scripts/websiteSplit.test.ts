import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The website lives in better-ade/ade-website (ADR 0047). This repo keeps the
 * project documents in docs/ and the installers, which the website's build
 * fetches from here by path (.ade/context/website.md).
 */
const root = resolve(__dirname, "..");
const docs = (p: string) => resolve(root, "docs", p);

describe("the website lives in ade-website", () => {
  it("docs/ no longer holds the site", () => {
    const site = ["_config.yml", "_layouts", "_includes", "_data", "assets", "index.html", "guide", "training", "agent-hub", "ade_logo.png", "robots.txt"];
    expect(site.filter((p) => existsSync(docs(p)))).toEqual([]);
  });

  it("keeps the installers where ade-website fetches them", () => {
    expect(readFileSync(docs("install.sh"), "utf8").startsWith("#!")).toBe(true);
    expect(existsSync(docs("install.ps1"))).toBe(true);
  });

  it("the README points at the site, not at files that moved", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    expect(readme).not.toMatch(/docs\/(assets|guide|index\.html)/);
  });
});

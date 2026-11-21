import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MCP_CATALOG } from "../src/data/mcpCatalog";

/**
 * The README states how many MCP servers the library has; that is a claim
 * about the app, so it is checked against the catalog. The guide's MCP and
 * Orgo sections are checked against this code in better-ade/ade-website.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");
const readme = read("README.md");

describe("the MCP library in the README", () => {
  it("the README count matches the catalog", () => {
    const m = readme.match(/(\d+) curated MCP servers/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(MCP_CATALOG.length);
  });
});

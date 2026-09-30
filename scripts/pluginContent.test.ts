import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENT_CATALOG } from "../src/data/curatedAgents";
import { generatedPluginFiles, rolePrompt, SUB_AGENT_IDS } from "../src/lib/pluginContent";

const ROOT = join(__dirname, "..", "claude-plugin", "plugins", "ade");

describe("ADE Claude Code plugin", () => {
  it("extracts the Claude role prompt of every profile it ships", () => {
    for (const p of AGENT_CATALOG.filter((x) => x.category === "Web3" || x.category === "Architects")) {
      expect(rolePrompt(p).length).toBeGreaterThan(40);
    }
  });

  it("makes Web3 engineers agents and architects skills", () => {
    const files = generatedPluginFiles();
    const shipped = AGENT_CATALOG.filter((p) => SUB_AGENT_IDS.has(p.id) || p.category === "Web3");
    expect(files.filter((f) => f.path.startsWith("agents/"))).toHaveLength(shipped.length);
    expect(files.filter((f) => f.path.startsWith("skills/"))).toHaveLength(AGENT_CATALOG.filter((p) => p.category === "Architects").length);
    for (const f of files) expect(f.content).toMatch(/^---\nname: [a-z0-9-]+\ndescription: ".+"\n/);
  });

  it("matches the files in claude-plugin/ (npm run gen:plugin to update)", () => {
    for (const f of generatedPluginFiles()) {
      const out = join(ROOT, f.path);
      if (process.env.UPDATE_PLUGIN) {
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, f.content);
      }
      expect(existsSync(out), f.path).toBe(true);
      expect(readFileSync(out, "utf8"), f.path).toBe(f.content);
    }
  });
});

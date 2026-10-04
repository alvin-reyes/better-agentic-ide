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

/**
 * The plugin is installed from the marketplace by people who may never have
 * run ADE. BMAD ships with an ADE project, not with the plugin, so a role's
 * BMAD guidance must not travel into it.
 */
describe("plugin files carry no ADE-project guidance", () => {
  it("strips the BMAD tasks section the definitions carry", () => {
    const files = generatedPluginFiles();
    // Not vacuous: the source definitions really do contain it.
    const dev = rolePrompt(AGENT_CATALOG.find((a) => a.roleId === "developer")!);
    expect(dev).not.toContain("BMAD tasks");
    expect(dev).not.toContain("Project knowledge");
    for (const f of files) {
      expect(f.content, `${f.path} names a /BMad: command`).not.toContain("/BMad:");
      expect(f.content, `${f.path} points at .bmad-core`).not.toContain(".bmad-core");
      expect(f.content, `${f.path} points at the knowledge store`).not.toContain(".ade/knowledge");
    }
  });
});

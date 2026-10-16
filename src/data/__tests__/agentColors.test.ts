import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  AGENT_COLOR_HEX,
  AGENT_COLOR_NAMES,
  NEUTRAL_HEX,
  ROLE_COLORS,
  roleColor,
  roleColorHex,
} from "../agentColors";
import { ROLES } from "../roles";
import { AGENT_CATALOG } from "../curatedAgents";
import { themePresets } from "../../stores/settingsStore";

/** WCAG 2.x relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const HEX = /^#[0-9a-f]{6}$/i;

describe("the agent color map", () => {
  it("covers every vendored role with one of Claude Code's eight colors", () => {
    expect([...AGENT_COLOR_NAMES].sort()).toEqual(
      ["blue", "cyan", "green", "orange", "pink", "purple", "red", "yellow"],
    );
    expect(Object.keys(ROLE_COLORS).sort()).toEqual(ROLES.map((r) => r.id).sort());
    for (const [id, name] of Object.entries(ROLE_COLORS)) {
      expect(AGENT_COLOR_NAMES, `${id} has "${name}"`).toContain(name);
    }
    for (const role of ROLES) expect(roleColor(role.id)).toBe(ROLE_COLORS[role.id]);
    expect(roleColor(null)).toBeNull();
    expect(roleColor("Explore")).toBeNull();
    expect(roleColorHex(null)).toBe(NEUTRAL_HEX.dark);
    expect(roleColorHex("Explore")).toBe(NEUTRAL_HEX.dark);
    expect(roleColorHex("qa")).toBe(AGENT_COLOR_HEX.yellow.dark);
  });

  it("keeps the owner's mapping", () => {
    expect(ROLE_COLORS).toMatchObject({
      "adversarial-reviewer": "red",
      architect: "blue",
      "product-manager": "purple",
      designer: "pink",
      "scrum-master": "cyan",
      developer: "green",
      qa: "yellow",
      devops: "orange",
      "security-engineer": "red",
      sre: "orange",
      "technical-writer": "purple",
    });
    // The rest of the table, as the approved plan gives it.
    expect(ROLE_COLORS).toMatchObject({
      analyst: "purple",
      advisor: "purple",
      "brainstorming-architect": "blue",
      "solutions-engineer": "blue",
      "product-owner": "cyan",
      "engineering-manager": "cyan",
      "support-engineer": "yellow",
      "release-manager": "orange",
    });
  });

  it("fills reach 3:1 on every app theme surface", () => {
    expect(themePresets.length).toBeGreaterThan(0);
    const fills = [...AGENT_COLOR_NAMES.map((n) => [n, AGENT_COLOR_HEX[n].dark] as const), ["neutral", NEUTRAL_HEX.dark] as const];
    for (const preset of themePresets) {
      for (const surface of ["bgPrimary", "bgSecondary", "bgTertiary"] as const) {
        const bg = preset.colors[surface];
        expect(bg, `${preset.id} ${surface}`).toMatch(HEX);
        for (const [name, hex] of fills) {
          const ratio = contrast(hex, bg);
          expect(ratio, `${name} ${hex} on ${preset.id} ${surface} ${bg}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it("site values reach their contrast", () => {
    for (const name of AGENT_COLOR_NAMES) {
      const { dark, light } = AGENT_COLOR_HEX[name];
      expect(dark).toMatch(HEX);
      expect(light).toMatch(HEX);
      for (const bg of ["#ffffff", "#f7f7f8", "#f4f4f6"]) {
        expect(contrast(light, bg), `${name} light on ${bg}`).toBeGreaterThanOrEqual(3);
      }
      for (const bg of ["#08090b", "#111216", "#0b0c0f"]) {
        expect(contrast(dark, bg), `${name} dark on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const bg of ["#ffffff", "#f7f7f8", "#f4f4f6"]) {
      expect(contrast(NEUTRAL_HEX.light, bg), `neutral light on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("this repo's own sub-agents use the map's colors", () => {
    const dir = join(__dirname, "..", "..", "..", ".claude", "agents");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBe(8);
    for (const f of files) {
      const id = f.replace(/\.md$/, "");
      const front = readFileSync(join(dir, f), "utf8").split("---")[1];
      expect(front, f).toMatch(new RegExp(`\\ncolor: ${roleColor(id)}\\n`));
    }
  });

  it("every curated profile takes its role's color", () => {
    expect(AGENT_CATALOG.length).toBe(47);
    for (const p of AGENT_CATALOG) {
      expect(p.color, p.id).toBe(roleColorHex(p.roleId));
      expect(roleColor(p.roleId), `${p.id} has a mapped role`).not.toBeNull();
    }
    const source = readFileSync(join(__dirname, "..", "curatedAgents.ts"), "utf8");
    // CatalogAgent's own `color: string` and its derived value are allowed;
    // a literal color value on a profile is not.
    expect(source).not.toMatch(/\bcolor:\s*["'`#]/);
    expect(source).not.toMatch(/#[0-9a-f]{6}\b/i);
  });
});

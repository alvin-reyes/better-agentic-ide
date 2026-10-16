import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AGENT_COLOR_HEX, AGENT_COLOR_NAMES, NEUTRAL_HEX, roleColor } from "../src/data/agentColors";
import { ROLES as VENDORED_ROLES, getRole } from "../src/data/roles";
import { ROLES as CORE_ROLES } from "../src/lib/projectMethodology";

/**
 * The website shows the same agent colors as the app (ADR 0007). It is held to
 * the map in src/data/agentColors.ts by this test, not copied by hand.
 */
const CSS = readFileSync(resolve(__dirname, "../docs/assets/css/site.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const HTML = readFileSync(resolve(__dirname, "../docs/index.html"), "utf8");
const doc = new DOMParser().parseFromString(HTML, "text/html");

interface Rule {
  /** The selector list, each selector trimmed and whitespace-collapsed. */
  selectors: string[];
  body: string;
  /** The enclosing at-rule preludes, outermost first. */
  media: string[];
  index: number;
}

/** Every style rule in the stylesheet, in order, with its enclosing @media; keyframes are skipped. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const stack: string[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const close = css.indexOf("}", i);
    if (close !== -1 && (open === -1 || close < open)) {
      stack.pop();
      i = close + 1;
      continue;
    }
    if (open === -1) break;
    const prelude = css.slice(i, open).trim().replace(/\s+/g, " ");
    if (prelude.startsWith("@keyframes")) {
      let depth = 1;
      let j = open + 1;
      while (depth > 0 && j < css.length) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") depth--;
        j++;
      }
      i = j;
      continue;
    }
    if (prelude.startsWith("@")) {
      stack.push(prelude);
      i = open + 1;
      continue;
    }
    const end = css.indexOf("}", open);
    rules.push({
      selectors: prelude.split(",").map((s) => s.trim()),
      body: css.slice(open + 1, end),
      media: [...stack],
      index: rules.length,
    });
    i = end + 1;
  }
  return rules;
}

const RULES = parseRules(CSS);

/** The value of the last `prop` declared in a rule body, or undefined. */
function decl(body: string, prop: string): string | undefined {
  const re = new RegExp(`(?:^|;|\\s)${prop.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+)`, "g");
  let value: string | undefined;
  for (let m = re.exec(body); m; m = re.exec(body)) value = m[1].trim();
  return value;
}

/** Rules whose selector list has exactly `selector`, optionally inside a matching @media. */
function rulesFor(selector: string, media?: RegExp): Rule[] {
  return RULES.filter(
    (r) => r.selectors.includes(selector) && (media ? r.media.some((m) => media.test(m)) : r.media.length === 0),
  );
}

/** The value `prop` gets from the last rule naming `selector` that declares it. */
function valueOf(selector: string, prop: string, media?: RegExp): string | undefined {
  return rulesFor(selector, media).map((r) => decl(r.body, prop)).filter(Boolean).pop();
}

const NAMES = [...AGENT_COLOR_NAMES, "none"] as const;
const hexOf = (name: (typeof NAMES)[number]) => (name === "none" ? NEUTRAL_HEX : AGENT_COLOR_HEX[name]);
const DARK_MEDIA = /prefers-color-scheme:\s*dark/;
const REDUCED = /prefers-reduced-motion:\s*reduce/;

describe("the website's agent colors follow the map", () => {
  it("tokens equal the map in both themes and on terminal surfaces", () => {
    for (const name of NAMES) {
      const token = `--agent-${name}`;
      const { dark, light } = hexOf(name);
      expect(valueOf(":root", token)?.toLowerCase(), `${token} on :root`).toBe(light);
      expect(valueOf(':root:not([data-theme="light"])', token, DARK_MEDIA)?.toLowerCase(), `${token} in the system-dark block`).toBe(dark);
      expect(valueOf(':root[data-theme="dark"]', token)?.toLowerCase(), `${token} in the toggled-dark block`).toBe(dark);
      expect(valueOf(".feat-media--live", token)?.toLowerCase(), `${token} on .feat-media--live`).toBe(dark);
      expect(valueOf(".feat-media.tree", token)?.toLowerCase(), `${token} on .feat-media.tree`).toBe(dark);
    }
  });

  it("every agent-colored element takes its color from the token", () => {
    for (const name of NAMES) {
      expect(valueOf(`[data-agent-color="${name}"]`, "--agent-c"), name).toBe(`var(--agent-${name})`);
    }
    expect(valueOf(".fleetx-bar", "background")).toBe("var(--agent-c)");

    const hover = rulesFor(".org-node:hover");
    const role = rulesFor(".org-node[data-agent-color]").filter((r) => decl(r.body, "border-left"));
    expect(hover.length, ".org-node:hover rule").toBeGreaterThan(0);
    expect(role.length, ".org-node[data-agent-color] border-left rule").toBeGreaterThan(0);
    const roleRule = role[role.length - 1];
    expect(decl(roleRule.body, "border-left")).toMatch(/var\(--agent-c\)/);
    expect(roleRule.index, "the role border comes after .org-node:hover").toBeGreaterThan(hover[hover.length - 1].index);
    expect(valueOf(".org-node[data-agent-color]:hover", "border-left-color")).toBe("var(--agent-c)");

    expect(valueOf(".feat-media.tree [data-agent-color]", "color")).toBe("var(--agent-c)");
    expect(valueOf(".fleetx-run i", "background")).toBe("var(--agent-none)");
  });

  it("no hard-coded agent color on the site", () => {
    const watched = [".fleetx-bar", ".fleetx-edge", ".fleetx-run i", ".org-node[data-agent-color]", ".feat-media.tree [data-agent-color]"];
    const props = ["background", "background-color", "border", "border-left", "border-color", "color"];
    const literal = /#[0-9a-f]{3,8}\b|rgba?\(/i;
    const offenders: string[] = [];
    for (const r of RULES) {
      if (!r.selectors.some((s) => watched.some((w) => s.includes(w)))) continue;
      for (const p of props) {
        const v = decl(r.body, p);
        if (v && literal.test(v)) offenders.push(`${r.selectors.join(", ")} { ${p}: ${v} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("org chart nodes are the nineteen roles, named and colored by the map", () => {
    const nodes = [...doc.querySelectorAll<HTMLElement>(".org-node[data-role]")];
    expect(nodes.map((n) => n.dataset.role).sort()).toEqual(VENDORED_ROLES.map((r) => r.id).sort());
    for (const n of nodes) {
      const id = n.dataset.role!;
      expect(n.querySelector("b")?.textContent, id).toBe(getRole(id)!.title);
      expect(n.dataset.agentColor, id).toBe(roleColor(id));
    }
    const you = doc.querySelector<HTMLElement>(".org-node--you");
    expect(you).not.toBeNull();
    expect(you!.hasAttribute("data-agent-color")).toBe(false);
  });

  it("the agents listing is colored by the map", () => {
    const pre = doc.querySelector(".feat-media.tree pre");
    expect(pre).not.toBeNull();
    const spans = [...pre!.querySelectorAll<HTMLElement>("span[data-agent-color]")];
    expect(spans.map((s) => s.textContent).sort()).toEqual(CORE_ROLES.map((r) => `${r.name}.md`).sort());
    for (const s of spans) {
      const id = s.textContent!.replace(/\.md$/, "");
      expect(s.dataset.agentColor, id).toBe(roleColor(id));
    }
  });

  it("fleet demo shows role by color and running by shape", () => {
    const lanes = [...doc.querySelectorAll<HTMLElement>(".fleetx-lane")];
    expect(lanes.length).toBeGreaterThan(0);
    const names: string[] = [];
    for (const lane of lanes) {
      const name = lane.querySelector(".fleetx-name")!.textContent!.replace(/^↳\s*/, "").trim();
      names.push(name);
      const expected = name === "Explore" || name === "Plan" ? "none" : roleColor(name);
      expect(expected, `${name} is a role or a Claude Code built-in`).not.toBeNull();
      expect(lane.dataset.agentColor, name).toBe(expected);
      const edges = lane.querySelectorAll(".fleetx-track .fleetx-edge").length;
      expect(edges, `${name} edge`).toBe(lane.classList.contains("is-running") ? 1 : 0);
    }
    expect(names).toContain("adversarial-reviewer");
    expect(lanes.some((l) => l.classList.contains("is-running"))).toBe(true);

    const label = doc.querySelector(".fleetx[role='img']")?.getAttribute("aria-label") ?? "";
    expect(label).toMatch(/adversarial-reviewer/);
    expect(label).toMatch(/running/);

    expect(valueOf(".fleetx-edge", "animation")).toMatch(/\bfleetx-pulse\b/);
    expect(valueOf(".fleetx-edge", "animation", REDUCED)).toBe("none");

    const statusOpacity = RULES.filter(
      (r) =>
        r.selectors.some((s) => /\.fleetx-(lane|bar)/.test(s) && /\.is-|:not\(/.test(s)) &&
        decl(r.body, "opacity") !== undefined,
    );
    expect(statusOpacity.map((r) => r.selectors.join(", "))).toEqual([]);
  });
});

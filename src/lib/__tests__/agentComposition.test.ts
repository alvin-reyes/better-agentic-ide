import { describe, it, expect } from "vitest";
import { composeRoleMarkdown, roleFileName } from "../agentComposition";
import { getRole } from "../../data/roles";
import { getDomain } from "../../data/domains";

const architect = getRole("architect")!;
const security = getDomain("security")!;

describe("composeRoleMarkdown", () => {
  it("includes the role title, mission and boundaries", () => {
    const md = composeRoleMarkdown(architect);
    expect(md.includes(architect.title)).toBe(true);
    expect(md.includes(architect.mission)).toBe(true);
    expect(md.includes(architect.boundaries)).toBe(true);
  });

  it("lists every owned artifact", () => {
    const md = composeRoleMarkdown(architect);
    for (const glob of architect.owns) {
      expect(md.includes(glob), `missing owned artifact ${glob}`).toBe(true);
    }
  });

  it("appends the domain focus when a domain is given", () => {
    const md = composeRoleMarkdown(architect, security);
    expect(md.includes(security.focus)).toBe(true);
    expect(md.includes(security.title)).toBe(true);
  });

  it("omits any domain section when no domain is given", () => {
    expect(composeRoleMarkdown(architect).includes("## Focus")).toBe(false);
  });

  it("keeps the role's own text intact when a domain is added", () => {
    const withDomain = composeRoleMarkdown(architect, security);
    expect(withDomain.includes(architect.boundaries)).toBe(true);
  });

  it("produces markdown headings, not a flat blob", () => {
    const md = composeRoleMarkdown(architect, security);
    expect(md.split("\n").filter((l) => l.startsWith("#")).length).toBeGreaterThan(2);
  });
});

describe("roleFileName", () => {
  it("names a bare role file", () => {
    expect(roleFileName("architect")).toBe("architect.md");
  });

  it("names a role-and-domain file", () => {
    expect(roleFileName("architect", "security")).toBe("architect-security.md");
  });
});

import { describe, it, expect } from "vitest";
import { CURATED_AGENTS } from "../curatedAgents";
import { DOMAINS, getDomain } from "../domains";
import { getRole } from "../roles";

/** Every id that existed in agentProfiles.ts. None may disappear. */
const LEGACY_IDS = [
  "backend-api", "backend-db", "backend-auth",
  "frontend-ui", "frontend-css", "frontend-state",
  "devops-docker", "devops-ci", "devops-infra", "devops-k8s",
  "test-unit", "test-e2e", "test-perf",
  "general-debug", "general-review", "general-docs", "general-interview",
  "general-linkedin-leader", "general-git", "general-brainstorm",
  "general-architect", "general-cofounder",
];

describe("curated agents", () => {
  it("still resolves every legacy profile id", () => {
    const ids = CURATED_AGENTS.map((a) => a.id);
    for (const legacy of LEGACY_IDS) {
      expect(ids.includes(legacy), `legacy id "${legacy}" disappeared`).toBe(true);
    }
  });

  it("has exactly 22 curated agents", () => {
    expect(CURATED_AGENTS.length).toBe(22);
  });

  it("points every curated agent at a real role", () => {
    for (const agent of CURATED_AGENTS) {
      expect(getRole(agent.roleId), `${agent.id} -> role ${agent.roleId}`).toBeTruthy();
    }
  });

  it("points every curated agent with a domain at a real domain", () => {
    for (const agent of CURATED_AGENTS) {
      if (!agent.domainId) continue;
      expect(getDomain(agent.domainId), `${agent.id} -> domain ${agent.domainId}`).toBeTruthy();
    }
  });

  it("gives every curated agent a non-empty name and description", () => {
    for (const agent of CURATED_AGENTS) {
      expect(agent.name.length, `${agent.id} name`).toBeGreaterThan(0);
      expect(agent.description.length, `${agent.id} description`).toBeGreaterThan(0);
    }
  });

  it("has unique domain ids and non-empty focus text", () => {
    expect(new Set(DOMAINS.map((d) => d.id)).size).toBe(DOMAINS.length);
    for (const domain of DOMAINS) {
      expect(domain.focus.length, `${domain.id} focus`).toBeGreaterThan(40);
      expect(domain.keywords.length, `${domain.id} keywords`).toBeGreaterThan(0);
    }
  });

  it("leaves no domain orphaned", () => {
    const used = new Set(CURATED_AGENTS.map((a) => a.domainId).filter(Boolean));
    for (const domain of DOMAINS) {
      expect(used.has(domain.id), `domain "${domain.id}" is unused`).toBe(true);
    }
  });
});

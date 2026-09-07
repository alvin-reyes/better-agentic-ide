import { getDomain, type Domain } from "./domains";

export interface CuratedAgent {
  id: string; // the legacy profile id, preserved
  name: string; // the legacy display name, preserved
  icon: string;
  color: string;
  description: string;
  roleId: string;
  domainId?: string;
  /**
   * Routing keywords, when the domain's are not the right ones — which in
   * practice means the agents that have no domain at all. Without this an
   * agent is unroutable: `routeTask` scores only against keywords, so a
   * domainless agent could never win, and "write a readme for the project"
   * matched nothing at all.
   */
  keywords?: string[];
}

export type AgentCategory = Domain["category"];

export const CURATED_AGENTS: CuratedAgent[] = [
  // Backend
  {
    id: "backend-api",
    name: "API Builder",
    icon: "{}",
    color: "#3fb950",
    description: "Design and build REST/GraphQL APIs, routes, controllers, and middleware",
    roleId: "dev",
    domainId: "backend-api",
  },
  {
    id: "backend-db",
    name: "Database Engineer",
    icon: "DB",
    color: "#3fb950",
    description: "Schema design, migrations, queries, and database optimization",
    roleId: "dev",
    domainId: "database",
  },
  {
    id: "backend-auth",
    name: "Auth Architect",
    icon: "\u{1F512}",
    color: "#3fb950",
    description: "Authentication, authorization, OAuth, JWT, and security",
    roleId: "architect",
    domainId: "security",
  },

  // Frontend
  {
    id: "frontend-ui",
    name: "UI Builder",
    icon: "UI",
    color: "#58a6ff",
    description: "Build components, layouts, and interactive UI elements",
    roleId: "dev",
    domainId: "frontend-ui",
  },
  {
    id: "frontend-css",
    name: "Style Architect",
    icon: "CS",
    color: "#58a6ff",
    description: "CSS, Tailwind, animations, responsive design, and theming",
    roleId: "ux-expert",
    domainId: "css",
  },
  {
    id: "frontend-state",
    name: "State Manager",
    icon: "SM",
    color: "#58a6ff",
    description: "State management, data flow, hooks, and client-side architecture",
    roleId: "dev",
    domainId: "state-management",
  },

  // DevOps
  {
    id: "devops-docker",
    name: "Container Ops",
    icon: "\u{1F433}",
    color: "#bc8cff",
    description: "Docker, docker-compose, container orchestration, and images",
    roleId: "devops",
    domainId: "containers",
  },
  {
    id: "devops-ci",
    name: "CI/CD Pipeline",
    icon: "CI",
    color: "#bc8cff",
    description: "GitHub Actions, CI/CD pipelines, automated workflows",
    roleId: "devops",
    domainId: "ci-cd",
  },
  {
    id: "devops-infra",
    name: "Infrastructure",
    icon: "\u{2601}\u{FE0F}",
    color: "#bc8cff",
    description: "AWS, Terraform, cloud infrastructure, and IaC",
    roleId: "devops",
    domainId: "infrastructure",
  },
  {
    id: "devops-k8s",
    name: "K8s Engineer",
    icon: "K8",
    color: "#bc8cff",
    description: "Kubernetes manifests, Helm charts, and cluster management",
    roleId: "devops",
    domainId: "kubernetes",
  },

  // Testing
  {
    id: "test-unit",
    name: "Unit Tester",
    icon: "UT",
    color: "#d29922",
    description: "Unit tests, mocks, assertions, and test-driven development",
    roleId: "qa",
    domainId: "unit-testing",
  },
  {
    id: "test-e2e",
    name: "E2E Tester",
    icon: "E2",
    color: "#d29922",
    description: "End-to-end tests with Playwright, Cypress, or Selenium",
    roleId: "qa",
    domainId: "e2e-testing",
  },
  {
    id: "test-perf",
    name: "Perf Tester",
    icon: "\u{26A1}",
    color: "#d29922",
    description: "Performance testing, benchmarks, load testing, and profiling",
    roleId: "qa",
    domainId: "performance",
  },

  // General
  {
    id: "general-debug",
    name: "Debugger",
    icon: "\u{1F41B}",
    color: "#ff7b72",
    description: "Systematic debugging, root cause analysis, and bug fixing",
    roleId: "dev",
    domainId: "debugging",
  },
  {
    id: "general-review",
    name: "Code Reviewer",
    icon: "CR",
    color: "#ff7b72",
    description: "Code review, best practices, and architecture feedback",
    roleId: "adversarial-reviewer",
    domainId: "code-review",
  },
  {
    id: "general-docs",
    name: "Docs Writer",
    icon: "\u{1F4DD}",
    color: "#ff7b72",
    description: "API docs, READMEs, architecture docs, and inline comments",
    roleId: "technical-writer",
    keywords: ["docs", "readme", "documentation", "comment", "api doc", "guide", "tutorial", "adr"],
  },
  {
    id: "general-interview",
    name: "Interview Coach",
    icon: "\u{1F3AF}",
    color: "#ff7b72",
    description: "Tech interview prep — system design, algorithms, behavioral questions",
    roleId: "advisor",
    domainId: "interview-prep",
  },
  {
    id: "general-linkedin-leader",
    name: "LinkedIn Tech Leader",
    icon: "\u{1F4BC}",
    color: "#ff7b72",
    description: "LinkedIn content strategy for tech leaders — posts, articles, thought leadership",
    roleId: "advisor",
    domainId: "content-strategy",
  },
  {
    id: "general-git",
    name: "Git Wizard",
    icon: "\u{1F500}",
    color: "#ff7b72",
    description: "Git workflows, rebasing, conflict resolution, and branch strategies",
    roleId: "dev",
    domainId: "git",
  },
  {
    id: "general-brainstorm",
    name: "Brainstorm Agent",
    icon: "\u{1F4A1}",
    color: "#ff7b72",
    description: "Turn ideas into designs and specs through collaborative dialogue",
    roleId: "analyst",
    domainId: "ideation",
  },
  {
    id: "general-architect",
    name: "System Architect",
    icon: "\u{1F3D7}\u{FE0F}",
    color: "#ff7b72",
    description: "System design, architecture decisions, scalability patterns",
    roleId: "architect",
    keywords: ["architecture", "system design", "microservice", "monolith", "scalability", "pattern", "distributed"],
  },
  {
    id: "general-cofounder",
    name: "Cofounder CTO",
    icon: "CTO",
    color: "#ff7b72",
    description: "Strategic technical leadership — roadmap, build-vs-buy, architecture decisions, scaling strategy",
    roleId: "advisor",
    domainId: "tech-strategy",
  },
];

export const AGENT_CATEGORIES: AgentCategory[] = ["Backend", "Frontend", "DevOps", "Testing", "General"];

export interface CatalogAgent extends CuratedAgent {
  category: AgentCategory;
  keywords: string[];
}

// general-docs and general-architect have no domainId — their role (technical-writer,
// architect) already covers the whole job with no narrower domain to point at. In the
// legacy AGENT_PROFILES both were category "General", so that is the fallback here too.
// Their routing keywords have no domain to come from either, so they carry their own.
const FALLBACK_CATEGORY: AgentCategory = "General";

/**
 * CURATED_AGENTS enriched with the category and keywords their domain supplies.
 * An explicit `keywords` on the agent wins, which is the only way a domainless
 * agent can be routed to at all.
 */
export const AGENT_CATALOG: CatalogAgent[] = CURATED_AGENTS.map((agent) => {
  const domain = agent.domainId ? getDomain(agent.domainId) : undefined;
  return {
    ...agent,
    category: domain?.category ?? FALLBACK_CATEGORY,
    keywords: agent.keywords ?? domain?.keywords ?? [],
  };
});

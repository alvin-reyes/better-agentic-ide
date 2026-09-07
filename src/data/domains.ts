export interface Domain {
  id: string;
  title: string;
  category: "Backend" | "Frontend" | "DevOps" | "Testing" | "General";
  focus: string;
  keywords: string[];
}

export const DOMAINS: Domain[] = [
  {
    id: "backend-api",
    title: "Backend API",
    category: "Backend",
    focus:
      "Design, build, and debug API endpoints, routes, controllers, middleware, authentication, and request/response handling. Focus on clean architecture, proper error handling, and RESTful best practices.",
    keywords: ["api", "endpoint", "route", "rest", "graphql", "controller", "middleware", "express", "fastify"],
  },
  {
    id: "database",
    title: "Database",
    category: "Backend",
    focus:
      "Schema design, migrations, query optimization, indexing strategies, data modeling, and ORM usage. Focus on performance, data integrity, and scalable database patterns.",
    keywords: ["database", "schema", "migration", "query", "sql", "postgres", "mysql", "mongo", "orm", "prisma", "index"],
  },
  {
    id: "security",
    title: "Security",
    category: "Backend",
    focus:
      "Auth flows, OAuth integrations, JWT handling, role-based access control, session management, and security best practices. Focus on OWASP top 10 prevention.",
    keywords: ["auth", "login", "jwt", "oauth", "session", "password", "security", "rbac", "token", "permission"],
  },
  {
    id: "frontend-ui",
    title: "Frontend UI",
    category: "Frontend",
    focus:
      "Build React/Vue/Svelte components, layouts, forms, modals, and interactive elements. Focus on clean component architecture, accessibility, and responsive design patterns.",
    keywords: ["component", "ui", "button", "form", "modal", "layout", "react", "vue", "svelte", "widget"],
  },
  {
    id: "css",
    title: "CSS & Styling",
    category: "Frontend",
    focus:
      "Tailwind CSS, custom CSS, animations, responsive layouts, theming systems, and design system implementation. Focus on pixel-perfect execution and performance.",
    keywords: ["css", "style", "tailwind", "animation", "responsive", "theme", "design", "color", "font", "layout"],
  },
  {
    id: "state-management",
    title: "State Management",
    category: "Frontend",
    focus:
      "Design and implement state management with Zustand/Redux/Context, data fetching patterns, custom hooks, and client-side caching. Focus on clean data flow and minimal re-renders.",
    keywords: ["state", "store", "zustand", "redux", "context", "hook", "data flow", "cache", "fetch"],
  },
  {
    id: "containers",
    title: "Containers",
    category: "DevOps",
    focus:
      "Write Dockerfiles, docker-compose configs, multi-stage builds, container networking, and orchestration. Focus on small image sizes, security, and reproducible builds.",
    keywords: ["docker", "container", "compose", "image", "dockerfile", "build", "registry"],
  },
  {
    id: "ci-cd",
    title: "CI/CD",
    category: "DevOps",
    focus:
      "Build GitHub Actions workflows, deployment pipelines, automated testing, release automation, and build optimization. Focus on fast, reliable, and secure pipelines.",
    keywords: ["ci", "cd", "pipeline", "github actions", "workflow", "deploy", "release", "build", "automation"],
  },
  {
    id: "infrastructure",
    title: "Infrastructure",
    category: "DevOps",
    focus:
      "AWS/GCP/Azure services, Terraform/Pulumi IaC, networking, monitoring, and cloud architecture. Focus on cost optimization, security, and reliability.",
    keywords: ["aws", "terraform", "cloud", "infrastructure", "iac", "gcp", "azure", "s3", "lambda", "ec2"],
  },
  {
    id: "kubernetes",
    title: "Kubernetes",
    category: "DevOps",
    focus:
      "Write K8s manifests, Helm charts, deployment strategies, service mesh configs, and cluster management. Focus on reliability, scalability, and GitOps practices.",
    keywords: ["kubernetes", "k8s", "helm", "pod", "deployment", "service", "ingress", "cluster"],
  },
  {
    id: "unit-testing",
    title: "Unit Testing",
    category: "Testing",
    focus:
      "Write comprehensive unit tests, mocks, stubs, fixtures, and assertions. Follow TDD red-green-refactor. Focus on high coverage, edge cases, and fast test execution.",
    keywords: ["test", "unit", "mock", "assert", "tdd", "jest", "vitest", "spec", "coverage"],
  },
  {
    id: "e2e-testing",
    title: "E2E Testing",
    category: "Testing",
    focus:
      "Write end-to-end tests using Playwright/Cypress, page objects, test fixtures, and CI integration. Focus on reliable selectors, avoiding flaky tests, and testing critical user flows.",
    keywords: ["e2e", "end to end", "playwright", "cypress", "selenium", "integration", "browser"],
  },
  {
    id: "performance",
    title: "Performance",
    category: "Testing",
    focus:
      "Load testing (k6, Artillery), benchmarking, profiling, memory leak detection, and performance optimization. Focus on identifying bottlenecks and measurable improvements.",
    keywords: ["performance", "benchmark", "load test", "profile", "memory", "speed", "optimize", "k6", "artillery"],
  },
  {
    id: "debugging",
    title: "Debugging",
    category: "General",
    focus:
      "Identify and fix bugs through root cause analysis, log inspection, and methodical testing. Focus on reproducing the issue first, then fixing it.",
    keywords: ["debug", "bug", "fix", "error", "crash", "issue", "broken", "wrong", "fail", "exception", "stack trace"],
  },
  {
    id: "code-review",
    title: "Code Review",
    category: "General",
    focus:
      "Review code for bugs, security issues, performance problems, and architecture concerns. Be specific with line-level feedback. Focus on what matters, not style nitpicks.",
    keywords: ["review", "pr", "pull request", "refactor", "clean", "quality", "best practice", "code smell"],
  },
  {
    id: "interview-prep",
    title: "Interview Prep",
    category: "General",
    focus:
      "Prepare for software engineering interviews: system design (distributed systems, scalability, trade-offs), data structures & algorithms (optimal solutions, time/space complexity, common patterns), behavioral questions (STAR method, leadership principles), and live coding practice. Ask questions, evaluate answers, and provide detailed feedback. Adjust difficulty based on target level (junior, mid, senior, staff).",
    keywords: ["interview", "algorithm", "system design", "leetcode", "behavioral", "prep"],
  },
  {
    id: "content-strategy",
    title: "Content Strategy",
    category: "General",
    focus:
      "Craft compelling LinkedIn posts, articles, and thought leadership content about software engineering, AI, architecture, and team leadership. Focus on authentic storytelling, technical depth with accessibility, engagement hooks, and building a personal brand. Suggest content formats (carousels, polls, stories), optimal posting strategies, and help repurpose technical work into shareable insights.",
    keywords: ["linkedin", "post", "article", "content", "brand", "thought leadership"],
  },
  {
    id: "git",
    title: "Git",
    category: "General",
    focus:
      "Advanced Git workflows: interactive rebasing, cherry-picking, conflict resolution, bisect debugging, reflog recovery, branch strategies (trunk-based, GitFlow), monorepo management, and hook automation. Focus on clean commit history, safe force-push practices, and team collaboration patterns.",
    keywords: ["git", "rebase", "merge", "conflict", "branch", "cherry-pick", "bisect", "commit"],
  },
  {
    id: "ideation",
    title: "Ideation",
    category: "General",
    focus:
      "Turn ideas into fully formed designs and specs through collaborative dialogue. Ask clarifying questions one at a time, propose 2-3 approaches with trade-offs, and help settle on the best design. Write specs to markdown files. Focus on YAGNI, exploring alternatives, and incremental validation.",
    keywords: ["brainstorm", "idea", "design", "spec", "plan", "think", "explore", "approach", "strategy"],
  },
  {
    id: "tech-strategy",
    title: "Tech Strategy",
    category: "General",
    focus:
      "Product-engineering tradeoffs, technology bets, roadmap prioritization, scaling strategies (both technical and organizational), team structure, build-vs-buy decisions, and architecture decisions. Ask probing questions before giving advice. Challenge assumptions constructively. Provide decision frameworks (weighted scoring, RICE, opportunity cost analysis) rather than just opinions. Think about second-order effects and long-term implications. Be direct and opinionated but acknowledge uncertainty.",
    keywords: ["strategy", "roadmap", "tradeoff", "build vs buy", "prioritize", "architecture decision", "tech stack", "scaling", "hiring", "product", "vision", "cto", "cofounder"],
  },
];

export function getDomain(id: string): Domain | undefined {
  return DOMAINS.find((d) => d.id === id);
}

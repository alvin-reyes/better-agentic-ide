/**
 * Curated MCP servers for Claude Code. Installing one writes it into the
 * project's .mcp.json. Secrets are `${NAME}` references that Claude Code
 * expands from the environment; ADE's vault puts them there for terminals it
 * opens, so a value never lands in the file.
 */

export type McpCategory = "Code" | "Data & storage" | "Web & browser" | "Docs & knowledge" | "Work tools";

export interface McpSecret {
  /** Environment variable, and the vault entry that fills it. */
  name: string;
  label: string;
  /** Where to create one. */
  url?: string;
}

export interface McpEntry {
  id: string;
  name: string;
  category: McpCategory;
  description: string;
  /** The .mcp.json server entry. */
  server: Record<string, unknown>;
  secrets?: McpSecret[];
  /** Remote server that signs in through the browser: run /mcp in Claude Code. */
  oauth?: boolean;
  /** Needs this on PATH. */
  needs?: "npx" | "uvx";
  docs: string;
}

export const MCP_CATALOG: McpEntry[] = [
  {
    id: "github",
    name: "GitHub",
    category: "Code",
    description: "Issues, pull requests, code search and Actions, from GitHub's hosted server.",
    server: { type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
    secrets: [{ name: "GITHUB_PERSONAL_ACCESS_TOKEN", label: "GitHub personal access token", url: "https://github.com/settings/personal-access-tokens" }],
    docs: "https://github.com/github/github-mcp-server",
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "Code",
    description: "Look up errors, stack traces and releases while fixing a bug.",
    server: { type: "http", url: "https://mcp.sentry.dev/mcp" },
    oauth: true,
    docs: "https://docs.sentry.io/product/sentry-mcp/",
  },
  {
    id: "git",
    name: "Git",
    category: "Code",
    description: "Read history, diffs and blame for the repository in structured form.",
    server: { command: "uvx", args: ["mcp-server-git"] },
    needs: "uvx",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    category: "Data & storage",
    description: "Read and write files, limited to this project folder.",
    server: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "."] },
    needs: "npx",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  },
  {
    id: "memory",
    name: "Memory",
    category: "Data & storage",
    description: "A local knowledge graph the agent can store facts in and recall across sessions.",
    server: { command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"] },
    needs: "npx",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },
  {
    id: "db",
    name: "Databases (DBHub)",
    category: "Data & storage",
    description: "Query Postgres, MySQL, SQL Server, MariaDB or SQLite. Point it at a read-only user.",
    server: { command: "npx", args: ["-y", "@bytebase/dbhub", "--dsn", "${DATABASE_URL}"] },
    secrets: [{ name: "DATABASE_URL", label: "Connection string, e.g. postgres://readonly:…@host:5432/db" }],
    needs: "npx",
    docs: "https://github.com/bytebase/dbhub",
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Data & storage",
    description: "Tables, SQL, migrations, storage and edge functions in your Supabase projects.",
    server: { type: "http", url: "https://mcp.supabase.com/mcp" },
    oauth: true,
    docs: "https://supabase.com/docs/guides/getting-started/mcp",
  },
  {
    id: "airtable",
    name: "Airtable",
    category: "Data & storage",
    description: "Read and update bases, tables and records.",
    server: { command: "npx", args: ["-y", "airtable-mcp-server"], env: { AIRTABLE_API_KEY: "${AIRTABLE_API_KEY}" } },
    secrets: [{ name: "AIRTABLE_API_KEY", label: "Airtable personal access token", url: "https://airtable.com/create/tokens" }],
    needs: "npx",
    docs: "https://github.com/domdomegg/airtable-mcp-server",
  },
  {
    id: "playwright",
    name: "Playwright",
    category: "Web & browser",
    description: "Drive a real browser: open pages, click, fill forms and take snapshots to test UI changes.",
    server: { command: "npx", args: ["@playwright/mcp@latest"] },
    needs: "npx",
    docs: "https://github.com/microsoft/playwright-mcp",
  },
  {
    id: "fetch",
    name: "Fetch",
    category: "Web & browser",
    description: "Fetch a web page and read it as Markdown.",
    server: { command: "uvx", args: ["mcp-server-fetch"] },
    needs: "uvx",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  {
    id: "context7",
    name: "Context7",
    category: "Docs & knowledge",
    description: "Current, version-specific library docs, so the agent doesn't code against old APIs.",
    server: { command: "npx", args: ["-y", "@upstash/context7-mcp"] },
    needs: "npx",
    docs: "https://github.com/upstash/context7",
  },
  {
    id: "sequential-thinking",
    name: "Sequential thinking",
    category: "Docs & knowledge",
    description: "A scratch space for step-by-step reasoning on larger problems.",
    server: { command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
    needs: "npx",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
  },
  {
    id: "notion",
    name: "Notion",
    category: "Work tools",
    description: "Search and edit pages and databases in your workspace.",
    server: { type: "http", url: "https://mcp.notion.com/mcp" },
    oauth: true,
    docs: "https://developers.notion.com/docs/mcp",
  },
  {
    id: "linear",
    name: "Linear",
    category: "Work tools",
    description: "Find, create and update issues and projects.",
    server: { type: "http", url: "https://mcp.linear.app/mcp" },
    oauth: true,
    docs: "https://linear.app/docs/mcp",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Work tools",
    description: "Customers, products, payments and the Stripe docs.",
    server: { type: "http", url: "https://mcp.stripe.com" },
    oauth: true,
    docs: "https://docs.stripe.com/mcp",
  },
];

export const MCP_CATEGORIES: McpCategory[] = ["Code", "Data & storage", "Web & browser", "Docs & knowledge", "Work tools"];

/** Every `${NAME}` a server entry reads from the environment. */
export function envRefs(server: unknown): string[] {
  const found = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "string") for (const m of v.matchAll(/\$\{([A-Z_][A-Z0-9_]*)(?::-[^}]*)?\}/g)) found.add(m[1]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(server);
  return [...found].sort();
}

export function matchCatalog(entries: McpEntry[], query: string): McpEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((e) => {
    const hay = `${e.name} ${e.category} ${e.description}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

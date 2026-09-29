/**
 * Cost, cache and context figures from Claude Code transcript usage
 * (read by `token_usage`), and the savings tips they suggest.
 */

export interface ModelUsage {
  model: string;
  requests: number;
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export interface SessionUsage {
  id: string;
  cwd: string | null;
  title: string | null;
  firstAt: string | null;
  lastAt: string | null;
  models: ModelUsage[];
  subagentRequests: number;
  contextTokens: number;
  peakContextTokens: number;
  model: string | null;
  compactions: number;
}

export interface UsageReport {
  sessions: SessionUsage[];
  filesScanned: number;
}

interface Price {
  /** $ per million tokens. */
  input: number;
  output: number;
  /** Cache reads as a fraction of the input price. */
  read: number;
  context: number;
}

// Anthropic API list prices. Cache writes are 1.25x input (5-minute) or 2x
// (1-hour) on every model; reads are 0.1x except where noted.
const PRICES: [RegExp, Price][] = [
  [/fable-5-1|mythos-5-1/, { input: 10, output: 50, read: 0.025, context: 1_000_000 }],
  [/fable-5|mythos-5/, { input: 10, output: 50, read: 0.1, context: 1_000_000 }],
  [/opus-5-5/, { input: 4, output: 20, read: 0.05, context: 1_000_000 }],
  [/opus-5|opus-4-[6-8]/, { input: 5, output: 25, read: 0.1, context: 1_000_000 }],
  [/opus-4-5/, { input: 5, output: 25, read: 0.1, context: 200_000 }],
  [/opus-4/, { input: 15, output: 75, read: 0.1, context: 200_000 }],
  [/sonnet-5/, { input: 2, output: 10, read: 0.1, context: 1_000_000 }],
  [/sonnet-4-6/, { input: 3, output: 15, read: 0.1, context: 1_000_000 }],
  [/sonnet-4|sonnet-3/, { input: 3, output: 15, read: 0.1, context: 200_000 }],
  [/haiku-4/, { input: 1, output: 5, read: 0.1, context: 200_000 }],
  [/haiku-3-5/, { input: 0.8, output: 4, read: 0.1, context: 200_000 }],
  [/haiku/, { input: 0.25, output: 1.25, read: 0.1, context: 200_000 }],
];

function priceOf(model: string): Price | null {
  return PRICES.find(([re]) => re.test(model))?.[1] ?? null;
}

/** Context window; "[1m]" in Claude Code's model name selects the 1M window. */
export function contextWindow(model: string | null): number {
  if (!model) return 200_000;
  if (/\[1m\]/i.test(model)) return 1_000_000;
  return priceOf(model)?.context ?? 200_000;
}

const M = 1_000_000;

/** Dollars for this usage at list price, or null for an unknown model. */
export function costOf(u: ModelUsage): number | null {
  const p = priceOf(u.model);
  if (!p) return null;
  return (
    (u.input * p.input +
      u.cacheWrite5m * p.input * 1.25 +
      u.cacheWrite1h * p.input * 2 +
      u.cacheRead * p.input * p.read +
      u.output * p.output) / M
  );
}

/** All prompt tokens: fresh input plus cache writes and reads. */
export function promptTokens(u: ModelUsage): number {
  return u.input + u.cacheWrite5m + u.cacheWrite1h + u.cacheRead;
}

/** What the same requests would have cost with no prompt caching at all. */
export function uncachedCostOf(u: ModelUsage): number | null {
  const p = priceOf(u.model);
  if (!p) return null;
  return (promptTokens(u) * p.input + u.output * p.output) / M;
}

export function sumModels(list: ModelUsage[]): ModelUsage[] {
  const by = new Map<string, ModelUsage>();
  for (const u of list) {
    const t = by.get(u.model) ?? { model: u.model, requests: 0, input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
    t.requests += u.requests;
    t.input += u.input;
    t.output += u.output;
    t.cacheWrite5m += u.cacheWrite5m;
    t.cacheWrite1h += u.cacheWrite1h;
    t.cacheRead += u.cacheRead;
    by.set(u.model, t);
  }
  return [...by.values()];
}

export interface Totals {
  cost: number;
  /** Savings from caching versus sending every prompt uncached. */
  cacheSavings: number;
  inputTokens: number;
  outputTokens: number;
  /** Share of prompt tokens served from cache. */
  cacheHitRate: number;
  requests: number;
  unpriced: string[];
}

export function totals(models: ModelUsage[]): Totals {
  let cost = 0, uncached = 0, input = 0, output = 0, read = 0, requests = 0;
  const unpriced: string[] = [];
  for (const u of models) {
    const c = costOf(u);
    const n = uncachedCostOf(u);
    if (c === null || n === null) unpriced.push(u.model);
    else {
      cost += c;
      uncached += n;
    }
    input += promptTokens(u);
    read += u.cacheRead;
    output += u.output;
    requests += u.requests;
  }
  return { cost, cacheSavings: Math.max(0, uncached - cost), inputTokens: input, outputTokens: output, cacheHitRate: input ? read / input : 0, requests, unpriced };
}

export function sessionCost(s: SessionUsage): number {
  return s.models.reduce((a, u) => a + (costOf(u) ?? 0), 0);
}

export function contextShare(s: SessionUsage): number {
  return s.contextTokens / contextWindow(s.model);
}

/** Sessions quiet for longer than this are finished, not worth a warning. */
const ACTIVE_WITHIN_MS = 15 * 60_000;

/**
 * The latest session, if it's still active and its context has reached
 * `threshold` of the model's window.
 */
export function overThreshold(sessions: SessionUsage[], threshold: number, now = Date.now()): SessionUsage | null {
  const s = sessions[0];
  if (!s?.lastAt || now - Date.parse(s.lastAt) > ACTIVE_WITHIN_MS) return null;
  return contextShare(s) >= threshold ? s : null;
}

// ---------------------------------------------------------------------------
// Tips

export interface Tip {
  id: string;
  level: "high" | "medium" | "info";
  title: string;
  detail: string;
  /** A slash command to send to the active terminal's agent. */
  command?: string;
}

/** Rough tokens for a text file of this many bytes (about 4 bytes per token). */
export const tokensForBytes = (bytes: number) => Math.round(bytes / 4);

export interface AuditLike {
  memoryFiles: { path: string; bytes: number }[];
  heavy: { path: string; denied: boolean }[];
  mcpServers: string[];
}

const isBig = (m: string) => /opus|fable|mythos/.test(m);

export function tipsFor(sessions: SessionUsage[], audit: AuditLike | null): Tip[] {
  const tips: Tip[] = [];
  const latest = sessions[0];
  if (latest && latest.contextTokens > 0) {
    const share = contextShare(latest);
    const k = Math.round(latest.contextTokens / 1000);
    if (share >= 0.5 || latest.contextTokens >= 150_000) {
      tips.push({
        id: "compact",
        level: share >= 0.75 ? "high" : "medium",
        title: `The latest session resends ${k}k tokens every turn`,
        detail: "Each request carries the whole conversation. /compact summarizes it and keeps working; /clear starts fresh when you move on to a new task.",
        command: "/compact",
      });
    }
  }

  const all = sumModels(sessions.flatMap((s) => s.models));
  const t = totals(all);
  if (t.requests >= 20 && t.cacheHitRate < 0.6) {
    tips.push({
      id: "cache",
      level: "medium",
      title: `Only ${Math.round(t.cacheHitRate * 100)}% of prompt tokens came from cache`,
      detail: "Cache hits cost a tenth of fresh input or less. Long pauses let the cache expire, and editing CLAUDE.md, switching models or changing MCP servers mid-session invalidates it. Keep sessions going in one stretch and settle those before you start.",
    });
  }

  const subRequests = sessions.reduce((a, s) => a + s.subagentRequests, 0);
  const bigShare = all.filter((u) => isBig(u.model)).reduce((a, u) => a + u.requests, 0) / Math.max(1, t.requests);
  if (subRequests >= 20 && bigShare > 0.8) {
    tips.push({
      id: "subagent-model",
      level: "info",
      title: `${subRequests} sub-agent requests ran on the top-tier model`,
      detail: "Searching and reading don't need the biggest model. Set model: haiku or model: sonnet in those agents' .claude/agents/*.md frontmatter.",
    });
  }

  const output = all.reduce((a, u) => a + u.output, 0);
  if (t.requests >= 20 && output / t.requests > 3000) {
    tips.push({
      id: "output",
      level: "info",
      title: `Responses average ${Math.round(output / t.requests).toLocaleString()} output tokens`,
      detail: "Output costs about five times input. Ask for targeted edits instead of whole files, and for short answers when you only need a yes or a pointer.",
    });
  }

  if (audit) {
    const memBytes = audit.memoryFiles.reduce((a, f) => a + f.bytes, 0);
    if (tokensForBytes(memBytes) >= 5000) {
      tips.push({
        id: "memory",
        level: "medium",
        title: `CLAUDE.md files add about ${Math.round(tokensForBytes(memBytes) / 1000)}k tokens to every request`,
        detail: "Memory files load into every session. Keep them to rules the agent needs every time, and move reference material into docs it can open when needed.",
      });
    }
    const open = audit.heavy.filter((h) => !h.denied);
    if (open.length > 0) {
      tips.push({
        id: "deny",
        level: "medium",
        title: `${open.length} generated or dependency ${open.length === 1 ? "path is" : "paths are"} open to the agent`,
        detail: `${open.map((h) => h.path).join(", ")}. One stray read or search there can pull in tens of thousands of tokens. Add read-deny rules below.`,
      });
    }
    if (audit.mcpServers.length >= 4) {
      tips.push({
        id: "mcp",
        level: "info",
        title: `${audit.mcpServers.length} MCP servers are configured for this project`,
        detail: "Each server's tool definitions are part of every request. Disable the ones this project doesn't use (/mcp).",
      });
    }
  }
  const rank = { high: 0, medium: 1, info: 2 };
  return tips.sort((a, b) => rank[a.level] - rank[b.level]);
}

// ---------------------------------------------------------------------------
// Formatting

export function fmtTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/** 12345 → "12,345" (WebKitGTK's toLocaleString doesn't group digits). */
export function fmtInt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ",");
}

export function fmtUsd(n: number): string {
  if (n >= 100) return `$${fmtInt(n)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export function fmtBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(1)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/** "claude-opus-5-5" → "Opus 5.5". */
export function modelLabel(model: string): string {
  const m = /(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?!\d)/.exec(model);
  if (!m) return model;
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] ? "." + m[3] : ""}`;
}

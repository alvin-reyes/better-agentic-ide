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
  /** Bash tool results in the period, main conversation and sub-agents. */
  commandRuns: number;
  /** Their length in characters, added up. */
  commandOutputChars: number;
  /** The longest single one, in characters. */
  largestCommandOutput: number;
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
  // DeepSeek, reached through its Anthropic-compatible endpoint, so its usage
  // lands in the same transcripts. These are the published standard (peak)
  // rates in USD per million tokens. Off-peak is half, over 01:00-04:00 and
  // 06:00-10:00 UTC on weekdays, but ModelUsage is aggregated per model with
  // no timestamp, so nothing here can tell which applied. The standard rate
  // makes the figure an upper bound: it overstates an off-peak run rather than
  // understating a peak one. `read` is the cache-hit price as a fraction of
  // the cache-miss price, the same convention the Anthropic rows use.
  [/deepseek-v4-pro/, { input: 1.32, output: 3.96, read: 0.044 / 1.32, context: 1_000_000 }],
  [/deepseek-flash/, { input: 0.3, output: 1.2, read: 0.006 / 0.3, context: 1_000_000 }],
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
  // Deduped: the same model can arrive from several sessions, and this list is
  // shown to the user.
  return { cost, cacheSavings: Math.max(0, uncached - cost), inputTokens: input, outputTokens: output, cacheHitRate: input ? read / input : 0, requests, unpriced: [...new Set(unpriced)] };
}

export function sessionCost(s: SessionUsage): number {
  return s.models.reduce((a, u) => a + (costOf(u) ?? 0), 0);
}

export function contextShare(s: SessionUsage): number {
  return s.contextTokens / contextWindow(s.model);
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
  /** Claude Code settings the project has set, by preset key. */
  presets?: Record<string, string>;
}

/** How a session is named in a tip: its first prompt, or the start of its id. */
const sessionName = (s: SessionUsage) => (s.title ?? s.id.slice(0, 8)).slice(0, 40);

/** "a", "a and b", "a, b and c". */
const listOf = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0] ?? "");

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
      detail: "Set Sub-agent model to Sonnet below: it costs less and keeps the 1M context. For agents that only search and read, model: haiku in their .claude/agents/*.md frontmatter saves more.",
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

  // The audit's presets are one folder's settings. Without them (no audit, or
  // usage from every project) no tip names a setting or depends on one.
  const presets = audit?.presets;
  const unset = (key: string) => presets !== undefined && !presets[key];

  const full = sessions.filter((s) => s.peakContextTokens >= 0.8 * contextWindow(s.model));
  if (full.length >= 2) {
    tips.push({
      id: "ran-full",
      level: "medium",
      title: `${full.length} sessions filled 80% or more of the context window`,
      detail: "A full window is resent on every turn until something compacts it. /compact at a natural break, or /clear when the task changes."
        + (unset("env.CLAUDE_CODE_AUTOCOMPACT_PCT_OVERRIDE") ? " Set Auto-compact at below to have Claude Code compact sooner on its own." : ""),
    });
  }

  const most = sessions.reduce<SessionUsage | null>((a, s) => (s.compactions > (a?.compactions ?? 0) ? s : a), null);
  if (most && most.compactions >= 3) {
    tips.push({
      id: "recompacted",
      level: "medium",
      title: `${sessionName(most)} was compacted ${most.compactions} times`,
      detail: "Each compaction drops detail and the session fills up again. Split the work into smaller tasks, and /clear between them instead of carrying one conversation through all of it.",
    });
  }

  // Dollars are counted from priced models only: costOf is null for the rest,
  // so they add nothing to a figure or to a share of one.
  const big = all.filter((u) => isBig(u.model) && (costOf(u) ?? 0) > 0).sort((a, b) => costOf(b)! - costOf(a)!);
  const bigCost = big.reduce((a, u) => a + costOf(u)!, 0);
  if (t.cost >= 5 && bigCost / t.cost >= 0.9 && !presets?.model) {
    tips.push({
      id: "top-tier",
      level: "info",
      title: `${listOf([...new Set(big.map((u) => modelLabel(u.model)))])} took ${Math.round((bigCost / t.cost) * 100)}% of the ${fmtUsd(t.cost)} spent`,
      detail: "Sonnet handles most edits, searches and test runs for less. Switch with /model for routine work and come back for the hard problems."
        + (presets ? " Or set Default model to opusplan below: it plans with Opus, then writes the code with Sonnet." : ""),
      command: "/model",
    });
  }

  const dearest = sessions.reduce<SessionUsage | null>((a, s) => (a === null || sessionCost(s) > sessionCost(a) ? s : a), null);
  if (dearest && sessions.length >= 3 && t.cost >= 1 && sessionCost(dearest) / t.cost >= 0.6) {
    const cost = sessionCost(dearest);
    tips.push({
      id: "one-session",
      level: "info",
      title: `${sessionName(dearest)} is ${Math.round((cost / t.cost) * 100)}% of this period's spend (${fmtUsd(cost)})`,
      detail: "Every turn of a long conversation resends everything before it. Give each task its own session, and /clear when you move on.",
    });
  }

  // A session that read more than it wrote was already going before the
  // period: only its last few requests fall inside, and it is not a short one.
  const writes = (s: SessionUsage) => s.models.reduce((a, u) => a + u.cacheWrite5m + u.cacheWrite1h, 0);
  const short = sessions.filter((s) =>
    s.models.reduce((a, u) => a + u.requests, 0) <= 3 && writes(s) > s.models.reduce((a, u) => a + u.cacheRead, 0));
  const written = short.reduce((a, s) => a + writes(s), 0);
  if (short.length >= 5 && written >= 50_000) {
    tips.push({
      id: "short-sessions",
      level: "info",
      title: `${short.length} sessions made 3 requests or fewer and wrote ${fmtTokens(written)} tokens to cache`,
      detail: "A new session writes its system prompt, tools and CLAUDE.md to cache before it answers, and a short one never reads enough back to repay that. Ask follow-ups in a session that is still open.",
    });
  }

  // Thresholds are 50k and 200k tokens at four characters each, compared in
  // characters so rounding cannot tip one over.
  const outputChars = sessions.reduce((a, s) => a + s.commandOutputChars, 0);
  if (outputChars >= 200_000) {
    const runs = sessions.reduce((a, s) => a + s.commandRuns, 0);
    tips.push({
      id: "script-output",
      level: outputChars >= 800_000 ? "medium" : "info",
      title: `Command output added about ${fmtTokens(tokensForBytes(outputChars))} tokens over ${fmtInt(runs)} runs`,
      detail: "Everything a command prints is read by the model and resent on later turns. Run tests, builds and installs yourself in a split terminal and paste only the lines that matter.",
    });
  }

  const largest = sessions.reduce((a, s) => Math.max(a, s.largestCommandOutput), 0);
  if (largest >= 15_000 && unset("env.BASH_MAX_OUTPUT_LENGTH")) {
    tips.push({
      id: "bash-limit",
      level: "info",
      title: `The largest command output was ${fmtInt(largest)} characters`,
      detail: "Claude Code sends up to 30,000 characters of a command's output to the model. Set Bash output sent to the model below to cut long output before the agent reads it.",
    });
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

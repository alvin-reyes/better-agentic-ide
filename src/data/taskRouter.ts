import { AGENT_CATALOG, type CatalogAgent } from "./curatedAgents";

interface RouteResult {
  agent: CatalogAgent;
  score: number;
}

/**
 * Route a task description to the best-matching curated agent.
 * Uses keyword matching against each agent's domain keywords.
 * Returns the top match or null if no keywords match (< 1 score).
 */
export function routeTask(input: string): RouteResult | null {
  const words = input.toLowerCase().split(/\s+/);
  let best: RouteResult | null = null;

  for (const agent of AGENT_CATALOG) {
    let score = 0;
    for (const keyword of agent.keywords) {
      // Support multi-word keywords (e.g. "system design")
      if (keyword.includes(" ")) {
        if (input.toLowerCase().includes(keyword)) score += 2;
      } else {
        if (words.some((w) => w === keyword || w.startsWith(keyword))) score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { agent, score };
    }
  }

  return best;
}

/**
 * Check if input looks like a task description (multiple words)
 * vs a simple agent name search (1-2 words that match agent names).
 */
export function isTaskDescription(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  const wordCount = trimmed.split(/\s+/).length;
  // 3+ words is likely a task description
  if (wordCount >= 3) return true;
  // 2 words: check if it matches any agent name — if not, treat as task
  if (wordCount === 2) {
    const q = trimmed.toLowerCase();
    const matchesAgent = AGENT_CATALOG.some(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase() === q,
    );
    return !matchesAgent;
  }
  return false;
}

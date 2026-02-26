import { AGENT_PROFILES, type AgentProfile } from "./agentProfiles";

interface RouteResult {
  agent: AgentProfile;
  score: number;
}

/**
 * Route a task description to the best-matching agent profile.
 * Uses keyword matching against each agent's keywords array.
 * Returns the top match or null if no keywords match (< 1 score).
 */
export function routeTask(input: string): RouteResult | null {
  const words = input.toLowerCase().split(/\s+/);
  let best: RouteResult | null = null;

  for (const profile of AGENT_PROFILES) {
    let score = 0;
    for (const keyword of profile.keywords) {
      // Support multi-word keywords (e.g. "system design")
      if (keyword.includes(" ")) {
        if (input.toLowerCase().includes(keyword)) score += 2;
      } else {
        if (words.some((w) => w === keyword || w.startsWith(keyword))) score += 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { agent: profile, score };
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
    const matchesAgent = AGENT_PROFILES.some(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase() === q,
    );
    return !matchesAgent;
  }
  return false;
}

/**
 * Local, rule-based de-slopping for text drafted in the scratchpad: swaps
 * AI-tell words for plain ones and drops filler phrases. For a full rewrite
 * ask the agent (/ade:deslop in the ADE plugin).
 */

// Order matters: phrases before the single words inside them.
const DROP: RegExp[] = [
  /\bin today's (fast-paced|digital|ever-changing) (world|landscape)[,:]?\s*/gi,
  /\bit(?:'s| is) (?:worth|important to) not(?:e|ing) that\s*/gi,
  /\b(?:great question|certainly|absolutely)!\s*/gi,
  /\bi hope this helps[.!]?\s*/gi,
  /\blet me know if you (?:have any (?:other )?questions|need anything else)[.!]?\s*/gi,
  /\b(?:at the end of the day|needless to say),\s*/gi,
];

const SWAP: [RegExp, string][] = [
  [/\bdelv(?:e|ing) into\b/gi, "look into"],
  [/\bdelves into\b/gi, "looks into"],
  [/\butiliz(?:e|ing)\b/gi, "use"],
  [/\butilizes\b/gi, "uses"],
  [/\bleverag(?:e|ing)\b/gi, "use"],
  [/\bleverages\b/gi, "uses"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bseamless\b/gi, "smooth"],
  [/\bcutting[- ]edge\b/gi, "new"],
  [/\bgame[- ]chang(?:er|ing)\b/gi, "big change"],
  [/\bin order to\b/gi, "to"],
  [/\ba plethora of\b/gi, "many"],
  [/\bembark on\b/gi, "start"],
];

/** Keep the first letter's case when swapping a word. */
function keepCase(match: string, replacement: string): string {
  return match[0] === match[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

export function deslop(text: string): { text: string; changes: number } {
  let changes = 0;
  let out = text;
  for (const re of DROP) {
    out = out.replace(re, () => {
      changes++;
      return "\u0000";
    });
  }
  for (const [re, rep] of SWAP) {
    out = out.replace(re, (m) => {
      changes++;
      return keepCase(m, rep);
    });
  }
  // A dropped opener leaves its sentence starting lowercase: capitalize it.
  out = out
    .replace(/(^|[.!?]\s+|\n\s*)\u0000([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase())
    .replace(/\u0000/g, "");
  return { text: out, changes };
}

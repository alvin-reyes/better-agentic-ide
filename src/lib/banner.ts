// The launch banner printed at the top of a new terminal tab: the logo mark
// (brand/logo.svg) beside "ADE". Pure string building, so it can be tested
// and previewed outside the app.
//
// The mark is the logo redrawn in half blocks: a pointy-top hexagon with a node
// on three corners (top and bottom-right in ink, bottom-left in orange), and
// the prompt caret with an orange cursor inside. Ink is the terminal's own
// foreground, so it reads on any theme; orange is the logo's #ff5a1f.

const RESET = "\x1b[0m";
const ORANGE = "\x1b[38;2;255;90;31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// Each row of the mark, and beside it which cells are orange ("o").
const MARK: [string, string][] = [
  ["     ▄▄●▄▄     ", "               "],
  [" ▄▄▀▀     ▀▀▄▄ ", "               "],
  ["█  ▄          █", "               "],
  ["█   ▀▄        █", "               "],
  ["█   ▄▀ ▄▄▄▄   █", "       oooo    "],
  ["●  ▀          ●", "o              "],
  [" ▀▀▄▄     ▄▄▀▀ ", "               "],
  ["     ▀▀▄▀▀     ", "               "],
];

const WORD = [
  " █████╗ ██████╗ ███████╗",
  "██╔══██╗██╔══██╗██╔════╝",
  "███████║██║  ██║█████╗  ",
  "██╔══██║██║  ██║██╔══╝  ",
  "██║  ██║██████╔╝███████╗",
  "╚═╝  ╚═╝╚═════╝ ╚══════╝",
];

const GAP = "   ";

/** Width of `line` in terminal columns, ignoring SGR colour sequences. */
export function visibleWidth(line: string): number {
  return [...stripSgr(line)].length;
}

export function stripSgr(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function markRow([glyphs, mask]: [string, string]): string {
  const g = [...glyphs];
  const m = [...mask];
  let out = "";
  let orange = false;
  for (let i = 0; i < g.length; i++) {
    const want = m[i] === "o" && g[i] !== " ";
    if (want !== orange) {
      out += want ? ORANGE : RESET;
      orange = want;
    }
    out += g[i];
  }
  return out + RESET;
}

/** Block letters solid in the foreground, their box-drawing shadow dimmed. */
function wordRow(row: string): string {
  return [...row].map((ch) => (ch === "█" ? `${BOLD}${ch}${RESET}` : ch === " " ? ch : `${DIM}${ch}${RESET}`)).join("");
}

/**
 * The banner, one string per terminal row, each ending with a colour reset.
 * `version` is shown as "v<version>" only when given; never pass a guess.
 */
export function bannerLines(version?: string | null): string[] {
  const right = [
    ...WORD.map(wordRow),
    `${DIM}Agentic Development Environment${RESET}`,
    version ? `${DIM}v${version.replace(/^v/, "")}${RESET}` : "",
  ];
  const lines = [""];
  for (let i = 0; i < MARK.length; i++) {
    lines.push(`${markRow(MARK[i])}${GAP}${right[i] ?? ""}${RESET}`.replace(/\s+(\x1b\[0m)$/, "$1"));
  }
  lines.push("");
  return lines;
}

/** Columns the banner needs; narrower terminals skip it rather than wrap it. */
export function bannerWidth(): number {
  return Math.max(...bannerLines("0.0.0").map(visibleWidth));
}

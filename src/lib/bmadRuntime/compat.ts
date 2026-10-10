import { pyRepr, resolvePath } from "./knowledge";
import { isAbsolutePath, toForwardSlashes } from "./paths";

/**
 * The dialect pieces a bundled runtime has to bring itself: Python's `csv`
 * reader, the YAML subset the legacy `module.yaml` files use, and the handful
 * of date/string operations the recon helpers need.
 *
 * PyYAML is not available to the runtime and may not be vendored, so
 * `loadYaml` implements the subset those files are written in — block mappings
 * and sequences, flow collections, quoted and plain scalars, block scalars with
 * chomping, comments. Anything outside that subset is a parse error; a fuller
 * document PyYAML could read is a documented divergence at capture.sh.
 */

// ---------------------------------------------------------------- csv

/**
 * `csv.DictReader` over a whole document, default dialect: the header names the
 * fields, a field the row stops short of is null (Python's `None`), and any
 * extra field rides under a `null` key, which every caller drops. A blank line
 * is skipped, a quoted field carries delimiters, newlines and doubled quotes.
 */
export function csvDictRows(text: string): Record<string, string | null>[] {
  const rows = csvRows(text);
  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const row: Record<string, string | null> = {};
    header.forEach((name, i) => {
      row[name] = i < cells.length ? cells[i] : null;
    });
    if (cells.length > header.length) row["null"] = cells[header.length];
    return row;
  });
}

/** The rows of a CSV document, each a list of raw fields. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let fieldSeen = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
    fieldSeen = false;
  };
  const endRow = () => {
    push();
    // csv.reader hands an empty line back as no row at all.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === "" && !fieldSeen) {
      quoted = true;
      fieldSeen = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      push();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i += 1;
      continue;
    }
    if (ch === "\r" && text[i + 1] === "\n") {
      endRow();
      i += 2;
      continue;
    }
    field += ch;
    fieldSeen = true;
    i += 1;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

// ---------------------------------------------------------------- yaml

class YamlError extends Error {}

interface Line {
  indent: number;
  text: string;
  number: number;
}

/** The document's significant lines: blanks and full-line comments dropped,
 * a document marker ignored, indentation counted. */
function scanLines(text: string): Line[] {
  const out: Line[] = [];
  text.split(/\r\n|\n|\r/).forEach((raw, index) => {
    const trimmed = raw.replace(/\s+$/, "");
    const body = trimmed.trimStart();
    if (body === "" || body.startsWith("#") || body === "---") return;
    out.push({ indent: trimmed.length - body.length, text: body, number: index + 1 });
  });
  return out;
}

/** Strip a trailing `# comment` that is not inside quotes. */
function stripComment(text: string): string {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === "\\" && quote === '"') i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "#" && (i === 0 || /\s/.test(text[i - 1]))) return text.slice(0, i).replace(/\s+$/, "");
  }
  return text;
}

function unquote(raw: string, line: number): string {
  const text = raw.trim();
  if (text.startsWith("'")) {
    if (!text.endsWith("'") || text.length < 2) throw new YamlError(`unterminated single-quoted scalar at line ${line}`);
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.startsWith('"')) {
    if (!text.endsWith('"') || text.length < 2) throw new YamlError(`unterminated double-quoted scalar at line ${line}`);
    let out = "";
    for (let i = 1; i < text.length - 1; i++) {
      const ch = text[i];
      if (ch !== "\\") {
        out += ch;
        continue;
      }
      const next = text[++i];
      if (next === "n") out += "\n";
      else if (next === "t") out += "\t";
      else if (next === "r") out += "\r";
      else out += next;
    }
    return out;
  }
  return text;
}

/** The YAML core schema's plain scalars: null, bool, int, float, else string. */
function plainScalar(text: string): unknown {
  if (text === "" || text === "~" || /^null$/i.test(text)) return null;
  if (/^(true|yes|on)$/i.test(text)) return true;
  if (/^(false|no|off)$/i.test(text)) return false;
  if (/^[-+]?[0-9]+$/.test(text)) return Number.parseInt(text, 10);
  if (/^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)(?:[eE][-+]?[0-9]+)?$/.test(text)) return Number.parseFloat(text);
  return text;
}

function scalar(raw: string, line: number): unknown {
  const text = raw.trim();
  if (text.startsWith("[") || text.startsWith("{")) return readFlow(text, line);
  if (text.startsWith("'") || text.startsWith('"')) return unquote(text, line);
  return plainScalar(text);
}

/** A flow collection: `[a, b]`, `{a: b, c: [1, 2]}`. */
function readFlow(text: string, line: number): unknown {
  let i = 0;
  const skip = () => {
    while (i < text.length && /\s/.test(text[i])) i += 1;
  };
  const readPlain = (stops: string): string => {
    const start = i;
    while (i < text.length && !stops.includes(text[i])) i += 1;
    return text.slice(start, i).trim();
  };
  const readValue = (): unknown => {
    skip();
    const ch = text[i];
    if (ch === "[" || ch === "{") {
      const mapping = ch === "{";
      const close = mapping ? "}" : "]";
      i += 1;
      const items: unknown[] = [];
      const entries: Record<string, unknown> = {};
      for (;;) {
        skip();
        if (i >= text.length) throw new YamlError(`unterminated flow collection at line ${line}`);
        if (text[i] === close) {
          i += 1;
          return mapping ? entries : items;
        }
        if (text[i] === ",") {
          i += 1;
          continue;
        }
        if (mapping) {
          skip();
          const key = text[i] === "'" || text[i] === '"' ? String(readValue()) : readPlain(":," + close);
          skip();
          if (text[i] !== ":") throw new YamlError(`flow mapping entry without a value at line ${line}`);
          i += 1;
          entries[key] = readValue();
        } else {
          items.push(readValue());
        }
      }
    }
    if (ch === "'" || ch === '"') {
      let out = "";
      const quote = ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === quote) {
          if (quote === "'" && text[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        if (text[i] === "\\" && quote === '"') {
          const next = text[++i];
          out += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 1;
          continue;
        }
        out += text[i++];
      }
      return out;
    }
    return plainScalar(readPlain(",]" + "}"));
  };
  const value = readValue();
  skip();
  if (i !== text.length) throw new YamlError(`trailing text after a flow collection at line ${line}`);
  return value;
}

/**
 * `yaml.safe_load` for the legacy module dialect: block mappings and
 * sequences, both flow collection styles, quoted and plain scalars, `|`/`>`
 * block scalars with their chomping indicators, and `#` comments. A document
 * whose top level is not a mapping still parses; the callers treat any
 * non-table as `{}`.
 */
export function loadYaml(text: string, file = "module.yaml"): unknown {
  const lines = scanLines(text);
  let at = 0;
  const fail = (number: number, detail: string): never => {
    throw new YamlError(`${file}: ${detail} at line ${number}`);
  };

  const blockScalar = (header: string, indent: number): string => {
    const keep = header.endsWith("+");
    const chomp = header.endsWith("-");
    const folded = header.startsWith(">");
    const parts: { indent: number; text: string }[] = [];
    while (at < lines.length && lines[at].indent > indent) {
      parts.push({ indent: lines[at].indent, text: lines[at].text });
      at += 1;
    }
    if (!parts.length) return "";
    const base = parts[0].indent;
    const body = parts.map((part) => " ".repeat(Math.max(0, part.indent - base)) + part.text).join("\n");
    const value = folded ? body.replace(/([^\n])\n(?!\n)/g, "$1 ") : body;
    if (chomp) return value;
    return keep ? value + "\n\n" : value + "\n";
  };

  const isMappingLine = (line: Line): boolean => {
    if (line.text.startsWith("- ") || line.text === "-") return false;
    const text = stripComment(line.text);
    return text.includes(":");
  };

  const parseNode = (indent: number): unknown => {
    if (at >= lines.length) return null;
    if (lines[at].text.startsWith("- ") || lines[at].text === "-") return parseSequence(indent);
    return parseMapping(indent);
  };

  const parseSequence = (indent: number): unknown[] => {
    const items: unknown[] = [];
    while (
      at < lines.length &&
      lines[at].indent === indent &&
      (lines[at].text.startsWith("- ") || lines[at].text === "-")
    ) {
      const line = lines[at];
      const rest = line.text === "-" ? "" : stripComment(line.text.slice(2)).trim();
      at += 1;
      if (rest === "") {
        items.push(at < lines.length && lines[at].indent > indent ? parseNode(lines[at].indent) : null);
        continue;
      }
      // `- key: value` opens a nested block mapping at the dash's content column.
      if (isMappingLine({ ...line, text: rest })) items.push(parseMapping(indent + 2, [rest]));
      else items.push(scalar(rest, line.number));
    }
    return items;
  };

  /** A mapping at `indent`; `leading` seeds the first entry (`- key: value`). */
  const parseMapping = (indent: number, leading: string[] = []): Record<string, unknown> => {
    const map: Record<string, unknown> = {};
    let pending = leading;
    for (;;) {
      let text: string;
      let number: number;
      if (pending.length) {
        text = pending.shift()!;
        number = lines[Math.max(0, at - 1)]?.number ?? 1;
      } else {
        if (at >= lines.length || lines[at].indent !== indent || !isMappingLine(lines[at])) return map;
        const line = lines[at];
        text = stripComment(line.text);
        number = line.number;
        at += 1;
      }
      const cut = text.indexOf(":");
      const key = unquote(text.slice(0, cut), number).trim();
      const rest = stripComment(text.slice(cut + 1)).trim();
      if (rest.startsWith("|") || rest.startsWith(">")) {
        if (!/^[|>][+-]?$/.test(rest)) fail(number, `unsupported block scalar header ${pyRepr(rest)}`);
        map[key] = blockScalar(rest, indent);
        continue;
      }
      if (rest === "") {
        if (at < lines.length && lines[at].indent > indent) map[key] = parseNode(lines[at].indent);
        else if (at < lines.length && lines[at].indent === indent && (lines[at].text.startsWith("- ") || lines[at].text === "-"))
          map[key] = parseSequence(indent);
        else map[key] = null;
        continue;
      }
      if (isMappingLine({ indent, text: rest, number })) {
        // `key:\n  ...` written inline is not this dialect; refuse it loudly
        // rather than guessing.
        fail(number, `a mapping value must start on its own line`);
      }
      map[key] = scalar(rest, number);
    }
  };

  if (!lines.length) return null;
  const value = parseNode(lines[0].indent);
  if (at < lines.length) fail(lines[at].number, "cannot parse");
  return value;
}

// ---------------------------------------------------------------- dates

/** Python's `date`: a local-time date with no zone, compared by value. */
export interface PyDate {
  year: number;
  month: number;
  day: number;
}

/** `datetime.strptime(raw, "%Y-%m-%d" | "%Y-%m" | "%Y").date()`. */
export function parseDate(raw: string): PyDate {
  const text = raw.trim();
  const match = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(text);
  if (!match) throw new Error(`unparseable date: ${pyRepr(text)} (want YYYY[-MM[-DD]])`);
  const [, year, month, day] = match;
  const date = { year: Number(year), month: Number(month ?? 1), day: Number(day ?? 1) };
  if (!dayOfMonthExists(date)) throw new Error(`day is out of range for month`);
  return date;
}

function dayOfMonthExists({ year, month, day }: PyDate): boolean {
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** `calendar.monthrange(year, month)[1]`. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `d + relativedelta(months=n)`, the Python's day-clamping included. */
export function addMonths(date: PyDate, months: number): PyDate {
  const total = date.month - 1 + months;
  const year = date.year + Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function formatDate(date: PyDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(date.year).padStart(4, "0")}-${pad(date.month)}-${pad(date.day)}`;
}

export function compareDates(a: PyDate, b: PyDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Today in the host's local time — `date.today()`, for the shapes that did
 * not pin one. */
export function today(): PyDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

// ---------------------------------------------------------------- strings

/**
 * `Path(text).resolve()` for a path a command line handed in: a relative path
 * is taken against this process's working directory, exactly as the
 * interpreter resolved it. The ports call this where the Python called
 * `.resolve()` on an argument; the call sites in the vendored tree expand
 * `{project-root}` and `{skill-root}` to absolute paths, and a human typing
 * `--project-root .` gets the folder they are standing in.
 */
export function absolutePath(text: string, cwd = process.cwd()): string {
  // A Windows absolute (`C:\…`, a UNC share) is already resolved: prefixing the
  // working directory is what broke the runtime on Windows.
  const path = toForwardSlashes(text);
  return resolvePath(isAbsolutePath(path) ? path : `${toForwardSlashes(cwd)}/${path}`);
}

/** `unicodedata.normalize("NFKD", text).encode("ascii", "ignore")`. */
export function asciiFold(text: string): string {
  return text
    .normalize("NFKD")
    .split("")
    .filter((ch) => ch.codePointAt(0)! < 0x80)
    .join("");
}

/** `html.escape(text)`: `&<>` always, quotes only when asked. */
export function htmlEscape(text: string, quote = true): string {
  const out = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return quote ? out.replace(/"/g, "&quot;").replace(/'/g, "&#x27;") : out;
}

/** Python's `str.splitlines()`: an empty document has no lines. */
export function pySplitLines(text: string): string[] {
  if (text === "") return [];
  // \r\n, then any of Python's other line boundaries (\v \f \x1c-\x1e \x85
  // \u2028 \u2029), written as escapes so the source carries no line breaks.
  const lines = text.split(new RegExp("\\r\\n|[\\n\\r\\v\\f\\x1c-\\x1e\\x85\\u2028\\u2029]"));
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** `" ".join(text.split())`: whitespace runs collapse, ends trimmed. */
export function pySplitJoin(text: string): string {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

/** Python's `round(value, digits)` — half to even at the requested scale. */
export function pyRound(value: number, digits = 0): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}

// ---------------------------------------------------------------- port plumbing

export interface PortResult {
  stdout: string;
  exitCode: number;
}

/** A refusal in the Task 6 convention, at the exit code argparse used. */
export function usageError(script: string, message: string): PortResult {
  return { stdout: `${script}: error: ${message}`, exitCode: 2 };
}


const BLOCK_RE = /\{if-([a-zA-Z0-9_-]+)\}([\s\S]*?)\{\/if-\1\}/;

/** `process_conditionals`: innermost blocks first, then at most one blank line
 * where a removed block left a run of them. */
export function processConditionals(
  text: string,
  truths: Set<string>,
): { text: string; kept: string[]; removed: string[] } {
  const kept: string[] = [];
  const removed: string[] = [];
  let current = text;
  for (;;) {
    const match = BLOCK_RE.exec(current);
    if (match === null) break;
    const condition = match[1];
    const replacement = truths.has(condition) ? match[2] : "";
    if (truths.has(condition)) {
      if (!kept.includes(condition)) kept.push(condition);
    } else if (!removed.includes(condition)) removed.push(condition);
    current = current.slice(0, match.index) + replacement + current.slice(match.index + match[0].length);
  }
  return { text: current.replace(/\n{3,}/g, "\n\n"), kept, removed };
}

/** `process_variables`, in the order the assignments were given. */
export function processVariables(
  text: string,
  variables: Map<string, string>,
): { text: string; substituted: string[] } {
  const substituted: string[] = [];
  let current = text;
  for (const [name, value] of variables) {
    const placeholder = `{${name}}`;
    if (current.includes(placeholder)) {
      current = current.split(placeholder).join(value);
      substituted.push(name);
    }
  }
  return { text: current, substituted };
}

/** `--flag` / `--flag=value` / `-o` in one place. */
export function splitFlag(token: string): [string, string | null] {
  if (!token.startsWith("-") || token === "-" || token === "--") return [token, null];
  const cut = token.indexOf("=");
  if (cut < 0) return [token, null];
  return [token.slice(0, cut), token.slice(cut + 1)];
}

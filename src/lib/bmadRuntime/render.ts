import { parse as parseToml } from "smol-toml";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { loadCentralConfig, resolveCustomization, deepMerge } from "./config";
import type { Fs } from "./fs";
import { isAbsolutePath } from "./paths";
import { hasOwn } from "./compat";

/**
 * Port of `skills/bmad/scripts/render_skill.py` at bda3c59. The Python is the
 * specification: the sources it loads, the Jinja2 environment it renders them
 * with (StrictUndefined, trim_blocks, lstrip_blocks, keep_trailing_newline),
 * the values a template may reach (`config.*`, `workflow.*`, `rendered()`,
 * `halt()`), the generation it publishes and the line it prints — `read and
 * follow <workflow.md>`, or `HALT: <reason>` for a render it refuses. The
 * goldens under `__tests__/goldens/render` are the contract.
 *
 * Seams, all substitutions of things a port cannot or must not share:
 * - config and customization come from the Task 3 `loadCentralConfig` /
 *   `resolveCustomization`, not the project's own `_bmad/scripts/config_utils.py`
 *   (so a missing config names itself in different words);
 * - the skill's own `setup_check` note is not ported: it is optional, must
 *   never fail a render, and has no equivalent here;
 * - `--overrides` is not ported: no call site in the pinned tree passes it;
 * - output goes to one channel — stdout — and `renderSkill` returns it, so the
 *   caller (the runtime CLI) prints exactly what the Python printed. The Python
 *   exits 1 after a HALT line; the caller reads the line;
 * - the generation directory is the Python's own scheme — `<project-root>/_bmad/
 *   render/<skill>/<slug>-<root-hash>/<generation-hash>` — but its identity
 *   carries the port's renderer marker where the Python hashes its own file
 *   bytes, and `template_engine` where the Python records its jinja2 version.
 *   Both only change the hashes, which name an opaque folder either way;
 * - publish writes the generation in place: `Fs` has no rename, so the Python's
 *   staging directory + atomic rename is not reproducible. A crash mid-publish
 *   leaves a partial generation, which the next run reports as corrupt;
 * - `_load_sources`' symlink-escape checks have no `Fs` equivalent: the port
 *   walks what `list` shows and reads only regular files.
 */

// ---------------------------------------------------------------- errors

/** The Python's RenderError: raised when rendering cannot safely publish. */
class RenderError extends Error {}

/** jinja2's StrictUndefined: a name a template read and the context does not
 * hold. Raised when the value is used, not when it is looked up — `| default`
 * is allowed to see it. */
class UndefinedError extends RenderError {}

const pyTypeName = (value: unknown): string => {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string" || value instanceof Text) return "str";
  if (Array.isArray(value)) return "list";
  if (value === null || value === undefined) return "NoneType";
  return "dict";
};

// ---------------------------------------------------------------- hashing

const sha256Hex = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)));

/** `json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))`:
 * the Python's canonical JSON, which keys both hashes and the manifest. */
function canonicalJson(value: unknown): string {
  const write = (value: unknown): string => {
    if (value === null || value === undefined) return "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(write).join(",")}]`;
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${write(v)}`).join(",")}}`;
  };
  return write(value);
}

// ---------------------------------------------------------------- toml values

/** `_toml_literal`: one TOML value, as `--set` writes it. */
function tomlLiteral(text: string, label: string): unknown {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(`value = ${text}`) as Record<string, unknown>;
  } catch (error) {
    throw new RenderError(`invalid TOML value for ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (Object.keys(parsed).length !== 1 || !("value" in parsed)) {
    throw new RenderError(`${label} must contain a single TOML value`);
  }
  return parsed.value;
}

// ---------------------------------------------------------------- customization layers

const PARAMETER_RE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/;

/** `_leaf_paths`: every dotted path a table holds, down to its scalars. */
function leafPaths(table: Record<string, unknown>, prefix = ""): Set<string> {
  const leaves = new Set<string>();
  for (const [key, value] of Object.entries(table)) {
    const path = `${prefix}${key}`;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const leaf of leafPaths(value as Record<string, unknown>, `${path}.`)) leaves.add(leaf);
    } else leaves.add(path);
  }
  return leaves;
}

/** `_declares`: the skill's own defaults hold this path. */
function declares(defaults: Record<string, unknown> | null, path: string): boolean {
  let node: unknown = defaults;
  for (const part of path.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node) || !hasOwn(node as Record<string, unknown>, part)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return true;
}

/** `_lookup`: walk a dotted path, naming what is missing. */
function lookup(data: Record<string, unknown>, path: string, label: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !hasOwn(current as Record<string, unknown>, part)) {
      throw new RenderError(`missing ${label} \`${path}\``);
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** `_check_persistent_layers`: a persistent override may only set keys the skill
 * declares; a stale or misspelled key halts. */
async function checkPersistentLayers(
  projectRoot: string,
  skillName: string,
  defaults: Record<string, unknown> | null,
  fs: Fs,
): Promise<void> {
  for (const layer of [`${projectRoot}/_bmad/custom/${skillName}.toml`, `${projectRoot}/_bmad/custom/${skillName}.user.toml`]) {
    const table = await readTomlLayer(layer, fs);
    const undeclared = [...leafPaths(table)].filter((path) => !declares(defaults, path)).sort();
    if (undeclared.length) {
      throw new RenderError(`${layer} sets keys ${skillName} does not declare: ${undeclared.join(", ")}`);
    }
  }
}

/** `config_utils.load_toml`: an absent optional layer is `{}`. */
async function readTomlLayer(path: string, fs: Fs): Promise<Record<string, unknown>> {
  if (!(await fs.exists(path))) return {};
  try {
    return parseToml(await fs.readText(path)) as Record<string, unknown>;
  } catch (error) {
    throw new RenderError(`failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A decimal float literal (`2.0`, `1e3`); `0x1E` is an integer whose `E` is a digit. */
const DECIMAL_FLOAT_RE = /^[+-]?\d[\d_]*(\.\d|[eE])/;

/** smol-toml reads a default written `2.0` as the integer 2, so the check
 * `--set` makes against an int default needs the source text: true only when
 * every line assigning the path's leaf key writes an integer literal. When the
 * spelling cannot be found the default is not known to be an int. */
function defaultWrittenAsInt(source: string, path: string): boolean {
  const leaf = path.split(".").pop() ?? path;
  const escaped = leaf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = new RegExp(`^\\s*(?:${escaped}|"${escaped}"|'${escaped}')\\s*=\\s*([^#\\n]*)`, "gm");
  const values = [...source.matchAll(line)].map((m) => m[1].trim());
  return values.length > 0 && values.every((v) => /^[+-]?(\d[\d_]*|0x[\da-fA-F_]+|0o[0-7_]+|0b[01_]+)$/.test(v));
}

/** `_invocation_customization`: the `--set` assignments as one command layer.
 * A repeated or overlapping path is a caller mistake, not a precedence rule; a
 * string default takes the raw text so `--set workflow.route=full` is a route,
 * not a TOML value. */
function invocationCustomization(
  defaults: Record<string, unknown> | null,
  assignments: Record<string, string>,
  defaultsSource = "",
): Record<string, unknown> {
  const commandLayer: Record<string, unknown> = {};
  const assigned: string[] = [];
  for (const [path, raw] of Object.entries(assignments)) {
    if (!PARAMETER_RE.test(path)) {
      throw new RenderError(`invalid --set assignment \`${path}=${raw}\`; expected bare dotted key=value`);
    }
    for (const earlier of assigned) {
      if (path === earlier || path.startsWith(`${earlier}.`) || earlier.startsWith(`${path}.`)) {
        throw new RenderError(`--set \`${path}\` conflicts with earlier --set \`${earlier}\``);
      }
    }
    assigned.push(path);
    const fallback = lookup(defaults ?? {}, path, "customization parameter");
    const value = typeof fallback === "string" && !/^\s*["']/.test(raw) ? raw : tomlLiteral(raw, path);
    // Python's `type(value) is not type(default)` tells an int from a float, and
    // `--set` is where the port can still tell: TOML's `2.0` is a float, and an
    // int default refuses it. (`tomlLiteral` alone cannot — both spellings parse
    // to the number 2 in JavaScript.)
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      Number.isInteger(fallback) &&
      DECIMAL_FLOAT_RE.test(raw.trim()) &&
      defaultWrittenAsInt(defaultsSource, path)
    ) {
      throw new RenderError(`customization.${path} must be int, got float`);
    }
    let target = commandLayer;
    const parts = path.split(".");
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object") target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = value;
  }
  return commandLayer;
}

// ---------------------------------------------------------------- value shapes

/** The Python's `_Text`: a customization string. Looping over one is a template
 * mistake, not a walk over its characters. */
class Text {
  constructor(
    readonly value: string,
    readonly label: string,
  ) {}
}

type ReviewLayer = { id: string; name: string; instruction: string; when?: string };

/** `_MarkdownList`: inserted directly it renders as the Markdown list it is. */
class MarkdownList extends Array<string> {}
/** `_LayerList`: inserted directly it renders as lens sections. */
class LayerList extends Array<ReviewLayer> {}

const markdownList = (items: string[]): MarkdownList => {
  const list = new MarkdownList();
  list.push(...items);
  return list;
};
const layerList = (layers: ReviewLayer[]): LayerList => {
  const list = new LayerList();
  list.push(...layers);
  return list;
};

/** `_format_markdown_list`. */
function formatMarkdownList(items: string[]): string {
  if (!items.length) return "_None._";
  const rendered: string[] = [];
  for (const item of items) {
    const lines = item.split("\n");
    rendered.push(`- ${lines[0]}`);
    for (const line of lines.slice(1)) rendered.push(`  ${line}`);
  }
  return rendered.join("\n");
}

/** `_format_review_layers`. */
function formatReviewLayers(layers: ReviewLayer[]): string {
  const active = layers.filter((layer) => layer.instruction.trim());
  if (!active.length) return "No active review layers. HALT with blocking condition `no active review layers`.";
  const sections: string[] = [];
  for (const layer of active) {
    const section = [`#### ${layer.name} (\`${layer.id}\`)`];
    if (layer.when) section.push("", `Run only when: ${layer.when}`);
    section.push("", layer.instruction.trim());
    sections.push(section.join("\n"));
  }
  return sections.join("\n\n");
}

function requireString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string") throw new RenderError(`${label} must be a string, got ${pyTypeName(value)}`);
  if (!allowEmpty && !value.trim()) throw new RenderError(`${label} must not be empty`);
  return value;
}

function requireStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new RenderError(`${label} must be a list, got ${pyTypeName(value)}`);
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}

function requireReviewLayers(value: unknown, label: string): ReviewLayer[] {
  if (!Array.isArray(value)) throw new RenderError(`${label} must be a list of tables`);
  const seen = new Set<string>();
  return value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new RenderError(`${itemLabel} must be a table`);
    const source = item as Record<string, unknown>;
    const id = requireString(source.id, `${itemLabel}.id`);
    if (seen.has(id)) throw new RenderError(`duplicate review layer id \`${id}\``);
    seen.add(id);
    const layer: ReviewLayer = {
      id,
      name: requireString(source.name ?? id, `${itemLabel}.name`),
      instruction: requireString(source.instruction, `${itemLabel}.instruction`, true),
    };
    if (hasOwn(source, "when")) layer.when = requireString(source.when, `${itemLabel}.when`);
    return layer;
  });
}

/** `_resolve_customization_value`: an effective leaf, validated against the shape
 * of its shipped default. */
function resolveCustomizationValue(value: unknown, fallback: unknown, label: string): unknown {
  if (typeof fallback === "string") return requireString(value, label, !fallback.trim());
  if (Array.isArray(fallback)) {
    if (fallback.length && fallback.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return requireReviewLayers(value, label);
    }
    return requireStringList(value, label);
  }
  if (typeof fallback === "boolean" || typeof fallback === "number") {
    if (pyTypeName(value) !== pyTypeName(fallback)) {
      throw new RenderError(`${label} must be ${pyTypeName(fallback)}, got ${pyTypeName(value)}`);
    }
    return value;
  }
  throw new RenderError(`${label} has unsupported default type ${pyTypeName(fallback)}`);
}

/** `_bind_customization`: bind `{skill-root}` in customization prose to the
 * generation, and wrap lists so an insert renders as the thing it always did. */
function bindCustomization(value: unknown, label: string, destination: string): unknown {
  const bind = (text: string) => text.replaceAll("{skill-root}", destination);
  if (typeof value === "string") return new Text(bind(value), label);
  if (Array.isArray(value)) {
    const items = value as unknown[];
    if (items.length && items.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return layerList(
        (items as ReviewLayer[]).map((layer) => {
          const bound = Object.fromEntries(Object.entries(layer).map(([key, text]) => [key, bind(text)]));
          return bound as unknown as ReviewLayer;
        }),
      );
    }
    return markdownList((items as string[]).map(bind));
  }
  return value;
}

// ---------------------------------------------------------------- tables

/** `_Table`: a dotted namespace over a TOML table. Names never hit JavaScript
 * properties, so `workflow.items` is a lookup. */
abstract class Table {
  constructor(readonly path: string) {}
  abstract resolve(name: string): unknown;
}

/** `_ConfigTable`: `config.key` is the short lookup of one scalar anywhere in
 * the central config; `config.a.b.c` is a path. */
class ConfigTable extends Table {
  constructor(
    private readonly central: Record<string, unknown>,
    private readonly table: Record<string, unknown>,
    path: string,
    private readonly ctx: RenderContext,
  ) {
    super(path);
  }

  resolve(name: string): unknown {
    if (this.path === "config" && !hasOwn(this.table, name)) {
      const [path, resolved] = resolveShortConfig(this.central, name, this.ctx.projectRoot);
      this.ctx.inputs[`config.${path}`] = resolved;
      return new Text(resolved, `config.${path}`);
    }
    const label = `${this.path}.${name}`;
    if (!hasOwn(this.table, name)) throw new RenderError(`missing config value \`${label.replace(/^config\./, "")}\``);
    const value = this.table[name];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return new ConfigTable(this.central, value as Record<string, unknown>, label, this.ctx);
    }
    const resolved = resolveConfigValue(value, label, this.ctx.projectRoot);
    this.ctx.inputs[label] = resolved;
    return new Text(resolved, label);
  }
}

/** `_CustomizationTable`: the effective customization, each leaf validated
 * against its `customize.toml` default. */
class CustomizationTable extends Table {
  constructor(
    private readonly defaults: Record<string, unknown> | null,
    private readonly values: Record<string, unknown>,
    path: string,
    private readonly ctx: RenderContext,
  ) {
    super(path);
  }

  resolve(name: string): unknown {
    const path = `${this.path}.${name}`;
    if (this.defaults === null) throw new RenderError(`\`${path}\` requires customize.toml`);
    if (!hasOwn(this.defaults, name)) throw new RenderError(`missing customization parameter \`${path}\``);
    if (!hasOwn(this.values, name)) throw new RenderError(`missing customization value \`${path}\``);
    const fallback = this.defaults[name];
    const value = this.values[name];
    const label = `customization.${path}`;
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new RenderError(`${label} must be a table, got ${pyTypeName(value)}`);
      }
      return new CustomizationTable(fallback as Record<string, unknown>, value as Record<string, unknown>, path, this.ctx);
    }
    const resolved = resolveCustomizationValue(value, fallback, label);
    this.ctx.inputs[label] = resolved;
    return bindCustomization(resolved, label, this.ctx.destination);
  }
}

// ---------------------------------------------------------------- config values

/** `_resolve_config_value`: `{project-root}` binds here, and the result must be
 * absolute. */
function resolveConfigValue(value: unknown, label: string, projectRoot: string): string {
  const text = requireString(value, label);
  if (!text.includes("{project-root}")) return text;
  const resolved = text.replaceAll("{project-root}", projectRoot);
  if (!isAbsolutePath(resolved)) throw new RenderError(`${label} must resolve to an absolute path: ${resolved}`);
  return resolved;
}

/** `_find_config_values`: every scalar under `key`, depth-first, in table order. */
function findConfigValues(data: unknown, key: string, prefix = ""): [string, unknown][] {
  const matches: [string, unknown][] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return matches;
  for (const [name, value] of Object.entries(data as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (name === key && !(value && typeof value === "object")) matches.push([path, value]);
    matches.push(...findConfigValues(value, key, path));
  }
  return matches;
}

/** `_resolve_short_config`: one scalar named `key` anywhere in the config, or a
 * refusal — ambiguity is not a precedence rule. */
function resolveShortConfig(central: Record<string, unknown>, key: string, projectRoot: string): [string, string] {
  const matches = findConfigValues(central, key);
  if (!matches.length) throw new RenderError(`missing config value \`${key}\``);
  if (matches.length > 1) {
    throw new RenderError(`ambiguous config value \`${key}\` found at: ${matches.map(([path]) => path).join(", ")}`);
  }
  const [path, value] = matches[0];
  return [path, resolveConfigValue(value, `config.${path}`, projectRoot)];
}

// ---------------------------------------------------------------- the template engine

/** jinja2's StrictUndefined, held as a value until something uses it. */
type Undefined = { __undefined: string };

const isUndefined = (value: unknown): value is Undefined =>
  typeof value === "object" && value !== null && "__undefined" in (value as Record<string, unknown>);

const undefinedValue = (name: string): Undefined => ({ __undefined: name });

const usedUndefined = (value: Undefined): never => {
  throw new UndefinedError(`'${value.__undefined}' is undefined`);
};

/** Python truthiness, which jinja follows: empty strings, lists and dicts are
 * false, a Table is an object and therefore true. */
function pyTruthy(value: unknown): boolean {
  if (isUndefined(value)) usedUndefined(value);
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (value instanceof Text) return value.value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  // A Table is a plain object in Python terms — no __len__, no __bool__ — and
  // therefore true; a dict follows its keys.
  if (value instanceof Table) return true;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

/** Python's repr of the small values a template can insert. */
function pyRepr(value: unknown): string {
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (typeof value === "boolean") return value ? "True" : "False";
  if (value === null || value === undefined) return "None";
  if (Array.isArray(value)) return `[${value.map(pyRepr).join(", ")}]`;
  if (value && typeof value === "object" && !(value instanceof Text)) {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => `${pyRepr(k)}: ${pyRepr(v)}`);
    return `{${entries.join(", ")}}`;
  }
  return String(value);
}

/** `str(value)` as jinja's `{{ }}` inserts it. */
function toDisplay(value: unknown): string {
  if (isUndefined(value)) usedUndefined(value);
  if (value instanceof Table) throw new RenderError(`\`${value.path}\` is a table, not a value`);
  if (value instanceof Text) return value.value;
  if (value instanceof MarkdownList) return formatMarkdownList([...value]);
  if (value instanceof LayerList) return formatReviewLayers([...value]);
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return pyRepr(value);
  if (typeof value === "object") return pyRepr(value);
  return String(value);
}

function pyEqual(a: unknown, b: unknown): boolean {
  if (isUndefined(a)) usedUndefined(a);
  if (isUndefined(b)) usedUndefined(b);
  if (a instanceof Text) a = a.value;
  if (b instanceof Text) b = b.value;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => pyEqual(item, b[index]));
  return a === b;
}

/** `<` and friends: Python compares two numbers numerically and everything else
 * through its ordering — the port has no richer one, so it uses the string form.
 * A bool is an int, so `True < 2` holds. */
function compareValues(a: unknown, b: unknown): number {
  const isNumber = (value: unknown) => typeof value === "number" || typeof value === "boolean";
  if (isNumber(a) && isNumber(b)) {
    const [x, y] = [Number(a), Number(b)];
    return x === y ? 0 : x < y ? -1 : 1;
  }
  const [x, y] = [toDisplay(a), toDisplay(b)];
  return x === y ? 0 : x < y ? -1 : 1;
}

const FILTERS: Record<string, (value: unknown, args: unknown[]) => unknown> = {
  /** jinja's `default(value, default_value="", boolean=false)`. */
  default: (value, args) =>
    isUndefined(value) || (pyTruthy(args[1]) && !pyTruthy(value)) ? (args.length ? args[0] : "") : value,
};

type Chunk =
  | { kind: "text"; text: string }
  | { kind: "output"; expr: string; line: number }
  | { kind: "tag"; body: string; line: number };

type Node =
  | { kind: "text"; text: string }
  | { kind: "output"; expr: string; line: number }
  | { kind: "set"; name: string; expr: string; line: number }
  | { kind: "if"; branches: { expr: string | null; body: Node[] }[]; line: number }
  | { kind: "for"; name: string; expr: string; body: Node[]; line: number };

const isSpace = (ch: string) => ch === " " || ch === "\t";

/** The lexer: jinja2's tags with the pinned environment's whitespace rules
 * (trim_blocks, lstrip_blocks, keep_trailing_newline). */
function tokenize(source: string): Chunk[] {
  const chunks: Chunk[] = [];
  let text = "";
  let line = 1;
  let i = 0;
  const flush = () => {
    if (text) chunks.push({ kind: "text", text });
    text = "";
  };
  /** jinja strips the whitespace a line holds before a block tag. */
  const lstrip = () => {
    const cut = text.lastIndexOf("\n") + 1;
    if ([...text.slice(cut)].every(isSpace)) text = text.slice(0, cut);
  };
  while (i < source.length) {
    const at = (() => {
      for (let j = i; j < source.length - 1; j++) {
        if (source[j] === "{" && (source[j + 1] === "{" || source[j + 1] === "%" || source[j + 1] === "#")) return j;
      }
      return -1;
    })();
    if (at === -1) {
      text += source.slice(i);
      break;
    }
    text += source.slice(i, at);
    line += (source.slice(i, at).match(/\n/g) ?? []).length;
    const opener = source[at + 1];
    const close = `${opener === "{" ? "}" : opener}}`;
    const end = findClose(source, close, at + 2);
    if (end === -1) throw new RenderError(`unclosed ${opener} at line ${line}`);
    const inner = source.slice(at + 2, end);
    const leftSign = inner.startsWith("-") ? "-" : inner.startsWith("+") ? "+" : "";
    const rightSign = inner.endsWith("-") ? "-" : inner.endsWith("+") ? "+" : "";
    const body = inner.slice(leftSign ? 1 : 0, rightSign ? -1 : undefined).trim();
    if (leftSign === "-") text = text.replace(/\s+$/, "");
    else if (opener !== "{" && leftSign !== "+") lstrip();
    const after = end + 2;
    if (body === "raw" && opener === "%") {
      const rawEnd = findRawEnd(source, after);
      if (rawEnd === -1) throw new RenderError(`unclosed raw block at line ${line}`);
      let raw = source.slice(after, rawEnd.start);
      if (rightSign === "-") raw = raw.replace(/^\s+/, "");
      if (rawEnd.leftSign === "-") raw = raw.replace(/\s+$/, "");
      flush();
      if (raw) chunks.push({ kind: "text", text: raw });
      line += (source.slice(after, rawEnd.after).match(/\n/g) ?? []).length;
      i = rawEnd.after;
      continue;
    }
    let next = after;
    if (rightSign === "-") next += /^\s+/.exec(source.slice(after))?.[0].length ?? 0;
    else if (opener !== "{" && rightSign !== "+" && source.startsWith("\n", after)) next = after + 1;
    else if (opener !== "{" && rightSign !== "+" && source.startsWith("\r\n", after)) next = after + 2;
    if (opener === "#") {
      i = next;
      continue;
    }
    flush();
    chunks.push(opener === "{" ? { kind: "output", expr: body, line } : { kind: "tag", body, line });
    line += (source.slice(after, next).match(/\n/g) ?? []).length;
    i = next;
  }
  flush();
  return chunks;
}

/** The end of a tag, skipping over quoted strings. */
function findClose(source: string, close: string, from: number): number {
  for (let j = from; j < source.length - 1; j++) {
    const ch = source[j];
    if (ch === '"' || ch === "'") {
      for (j++; j < source.length && source[j] !== ch; j++) {
        if (source[j] === "\\") j++;
      }
      continue;
    }
    if (source.startsWith(close, j)) return j;
  }
  return -1;
}

type RawEnd = { start: number; after: number; leftSign: string };

function findRawEnd(source: string, from: number): RawEnd | -1 {
  let i = from;
  while (i < source.length) {
    const at = source.indexOf("{%", i);
    if (at === -1) return -1;
    const end = source.indexOf("%}", at + 2);
    if (end === -1) return -1;
    const inner = source.slice(at + 2, end);
    if (inner.trim().replace(/^[-+]|[-+]$/g, "").trim() === "endraw") {
      const leftSign = inner.startsWith("-") ? "-" : "";
      let after = end + 2;
      if (inner.endsWith("-")) {
        after += /^\s+/.exec(source.slice(after))?.[0].length ?? 0;
      } else if (source.startsWith("\r\n", after)) after += 2;
      else if (source.startsWith("\n", after)) after += 1;
      return { start: at, after, leftSign };
    }
    i = end + 2;
  }
  return -1;
}

/** The parser: chunks into nodes. Blocks end on the tag that closes them. */
function parseNodes(chunks: Chunk[], from: number, stop?: (body: string) => boolean): { nodes: Node[]; index: number; stopTag?: string } {
  const nodes: Node[] = [];
  let i = from;
  for (; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.kind === "text") {
      nodes.push({ kind: "text", text: chunk.text });
      continue;
    }
    if (chunk.kind === "output") {
      nodes.push({ kind: "output", expr: chunk.expr, line: chunk.line });
      continue;
    }
    const [word] = chunk.body.split(/\s+/, 1);
    if (stop && stop(chunk.body)) return { nodes, index: i, stopTag: word };
    if (word === "if") {
      // Each branch runs until the tag that ends it: elif and else open the
      // next one, endif closes the block. `if` opens no scope.
      const branches: { expr: string | null; body: Node[] }[] = [];
      let expr: string | null = chunk.body.replace(/^if\s+/, "").trim();
      let cursor = i + 1;
      for (;;) {
        // Only a bare `else` ends a branch: `{% else if %}` is not a Jinja tag,
        // and letting it through would silently make it an unconditional else.
        const parsed = parseNodes(chunks, cursor, (body) => /^(elif\b|else\s*$|endif\b)/.test(body));
        branches.push({ expr, body: parsed.nodes });
        const tag = chunks[parsed.index];
        if (!tag || tag.kind !== "tag") throw new RenderError("unexpected end of template; missing endif");
        if (parsed.stopTag === "endif") {
          i = parsed.index;
          break;
        }
        if (parsed.stopTag === "else") expr = null;
        else if (parsed.stopTag === "elif") expr = tag.body.replace(/^elif\s+/, "").trim();
        else throw new RenderError("unexpected end of template; missing endif");
        cursor = parsed.index + 1;
      }
      nodes.push({ kind: "if", branches, line: chunk.line });
      continue;
    }
    if (word === "set") {
      const match = /^set\s+([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(chunk.body);
      if (!match) throw new RenderError(`invalid set at line ${chunk.line}`);
      nodes.push({ kind: "set", name: match[1], expr: match[2], line: chunk.line });
      continue;
    }
    if (word === "for") {
      const match = /^for\s+([A-Za-z_]\w*)\s+in\s+([\s\S]+)$/.exec(chunk.body);
      if (!match) throw new RenderError(`invalid for at line ${chunk.line}`);
      const body = parseNodes(chunks, i + 1, (b) => /^endfor\b/.test(b));
      if (body.stopTag !== "endfor") throw new RenderError(`unexpected end of template; missing endfor`);
      nodes.push({ kind: "for", name: match[1], expr: match[2], body: body.nodes, line: chunk.line });
      i = body.index;
      continue;
    }
    throw new RenderError(`unknown tag \`${chunk.body}\` at line ${chunk.line}`);
  }
  return { nodes, index: i };
}

// ---------------------------------------------------------------- expressions

type Expr =
  | { kind: "literal"; value: unknown }
  | { kind: "name"; name: string }
  | { kind: "attr"; target: Expr; name: string }
  | { kind: "item"; target: Expr; index: Expr }
  | { kind: "call"; target: Expr; args: Expr[] }
  | { kind: "filter"; target: Expr; name: string; args: Expr[] }
  | { kind: "tuple"; items: Expr[] }
  | { kind: "unary"; op: string; operand: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "compare"; op: string; left: Expr; right: Expr }
  | { kind: "and"; left: Expr; right: Expr }
  | { kind: "or"; left: Expr; right: Expr };

type Token = { kind: "name" | "number" | "string" | "op"; value: string };

function lexExpression(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      tokens.push({ kind: "name", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9._]/.test(source[j])) j++;
      tokens.push({ kind: "number", value: source.slice(i, j) });
      i = j;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== ch) {
        if (source[j] === "\\" && j + 1 < source.length) {
          const escaped = source[j + 1];
          value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped === "r" ? "\r" : escaped;
          j += 2;
          continue;
        }
        value += source[j];
        j++;
      }
      tokens.push({ kind: "string", value });
      i = j + 1;
      continue;
    }
    const op = ["==", "!=", "<=", ">=", "//", "**"].find((candidate) => source.startsWith(candidate, i)) ?? ch;
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

function parseExpression(source: string): Expr {
  const tokens = lexExpression(source);
  let at = 0;
  const peek = () => tokens[at];
  const take = () => tokens[at++];
  const eat = (value: string) => (peek() && peek().value === value && peek().kind === "op" ? (at++, true) : false);
  const expect = (value: string) => {
    if (!eat(value)) throw new RenderError(`expected \`${value}\` in \`${source}\``);
  };

  const parsePrimary = (): Expr => {
    const token = take();
    if (!token) throw new RenderError(`unexpected end of expression: \`${source}\``);
    if (token.kind === "string") return { kind: "literal", value: token.value };
    if (token.kind === "number") return { kind: "literal", value: Number(token.value) };
    if (token.kind === "name") {
      if (token.value === "true" || token.value === "True") return { kind: "literal", value: true };
      if (token.value === "false" || token.value === "False") return { kind: "literal", value: false };
      if (token.value === "none" || token.value === "None") return { kind: "literal", value: null };
      if (token.value === "not") return { kind: "unary", op: "not", operand: parseUnary() };
      return { kind: "name", name: token.value };
    }
    if (token.value === "(" || token.value === "[") {
      const close = token.value === "(" ? ")" : "]";
      if (eat(close)) return { kind: "tuple", items: [] };
      const first = parseOr();
      if (token.value === "[" || eat(",")) {
        const items = [first];
        while (!eat(close)) {
          items.push(parseOr());
          if (!eat(",")) break;
        }
        expect(close);
        return { kind: "tuple", items };
      }
      expect(close);
      return first;
    }
    throw new RenderError(`unexpected \`${token.value}\` in \`${source}\``);
  };

  const parsePostfix = (): Expr => {
    let expr = parsePrimary();
    for (;;) {
      if (eat(".")) {
        const name = take();
        if (!name || name.kind !== "name") throw new RenderError(`expected a name after \`.\` in \`${source}\``);
        expr = { kind: "attr", target: expr, name: name.value };
        continue;
      }
      if (eat("[")) {
        const index = parseOr();
        expect("]");
        expr = { kind: "item", target: expr, index };
        continue;
      }
      if (eat("(")) {
        const args: Expr[] = [];
        if (!eat(")")) {
          args.push(parseOr());
          while (eat(",")) {
            if (peek() && peek().value === ")") break;
            args.push(parseOr());
          }
          expect(")");
        }
        expr = { kind: "call", target: expr, args };
        continue;
      }
      if (peek() && peek().kind === "op" && peek().value === "|") {
        at++;
        const name = take();
        if (!name || name.kind !== "name") throw new RenderError(`expected a filter name in \`${source}\``);
        const args: Expr[] = [];
        if (eat("(")) {
          if (!eat(")")) {
            args.push(parseOr());
            while (eat(",")) args.push(parseOr());
            expect(")");
          }
        }
        expr = { kind: "filter", target: expr, name: name.value, args };
        continue;
      }
      return expr;
    }
  };

  const parseUnary = (): Expr => {
    if (peek() && peek().kind === "op" && (peek().value === "-" || peek().value === "+")) {
      const op = take().value;
      return { kind: "unary", op, operand: parseUnary() };
    }
    return parsePostfix();
  };

  const parseMultiplicative = (): Expr => {
    let left = parseUnary();
    while (peek() && peek().kind === "op" && ["*", "/", "//", "%"].includes(peek().value)) {
      left = { kind: "binary", op: take().value, left, right: parseUnary() };
    }
    return left;
  };

  const parseAdditive = (): Expr => {
    let left = parseMultiplicative();
    while (peek() && peek().kind === "op" && (peek().value === "+" || peek().value === "-")) {
      left = { kind: "binary", op: take().value, left, right: parseMultiplicative() };
    }
    return left;
  };

  const parseConcat = (): Expr => {
    let left = parseAdditive();
    while (peek() && peek().kind === "op" && peek().value === "~") {
      take();
      left = { kind: "binary", op: "~", left, right: parseAdditive() };
    }
    return left;
  };

  const parseComparison = (): Expr => {
    const left = parseConcat();
    const token = peek();
    if (token && (token.kind === "op" || token.kind === "name")) {
      if (["==", "!=", "<", ">", "<=", ">="].includes(token.value)) {
        at++;
        return { kind: "compare", op: token.value, left, right: parseConcat() };
      }
      if (token.value === "in") {
        at++;
        return { kind: "compare", op: "in", left, right: parseConcat() };
      }
      if (token.value === "not" && tokens[at + 1]?.value === "in") {
        at += 2;
        return { kind: "compare", op: "not in", left, right: parseConcat() };
      }
    }
    return left;
  };

  const parseAnd = (): Expr => {
    let left = parseComparison();
    while (peek() && peek().value === "and") {
      at++;
      left = { kind: "and", left, right: parseComparison() };
    }
    return left;
  };

  const parseOr = (): Expr => {
    let left = parseAnd();
    while (peek() && peek().value === "or") {
      at++;
      left = { kind: "or", left, right: parseAnd() };
    }
    return left;
  };

  const expr = parseOr();
  if (at !== tokens.length) throw new RenderError(`unexpected \`${tokens[at].value}\` in \`${source}\``);
  return expr;
}

/** Attribute and item access, over Tables, plain objects, arrays and Text. */
function getAttribute(target: unknown, name: string, path: (e: Expr) => string, expr: Expr): unknown {
  if (isUndefined(target)) {
    path(expr);
    usedUndefined(target);
  }
  if (target instanceof Table) return target.resolve(name);
  if (target instanceof Text) return undefinedValue(`${path(expr)}`);
  if (target && typeof target === "object" && !Array.isArray(target) && hasOwn(target, name)) {
    return (target as Record<string, unknown>)[name];
  }
  return undefinedValue(path(expr));
}

/** The dotted source text of an expression, for jinja's undefined message. */
function expressionPath(expr: Expr): string {
  if (expr.kind === "name") return expr.name;
  if (expr.kind === "attr") return `${expressionPath(expr.target)}.${expr.name}`;
  if (expr.kind === "item" && expr.index.kind === "literal") return `${expressionPath(expr.target)}.${String((expr.index as { value: unknown }).value)}`;
  return "expression";
}

class Scope {
  private readonly values = new Map<string, unknown>();
  constructor(private readonly parent?: Scope) {}
  has(name: string): boolean {
    return this.values.has(name) || (this.parent?.has(name) ?? false);
  }
  get(name: string): unknown {
    if (this.values.has(name)) return this.values.get(name);
    return this.parent?.get(name);
  }
  set(name: string, value: unknown): void {
    this.values.set(name, value);
  }
}

function evaluate(expr: Expr, scope: Scope, context: Record<string, unknown>): unknown {
  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "name":
      return scope.has(expr.name) ? scope.get(expr.name) : hasOwn(context, expr.name) ? context[expr.name] : undefinedValue(expr.name);
    case "attr":
      return getAttribute(evaluate(expr.target, scope, context), expr.name, expressionPath, expr);
    case "item": {
      const target = evaluate(expr.target, scope, context);
      const index = evaluate(expr.index, scope, context);
      if (isUndefined(target)) usedUndefined(target);
      if (target instanceof Table) return target.resolve(String(index));
      // A list index is Python's: negative counts from the end, an out-of-range
      // one is a miss (`undefined`), which a use then raises on.
      if (Array.isArray(target) && typeof index === "number") {
        const at = index < 0 ? target.length + index : index;
        return at >= 0 && at < target.length ? target[at] : undefinedValue(expressionPath(expr));
      }
      if (target && typeof target === "object" && hasOwn(target, String(index))) {
        return (target as Record<string, unknown>)[String(index)];
      }
      return undefinedValue(`${expressionPath(expr)}`);
    }
    case "call": {
      const target = evaluate(expr.target, scope, context);
      const args = expr.args.map((arg) => evaluate(arg, scope, context));
      if (isUndefined(target)) usedUndefined(target);
      if (typeof target !== "function") throw new RenderError(`\`${expressionPath(expr.target)}\` is not callable`);
      return (target as (...args: unknown[]) => unknown)(...args);
    }
    case "filter": {
      const filter = FILTERS[expr.name];
      if (!filter) throw new RenderError(`unknown filter \`${expr.name}\``);
      const value = evaluate(expr.target, scope, context);
      return filter(value, expr.args.map((arg) => evaluate(arg, scope, context)));
    }
    case "tuple":
      return expr.items.map((item) => evaluate(item, scope, context));
    case "unary": {
      const operand = evaluate(expr.operand, scope, context);
      if (expr.op === "not") return !pyTruthy(operand);
      if (isUndefined(operand)) usedUndefined(operand);
      return expr.op === "-" ? -Number(operand) : Number(operand);
    }
    case "and": {
      const left = evaluate(expr.left, scope, context);
      return pyTruthy(left) ? evaluate(expr.right, scope, context) : left;
    }
    case "or": {
      const left = evaluate(expr.left, scope, context);
      return pyTruthy(left) ? left : evaluate(expr.right, scope, context);
    }
    case "binary": {
      const left = evaluate(expr.left, scope, context);
      const right = evaluate(expr.right, scope, context);
      if (isUndefined(left)) usedUndefined(left);
      if (isUndefined(right)) usedUndefined(right);
      if (expr.op === "~") return toDisplay(left) + toDisplay(right);
      // Python's `+`: two strings concatenate, two numbers add, and every other
      // pair is the TypeError Jinja surfaces as a template error — `'a' + 'b'`
      // is 'ab', never NaN. A bool is an int (`True + 1` is 2).
      if (expr.op === "+") {
        const isString = (value: unknown) => typeof value === "string" || value instanceof Text;
        const isNumber = (value: unknown) => typeof value === "number" || typeof value === "boolean";
        if (isString(left) && isString(right)) return toDisplay(left) + toDisplay(right);
        if (isNumber(left) && isNumber(right)) return Number(left) + Number(right);
        throw new RenderError(`unsupported operand type(s) for +: ${pyTypeName(left)} and ${pyTypeName(right)}`);
      }
      const a = Number(left);
      const b = Number(right);
      switch (expr.op) {
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "//":
          return Math.floor(a / b);
        default:
          return a % b;
      }
    }
    case "compare": {
      const left = evaluate(expr.left, scope, context);
      const right = evaluate(expr.right, scope, context);
      if (isUndefined(left)) usedUndefined(left);
      if (isUndefined(right)) usedUndefined(right);
      switch (expr.op) {
        case "==":
          return pyEqual(left, right);
        case "!=":
          return !pyEqual(left, right);
        case "in":
          return contains(right, left);
        case "not in":
          return !contains(right, left);
        case "<":
          return compareValues(left, right) < 0;
        case ">":
          return compareValues(left, right) > 0;
        case "<=":
          return compareValues(left, right) <= 0;
        default:
          return compareValues(left, right) >= 0;
      }
    }
  }
}

function contains(haystack: unknown, needle: unknown): boolean {
  if (isUndefined(haystack)) usedUndefined(haystack);
  if (haystack instanceof Text) return haystack.value.includes(toDisplay(needle));
  if (typeof haystack === "string") return haystack.includes(toDisplay(needle));
  if (Array.isArray(haystack)) return haystack.some((item) => pyEqual(item, needle));
  if (haystack && typeof haystack === "object") return hasOwn(haystack, String(toDisplay(needle)));
  return false;
}

/** Render one template against a context. This is the brief's `renderTemplate`:
 * the jinja2 subset the pinned workflows are written in — variables, `if` /
 * `elif` / `else`, `set`, `for`, `{% raw %}`, comments, filters (`default`),
 * jinja's whitespace rules, and StrictUndefined. */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
  const state = { line: 1 };
  return renderNodes(parseNodes(tokenize(template), 0).nodes, new Scope(), context, state);
}

function renderNodes(nodes: Node[], scope: Scope, context: Record<string, unknown>, state: { line: number }): string {
  let out = "";
  for (const node of nodes) {
    switch (node.kind) {
      case "text":
        out += node.text;
        break;
      case "output":
        state.line = node.line;
        out += toDisplay(evaluate(parseExpression(node.expr), scope, context));
        break;
      case "set":
        state.line = node.line;
        scope.set(node.name, evaluate(parseExpression(node.expr), scope, context));
        break;
      case "if":
        for (const branch of node.branches) {
          if (branch.expr === null) {
            out += renderNodes(branch.body, scope, context, state);
            break;
          }
          state.line = node.line;
          // `if` opens no scope: a `set` in a branch is visible after it.
          if (pyTruthy(evaluate(parseExpression(branch.expr), scope, context))) {
            out += renderNodes(branch.body, scope, context, state);
            break;
          }
        }
        break;
      case "for": {
        state.line = node.line;
        const list = evaluate(parseExpression(node.expr), scope, context);
        if (typeof list === "string" || list instanceof Text) {
          throw new RenderError(`\`${node.expr}\` is a string, not a list`);
        }
        if (isUndefined(list)) usedUndefined(list);
        if (!Array.isArray(list)) throw new RenderError(`\`${node.expr}\` is not a list`);
        for (const item of list) {
          const inner = new Scope(scope);
          inner.set(node.name, item);
          out += renderNodes(node.body, inner, context, state);
        }
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- sources

/** `Fs` has no dirent types, and a trailing slash does not tell files from
 * directories: the one probe both implementations answer honestly is `list` —
 * a directory lists, a file does not. */
async function isDirectory(path: string, fs: Fs): Promise<boolean> {
  try {
    await fs.list(path);
    return true;
  } catch {
    return false;
  }
}

/** `_load_sources`: every `*.md` under the skill except `SKILL.md`, by relative
 * posix path; `workflow.md` is the entry and must be one of them. */
async function loadSources(skillRoot: string, fs: Fs): Promise<Record<string, string>> {
  const sources: Record<string, string> = {};
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const name of await fs.list(dir)) {
      const path = `${dir}/${name}`;
      if (await isDirectory(path, fs)) await walk(path, `${prefix}${name}/`);
      else if (name.endsWith(".md") && name !== "SKILL.md") sources[`${prefix}${name}`] = await fs.readText(path);
    }
  };
  await walk(skillRoot, "");
  const names = Object.keys(sources).sort();
  const sorted: Record<string, string> = {};
  for (const name of names) sorted[name] = sources[name];
  if (!("workflow.md" in sorted)) throw new RenderError(`render entry is missing: ${skillRoot}/workflow.md`);
  return sorted;
}

// ---------------------------------------------------------------- the render context

/** `_RenderContext`: one rendering pass — the values it serves, the inputs it
 * recorded, and the `rendered()` links each source makes. */
class RenderContext {
  readonly inputs: Record<string, unknown> = {};
  readonly links: Record<string, string[]> = {};
  readonly variables: Record<string, unknown>;
  line = 1;

  constructor(
    readonly projectRoot: string,
    readonly destination: string,
    central: Record<string, unknown>,
    defaults: Record<string, unknown> | null,
    customization: Record<string, unknown>,
    private readonly sourceNames: Set<string>,
  ) {
    this.variables = {
      config: new ConfigTable(central, central, "config", this),
      workflow: new CustomizationTable(
        defaults === null ? null : ((defaults.workflow as Record<string, unknown>) ?? {}),
        (customization.workflow as Record<string, unknown>) ?? {},
        "workflow",
        this,
      ),
      rendered: (target: unknown) => this.rendered(toDisplay(target)),
      halt: (message: unknown) => this.halt(toDisplay(message)),
    };
  }

  /** Let a template reject its inputs; the caller prefixes the source and line. */
  private halt(message: string): never {
    throw new RenderError(message);
  }

  private rendered(target: string): string {
    if (!this.sourceNames.has(target)) throw new RenderError(`rendered() targets undeclared source: ${target}`);
    const name = this.currentSource ?? "";
    this.links[name] = [...(this.links[name] ?? []), target];
    return `${this.destination}/${target}`;
  }

  currentSource: string | null = null;
}

/** `_render_sources`: render every source, drop the ones that render empty, and
 * refuse a survivor that links into a dropped one. */
function renderSources(sources: Record<string, string>, skillRoot: string, ctx: RenderContext): Record<string, string> {
  const bound: Record<string, string> = {};
  for (const [name, content] of Object.entries(sources)) bound[name] = content.replaceAll("{skill-root}", skillRoot);
  const rendered: Record<string, string> = {};
  for (const name of Object.keys(sources)) {
    ctx.currentSource = name;
    try {
      rendered[name] = renderSource(bound[name], ctx.variables, ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const location = error instanceof RenderError || error instanceof UndefinedError ? `${name}:${ctx.line}` : null;
      throw new RenderError(`${location ?? name}: ${message}`);
    }
  }
  const omitted = new Set(Object.keys(rendered).filter((name) => !rendered[name].trim()));
  if (omitted.has("workflow.md")) throw new RenderError("workflow.md: rendered empty");
  for (const name of Object.keys(rendered).filter((n) => !omitted.has(n)).sort()) {
    for (const target of [...(ctx.links[name] ?? [])].sort()) {
      if (omitted.has(target)) throw new RenderError(`${name}: rendered() targets omitted source: ${target}`);
    }
  }
  const out: Record<string, string> = {};
  for (const [name, text] of Object.entries(rendered)) if (!omitted.has(name)) out[name] = text;
  return out;
}

function renderSource(template: string, variables: Record<string, unknown>, ctx: RenderContext): string {
  ctx.line = 1;
  return renderNodes(parseNodes(tokenize(template), 0).nodes, new Scope(), variables, ctx);
}

// ---------------------------------------------------------------- publishing

/** `_verify_existing`: a generation that already exists must be the one this
 * render would publish, file for file. */
async function verifyExisting(destination: string, manifest: Record<string, unknown>, fs: Fs): Promise<void> {
  const path = `${destination}/manifest.json`;
  let existing: unknown;
  try {
    existing = JSON.parse(await fs.readText(path));
  } catch (error) {
    throw new RenderError(`corrupt existing generation ${destination}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (canonicalJson(existing) !== canonicalJson(manifest)) {
    throw new RenderError(`generation collision or corruption at ${destination}`);
  }
  const outputs = manifest.outputs as Record<string, string>;
  const missing: string[] = [];
  for (const name of Object.keys(outputs).sort()) {
    if (!(await fs.exists(`${destination}/${name}`))) missing.push(name);
  }
  if (missing.length) {
    throw new RenderError(
      `generation is missing rendered files: ${missing.join(", ")} in ${destination}; ` +
        "deleting that folder is safe because the next run renders it again",
    );
  }
  for (const name of Object.keys(outputs)) {
    if (sha256Hex(await fs.readText(`${destination}/${name}`)) !== outputs[name]) {
      throw new RenderError(`generation output hash mismatch: ${destination}/${name}`);
    }
  }
}

/** `_publish`: write the generation, or verify the identical one already there. */
async function publish(destination: string, outputs: Record<string, string>, manifest: Record<string, unknown>, fs: Fs): Promise<void> {
  if (await fs.exists(destination)) {
    await verifyExisting(destination, manifest, fs);
    return;
  }
  await fs.mkdir(destination);
  for (const [name, content] of Object.entries(outputs)) {
    const path = `${destination}/${name}`;
    const parent = path.slice(0, path.lastIndexOf("/"));
    await fs.mkdir(parent);
    await fs.writeText(path, content);
  }
  await fs.writeText(`${destination}/manifest.json`, `${JSON.stringify(sortedKeys(manifest), null, 2)}\n`);
}

/** `json.dumps(..., indent=2, sort_keys=True)` writes keys in sorted order. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortedKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ---------------------------------------------------------------- the render

/** The port's own renderer identity: the Python hashes its file's bytes and
 * records jinja2's version; a bundle has neither. */
const RENDERER_MARKER = "ade-runtime/bmad-v6 render_skill";
const TEMPLATE_ENGINE = "ade-runtime/bmad-v6 jinja2 subset";

const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "project";

/**
 * Render a skill's workflow into an immutable generation and return the line the
 * Python printed: `read and follow <workflow.md>` on success, `HALT: <reason>`
 * when the render is refused. `set` is the command line's `--set k=v` pairs, as
 * a map.
 */
export async function renderSkill(
  projectRoot: string,
  skillRoot: string,
  set: Record<string, string>,
  fs: Fs,
): Promise<string> {
  try {
    return `read and follow ${await render(projectRoot, skillRoot, set, fs)}\n`;
  } catch (error) {
    // The Python's main reports every refusal it can name — its own errors, the
    // filesystem's, a config it cannot read — as `HALT: <reason>` and exits 1,
    // and the skills are written to expect that line. A failure below this
    // point is one of those refusals.
    return `HALT: ${(error instanceof Error ? error.message : String(error)).split("\n").join(" ")}\n`;
  }
}

async function render(projectRoot: string, skillRoot: string, set: Record<string, string>, fs: Fs): Promise<string> {
  const skillName = skillRoot.replace(/\/+$/, "").split("/").pop() ?? skillRoot;
  const sources = await loadSources(skillRoot, fs);
  const central = await loadCentralConfig(projectRoot, fs);
  const customizePath = `${skillRoot}/customize.toml`;
  const hasCustomization = Object.keys(set).length > 0 || (await fs.exists(customizePath));
  const defaults = hasCustomization ? ((await readTomlLayer(customizePath, fs)) as Record<string, unknown>) : null;
  const defaultsSource = hasCustomization && (await fs.exists(customizePath)) ? await fs.readText(customizePath) : "";
  await checkPersistentLayers(projectRoot, skillName, defaults, fs);
  let customization = hasCustomization ? await resolveCustomization(projectRoot, skillRoot, skillName, fs) : {};
  const supplied = new Set<string>();
  if (defaults !== null) {
    const commandLayer = invocationCustomization(defaults, set, defaultsSource);
    customization = deepMerge(customization, commandLayer) as Record<string, unknown>;
    for (const leaf of leafPaths(commandLayer)) supplied.add(leaf);
  }

  const sourceHashes: Record<string, string> = {};
  for (const [name, content] of Object.entries(sources)) sourceHashes[name] = sha256Hex(content);
  const rootHash = sha256Hex(projectRoot).slice(0, 12);
  const slug = slugOf(projectRoot.replace(/\/+$/, "").split("/").pop() ?? projectRoot);
  const namespace = `${projectRoot}/_bmad/render/${skillName}/${slug}-${rootHash}`;

  const buildContext = (destination: string) =>
    new RenderContext(projectRoot, destination, central, defaults, customization as Record<string, unknown>, new Set(Object.keys(sources)));

  // The generation path is keyed by the values the templates reach and the
  // templates insert that path, so a first pass against a placeholder
  // destination collects the inputs, and the real pass renders the output.
  const probe = buildContext(`${namespace}/pending`);
  renderSources(sources, skillRoot, probe);
  const unused = [...supplied].filter((path) => !hasOwn(probe.inputs, `customization.${path}`)).sort();
  if (unused.length) throw new RenderError(`invocation override not used by this render: ${unused.join(", ")}`);

  const identity = {
    project_root: projectRoot,
    skill_root: skillRoot,
    renderer_sha256: sha256Hex(RENDERER_MARKER),
    template_engine: TEMPLATE_ENGINE,
    resolved_values: JSON.parse(canonicalJson(probe.inputs)),
    source_sha256: sourceHashes,
  };
  const generationHash = sha256Hex(canonicalJson(identity)).slice(0, 20);
  const destination = `${namespace}/${generationHash}`;
  const rendered = renderSources(sources, skillRoot, buildContext(destination));

  const outputs: Record<string, string> = {};
  const outputHashes: Record<string, string> = {};
  for (const [name, content] of Object.entries(rendered)) {
    outputs[name] = content;
    outputHashes[name] = sha256Hex(content);
  }
  const manifest = {
    schema_version: 1,
    skill: skillName,
    project_root: projectRoot,
    project_slug: slug,
    root_hash: rootHash,
    generation_hash: generationHash,
    inputs: identity,
    outputs: outputHashes,
  };
  await publish(destination, outputs, manifest as unknown as Record<string, unknown>, fs);
  return `${destination}/workflow.md`;
}

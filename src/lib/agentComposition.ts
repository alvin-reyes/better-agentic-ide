import type { Role } from "../data/roles";
import type { Domain } from "../data/domains";

/**
 * Compose a role — optionally narrowed by a domain — into the markdown handed
 * to a provider CLI. The role supplies accountability; the domain only narrows
 * technical focus and never overrides the role's boundaries.
 */
export function composeRoleMarkdown(role: Role, domain?: Domain): string {
  const sections = [
    `# ${role.title}${domain ? ` — ${domain.title}` : ""}`,
    "",
    role.mission,
    "",
    "## What you own",
    "",
    role.owns.length > 0
      ? role.owns.map((glob) => `- \`${glob}\``).join("\n")
      : "_No artifacts. You produce guidance, not deliverables._",
    "",
    "## Boundaries",
    "",
    role.boundaries,
  ];

  if (domain) {
    sections.push("", "## Focus", "", domain.focus);
  }

  return sections.join("\n") + "\n";
}

export function roleFileName(roleId: string, domainId?: string): string {
  return domainId ? `${roleId}-${domainId}.md` : `${roleId}.md`;
}

/**
 * Wrap a composed role as an Ollama Modelfile.
 *
 * `ollama run` has no system-prompt flag — the only way to start an
 * interactive session with one is to derive a model whose Modelfile carries it.
 *
 * SYSTEM takes a triple-quoted block, so a literal `"""` inside the role would
 * end it early and spill the rest of the prompt into the Modelfile as
 * directives. Role bodies are Markdown and can legitimately contain one, so it
 * is neutralised rather than trusted.
 */
export function toModelfile(roleMarkdown: string, baseModel: string): string {
  const safe = roleMarkdown.replace(/"""/g, '\\"\\"\\"');
  // ollamaModel is free text from Settings and lands on the FROM line. A
  // newline in it would start a second Modelfile directive, so only the first
  // line is ever used.
  const from = baseModel.split(/[\r\n]/)[0].trim() || "deepseek-r1";
  return `FROM ${from}\nSYSTEM """${safe}"""\n`;
}

/** The derived model's name: stable per role, and obviously ADE's. */
export function modelTagFor(roleId: string, domainId: string | undefined, baseModel: string): string {
  // Drop the ":tag" first — sanitising turns the colon into a dash, after
  // which there is nothing left to strip.
  const base = baseModel.replace(/:.*$/, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  return `ade-${base}-${domainId ? `${roleId}-${domainId}` : roleId}`.toLowerCase();
}

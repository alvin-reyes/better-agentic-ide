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

import { AGENT_CATALOG } from "./curatedAgents";
import { ROLES, type Role } from "./roles";

/**
 * One selectable row in AgentPicker.
 *
 * The picker offers two ways in, both launching the same machinery:
 *   - the 22 curated role-domain pairs, unchanged and still one keystroke away;
 *   - a bare role with no domain, which is what the design calls "role first,
 *     domain second and optional".
 *
 * Without the second group, `product-manager`, `product-owner` and
 * `scrum-master` are attached to no curated pair and cannot be launched at all
 * — the regression left behind when BmadPanel's persona buttons were removed.
 */
export interface PickerItem {
  /** Unique across both groups: the curated id, or `role:<roleId>`. */
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  /** The domain's category for a curated pair, or "Role" for a bare role. */
  badge: string;
  roleId: string;
  domainId?: string;
  group: "agent" | "role";
}

/** Pill value that filters the list down to the bare roles. */
export const ROLES_FILTER = "Roles";

/** Bare roles are shown in one neutral colour; the curated pairs keep theirs. */
const ROLE_COLOR = "#8b949e";

/**
 * A short description for a role row. The mission's opening paragraph already
 * says what the role owns; its first sentence only restates the title the row
 * is displaying anyway, so it is dropped.
 */
export function roleSummary(role: Role): string {
  const firstParagraph = role.mission.split("\n\n")[0].replace(/\*\*/g, "");
  const withoutOpener = firstParagraph.replace(/^You are (the )?[^.]*\.\s*/, "");
  return withoutOpener || firstParagraph;
}

/** Monogram for the role's icon tile, matching the curated agents' style. */
export function roleInitials(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (/^[A-Z]{2,3}$/.test(words[0])) return words[0];
  if (words.length > 1) return words.map((w) => w[0]).join("").toUpperCase().slice(0, 3);
  return title.slice(0, 3).toUpperCase();
}

export const CURATED_ITEMS: PickerItem[] = AGENT_CATALOG.map((agent) => ({
  id: agent.id,
  name: agent.name,
  description: agent.description,
  icon: agent.icon,
  color: agent.color,
  badge: agent.category,
  roleId: agent.roleId,
  domainId: agent.domainId,
  group: "agent",
}));

export const ROLE_ITEMS: PickerItem[] = ROLES.map((role) => ({
  id: `role:${role.id}`,
  name: role.title,
  description: roleSummary(role),
  icon: roleInitials(role.title),
  color: ROLE_COLOR,
  badge: "Role",
  roleId: role.id,
  group: "role",
}));

/** Curated pairs first — they are the familiar entries — then the bare roles. */
export const PICKER_ITEMS: PickerItem[] = [...CURATED_ITEMS, ...ROLE_ITEMS];

import type { Fs } from "../../bmadRuntime/fs";

type TicketType = "story" | "spike" | "bug";

export interface V6TreeSpec {
  /** The initiative's folder is `initiative-<slug>`. */
  initiative: { slug: string; title?: string };
  /** `slug` with or without its `epic-` prefix; the folder is `epic-<slug>`. Title defaults to the slug in words. */
  epics: { id: number | string; slug: string; title?: string }[];
  /** `id` is the per-epic id (`1`, `6a`); `epic` names an epic by slug. A ticket is pulled (has a leaf
   * file) unless `pulled: false`, which leaves it a planned `[[entry]]` only. */
  tickets: {
    id: number | string;
    title: string;
    epic: string;
    type?: TicketType;
    pulled?: boolean;
    criteria?: string[];
  }[];
  /** Plans keyed by the ticket's ref, `<epic id>.<ticket id>` (e.g. `1.1`, `1.6a`). */
  plans: Record<string, { status: string; assignee?: string }>;
}

const epicFolder = (slug: string) => (slug.startsWith("epic-") ? slug : `epic-${slug}`);

const words = (slug: string) => {
  const bare = slug.replace(/^epic-/, "").replace(/-/g, " ");
  return bare.charAt(0).toUpperCase() + bare.slice(1);
};

/** A TOML or frontmatter id: digits bare, anything else quoted in TOML. */
const tomlId = (id: number | string) => (/^\d+$/.test(String(id)) ? String(id) : `"${id}"`);

/** The port's `titleSlug`: what `pull` names a leaf after. */
function titleSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "untitled";
}

/**
 * Seed a v6 project the BMAD runtime port reads with no problems, shaped like
 * the vendored bmad-ticket templates: `_bmad/config.toml` naming the output
 * folder and active initiative, the initiative's container doc and its
 * `[[epic]]` breakdown, each epic's container doc and `[[entry]]` breakdown,
 * pulled leaf files (`<type>-<title slug>.md`) and plans beside them
 * (`<stem>-plan.md`, joined through their `ticket` key).
 */
export async function seedV6Tree(fs: Fs, root: string, spec: V6TreeSpec): Promise<void> {
  const initiative = `initiative-${spec.initiative.slug}`;
  await fs.mkdir(`${root}/_bmad/custom`);
  await fs.writeText(
    `${root}/_bmad/config.toml`,
    `[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\nactive_initiative = "${initiative}"\n`,
  );
  const store = `${root}/_bmad-output/${initiative}`;
  await fs.mkdir(store);
  const initiativeTitle = spec.initiative.title ?? words(spec.initiative.slug);
  await fs.writeText(
    `${store}/${initiative}.md`,
    `---\ntype: initiative\ntitle: "${initiativeTitle}"\nparent: none\ncovers: []\nafter: []\n---\n\n# ${initiativeTitle}\n`,
  );
  await fs.writeText(
    `${store}/tickets.toml`,
    spec.epics
      .map((e) => `[[epic]]\nid = ${tomlId(e.id)}\nslug = "${epicFolder(e.slug)}"\ntitle = "${e.title ?? words(e.slug)}"\n`)
      .join("\n"),
  );

  for (const e of spec.epics) {
    const folder = epicFolder(e.slug);
    const dir = `${store}/${folder}`;
    const title = e.title ?? words(e.slug);
    await fs.mkdir(dir);
    await fs.writeText(
      `${dir}/${folder}.md`,
      `---\ntype: epic\ntitle: "${title}"\nparent: ${initiative}\ncovers: []\nafter: []\n---\n\n# ${title}\n`,
    );
    const mine = spec.tickets.filter((t) => epicFolder(t.epic) === folder);
    await fs.writeText(
      `${dir}/tickets.toml`,
      mine
        .map((t) => `[[entry]]\nid = ${tomlId(t.id)}\ntype = "${t.type ?? "story"}"\ntitle = "${t.title}"\nverify = "It works."\n`)
        .join("\n"),
    );
    const taken = new Set<string>();
    for (const t of mine) {
      const type = t.type ?? "story";
      let stem = `${type}-${titleSlug(t.title)}`;
      if (taken.has(stem)) stem = `${stem}-${t.id}`;
      taken.add(stem);
      if (t.pulled !== false) {
        const criteria = (t.criteria ?? ["Verify: it works."]).map((c, i) => (t.criteria ? `${i + 1}. ${c}` : c));
        await fs.writeText(
          `${dir}/${stem}.md`,
          `---\nid: ${t.id}\ntype: ${type}\ntitle: "${t.title}"\nparent: ${folder}\ncovers: []\nafter: []\nrefined: false\nhitl: false\nrisk: low\n---\n\n` +
            `# ${t.title}\n\n## Description\n\n${t.title}.\n\n## Acceptance Criteria\n\n${criteria.join("\n")}\n\n## References\n\n- parent — ${folder}/${folder}.md\n`,
        );
      }
      const plan = spec.plans[`${e.id}.${t.id}`];
      if (plan) {
        const assignee = plan.assignee ? `assignee: "${plan.assignee}"\n` : "";
        await fs.writeText(
          `${dir}/${stem}-plan.md`,
          `---\ntitle: "${t.title}"\nticket: ${t.id}\nstatus: ${plan.status}\n${assignee}---\n\n# Plan\n`,
        );
      }
    }
  }
}

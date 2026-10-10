import type { Fs } from "../../fs";

/** Seed a minimal v6 project: _bmad/config.toml, the store folders, and the
 * requested epics/stories as [[epic]]/[[entry]] tables plus leaf and plan
 * files. Mirrors the vendored templates' shape. */
export async function seedTicketTree(
  fs: Fs,
  root: string,
  spec: {
    epics: { id: number; slug: string }[];
    stories: { id: string | number; slug: string; parent: string }[];
  },
): Promise<void> {
  await fs.mkdir(`${root}/_bmad/custom`);
  await fs.writeText(
    `${root}/_bmad/config.toml`,
    `[core]\nproject_name = "p"\noutput_folder = "${root}/_bmad-output"\nactive_initiative = "initiative-demo"\n`,
  );
  const store = `${root}/_bmad-output/initiative-demo`;
  await fs.mkdir(store);
  const epicsToml = spec.epics
    .map((e) => `[[epic]]\nid = ${e.id}\nslug = "${e.slug}"\ntitle = "Demo"\n`)
    .join("\n");
  await fs.writeText(`${store}/tickets.toml`, epicsToml);
  for (const e of spec.epics) {
    const dir = `${store}/epic-${e.slug}`;
    await fs.mkdir(dir);
    // Every epic folder carries its own container file: without <folder>.md the
    // loader refuses it ("epic-demo: no epic-demo.md").
    await fs.writeText(`${dir}/epic-${e.slug}.md`, `---\ntype: epic\n---\n# Demo\n`);
    const mine = spec.stories.filter((s) => s.parent === `epic-${e.slug}`);
    await fs.writeText(
      `${dir}/tickets.toml`,
      mine.map((s) => `[[entry]]\nid = ${typeof s.id === "string" ? `"${s.id}"` : s.id}\ntype = "story"\ntitle = "Demo story"\n`).join("\n"),
    );
    for (const s of mine) {
      const stem = `story-${s.id}`;
      await fs.writeText(
        `${dir}/${stem}.md`,
        `---\nid: ${s.id}\ntype: story\ntitle: "Demo story"\nparent: epic-${e.slug}\n---\n# Demo story\n\n## Acceptance Criteria\n- AC1\n`,
      );
      await fs.writeText(`${dir}/${stem}-plan.md`, `---\nticket: ${s.id}\nstatus: draft\n---\n# Plan\n`);
    }
  }
}

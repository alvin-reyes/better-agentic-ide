import type { Fs } from "./bmadRuntime/fs";

/** Gate files for a project, by methodology. v6 verdicts live in ADE's own
 * .ade/gates/; v4 projects keep BMAD's docs/qa/gates/. The file format is the
 * same (spec: the schema reuses v4's keys verbatim). */
export async function findGates(root: string, methodology: "v4" | "v6", fs: Fs): Promise<{ file: string; yaml: string }[]> {
  const dir = methodology === "v6" ? `${root}/.ade/gates` : `${root}/docs/qa/gates`;
  if (!(await fs.exists(dir))) return [];
  const names = (await fs.list(dir)).filter((n) => n.endsWith(".yml"));
  const out: { file: string; yaml: string }[] = [];
  for (const n of names) out.push({ file: `${dir.replace(root + "/", "")}/${n}`, yaml: await fs.readText(`${dir}/${n}`) });
  return out;
}

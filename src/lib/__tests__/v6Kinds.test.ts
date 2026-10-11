import { describe, expect, it } from "vitest";
import { classifyFolder, readFolderDoc, readPlanFile, readRetrospective, V6_KINDS } from "../v6Kinds";
import { memFs, type Fs } from "../bmadRuntime/fs";

const I = "/p/_bmad-output/initiative-demo";
const kind = (name: string) => classifyFolder(name)!;
async function folder(fs: Fs, name: string, files: Record<string, string>) {
  await fs.mkdir(`${I}/${name}`);
  for (const [f, body] of Object.entries(files)) await fs.writeText(`${I}/${name}/${f}`, body);
}

describe("classifyFolder", () => {
  it.each([
    ["brainstorm-pricing", "brainstorm", "analysis"],
    ["forge-idea", "forge", "analysis"],
    ["research-market", "research", "analysis"],
    ["brief-shop", "brief", "analysis"],
    ["prfaq-shop", "prfaq", "analysis"],
    ["prd-shop", "prd", "planning"],
    ["ux-shop", "ux", "planning"],
    ["architecture-shop", "architecture", "planning"],
    ["spec-cart", "spec", "planning"],
    ["change-scope", "change", "implementation"],
    ["walkthrough-cart", "walkthrough", "validation"],
    ["test-summary-cart", "test-summary", "validation"],
  ])("%s is a %s doc in %s", (name, k, phase) => {
    expect(classifyFolder(name)).toMatchObject({ kind: k, phase });
  });

  it("ignores names that match no kind, and a bare prefix", () => {
    expect(classifyFolder("notes")).toBeNull();
    expect(classifyFolder("epic-cart")).toBeNull();
    expect(classifyFolder("prd-")).toBeNull();
  });

  it("every kind names at least one main file", () => {
    for (const k of V6_KINDS) expect(k.main.length).toBeGreaterThan(0);
  });
});

describe("readFolderDoc", () => {
  it("reads a doc's status from its own frontmatter and opens its main file", async () => {
    const fs = memFs();
    await folder(fs, "prd-shop", { "prd-shop.md": "---\nstatus: draft\n---\n# PRD\n" });
    const { doc, problem } = await readFolderDoc("/p", `${I}/prd-shop`, kind("prd-shop"), fs);
    expect(doc).toEqual({ kind: "prd", label: "PRD", name: "shop", path: "_bmad-output/initiative-demo/prd-shop/prd-shop.md", status: "draft" });
    expect(problem).toBeNull();
  });

  it("opens a brainstorm's HTML report when there is one, else its notes", async () => {
    const fs = memFs();
    await folder(fs, "brainstorm-a", { "brainstorm-a.md": "# notes\n" });
    await folder(fs, "brainstorm-b", { "brainstorm-b.md": "# notes\n", "brainstorm.html": "<html></html>" });
    expect((await readFolderDoc("/p", `${I}/brainstorm-a`, kind("brainstorm-a"), fs)).doc.path).toMatch(/brainstorm-a\/brainstorm-a\.md$/);
    expect((await readFolderDoc("/p", `${I}/brainstorm-b`, kind("brainstorm-b"), fs)).doc.path).toMatch(/brainstorm-b\/brainstorm\.html$/);
  });

  it("a brainstorm whose run log has no status yet is in progress; a finished one says so", async () => {
    const fs = memFs();
    await folder(fs, "brainstorm-live", { ".memlog.md": "---\ntopic: pricing: ideas\nmode: partner\n---\n- idea one\n" });
    await folder(fs, "brainstorm-done", { ".memlog.md": "---\ntopic: pricing\nstatus: complete\n---\n" });
    expect((await readFolderDoc("/p", `${I}/brainstorm-live`, kind("brainstorm-live"), fs)).doc.status).toBe("in progress");
    expect((await readFolderDoc("/p", `${I}/brainstorm-done`, kind("brainstorm-done"), fs)).doc.status).toBe("complete");
  });

  it("reads UX status from DESIGN.md, not the pointer doc", async () => {
    const fs = memFs();
    await folder(fs, "ux-shop", { "ux-shop.md": "---\nstatus: draft\n---\n", "DESIGN.md": "---\nstatus: final\ntokens:\n  color: red\n---\n" });
    const { doc } = await readFolderDoc("/p", `${I}/ux-shop`, kind("ux-shop"), fs);
    expect(doc.status).toBe("final");
    expect(doc.path).toMatch(/ux-shop\/ux-shop\.md$/);
  });

  it("falls back from a PRFAQ's status to its stage", async () => {
    const fs = memFs();
    await folder(fs, "prfaq-shop", { "prfaq-shop.md": "---\nstage: 3\n---\n" });
    expect((await readFolderDoc("/p", `${I}/prfaq-shop`, kind("prfaq-shop"), fs)).doc.status).toBe("3");
  });

  it("a spec has no status word of its own", async () => {
    const fs = memFs();
    await folder(fs, "spec-cart", { "spec-cart.md": "---\nstatus: draft\n---\n" });
    expect((await readFolderDoc("/p", `${I}/spec-cart`, kind("spec-cart"), fs)).doc.status).toBe("present");
  });

  it("a folder with no main file has no path, and a doc with no status key is present", async () => {
    const fs = memFs();
    await folder(fs, "prd-empty", { "addendum.md": "# x\n" });
    await folder(fs, "brief-shop", { "brief-shop.md": "# no frontmatter\n" });
    expect((await readFolderDoc("/p", `${I}/prd-empty`, kind("prd-empty"), fs)).doc).toMatchObject({ path: null, status: "present" });
    expect((await readFolderDoc("/p", `${I}/brief-shop`, kind("brief-shop"), fs)).doc.status).toBe("present");
  });

  it("an unclosed frontmatter fence is an unreadable status and a problem", async () => {
    const fs = memFs();
    await folder(fs, "prd-broken", { "prd-broken.md": "---\nstatus: draft\n# never closed\n" });
    const { doc, problem } = await readFolderDoc("/p", `${I}/prd-broken`, kind("prd-broken"), fs);
    expect(doc.status).toBe("unreadable status");
    expect(problem).toBe("_bmad-output/initiative-demo/prd-broken/prd-broken.md: frontmatter is not closed");
  });
});

describe("readPlanFile", () => {
  it("a oneshot plan is a quick plan with its status", async () => {
    const fs = memFs();
    await fs.mkdir(I);
    await fs.writeText(`${I}/plan-fix-typo.md`, "---\nticket: ''\nroute: oneshot\nstatus: in-progress\n---\n");
    expect((await readPlanFile("/p", `${I}/plan-fix-typo.md`, fs))?.doc).toEqual({
      kind: "plan", label: "Quick plan", name: "fix-typo", path: "_bmad-output/initiative-demo/plan-fix-typo.md", status: "in-progress",
    });
  });

  it("a full-route plan is a plan", async () => {
    const fs = memFs();
    await fs.mkdir(I);
    await fs.writeText(`${I}/plan-refactor.md`, "---\nroute: full\nstatus: draft\n---\n");
    expect((await readPlanFile("/p", `${I}/plan-refactor.md`, fs))?.doc.label).toBe("Plan");
  });

  it("a plan joined to a ticket is skipped: its ticket already shows it", async () => {
    const fs = memFs();
    await fs.mkdir(I);
    await fs.writeText(`${I}/plan-cart.md`, "---\nticket: '1.1'\nstatus: in-progress\n---\n");
    expect(await readPlanFile("/p", `${I}/plan-cart.md`, fs)).toBeNull();
  });
});

describe("readRetrospective", () => {
  it("reads the verdict, and a retrospective with none is in progress", async () => {
    const fs = memFs();
    await fs.mkdir(`${I}/epic-cart`);
    expect(await readRetrospective("/p", `${I}/epic-cart`, fs)).toBeNull();
    await fs.writeText(`${I}/epic-cart/epic-cart-retrospective.md`, "---\nepic: cart\n---\n");
    expect((await readRetrospective("/p", `${I}/epic-cart`, fs))?.doc).toMatchObject({ kind: "retrospective", label: "Retrospective", name: "cart", status: "in progress" });
    await fs.writeText(`${I}/epic-cart/epic-cart-retrospective.md`, "---\nverdict: accepted-with-open-items\n---\n");
    expect((await readRetrospective("/p", `${I}/epic-cart`, fs))?.doc.status).toBe("accepted-with-open-items");
  });
});

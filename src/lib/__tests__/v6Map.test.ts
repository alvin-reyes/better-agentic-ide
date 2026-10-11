import { describe, expect, it } from "vitest";
import { buildV6Map } from "../v6Map";
import { memFs, type Fs } from "../bmadRuntime/fs";
import { seedV6Tree } from "./fixtures/v6tree";

const I = "/p/_bmad-output/initiative-shop";
const tree = {
  initiative: { slug: "shop", title: "Shop relaunch" },
  epics: [{ id: 1, slug: "cart" }],
  tickets: [{ id: 1, title: "Cart total", epic: "cart" }],
  plans: { "1.1": { status: "in-progress" } },
};
async function write(fs: Fs, path: string, body: string) {
  await fs.mkdir(path.slice(0, path.lastIndexOf("/")));
  await fs.writeText(path, body);
}

describe("buildV6Map", () => {
  it("files each doc under its phase, with the initiative's title", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, `${I}/brief-shop/brief-shop.md`, "---\nstatus: complete\n---\n");
    await write(fs, `${I}/prd-shop/prd-shop.md`, "---\nstatus: draft\n---\n");
    await write(fs, `${I}/plan-fix-typo.md`, "---\nroute: oneshot\nstatus: built\n---\n");
    await write(fs, `${I}/deferred-work.md`, "# later\n");
    await write(fs, `${I}/walkthrough-cart/walkthrough-cart.md`, "# walk\n");
    await write(fs, `${I}/notes/whatever.md`, "# ignored\n");
    const map = await buildV6Map("/p", fs);
    expect(map.initiativeState).toBe("active");
    expect(map.initiative).toEqual({ title: "Shop relaunch", folder: "initiative-shop" });
    expect(map.outputFolder).toBe("_bmad-output");
    expect(map.docs.analysis.map((d) => [d.kind, d.status])).toEqual([["brief", "complete"]]);
    expect(map.docs.planning.map((d) => [d.kind, d.status])).toEqual([["prd", "draft"]]);
    expect(map.docs.implementation.map((d) => [d.label, d.status])).toEqual([["Deferred work", "present"], ["Quick plan", "built"]]);
    expect(map.docs.validation.map((d) => d.kind)).toEqual(["walkthrough"]);
    expect(map.tickets.map((t) => t.story.id)).toEqual(["1.1"]);
    expect(map.epics[0].refs).toEqual(["1.1"]);
  });

  it("finds specs and retrospectives inside the tree's epic folders", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, `${I}/epic-cart/spec-checkout/spec-checkout.md`, "# spec\n");
    await write(fs, `${I}/epic-cart/epic-cart-retrospective.md`, "---\nverdict: accepted\n---\n");
    const map = await buildV6Map("/p", fs);
    expect(map.docs.planning.map((d) => [d.kind, d.name])).toEqual([["spec", "cart/checkout"]]);
    expect(map.docs.validation.map((d) => [d.kind, d.status])).toEqual([["retrospective", "accepted"]]);
  });

  it("tells same-named specs at the top and in an epic apart", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, `${I}/spec-api/spec-api.md`, "# top\n");
    await write(fs, `${I}/epic-cart/spec-api/spec-api.md`, "# epic\n");
    const specs = (await buildV6Map("/p", fs)).docs.planning.filter((d) => d.kind === "spec");
    expect(specs.map((d) => d.name).sort()).toEqual(["api", "cart/api"]);
    expect(new Set(specs.map((d) => d.path)).size).toBe(2);
  });

  it("a doc folder that cannot be listed is a problem, not a failure", async () => {
    const mem = memFs();
    await seedV6Tree(mem, "/p", tree);
    await write(mem, `${I}/prd-shop/prd-shop.md`, "---\nstatus: draft\n---\n");
    await write(mem, `${I}/brief-shop/brief-shop.md`, "---\nstatus: complete\n---\n");
    const fs: Fs = { ...mem, list: async (p) => { if (p.endsWith("/prd-shop")) throw new Error("EACCES"); return mem.list(p); } };
    const map = await buildV6Map("/p", fs);
    expect(map.docs.analysis.map((d) => d.status)).toEqual(["complete"]);
    expect(map.docs.planning.map((d) => [d.kind, d.path, d.status])).toEqual([["prd", null, "unreadable status"]]);
    expect(map.problems).toContain("_bmad-output/initiative-shop/prd-shop could not be read: EACCES");
  });

  it("an epic folder that cannot be listed is a problem, not a failure", async () => {
    const mem = memFs();
    await seedV6Tree(mem, "/p", tree);
    await write(mem, `${I}/epic-cart/spec-x/spec-x.md`, "# s\n");
    let calls = 0; // the ticket tree lists the epic folder first; the map lists it again
    const fs: Fs = { ...mem, list: async (p) => { if (p.endsWith("/epic-cart") && ++calls > 1) throw new Error("EIO"); return mem.list(p); } };
    const map = await buildV6Map("/p", fs);
    expect(map.initiativeState).toBe("active");
    expect(map.problems).toContain("_bmad-output/initiative-shop/epic-cart could not be read: EIO");
  });

  it("an initiative folder that exists but cannot be listed is not called missing", async () => {
    const mem = memFs();
    await seedV6Tree(mem, "/p", tree);
    const fs: Fs = { ...mem, list: async (p) => { if (p.endsWith("/initiative-shop")) throw new Error("EACCES"); return mem.list(p); } };
    const map = await buildV6Map("/p", fs);
    expect(map.initiativeState).toBe("active");
    expect(map.problems).toContain("_bmad-output/initiative-shop could not be read: EACCES");
    expect(map.problems.some((p) => p.includes("not found"))).toBe(false);
  });

  it("collects loose work outside the initiative, skipping backlog, inbox and initiative folders", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, "/p/_bmad-output/brainstorm-names/.memlog.md", "---\nstatus: complete\n---\n");
    await write(fs, "/p/_bmad-output/plan-hotfix.md", "---\nroute: oneshot\nstatus: done\n---\n");
    await write(fs, "/p/_bmad-output/inbox/prd-x/prd-x.md", "---\nstatus: draft\n---\n");
    await write(fs, "/p/_bmad-output/initiative-old/prd-old/prd-old.md", "---\nstatus: final\n---\n");
    const map = await buildV6Map("/p", fs);
    expect(map.loose.map((d) => [d.kind, d.name])).toEqual([["brainstorm", "names"], ["plan", "hotfix"]]);
  });

  it("with no active initiative, shows only loose work and the backlog", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\n');
    await write(fs, "/p/_bmad-output/prd-loose/prd-loose.md", "---\nstatus: draft\n---\n");
    const map = await buildV6Map("/p", fs);
    expect(map.initiativeState).toBe("none");
    expect(map.initiative).toBeNull();
    expect(Object.values(map.docs).flat()).toEqual([]);
    expect(map.loose.map((d) => d.kind)).toEqual(["prd"]);
    expect(map.problems).toEqual([]);
  });

  it("an initiative whose folder is missing is a state with a problem, not a failure", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\nactive_initiative = "initiative-gone"\n');
    const map = await buildV6Map("/p", fs);
    expect(map.initiativeState).toBe("missing");
    expect(map.initiative).toEqual({ title: "initiative-gone", folder: "initiative-gone" });
    expect(map.problems).toEqual(["Initiative initiative-gone not found: _bmad-output/initiative-gone"]);
  });

  it("a malformed ticket tree is a problem; the docs still render", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, `${I}/prd-shop/prd-shop.md`, "---\nstatus: final\n---\n");
    await fs.writeText(`${I}/tickets.toml`, "[[epic]\nbroken = \n");
    const map = await buildV6Map("/p", fs);
    expect(map.tickets).toEqual([]);
    expect(map.docs.planning.map((d) => d.status)).toEqual(["final"]);
    expect(map.problems.some((p) => p.startsWith("Ticket tree could not be read: "))).toBe(true);
  });

  it("follows a configured output folder that is not _bmad-output", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/docs/bmad"\n');
    await write(fs, "/p/docs/bmad/prd-moved/prd-moved.md", "---\nstatus: draft\n---\n");
    const map = await buildV6Map("/p", fs);
    expect(map.outputFolder).toBe("docs/bmad");
    expect(map.loose.map((d) => d.path)).toEqual(["docs/bmad/prd-moved/prd-moved.md"]);
  });

  it("a missing output folder is an empty map", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\n');
    const map = await buildV6Map("/p", fs);
    expect(map.loose).toEqual([]);
    expect(map.backlog).toEqual([]);
  });

  it("reads the backlog as read-only rows; a done backlog ticket is claimed", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, "/p/_bmad-output/backlog/bug-login-crash.md", "---\ntype: bug\ntitle: Login crash\n---\n");
    await write(fs, "/p/_bmad-output/backlog/bug-login-crash-plan.md", "---\nticket: bug-login-crash\nstatus: done\n---\n");
    const map = await buildV6Map("/p", fs);
    expect(map.backlog.map((v) => [v.story.id, v.state, v.dispatchable])).toEqual([["bug-login-crash.md", "claimed", false]]);
  });

  it("an unclosed frontmatter fence becomes a problem on the doc's path", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, `${I}/prd-broken/prd-broken.md`, "---\nstatus: draft\n");
    const map = await buildV6Map("/p", fs);
    expect(map.docs.planning[0].status).toBe("unreadable status");
    expect(map.problems).toContain("_bmad-output/initiative-shop/prd-broken/prd-broken.md: frontmatter is not closed");
  });

  it("fails the build when the config cannot be parsed", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", "[core\nbroken");
    await expect(buildV6Map("/p", fs)).rejects.toThrow();
  });

  it("an unreadable gates folder is a problem; the docs still render", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", tree);
    await write(fs, `${I}/prd-shop/prd-shop.md`, "---\nstatus: final\n---\n");
    await write(fs, "/p/.ade/gates", "not a folder");
    const map = await buildV6Map("/p", fs);
    expect(map.docs.planning.map((d) => d.status)).toEqual(["final"]);
    expect(map.problems.some((p) => p.startsWith("Gates could not be read: "))).toBe(true);
  });
});

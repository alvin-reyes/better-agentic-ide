import { describe, expect, it } from "vitest";
import { v6Tickets } from "../v6Tickets";
import { memFs } from "../bmadRuntime/fs";
import { seedV6Tree } from "./fixtures/v6tree";

const PASS = 'story: "1.1"\ngate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n';
const oneTicket = (status: string) => ({
  initiative: { slug: "demo" },
  epics: [{ id: 1, slug: "cart" }],
  tickets: [{ id: 1, title: "Cart total", epic: "cart", type: "story" as const }],
  plans: { "1.1": { status } },
});

describe("v6Tickets", () => {
  it("a done ticket with a PASS gate is done; without one it is claimed", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    expect((await v6Tickets("/p", fs)).tickets[0].state).toBe("claimed");
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    expect((await v6Tickets("/p", fs)).tickets[0].state).toBe("done");
  });

  it("a done ticket whose gate is unreadable is claimed", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", 'story: "1.1"\ngate: "MAYBE"\n');
    expect((await v6Tickets("/p", fs)).tickets[0].state).toBe("claimed");
  });

  it("credits a letter-suffixed gate to its own ticket", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [
        { id: 6, title: "Cart total", epic: "cart" },
        { id: "6a", title: "Cart total rounding", epic: "cart" },
      ],
      plans: { "1.6": { status: "done" }, "1.6a": { status: "done" } },
    });
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.6a.yml", 'gate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n');
    const byId = Object.fromEntries((await v6Tickets("/p", fs)).tickets.map((v) => [v.story.id, v]));
    expect(byId["1.6a"].state).toBe("done");
    expect(byId["1.6"].state).toBe("claimed");
  });

  it("splits spare gates into unmatched and superseded", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    await fs.writeText("/p/.ade/gates/1.1-old.yml", 'story: "1.1"\ngate: "FAIL"\nupdated: "2026-01-01"\n');
    await fs.writeText("/p/.ade/gates/9.yml", 'gate: "FAIL"\n');
    const t = await v6Tickets("/p", fs);
    expect(t.supersededGates.map((g) => g.file)).toEqual([".ade/gates/1.1-old.yml"]);
    expect(t.unmatchedGates.map((g) => g.file)).toEqual([".ade/gates/9.yml"]);
  });

  it.each(["draft", "ready-for-dev"])("a %s ticket is approved and dispatchable only with an approval file", async (status) => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket(status));
    expect((await v6Tickets("/p", fs)).tickets[0]).toMatchObject({ state: "draft", dispatchable: false });
    await fs.mkdir("/p/.ade/approvals");
    await fs.writeText("/p/.ade/approvals/1.1", "2026-10-10\n");
    expect((await v6Tickets("/p", fs)).tickets[0]).toMatchObject({ state: "approved", dispatchable: true });
  });

  it("an approval file does not change a ticket already past draft", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("in-progress"));
    await fs.mkdir("/p/.ade/approvals");
    await fs.writeText("/p/.ade/approvals/1.1", "2026-10-10\n");
    expect((await v6Tickets("/p", fs)).tickets[0].state).toBe("in-progress");
  });

  it("groups refs under their epics", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("draft"));
    const t = await v6Tickets("/p", fs);
    expect(t.epics).toEqual([{ slug: "epic-cart", title: expect.any(String), refs: ["1.1"] }]);
  });

  it("is empty, not an error, with no active initiative or a missing initiative folder; orphan gates still surface", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\n');
    await fs.mkdir("/p/.ade/gates");
    await fs.writeText("/p/.ade/gates/1.1.yml", PASS);
    const none = await v6Tickets("/p", fs);
    expect(none.tickets).toEqual([]);
    expect(none.problems).toEqual([]);
    expect(none.unmatchedGates.map((g) => g.file)).toEqual([".ade/gates/1.1.yml"]);

    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\nactive_initiative = "initiative-gone"\n');
    const missing = await v6Tickets("/p", fs);
    expect(missing.tickets).toEqual([]);
    expect(missing.problems).toEqual([]);
  });

  it("turns a malformed ticket tree into a problem instead of throwing", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("draft"));
    await fs.writeText("/p/_bmad-output/initiative-demo/tickets.toml", "[[epic]\nbroken = \n");
    const t = await v6Tickets("/p", fs);
    expect(t.tickets).toEqual([]);
    expect(t.problems).toHaveLength(1);
    expect(t.problems[0]).toMatch(/^Ticket tree could not be read: /);
  });

  it("never appends or deletes, so the panel's Fs can refuse both", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("done"));
    const strict = { ...fs, append: async () => { throw new Error("append"); }, delete: async () => { throw new Error("delete"); } };
    await expect(v6Tickets("/p", strict)).resolves.toBeDefined();
  });

  it("an unreadable approvals folder is a problem, not a failure", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", oneTicket("ready-for-dev"));
    await fs.mkdir("/p/.ade");
    await fs.writeText("/p/.ade/approvals", "not a folder");
    const r = await v6Tickets("/p", fs);
    expect(r.tickets).toHaveLength(1);
    expect(r.problems.some((p) => p.startsWith("Approvals could not be read: "))).toBe(true);
  });
});

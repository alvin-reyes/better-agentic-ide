import { describe, expect, it } from "vitest";
import { readBacklogTree, readTicketTree } from "../bmadTicketTree";
import { memFs } from "../bmadRuntime/fs";
import { activeInitiativeName, outputFolder, ticketStatus } from "../bmadRuntime/tickets";
import { seedV6Tree } from "./fixtures/v6tree";

describe("readTicketTree", () => {
  it("reads epics, entries, leaves and plan statuses", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: 1, title: "Cart total", epic: "cart", type: "story", criteria: ["Total shows", "Total is charged"] }],
      plans: { "1.1": { status: "in-review" } },
    });
    const { tickets, epics, initiative } = await readTicketTree("/p", fs);
    expect(initiative).toBe("/p/_bmad-output/initiative-demo");
    expect(epics).toEqual([{ id: "1", slug: "epic-cart", title: "Cart", ticketCount: 1 }]);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      id: "1.1",
      localId: "1",
      type: "story",
      title: "Cart total",
      status: "in-review",
      state: "review",
      epic: "epic-cart",
      parent: "epic-cart",
      file: "_bmad-output/initiative-demo/epic-cart/story-cart-total.md",
      acceptanceCriteria: ["Total shows", "Total is charged"],
    });
  });

  it("derives planned when the plan file is missing", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: 1, title: "Cart total", epic: "cart", type: "story" }],
      plans: {},
    });
    const { tickets } = await readTicketTree("/p", fs);
    expect(tickets[0].status).toBeNull();
  });

  it("distinguishes alphanumeric ids from v4-style dotted ids", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: "6a", title: "Discounts", epic: "cart", type: "story" }],
      plans: {},
    });
    const { tickets } = await readTicketTree("/p", fs);
    expect(tickets[0].localId).toBe("6a");
    expect(tickets[0].id).toBe("1.6a");
  });

  it("keeps per-epic ids apart with initiative-unique refs", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [
        { id: 1, slug: "cart", title: "Shoppers manage their cart" },
        { id: 2, slug: "pay" },
      ],
      tickets: [
        { id: 1, title: "Cart total", epic: "cart" },
        { id: 1, title: "Pay by card", epic: "pay", type: "spike" },
      ],
      plans: { "2.1": { status: "done" } },
    });
    const { tickets, epics } = await readTicketTree("/p", fs);
    expect(tickets.map((t) => [t.id, t.localId, t.status, t.type])).toEqual([
      ["1.1", "1", null, "story"],
      ["2.1", "1", "done", "spike"],
    ]);
    expect(epics.map((e) => e.title)).toEqual(["Shoppers manage their cart", "Pay"]);
  });

  it("lists an entry that is not pulled yet, with no file and no status", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: 1, title: "Cart total", epic: "cart", pulled: false }],
      plans: {},
    });
    const { tickets } = await readTicketTree("/p", fs);
    expect(tickets[0]).toMatchObject({ id: "1.1", file: null, status: null, state: "planned", acceptanceCriteria: [] });
  });

  it("reads an initiative with no epics, and epics with no tickets", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", { initiative: { slug: "demo" }, epics: [], tickets: [], plans: {} });
    expect(await readTicketTree("/p", fs)).toMatchObject({ tickets: [], epics: [], problems: [] });

    const fs2 = memFs();
    await seedV6Tree(fs2, "/p", { initiative: { slug: "demo" }, epics: [{ id: 1, slug: "cart" }], tickets: [], plans: {} });
    const tree = await readTicketTree("/p", fs2);
    expect(tree.tickets).toEqual([]);
    expect(tree.epics).toEqual([{ id: "1", slug: "epic-cart", title: "Cart", ticketCount: 0 }]);
  });

  it("parses numbered Given/When/Then criteria and a lone Verify line", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [{ id: 1, slug: "cart" }],
      tickets: [{ id: 1, title: "Cart total", epic: "cart" }],
      plans: {},
    });
    const leaf = "/p/_bmad-output/initiative-demo/epic-cart/story-cart-total.md";
    await fs.writeText(
      leaf,
      [
        "---",
        "id: 1",
        "type: story",
        'title: "Cart total"',
        "parent: epic-cart",
        "---",
        "",
        "# Cart total",
        "",
        "## Acceptance Criteria",
        "",
        "<!-- a comment that is not a criterion -->",
        "1. **Valid code reduces the total**",
        "   **Given** a cart",
        "   **When** the shopper applies it",
        "   **Then** the total drops",
        "2. **Expired code is refused**",
        "   **Then** the total is unchanged",
        "",
        "## Boundaries",
        "",
        "- Must not change: tax",
        "",
      ].join("\n"),
    );
    let { tickets } = await readTicketTree("/p", fs);
    expect(tickets[0].acceptanceCriteria).toEqual([
      "Valid code reduces the total\nGiven a cart\nWhen the shopper applies it\nThen the total drops",
      "Expired code is refused\nThen the total is unchanged",
    ]);

    await fs.writeText(
      leaf,
      "---\nid: 1\ntype: story\ntitle: \"Cart total\"\n---\n\n# Cart total\n\n## Acceptance Criteria\n\nVerify: a shopper sees the total.\n\n## References\n\n- parent — x\n",
    );
    ({ tickets } = await readTicketTree("/p", fs));
    expect(tickets[0].acceptanceCriteria).toEqual(["Verify: a shopper sees the total."]);
  });
});

describe("seedV6Tree", () => {
  it("writes a tree the runtime port reads with no problems", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", {
      initiative: { slug: "demo" },
      epics: [
        { id: 1, slug: "cart" },
        { id: 2, slug: "pay" },
      ],
      tickets: [
        { id: 1, title: "Cart total", epic: "cart" },
        { id: "6a", title: "Discounts", epic: "cart", type: "bug" },
        { id: 1, title: "Not pulled", epic: "pay", pulled: false },
      ],
      plans: { "1.1": { status: "done" }, "1.6a": { status: "blocked" }, "2.1": { status: "in-progress" } },
    });
    expect(await fs.exists("/p/_bmad-output/initiative-demo/initiative-demo.md")).toBe(true);
    const view = await ticketStatus("/p", fs);
    expect(view).not.toHaveProperty("problems");
    expect(view.tickets.map((t: Record<string, unknown>) => [t.ref, t.status])).toEqual([
      ["1.1", "done"],
      ["1.6a", "blocked"],
      ["2.1", "in-progress"],
    ]);
  });
});

describe("v6 output folder and backlog", () => {
  const empty = { initiative: { slug: "demo" }, epics: [], tickets: [], plans: {} };

  it("resolves the output folder and the active initiative's name from the config", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", empty);
    expect(await outputFolder("/p", fs)).toBe("/p/_bmad-output");
    expect(await activeInitiativeName("/p", fs)).toBe("initiative-demo");
  });

  it("names no initiative when the config sets none", async () => {
    const fs = memFs();
    await fs.mkdir("/p/_bmad");
    await fs.writeText("/p/_bmad/config.toml", '[core]\nproject_name = "p"\noutput_folder = "{project-root}/_bmad-output"\n');
    expect(await activeInitiativeName("/p", fs)).toBeNull();
  });

  it("reads the backlog as a ticket tree, rows keyed by file name, plans joined by stem", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", empty);
    await fs.mkdir("/p/_bmad-output/backlog");
    await fs.writeText("/p/_bmad-output/backlog/bug-login-crash.md", "---\ntype: bug\ntitle: Login crash\n---\n\n# Login crash\n");
    await fs.writeText("/p/_bmad-output/backlog/bug-login-crash-plan.md", "---\nticket: bug-login-crash\nstatus: in-progress\n---\n\n# Plan\n");
    const tree = await readBacklogTree("/p", fs);
    expect(tree?.initiative).toBe("/p/_bmad-output/backlog");
    expect(tree?.epics).toEqual([]);
    expect(tree?.tickets).toHaveLength(1);
    expect(tree?.tickets[0]).toMatchObject({
      id: "bug-login-crash.md",
      type: "bug",
      title: "Login crash",
      status: "in-progress",
      file: "_bmad-output/backlog/bug-login-crash.md",
    });
  });

  it("has no backlog when the folder is missing", async () => {
    const fs = memFs();
    await seedV6Tree(fs, "/p", empty);
    expect(await readBacklogTree("/p", fs)).toBeNull();
  });
});

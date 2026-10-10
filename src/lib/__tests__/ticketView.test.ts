import { describe, expect, it } from "vitest";
import { ticketView } from "../ticketView";
import { parseGate } from "../bmadGates";
import type { Ticket } from "../bmadTicketTree";

const ticket = (status: string | null): Ticket => ({
  file: "x/story-1.1.md", id: "1.1", localId: "1", type: "story", title: "T",
  parent: "epic-cart", status, state: "planned", acceptanceCriteria: ["AC1"], epic: "epic-cart",
});

describe("ticketView", () => {
  it("maps built to Done and pairs the ADE gate", () => {
    const gate = parseGate(".ade/gates/1.1.yml", 'story: "1.1"\ngate: "PASS"\nstatus_reason: "verified"\nupdated: "2026-10-10"\n');
    const v = ticketView(ticket("built"), [gate]);
    expect(v.state).toBe("done");
    expect(v.gate?.verdict).toBe("PASS");
  });

  it("renders a done ticket with no gate as claimed, not done", () => {
    const v = ticketView(ticket("done"), []);
    expect(v.state).toBe("claimed");
  });

  it("derives planned for a missing plan and keeps the v6 status visible", () => {
    const v = ticketView(ticket(null), []);
    expect(v.story.status).toBe("Draft");
    expect(v.story.rawStatus).toBe("");
  });

  it("keeps blocked and dropped tickets visible as unknown-status stories", () => {
    for (const s of ["blocked", "dropped"]) {
      const v = ticketView(ticket(s), []);
      expect(v.story.status).toBe("unknown");
      expect(v.story.rawStatus).toBe(s);
    }
  });

  it("tolerates a ticket with no file yet", () => {
    const v = ticketView({ ...ticket("draft"), file: null }, []);
    expect(v.story.file).toBe("");
  });
});

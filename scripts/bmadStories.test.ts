import { describe, expect, it } from "vitest";
import { parseStory, isDispatchable } from "../src/lib/bmadStories";

const story = (status: string) => `# Story 2.4: Refund reversal

## Status

${status}

## Story

**As a** finance operator,
**I want** refunds to reverse the ledger entry,
**so that** the balance projection does not double-count.

## Acceptance Criteria

1. A refund writes a reversal, not a negative entry.
2. The balance projection is unchanged after a refund round-trip.
`;

describe("parseStory", () => {
  it("reads the id, title, status and acceptance criteria", () => {
    const s = parseStory("docs/stories/2.4.refund-reversal.md", story("Approved"));
    expect(s.id).toBe("2.4");
    expect(s.title).toBe("Refund reversal");
    expect(s.status).toBe("Approved");
    expect(s.acceptanceCriteria).toHaveLength(2);
    expect(s.acceptanceCriteria[0]).toContain("writes a reversal");
  });

  it("accepts every status BMAD defines", () => {
    for (const st of ["Draft", "Approved", "InProgress", "Review", "Done"]) {
      expect(parseStory("a.md", story(st)).status).toBe(st);
    }
  });

  // Review Focus 3: hand-written and older stories exist.
  it.each([
    ["an unknown word", "Shipped"],
    ["an empty status", ""],
  ])("renders a story with %s rather than guessing", (_label, raw) => {
    const s = parseStory("docs/stories/9.9.odd.md", story(raw));
    expect(s.status).toBe("unknown");
    expect(s.rawStatus).toBe(raw.trim());
    expect(s.title).toBe("Refund reversal"); // still rendered, from the heading
  });

  it("reads a lowercase status, since humans write them", () => {
    expect(parseStory("a.md", story("approved")).status).toBe("Approved");
  });

  it("falls back to the filename when there is no heading", () => {
    const s = parseStory("docs/stories/3.1.settlement-export.md", "no heading here");
    expect(s.id).toBe("3.1");
    expect(s.title).toBe("Settlement export");
    expect(s.status).toBe("unknown");
  });
});

describe("isDispatchable", () => {
  it("is true only at or past Approved", () => {
    const at = (st: string) => isDispatchable(parseStory("a.md", story(st)));
    expect(at("Draft")).toBe(false);
    expect(at("Shipped")).toBe(false); // unknown
    expect(at("Approved")).toBe(true);
    expect(at("InProgress")).toBe(true);
    expect(at("Review")).toBe(true);
    expect(at("Done")).toBe(true);
  });
});

describe("a story with the sections BMAD's template actually renders", () => {
  // story-tmpl.yaml's sections: Status, Story, Acceptance Criteria,
  // Tasks / Subtasks, Dev Notes, Testing, Change Log — with the deeper headings
  // a real Dev Notes section carries.
  const full = `# Story 2.4: Refund reversal

## Status

Review

## Story

**As a** finance operator,
**I want** refunds to reverse the ledger entry,
**so that** the projection does not double-count.

## Acceptance Criteria

1. A refund writes a reversal, not a negative entry.
2. The projection is unchanged after a round-trip.

#### A deeper heading inside the section

## Tasks / Subtasks

- [ ] Write the failing test
- [ ] Implement

## Dev Notes

### Testing standards

Vitest, under scripts/.

## Change Log

| Date | Version | Description |
|------|---------|-------------|
`;

  it("reads only the acceptance criteria, not what follows them", () => {
    const s = parseStory("docs/stories/2.4.refund-reversal.md", full);
    expect(s.status).toBe("Review");
    expect(s.acceptanceCriteria).toEqual([
      "A refund writes a reversal, not a negative entry.",
      "The projection is unchanged after a round-trip.",
    ]);
  });

  it("stops the section at a heading of any depth", () => {
    // ^#{1,3} let a #### heading fall into the criteria list.
    const s = parseStory("a.md", full);
    expect(s.acceptanceCriteria.some((c) => c.includes("deeper heading"))).toBe(false);
  });
});

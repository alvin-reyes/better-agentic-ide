import { describe, expect, it } from "vitest";
import { parseGate, gateFor } from "../src/lib/bmadGates";

const gate = (verdict: string, extra = "") => `schema: 1
story: "2.1"
story_title: "Ledger write path"
gate: ${verdict}
status_reason: "All acceptance criteria covered by passing tests."
reviewer: "Quinn (Test Architect)"
updated: "2026-10-05T10:00:00Z"
${extra}`;

describe("parseGate", () => {
  it("reads the verdict, story and reason", () => {
    const g = parseGate("docs/qa/gates/2.1-ledger.yml", gate("PASS"));
    expect(g.verdict).toBe("PASS");
    expect(g.storyId).toBe("2.1");
    expect(g.reason).toContain("acceptance criteria");
    expect(g.error).toBeNull();
    expect(g.waived).toBe(false);
  });

  it.each(["PASS", "CONCERNS", "FAIL", "WAIVED"])("reads %s", (v) => {
    expect(parseGate("g.yml", gate(v)).verdict).toBe(v);
  });

  it("marks a waiver active, so it can be shown as one", () => {
    const g = parseGate("g.yml", gate("WAIVED", 'waiver: { active: true }\n'));
    expect(g.waived).toBe(true);
  });

  // Review Focus 4: a malformed gate must not vanish or become a pass.
  it("keeps a gate with no verdict visible, with the problem attached", () => {
    const g = parseGate("docs/qa/gates/3.1-x.yml", 'story: "3.1"\nreviewer: "Quinn"\n');
    expect(g.verdict).toBeNull();
    expect(g.error).toMatch(/gate/i);
    expect(g.storyId).toBe("3.1");
  });

  it("keeps a gate with an unrecognised verdict visible", () => {
    const g = parseGate("g.yml", gate("MAYBE"));
    expect(g.verdict).toBeNull();
    expect(g.error).toContain("MAYBE");
  });

  it("falls back to the filename for the story id", () => {
    const g = parseGate("docs/qa/gates/4.2-settlement.yml", "gate: PASS\n");
    expect(g.storyId).toBe("4.2");
  });

  it("keeps a v6 ref's letter suffix when the story id comes from the filename", () => {
    expect(parseGate(".ade/gates/1.6a.yml", "gate: PASS\n").storyId).toBe("1.6a");
    expect(parseGate(".ade/gates/1.6a-slug.yml", "gate: PASS\n").storyId).toBe("1.6a");
    expect(parseGate(".ade/gates/1.6.yml", "gate: PASS\n").storyId).toBe("1.6");
  });

  it("reads every v4 filename the v4 parser always accepted", () => {
    // v4 gates were read up to the digits; a slug joined by _ or a space, or
    // letters straight after the number, must still name the story.
    expect(parseGate("docs/qa/gates/2.1_slug.yml", "gate: PASS\n").storyId).toBe("2.1");
    expect(parseGate("docs/qa/gates/2.1 slug.yml", "gate: PASS\n").storyId).toBe("2.1");
    expect(parseGate("docs/qa/gates/2.1slug.yml", "gate: PASS\n").storyId).toBe("2.1");
  });

  it("names a v6 gate by its whole ref, letters and all", () => {
    // v6 ids are any letters and digits, so only the directory says which rule applies.
    expect(parseGate(".ade/gates/2.1slug.yml", "gate: PASS\n").storyId).toBe("2.1slug");
    // Only gates directly in .ade/gates/ are v6; anything deeper is read as v4.
    expect(parseGate(".ade/gates/sub/2.1slug.yml", "gate: PASS\n").storyId).toBe("2.1");
    expect(parseGate("/proj/.ade/gates/2.3b.yml", "gate: PASS\n").storyId).toBe("2.3b");
  });

  it("still reads v4's <epic>.<story>-slug and bare <epic>.<story> filenames", () => {
    expect(parseGate("docs/qa/gates/2.1-slug.yml", "gate: PASS\n").storyId).toBe("2.1");
    expect(parseGate("docs/qa/gates/2.1.yml", "gate: PASS\n").storyId).toBe("2.1");
    expect(parseGate("docs/qa/gates/2.1.yaml", "gate: PASS\n").storyId).toBe("2.1");
  });
});

describe("gateFor", () => {
  it("matches a gate to its story", () => {
    const gates = [parseGate("docs/qa/gates/2.1-a.yml", gate("PASS"))];
    expect(gateFor("2.1", gates)?.verdict).toBe("PASS");
    expect(gateFor("2.2", gates)).toBeUndefined();
  });
});

/**
 * Fixtures below come from the files BMAD actually ships, not from prose.
 * The hand-written ones above pass against a parser that misreads the real
 * template, which is how a quoted-and-commented `gate:` line reached review.
 */
describe("the shapes BMAD actually ships", () => {
  it("reads a quoted verdict that carries a trailing comment", () => {
    // Verbatim shape of qa-gate-tmpl.yaml:15.
    const g = parseGate("docs/qa/gates/2.1-x.yml", 'gate: "PASS" # PASS|CONCERNS|FAIL|WAIVED\n');
    expect(g.verdict).toBe("PASS");
    expect(g.error).toBeNull();
  });

  it("keeps a # that is inside the quotes, where it is content not a comment", () => {
    const g = parseGate("g.yml", `gate: PASS\nstatus_reason: 'AC #3 lacks coverage'\n`);
    expect(g.reason).toBe("AC #3 lacks coverage");
  });

  it("detects a block-style waiver, which is what tasks/qa-gate.md documents", () => {
    const g = parseGate("g.yml", `gate: WAIVED\nwaiver:\n  active: true\n  reason: 'MVP release'\n`);
    expect(g.waived).toBe(true);
  });

  it("still detects the inline waiver form", () => {
    expect(parseGate("g.yml", "gate: WAIVED\nwaiver: { active: true }\n").waived).toBe(true);
  });

  it("does not call an inactive waiver waived", () => {
    expect(parseGate("g.yml", "gate: PASS\nwaiver: { active: false }\n").waived).toBe(false);
  });
});

describe("gateFor with more than one gate for a story", () => {
  const older = parseGate("docs/qa/gates/2.1-old.yml",
    `story: "2.1"\ngate: PASS\nupdated: "2026-01-01T00:00:00Z"\n`);
  const newer = parseGate("docs/qa/gates/2.1-new.yml",
    `story: "2.1"\ngate: FAIL\nupdated: "2026-06-01T00:00:00Z"\n`);

  it("takes the most recently updated, whatever order they arrive in", () => {
    // A renamed story leaves a stale gate beside the current one. Resolving by
    // array position lets a superseded PASS outrank a later FAIL.
    expect(gateFor("2.1", [older, newer])?.verdict).toBe("FAIL");
    expect(gateFor("2.1", [newer, older])?.verdict).toBe("FAIL");
  });
});

describe("a key with an empty value", () => {
  // `\s*` matches a newline, so `^key:\s*(.*)$` ran past the line end and
  // captured the FOLLOWING line as the value.
  it("does not swallow the next line as its value", () => {
    expect(parseGate("g.yml", 'gate: PASS\nstatus_reason:\nreviewer: "Quinn"\n').reason).toBe("");
    expect(parseGate("docs/qa/gates/4.2-x.yml", "story:\ngate: PASS\n").storyId).toBe("4.2");
  });

  it("reports an empty gate as missing, not as a bogus verdict", () => {
    const g = parseGate("g.yml", 'gate:\nstatus_reason: "no decision yet"\n');
    expect(g.verdict).toBeNull();
    expect(g.error).not.toContain("status_reason");
  });

  it("falls back to the filename for an explicitly empty story id", () => {
    expect(parseGate("docs/qa/gates/5.3-x.yml", 'story: ""\ngate: PASS\n').storyId).toBe("5.3");
  });
});

describe("gateFor when timestamps cannot order the gates", () => {
  const mk = (file: string, v: string, updated = "") =>
    parseGate(file, `story: "2.1"\ngate: ${v}\n${updated ? `updated: "${updated}"\n` : ""}`);

  it("does not let a stale PASS beat a current FAIL that has no timestamp", () => {
    // Treating a missing timestamp as oldest makes the dangerous direction the
    // default: believing a PASS is the failure that matters.
    const fresh = mk("fresh.yml", "FAIL");
    const stale = mk("stale.yml", "PASS", "2026-01-01T00:00:00Z");
    expect(gateFor("2.1", [fresh, stale])?.verdict).toBe("FAIL");
    expect(gateFor("2.1", [stale, fresh])?.verdict).toBe("FAIL");
  });

  it("is deterministic when neither carries a timestamp", () => {
    const a = mk("a.yml", "PASS");
    const b = mk("b.yml", "FAIL");
    expect(gateFor("2.1", [a, b])?.verdict).toBe("FAIL");
    expect(gateFor("2.1", [b, a])?.verdict).toBe("FAIL");
  });

  it("still prefers the newer when both are timestamped", () => {
    const old = mk("old.yml", "FAIL", "2026-01-01T00:00:00Z");
    const neu = mk("new.yml", "PASS", "2026-06-01T00:00:00Z");
    expect(gateFor("2.1", [old, neu])?.verdict).toBe("PASS");
  });
});

describe("the waiver scan stays inside the waiver block", () => {
  it("is not triggered by an example elsewhere in the file", () => {
    // qa-gate-tmpl.yaml ships a `when_waived: |` example containing an active
    // waiver. A lazy scan to any later `active: true` matches it.
    const yaml = `gate: "PASS" # PASS|CONCERNS|FAIL|WAIVED
waiver:
  active: false
examples:
  when_waived: |
    waiver:
      active: true
      reason: "Accepted for MVP release"
`;
    const g = parseGate("g.yml", yaml);
    expect(g.verdict).toBe("PASS");
    expect(g.waived).toBe(false);
  });

  it("still sees a real block waiver", () => {
    expect(parseGate("g.yml", "gate: WAIVED\nwaiver:\n  active: true\n  reason: 'MVP'\n").waived).toBe(true);
  });
});

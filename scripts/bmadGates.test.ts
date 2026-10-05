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
});

describe("gateFor", () => {
  it("matches a gate to its story", () => {
    const gates = [parseGate("docs/qa/gates/2.1-a.yml", gate("PASS"))];
    expect(gateFor("2.1", gates)?.verdict).toBe("PASS");
    expect(gateFor("2.2", gates)).toBeUndefined();
  });
});

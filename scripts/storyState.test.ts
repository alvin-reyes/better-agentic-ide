import { describe, expect, it } from "vitest";
import { parseStory } from "../src/lib/bmadStories";
import { parseGate } from "../src/lib/bmadGates";
import { storyView, executionComplete } from "../src/lib/storyState";

const md = (status: string) => `# Story 2.1: Ledger write path\n\n## Status\n\n${status}\n`;
const story = (status: string) => parseStory("docs/stories/2.1.ledger.md", md(status));
const gate = (v: string, id = "2.1") =>
  parseGate(`docs/qa/gates/${id}-x.yml`, `story: "${id}"\ngate: ${v}\nstatus_reason: "why"\n`);

describe("storyView", () => {
  it("is done when the status says Done and a gate passed", () => {
    const v = storyView(story("Done"), [gate("PASS")]);
    expect(v.state).toBe("done");
  });

  // Review Focus 5: the case the whole design exists for.
  it("is claimed, not done, when Done has no gate behind it", () => {
    const v = storyView(story("Done"), []);
    expect(v.state).toBe("claimed");
    expect(v.note).toMatch(/no gate/i);
  });

  it("is claimed when the gate did not pass", () => {
    expect(storyView(story("Done"), [gate("FAIL")]).state).toBe("claimed");
    expect(storyView(story("Done"), [gate("CONCERNS")]).state).toBe("claimed");
  });

  it("treats a waiver as done, and says it was waived", () => {
    const v = storyView(story("Done"), [gate("WAIVED")]);
    expect(v.state).toBe("done");
    expect(v.note).toMatch(/waived/i);
  });

  it("carries the other statuses straight through", () => {
    expect(storyView(story("Draft"), []).state).toBe("draft");
    expect(storyView(story("Approved"), []).state).toBe("approved");
    expect(storyView(story("InProgress"), []).state).toBe("in-progress");
    expect(storyView(story("Review"), []).state).toBe("review");
  });

  it("never dispatches below Approved", () => {
    expect(storyView(story("Draft"), []).dispatchable).toBe(false);
    expect(storyView(story("Shipped"), []).dispatchable).toBe(false);
    expect(storyView(story("Approved"), []).dispatchable).toBe(true);
  });

  it("surfaces an unreadable gate instead of ignoring it", () => {
    const broken = parseGate("docs/qa/gates/2.1-x.yml", 'story: "2.1"\n');
    const v = storyView(story("Review"), [broken]);
    expect(v.note).toMatch(/gate/i);
  });
});

describe("executionComplete", () => {
  it("is false while any story is short of done", () => {
    const views = [storyView(story("Done"), [gate("PASS")]), storyView(story("Review"), [])];
    expect(executionComplete(views)).toBe(false);
  });

  it("is true when every story is done", () => {
    expect(executionComplete([storyView(story("Done"), [gate("PASS")])])).toBe(true);
  });

  it("is false for an empty backlog, since nothing has been planned", () => {
    expect(executionComplete([])).toBe(false);
  });
});

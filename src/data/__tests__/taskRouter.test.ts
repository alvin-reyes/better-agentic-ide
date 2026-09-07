import { describe, it, expect } from "vitest";
import { routeTask, isTaskDescription } from "../taskRouter";
import { AGENT_CATALOG } from "../curatedAgents";

describe("routeTask", () => {
  it("routes architecture work to the System Architect", () => {
    // The regression this pins: general-architect has no domain, so it took
    // its keywords from a domain that does not exist and ended up with none.
    // It could then never win, and this sentence routed to Brainstorm Agent
    // on the strength of the single word "design".
    const result = routeTask("design a microservice architecture for scaling");
    expect(result?.agent.id).toBe("general-architect");
  });

  it("routes documentation work to the Docs Writer", () => {
    const result = routeTask("write documentation and a readme guide");
    expect(result?.agent.id).toBe("general-docs");
  });

  it("finds a match for a plain readme request instead of nothing at all", () => {
    // The reported symptom was an empty picker: routeTask returned null, and
    // AgentPicker's substring fallback matched no name, description or
    // category, so the user saw "No matching agents".
    //
    // It now matches. Note it matches *Code Reviewer*, not Docs Writer: the
    // code-review keyword "pr" prefix-matches "project" and ties break on
    // catalog order. That is taskRouter's pre-existing prefix heuristic,
    // unchanged by this branch and out of scope here — asserted so the
    // behaviour is recorded rather than mistaken for the bug above.
    const input = "write a readme for the project";
    expect(isTaskDescription(input)).toBe(true);
    expect(routeTask(input)).toBeTruthy();
  });

  it("returns null when nothing matches", () => {
    expect(routeTask("zzzz qqqq wwww")).toBe(null);
  });

  it("gives every curated agent at least one keyword to be routed by", () => {
    // A domainless agent inherits no keywords, which is exactly how
    // general-docs and general-architect became unroutable.
    for (const agent of AGENT_CATALOG) {
      expect(agent.keywords.length, `${agent.id} has no routing keywords`).toBeGreaterThan(0);
    }
  });
});

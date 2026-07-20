import { describe, it, expect, beforeEach } from "vitest";
import { useBmadStore } from "../bmadStore";

describe("bmadStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useBmadStore.setState({ dismissedPaths: [] });
  });

  it("records and reports dismissals", () => {
    useBmadStore.getState().dismiss("/proj/a");
    expect(useBmadStore.getState().isDismissed("/proj/a")).toBe(true);
    expect(useBmadStore.getState().isDismissed("/proj/b")).toBe(false);
  });

  it("persists dismissals to localStorage", () => {
    useBmadStore.getState().dismiss("/proj/a");
    expect(localStorage.getItem("ade-bmad-dismissed")).toContain("/proj/a");
  });
});

import { describe, it, expect, vi } from "vitest";
import { announceSetup } from "../useProjectSetup";
import type { SetupResult } from "../../lib/projectSetup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const result = (report: Partial<SetupResult["report"]>): SetupResult => ({
  root: "/code/app",
  report: { created: [], appendedImport: false, agents: 0, bmadFiles: 0, ...report },
  files: [],
  stacks: [],
});

describe("announceSetup", () => {
  it("says when the settings file couldn't be updated, even if nothing else was written", () => {
    const show = vi.fn();
    announceSetup(result({ settingsError: "/code/app/.claude/settings.json is not valid JSON; fix it first" }), show);
    expect(show).toHaveBeenCalledOnce();
    expect(show.mock.calls[0][0].body).toMatch(/AI attribution is still on: .*not valid JSON/);
  });

  it("stays quiet when a setup wrote nothing and nothing failed", () => {
    const show = vi.fn();
    announceSetup(result({}), show);
    expect(show).not.toHaveBeenCalled();
  });
});

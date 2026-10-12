import { describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { announceSetup } from "../useProjectSetup";
import type { ClaudeEdit, SetupResult } from "../../lib/projectSetup";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => 0) }));

const edit = (status: ClaudeEdit["status"], reason: string | null = null): ClaudeEdit =>
  status === "skipped" ? { status, reason, before: "", after: "" } : { status, reason, before: "# old\n", after: "# new\n" };

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
    expect(show.mock.calls[0][0].action, "nothing was written, so there is nothing to undo").toBeUndefined();
  });

  it("says so when the only change is the BMAD paragraph of CLAUDE.md, and Undo puts it back", () => {
    const show = vi.fn();
    announceSetup(result({ claudeMd: edit("replaced") }), show);
    expect(show).toHaveBeenCalledOnce();
    const toast = show.mock.calls[0][0];
    expect(toast.title).toBe("Set up app");
    expect(toast.body).toBe("Added an updated BMAD paragraph in CLAUDE.md. Other existing files were left as they were.");
    expect(toast.action.label).toBe("Undo");
    toast.action.run();
    expect(invoke).toHaveBeenCalledWith("project_setup_undo", { root: "/code/app", created: [], files: [], import: null, claudeMd: edit("replaced") });
  });

  it("says a section was added, and when old BMAD lines need removing by hand", () => {
    const show = vi.fn();
    announceSetup(result({ claudeMd: edit("appended") }), show);
    expect(show.mock.calls[0][0].body).toBe("Added a BMAD section in CLAUDE.md. Other existing files were left as they were.");
    announceSetup(result({ claudeMd: edit("appended", "edited"), agents: 8, created: new Array(8).fill("x") }), show);
    expect(show.mock.calls[1][0].body)
      .toBe("Added 8 agents and a BMAD section in CLAUDE.md. Other existing files were left as they were. CLAUDE.md still has older BMAD lines: remove them by hand.");
  });

  it("says why CLAUDE.md was left alone, even if nothing else was written", () => {
    const show = vi.fn();
    announceSetup(result({ claudeMd: edit("skipped", "link") }), show);
    expect(show).toHaveBeenCalledOnce();
    expect(show.mock.calls[0][0].body).toBe("CLAUDE.md is a link, so its BMAD paragraph was left as it is.");
    // Nothing was written: there is nothing to undo, and Undo would mark the project declined.
    expect(show.mock.calls[0][0].action).toBeUndefined();
    announceSetup(result({ claudeMd: edit("skipped", "twice"), agents: 1, created: ["x"] }), show);
    expect(show.mock.calls[1][0].body)
      .toBe("Added 1 agent. Existing files were left as they were. CLAUDE.md holds the BMAD paragraph more than once, so its BMAD paragraph was left as it is.");
    expect(show.mock.calls[1][0].action.label).toBe("Undo");
    // The import is still added to a link or a file that isn't UTF-8: the note is about the paragraph.
    announceSetup(result({ claudeMd: edit("skipped", "not-utf8"), appendedImport: true }), show);
    expect(show.mock.calls[2][0].body)
      .toBe("Added a line in CLAUDE.md. Existing files were left as they were. CLAUDE.md isn't UTF-8 text, so its BMAD paragraph was left as it is.");
  });

  it("stays quiet when a setup wrote nothing and nothing failed", () => {
    const show = vi.fn();
    announceSetup(result({}), show);
    expect(show).not.toHaveBeenCalled();
  });
});

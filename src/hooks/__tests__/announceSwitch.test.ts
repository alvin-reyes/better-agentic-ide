import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const opened = vi.hoisted(() => ({ file: vi.fn() }));
vi.mock("../../lib/openFile", () => ({ openFileFromTerminal: opened.file }));

import { announceFailure, announceSwitch } from "../useProjectSetup";
import { toastActions, toastLifetime, type GuardToast } from "../useContextGuard";
import type { SwitchDone } from "../../lib/bmadSwitch";

const done = (over: Partial<SwitchDone["result"]> = {}): SwitchDone => ({
  root: "/code/shop",
  from: "v4",
  to: "v6",
  result: {
    archive: ".ade/archive/bmad-v4-2026-10-11",
    moved: 7,
    movedCapped: false,
    setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 },
    rulesAppended: true,
    archiveDenied: true,
    ...over,
  },
});

const announced = (d: SwitchDone): GuardToast => {
  const show = vi.fn<(t: GuardToast) => void>();
  announceSwitch(d, show);
  expect(show).toHaveBeenCalledOnce();
  return show.mock.calls[0][0];
};

beforeEach(() => opened.file.mockClear());

describe("announceSwitch", () => {
  it("says what was switched and where the old version went", () => {
    const toast = announced(done());
    expect(toast.title).toBe("Switched shop to BMAD v6");
    expect(toast.body).toContain("Moved 7 files to .ade/archive/bmad-v4-2026-10-11/.");
    expect(announced(done({ moved: 1 })).body).toContain("Moved 1 file to");
  });

  it("says 'N+ files' when a count was capped", () => {
    expect(announced(done({ moved: 50_000, movedCapped: true })).body).toContain("Moved 50,000+ files to");
  });

  it("says agents already running keep their old role prompt until restarted", () => {
    expect(announced(done()).body).toContain("Agents already running keep their old role prompt until restarted.");
  });

  it("says what happened to the BMAD paragraph of CLAUDE.md", () => {
    const setup = { created: [], appendedImport: false, agents: 8, bmadFiles: 0 };
    const withEdit = (status: "replaced" | "appended" | "skipped", reason: string | null = null) =>
      announced(done({ setup: { ...setup, claudeMd: { status, reason, before: "", after: "" } } })).body;
    expect(withEdit("replaced")).toContain("/. The BMAD paragraph in CLAUDE.md is now the v6 one. Agents can't edit the archive");
    expect(withEdit("appended")).toContain("/. CLAUDE.md has a new BMAD v6 section. Agents can't edit the archive");
    expect(withEdit("appended", "edited")).toContain("CLAUDE.md has a new BMAD v6 section. CLAUDE.md still has older BMAD lines: remove them by hand. Agents");
    expect(withEdit("skipped", "not-utf8")).toContain("/. CLAUDE.md isn't UTF-8 text, so its BMAD paragraph was left as it is. Agents");
    // Already right, or written new: nothing to say.
    expect(announced(done()).body).not.toContain("CLAUDE.md");
  });

  it("links to ARCHIVE.md and offers no Undo", () => {
    const toast = announced(done());
    const actions = toastActions(toast);
    expect(actions.map((a) => a.label)).toEqual(["Open ARCHIVE.md"]);
    actions[0].run!();
    expect(opened.file).toHaveBeenCalledWith("/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
    // A link, so it gets the time a button gets.
    expect(toastLifetime(toast)).toBe(15000);
  });

  it("says agents can't edit the archive when the permission rule is in place", () => {
    expect(announced(done()).body).toContain("Agents can't edit the archive");
  });

  it("says so when the permission rule couldn't be added", () => {
    const body = announced(done({ archiveDenied: false })).body;
    expect(body).toContain("couldn't be added to .claude/settings.json");
    expect(body).toContain("isn't protected from edits");
    expect(body).not.toContain("Agents can't edit the archive");
  });
});

describe("announceFailure", () => {
  const said = (failed: Parameters<typeof announceFailure>[0]): GuardToast => {
    const show = vi.fn<(t: GuardToast) => void>();
    announceFailure(failed, show);
    expect(show).toHaveBeenCalledOnce();
    return show.mock.calls[0][0];
  };

  it("says why, under Project setup, and goes after a few seconds", () => {
    const toast = said({ why: "Project setup failed: disk full" });
    expect(toast).toEqual({ title: "Project setup", body: "Project setup failed: disk full" });
    expect(toastLifetime(toast)).toBe(4000);
  });

  it("takes the title it is given", () => {
    expect(said({ why: "This project has no BMAD to switch from.", title: "BMAD switch" }).title).toBe("BMAD switch");
  });

  it("links to the journal when an unfinished switch is the reason, and stays long enough to click", () => {
    const toast = said({
      why: "A BMAD switch in shop didn't finish. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
      archiveFile: "/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md",
    });
    expect(toast.body).toContain("didn't finish");
    const actions = toastActions(toast);
    expect(actions.map((a) => a.label)).toEqual(["Open ARCHIVE.md"]);
    actions[0].run!();
    expect(opened.file).toHaveBeenCalledWith("/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md");
    expect(toastLifetime(toast)).toBe(15000);
  });
});

describe("App", () => {
  it("reports a setup or switch that didn't happen through announceFailure", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(app).toMatch(/const onSetupFailed = \(e: Event\) => announceFailure\(/);
  });

  it("announces a switch from its own event, apart from setup's", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(app).toMatch(/const onSwitch = \(e: Event\) => announceSwitch\(/);
    expect(app).toContain("window.addEventListener(SWITCH_DONE_EVENT, onSwitch);");
    expect(app).toContain("window.removeEventListener(SWITCH_DONE_EVENT, onSwitch);");
  });
});

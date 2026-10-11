import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const opened = vi.hoisted(() => ({ file: vi.fn() }));
vi.mock("../../lib/openFile", () => ({ openFileFromTerminal: opened.file }));

import { announceSwitch } from "../useProjectSetup";
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

describe("App", () => {
  it("announces a switch from its own event, apart from setup's", () => {
    const app = readFileSync(resolve(__dirname, "../../App.tsx"), "utf8");
    expect(app).toMatch(/const onSwitch = \(e: Event\) => announceSwitch\(/);
    expect(app).toContain("window.addEventListener(SWITCH_DONE_EVENT, onSwitch);");
    expect(app).toContain("window.removeEventListener(SWITCH_DONE_EVENT, onSwitch);");
  });
});

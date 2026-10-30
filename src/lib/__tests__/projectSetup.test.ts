import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Setup is IPC only. Tauri binds the apply arguments by name, so the recorded
// call is the whole observable contract — especially `methodology`, whose
// absence used to be invisible until the Rust command rejected the call.
const tauri = vi.hoisted(() => ({
  applies: [] as Record<string, unknown>[],
  undos: [] as Record<string, unknown>[],
  /** What `project_setup_status` reports the project is already on. */
  methodology: null as "v4" | "v6" | null,
  /** Per-folder override of `methodology`, for folders inside a project. */
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
  /** What `bmad_switch_pending` answers; null makes the check itself fail. */
  pending: [] as unknown[] | null,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "project_root":
        return tauri.roots[args.path as string] ?? args.path;
      case "project_setup_status":
        return {
          isGit: true,
          missing: [],
          needsImport: false,
          bmadInstalled: false,
          stacks: [],
          methodology: (args.root as string) in tauri.byDir ? tauri.byDir[args.root as string] : tauri.methodology,
        };
      case "bmad_switch_pending":
        if (tauri.pending === null) throw new Error("no such folder");
        return tauri.pending;
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0, bmadv6Files: 0 };
      case "project_setup_undo":
        tauri.undos.push(args);
        return 0;
      case "project_agent_remove":
        return true;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import { BMAD_PARAGRAPH, BMAD_SHIPPED, agentCatalog, bmadSection } from "../projectMethodology";
import {
  addAgent, addStackAgents, beginSwitch, bmadRootOf, detectOnDisk, foldersUpTo, hasBmad, isComplete, isKept, isSettingUp, isWithin, markKept, methodologyOf, migrateKept, normRoot, reaskV4Projects, removeAgent,
  removedAgents, setUpProject, setupDeclined, setupRootOf, summarize, switchBlock, undoSetup, wasSetUp, claudeMdNote,
  type ClaudeEdit, type SetupReport, type SetupStatus,
} from "../projectSetup";

const lastApply = () => tauri.applies[tauri.applies.length - 1];

beforeEach(() => {
  localStorage.clear();
  tauri.applies.length = 0;
  tauri.undos.length = 0;
  tauri.methodology = null;
  tauri.byDir = {};
  tauri.roots = {};
  tauri.pending = [];
});

describe("methodology in project setup", () => {
  it("passes the chosen methodology to setup and defaults new projects to v6", async () => {
    await setUpProject("/tmp/proj", "v6");
    expect(lastApply().methodology).toBe("v6");
    await setUpProject("/tmp/proj");
    expect(lastApply().methodology).toBe("v6");
  });

  it("keeps a project that says what it is on", async () => {
    tauri.methodology = "v4";
    await setUpProject("/tmp/proj");
    expect(lastApply().methodology).toBe("v4");
    tauri.methodology = "v6";
    await setUpProject("/tmp/proj");
    expect(lastApply().methodology).toBe("v6");
  });

  it("lets the owner's explicit choice win over what the project is on", async () => {
    tauri.methodology = "v4";
    await setUpProject("/tmp/proj", "v6");
    expect(lastApply().methodology).toBe("v6");
  });

  it("reports what a project is on from the status command, null when it has neither", async () => {
    expect(await detectOnDisk("/tmp/proj")).toBeNull();
    tauri.methodology = "v4";
    expect(await detectOnDisk("/tmp/proj")).toBe("v4");
    tauri.methodology = "v6";
    expect(await detectOnDisk("/tmp/proj")).toBe("v6");
  });

  it("sends the methodology when adding stack agents and single agents", async () => {
    await addStackAgents("/tmp/proj", ["go"], "v4");
    expect(lastApply().methodology).toBe("v4");
    await addStackAgents("/tmp/proj", ["go"]);
    expect(lastApply().methodology).toBe("v6");
    await addAgent("/tmp/proj", agentCatalog()[0]);
    expect(lastApply().methodology).toBe("v6");
  });

  const files = () => lastApply().files as { path: string; content: string }[];
  const qaIn = () => files().find((f) => f.path === ".claude/agents/qa.md")?.content ?? "";

  it("writes the core roles with only the project's BMAD section", async () => {
    tauri.methodology = "v4";
    await setUpProject("/tmp/proj");
    expect(qaIn()).toContain("## BMAD tasks (v4)");
    expect(qaIn()).not.toContain("## BMAD tasks (v6)");
    await setUpProject("/tmp/proj", "v6", []);
    expect(qaIn()).toContain("## BMAD tasks (v6)");
    expect(qaIn()).not.toContain("## BMAD tasks (v4)");
  });

  it("adds a single core role on the project's methodology", async () => {
    const qa = agentCatalog().find((a) => a.id === "qa")!;
    await addAgent("/tmp/proj", qa, "v4");
    expect(qaIn()).toContain("## BMAD tasks (v4)");
    expect(qaIn()).not.toContain("## BMAD tasks (v6)");
  });

  it("resolves a launch's methodology from the project, v6 when unknown", async () => {
    expect(await methodologyOf(undefined)).toBe("v6");
    expect(await methodologyOf("/tmp/proj")).toBe("v6");
    tauri.methodology = "v4";
    expect(await methodologyOf("/tmp/proj")).toBe("v4");
  });

  it("finds the methodology of a folder's project from inside a subfolder", async () => {
    // A v4 project with its marker at the root; the terminal is cd'd into src.
    tauri.byDir = { "/p": "v4", "/p/src": null, "/p/src/deep": null };
    tauri.roots = { "/p/src/deep": "/p", "/p/src": "/p" };
    expect(await methodologyOf("/p/src/deep")).toBe("v4");
    expect(await methodologyOf("/p/src")).toBe("v4");
  });

  it("stops at the nearest folder that says what it is on", async () => {
    // A BMAD project nested inside a larger git repository.
    tauri.byDir = { "/mono": "v6", "/mono/app": "v4", "/mono/app/src": null };
    tauri.roots = { "/mono/app/src": "/mono" };
    expect(await methodologyOf("/mono/app/src")).toBe("v4");
  });

  it("handles Windows paths", async () => {
    tauri.byDir = { "C:\\p": "v4", "C:\\p\\src": null };
    tauri.roots = { "C:\\p\\src": "C:\\p" };
    expect(await methodologyOf("C:\\p\\src")).toBe("v4");
  });
});

describe("the BMAD paragraph of an existing CLAUDE.md", () => {
  const report = (claudeMd?: ClaudeEdit | null): SetupReport => ({ created: [], appendedImport: false, agents: 0, bmadFiles: 0, claudeMd });
  const edit = (status: ClaudeEdit["status"], reason: string | null = null): ClaudeEdit =>
    status === "skipped" ? { status, reason, before: "", after: "" } : { status, reason, before: "# old\n", after: "# new\n" };

  it("is sent with a full setup: the project's version's, and every text ADE has shipped", async () => {
    for (const methodology of ["v6", "v4"] as const) {
      await setUpProject(`/tmp/${methodology}`, methodology, []);
      const sent = lastApply();
      expect(sent.full).toBe(true);
      expect(sent.bmad).toEqual({
        paragraph: BMAD_PARAGRAPH[methodology],
        section: bmadSection(methodology),
        paragraphs: BMAD_SHIPPED,
        sections: expect.arrayContaining([bmadSection("v4"), bmadSection("v6")]),
        open: "<!-- ade:bmad -->",
        close: "<!-- /ade:bmad -->",
      });
      expect((sent.bmad as { sections: string[] }).sections).toHaveLength(BMAD_SHIPPED.length);
    }
  });

  it("is not sent when agents are added on their own: CLAUDE.md is not theirs to edit", async () => {
    await addStackAgents("/tmp/proj", ["go"], "v6");
    expect(lastApply().full).toBe(false);
    expect(lastApply()).not.toHaveProperty("bmad");
    await addAgent("/tmp/proj", agentCatalog().find((a) => a.id === "qa")!, "v6");
    expect(lastApply().full).toBe(false);
    expect(lastApply()).not.toHaveProperty("bmad");
  });

  it("is summarized when it was updated or added, and not when the file was left", () => {
    expect(summarize(report(edit("replaced")))).toBe("an updated BMAD paragraph in CLAUDE.md");
    expect(summarize(report(edit("appended")))).toBe("a BMAD section in CLAUDE.md");
    expect(summarize({ ...report(edit("appended")), appendedImport: true, agents: 2 }))
      .toBe("2 agents, a line in CLAUDE.md and a BMAD section in CLAUDE.md");
    expect(summarize(report(edit("skipped", "link")))).toBeNull();
    expect(summarize(report(null))).toBeNull();
  });

  it("says when old BMAD lines need removing by hand", () => {
    expect(claudeMdNote(report(edit("appended", "edited")))).toBe("CLAUDE.md still has older BMAD lines: remove them by hand.");
    expect(claudeMdNote(report(edit("replaced", "edited")))).toBe("CLAUDE.md still has older BMAD lines: remove them by hand.");
    expect(claudeMdNote(report(edit("appended")))).toBeNull();
    expect(claudeMdNote(report(edit("replaced")))).toBeNull();
    expect(claudeMdNote(report())).toBeNull();
  });

  it("says why a file was left alone", () => {
    const why = (reason: string | null) => claudeMdNote(report(edit("skipped", reason)));
    expect(why("link")).toBe("CLAUDE.md is a link, so its BMAD paragraph was left as it is.");
    expect(why("read-only")).toBe("CLAUDE.md is read-only, so its BMAD paragraph was left as it is.");
    expect(why("not-utf8")).toBe("CLAUDE.md isn't UTF-8 text, so its BMAD paragraph was left as it is.");
    expect(why("twice")).toBe("CLAUDE.md holds the BMAD paragraph more than once, so its BMAD paragraph was left as it is.");
    // About the paragraph only: the same toast may say a line was added to the file.
    for (const reason of ["link", "read-only", "not-utf8", "twice", "some error"]) expect(why(reason)).toMatch(/BMAD paragraph.* was left as it is/);
    expect(why("edited-section")).toBe("The BMAD section in CLAUDE.md was edited, so it was left as it is.");
    expect(why("it couldn't be written: disk full")).toBe("The BMAD paragraph in CLAUDE.md was left as it is: it couldn't be written: disk full.");
    expect(why(null)).toBe("The BMAD paragraph in CLAUDE.md was left as it is: it couldn't be updated.");
  });

  it("is handed back to Undo as the setup recorded it, and not when the file was left", async () => {
    const result = await setUpProject("/tmp/proj", "v6", []);
    await undoSetup({ ...result, report: report(edit("replaced")) });
    expect(tauri.undos[0].claudeMd).toEqual(edit("replaced"));
    await undoSetup({ ...result, report: report(edit("appended", "edited")) });
    expect(tauri.undos[1].claudeMd).toEqual(edit("appended", "edited"));
    await undoSetup({ ...result, report: report(edit("skipped", "link")) });
    expect(tauri.undos[2].claudeMd).toBeNull();
    await undoSetup(result);
    expect(tauri.undos[3].claudeMd).toBeNull();
  });
});

describe("bmadRootOf", () => {
  it("finds a BMAD project nested below the repository root", async () => {
    tauri.byDir = { "/mono": null, "/mono/app": "v4", "/mono/app/src": null };
    tauri.roots = { "/mono/app/src": "/mono" };
    expect(await bmadRootOf("/mono/app/src")).toEqual({ root: "/mono/app", methodology: "v4" });
  });

  it("walks up to the project root and no further", async () => {
    tauri.byDir = { "/p": "v6", "/p/src": null };
    // project_root resolves /p/src to itself: /p is above it and not asked.
    expect(await bmadRootOf("/p/src")).toBeNull();
    tauri.roots = { "/p/src": "/p" };
    expect(await bmadRootOf("/p/src")).toEqual({ root: "/p", methodology: "v6" });
  });

  it("is the cwd itself when that is the project", async () => {
    tauri.byDir = { "/p": "v6" };
    expect(await bmadRootOf("/p/")).toEqual({ root: "/p", methodology: "v6" });
  });

  it("is null when nothing from cwd to the project root is set up, or there is no cwd", async () => {
    tauri.byDir = { "/p": null, "/p/src": null };
    tauri.roots = { "/p/src": "/p" };
    expect(await bmadRootOf("/p/src")).toBeNull();
    expect(await bmadRootOf(null)).toBeNull();
  });
});

describe("the normalised root", () => {
  it("strips trailing separators and leaves a bare root alone", () => {
    expect(normRoot("/code/shop/")).toBe("/code/shop");
    expect(normRoot("/code/shop//")).toBe("/code/shop");
    expect(normRoot("C:\\code\\shop\\")).toBe("C:\\code\\shop");
    expect(normRoot("/code/shop")).toBe("/code/shop");
    expect(normRoot("/")).toBe("/");
  });

  it("marks a project set up under one key, with or without a trailing slash", async () => {
    const result = await setUpProject("/code/shop/", "v6", []);
    expect(result.root).toBe("/code/shop");
    expect(lastApply().root).toBe("/code/shop");
    expect(wasSetUp("/code/shop")).toBe(true);
    expect(wasSetUp("/code/shop/")).toBe(true);
    expect(JSON.parse(localStorage.getItem("ade-project-setup-done")!)).toEqual(["/code/shop"]);
  });

  it("normalises keys written before, when it reads them", () => {
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/old/", "/code/old"]));
    localStorage.setItem("ade-project-setup-declined", JSON.stringify(["C:\\code\\old\\"]));
    expect(wasSetUp("/code/old")).toBe(true);
    expect(setupDeclined("C:\\code\\old")).toBe(true);
  });

  it("declines under the normalised root, and a later setup clears it", async () => {
    const result = await setUpProject("/code/shop", "v6", []);
    await undoSetup({ ...result, root: "/code/shop/" });
    expect(setupDeclined("/code/shop")).toBe(true);
    expect(JSON.parse(localStorage.getItem("ade-project-setup-declined")!)).toEqual(["/code/shop"]);
    await setUpProject("/code/shop/", "v6", []);
    expect(setupDeclined("/code/shop")).toBe(false);
  });

  it("keeps removed agents under the normalised root", async () => {
    await removeAgent("/code/shop/", "qa");
    expect(removedAgents("/code/shop")).toEqual(["qa"]);
    localStorage.setItem("ade-project-agents-removed", JSON.stringify({ "/code/old/": ["qa"], "/code/old": ["architect"] }));
    expect(removedAgents("/code/old").sort()).toEqual(["architect", "qa"]);
  });

  it("shares a running setup across spellings of the root", async () => {
    const first = setUpProject("/code/shop", "v6", []);
    expect(isSettingUp("/code/shop/")).toBe(true);
    expect(setUpProject("/code/shop/", "v6", [])).toBe(first);
    await first;
    expect(tauri.applies).toHaveLength(1);
    expect(isSettingUp("/code/shop")).toBe(false);
  });
});

describe("setupRootOf", () => {
  it("is the BMAD project the folder is in", async () => {
    tauri.byDir = { "/mono": null, "/mono/app": "v4", "/mono/app/src": null };
    tauri.roots = { "/mono/app/src": "/mono" };
    expect(await setupRootOf("/mono/app/src")).toBe("/mono/app");
  });

  it("falls back to the project root, normalised", async () => {
    tauri.roots = { "/mono/app/src": "/mono/" };
    expect(await setupRootOf("/mono/app/src")).toBe("/mono");
  });
});

describe("foldersUpTo", () => {
  it("lists the folder and each one above it, up to the stop", () => {
    expect(foldersUpTo("/mono/app/src", "/mono")).toEqual(["/mono/app/src", "/mono/app", "/mono"]);
    expect(foldersUpTo("/mono/", "/mono")).toEqual(["/mono"]);
    expect(foldersUpTo("C:\\p\\src", "C:\\p")).toEqual(["C:\\p\\src", "C:\\p"]);
  });

  it("is just the folder when it isn't under the stop", () => {
    expect(foldersUpTo("/elsewhere/x", "/mono")).toEqual(["/elsewhere/x"]);
  });
});

describe("isComplete", () => {
  const status = (over: Partial<SetupStatus>): SetupStatus => ({
    isGit: true, missing: [], needsImport: false, bmadInstalled: false, stacks: [], methodology: null, ...over,
  });

  it("counts a v6 project as having BMAD", () => {
    // bmadInstalled is `.bmad-core/VERSION`, which a v6 project never has.
    expect(hasBmad(status({ methodology: "v6" }))).toBe(true);
    expect(isComplete(status({ methodology: "v6" }))).toBe(true);
  });

  it("still needs the engine on disk for a v4 project", () => {
    expect(isComplete(status({ methodology: "v4" }))).toBe(false);
    expect(isComplete(status({ methodology: "v4", bmadInstalled: true }))).toBe(true);
  });

  it("is incomplete with no BMAD, a missing file, or a CLAUDE.md that doesn't load the rules", () => {
    expect(isComplete(status({}))).toBe(false);
    expect(isComplete(status({ methodology: "v6", missing: [".ade/rules.md"] }))).toBe(false);
    expect(isComplete(status({ methodology: "v6", needsImport: true }))).toBe(false);
  });
});

describe("the kept list", () => {
  const kept = () => JSON.parse(localStorage.getItem("ade-bmad-kept")!);

  it("keeps a project under its normalised root", () => {
    expect(isKept("/code/shop")).toBe(false);
    markKept("/code/shop/");
    expect(isKept("/code/shop")).toBe(true);
    expect(isKept("/code/shop/")).toBe(true);
    expect(kept()).toEqual(["/code/shop"]);
  });

  it("is seeded once from the projects already set up, with their roots normalised", () => {
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/old/", "/code/older", "/code/old"]));
    migrateKept();
    expect(kept()).toEqual(["/code/old", "/code/older"]);
    expect(isKept("/code/old")).toBe(true);
  });

  it("is not seeded once the key exists, even empty", () => {
    localStorage.setItem("ade-bmad-kept", "[]");
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/old"]));
    migrateKept();
    expect(isKept("/code/old")).toBe(false);
  });

  it("is written even when nothing was set up, so the migration runs once", () => {
    migrateKept();
    expect(localStorage.getItem("ade-bmad-kept")).toBe("[]");
    // A project set up afterwards is not one the user "already had".
    localStorage.setItem("ade-project-setup-done", JSON.stringify(["/code/new"]));
    migrateKept();
    expect(isKept("/code/new")).toBe(false);
  });

  it("drops the v4 projects once, so each is asked to keep v4 or switch", async () => {
    tauri.byDir = { "/code/four": "v4", "/code/six": "v6", "/code/none": null };
    localStorage.setItem("ade-bmad-kept", JSON.stringify(["/code/four/", "/code/six", "/code/none"]));
    await reaskV4Projects();
    expect(kept()).toEqual(["/code/six", "/code/none"]);
    // Once: a v4 project kept after that stays kept.
    markKept("/code/four");
    await reaskV4Projects();
    expect(isKept("/code/four")).toBe(true);
  });

  it("leaves a project it couldn't check, and one kept while it was checking", async () => {
    tauri.byDir = { "/code/four": "v4" };
    localStorage.setItem("ade-bmad-kept", JSON.stringify(["/code/four", "/code/gone"]));
    const invoke = vi.mocked((await import("@tauri-apps/api/core")).invoke);
    const real = invoke.getMockImplementation()!;
    invoke.mockImplementation(async (command, args) => {
      if (command === "project_setup_status" && (args as { root: string }).root === "/code/gone") {
        markKept("/code/answered");
        throw new Error("no such folder");
      }
      return real(command, args);
    });
    try {
      await reaskV4Projects();
    } finally {
      invoke.mockImplementation(real);
    }
    expect(kept()).toEqual(["/code/gone", "/code/answered"]);
  });

  it("re-asks v4 projects after the kept list is seeded, in the main window", () => {
    const main = readFileSync(resolve(__dirname, "../boot.ts"), "utf8");
    const seeded = main.indexOf("migrateKept();");
    expect(seeded).toBeGreaterThan(-1);
    expect(main.indexOf("reaskV4Projects()", seeded)).toBeGreaterThan(seeded);
  });

  it("is migrated after the saved state is restored, in the main window", () => {
    const main = readFileSync(resolve(__dirname, "../boot.ts"), "utf8");
    const hydrated = main.indexOf("await hydrateFromDisk();");
    const saving = main.indexOf("startAutoSave();", hydrated);
    const migrated = main.indexOf("migrateKept();");
    expect(hydrated).toBeGreaterThan(-1);
    // After hydration, or the key would always look absent; after auto-save
    // starts, or the write would never reach disk.
    expect(saving).toBeGreaterThan(hydrated);
    expect(migrated).toBeGreaterThan(saving);
  });
});

describe("a project whose switch didn't finish", () => {
  const PENDING = { archive: ".ade/archive/bmad-v4-2026-10-11", status: "incomplete", phase: "moving", from: "v4", to: "v6", date: "2026-10-11" };
  const qa = () => agentCatalog().find((a) => a.id === "qa")!;

  it("is blocked, with the reason and the journal to open", async () => {
    tauri.pending = [PENDING];
    expect(await switchBlock("/code/shop/")).toEqual({
      reason: "A BMAD switch in shop didn't finish. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
      archiveFile: "/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md",
    });
  });

  it("says so when the record couldn't be read", async () => {
    tauri.pending = [{ ...PENDING, status: "unknown" }];
    expect((await switchBlock("/code/shop"))?.reason).toBe(
      "A BMAD switch in shop left a record that couldn't be read. Setup waits until it is resolved: see .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
    );
  });

  it("says how many when more than one is unfinished", async () => {
    tauri.pending = [PENDING, { ...PENDING, archive: ".ade/archive/bmad-v6-2026-10-11" }, { ...PENDING, archive: ".ade/archive/bmad-v4-2026-10-11-2" }];
    expect(await switchBlock("/code/shop")).toEqual({
      reason: "3 BMAD switches in shop didn't finish. Setup waits until each one is resolved: start with .ade/archive/bmad-v4-2026-10-11/ARCHIVE.md.",
      archiveFile: "/code/shop/.ade/archive/bmad-v4-2026-10-11/ARCHIVE.md",
    });
  });

  it("is blocked when the check fails, or a switch is running, with no journal to open", async () => {
    tauri.pending = null;
    expect(await switchBlock("/code/shop")).toEqual({ reason: "Couldn't check for an unfinished BMAD switch." });
    tauri.pending = [];
    const end = beginSwitch("/code/shop");
    expect(await switchBlock("/code/shop")).toEqual({ reason: "A BMAD switch is running." });
    end();
    expect(await switchBlock("/code/shop")).toBeNull();
  });

  it("gets no stack agents: the caller is told the reason, and nothing is written", async () => {
    tauri.pending = [PENDING];
    await expect(addStackAgents("/code/shop", ["evm"], "v4")).rejects.toMatch(/A BMAD switch in shop didn't finish\..*ARCHIVE\.md/);
    tauri.pending = null;
    await expect(addStackAgents("/code/shop", ["evm"], "v4")).rejects.toBe("Couldn't check for an unfinished BMAD switch.");
    expect(tauri.applies).toHaveLength(0);
  });

  it("gets no single agent either, and an agent the person removed stays removed", async () => {
    await removeAgent("/code/shop", "qa");
    tauri.pending = [PENDING];
    await expect(addAgent("/code/shop", qa(), "v4")).rejects.toMatch(/A BMAD switch in shop didn't finish\..*ARCHIVE\.md/);
    expect(tauri.applies).toHaveLength(0);
    expect(removedAgents("/code/shop")).toEqual(["qa"]);
  });

  it("gets no single agent while a switch is moving its folders", async () => {
    const end = beginSwitch("/code/shop");
    await expect(addAgent("/code/shop", qa(), "v4")).rejects.toBe("a BMAD switch is running");
    end();
    expect(tauri.applies).toHaveLength(0);
  });
});

describe("isWithin", () => {
  it("is true for the root and for folders inside it", () => {
    expect(isWithin("/mono", "/mono")).toBe(true);
    expect(isWithin("/mono/", "/mono")).toBe(true);
    expect(isWithin("/mono/app/src", "/mono/")).toBe(true);
    expect(isWithin("C:\\p\\src", "C:\\p")).toBe(true);
    expect(isWithin("/x", "/")).toBe(true);
  });

  it("needs a separator after the root", () => {
    expect(isWithin("/mono2", "/mono")).toBe(false);
    expect(isWithin("/mono2/app", "/mono")).toBe(false);
    expect(isWithin("C:\\p2\\src", "C:\\p")).toBe(false);
    expect(isWithin("/mon", "/mono")).toBe(false);
  });
});

describe("a folder beside the project, with a longer name", () => {
  it("is not listed as above a folder that isn't under the stop", () => {
    expect(foldersUpTo("/mono2/app", "/mono")).toEqual(["/mono2/app"]);
  });

  it("is not walked into when looking for the BMAD project", async () => {
    // `project_root` answers /mono for a cwd in /mono2: the walk must not
    // carry on up /mono2 as if it were inside /mono.
    tauri.roots = { "/mono2/app": "/mono" };
    tauri.byDir = { "/mono2": "v4" };
    expect(await bmadRootOf("/mono2/app")).toBeNull();
  });
});

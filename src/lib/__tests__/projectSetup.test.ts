import { beforeEach, describe, expect, it, vi } from "vitest";

// Setup is IPC only. Tauri binds the apply arguments by name, so the recorded
// call is the whole observable contract — especially `methodology`, whose
// absence used to be invisible until the Rust command rejected the call.
const tauri = vi.hoisted(() => ({
  applies: [] as Record<string, unknown>[],
  /** What `project_setup_status` reports the project is already on. */
  methodology: null as "v4" | "v6" | null,
  /** Per-folder override of `methodology`, for folders inside a project. */
  byDir: {} as Record<string, "v4" | "v6" | null>,
  /** What `project_root` resolves a folder to (default: the folder itself). */
  roots: {} as Record<string, string>,
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
      case "project_setup_apply":
        tauri.applies.push(args);
        return { created: [], appendedImport: false, agents: 0, bmadFiles: 0, bmadv6Files: 0 };
      case "project_setup_undo":
        return 0;
      case "project_agent_remove":
        return true;
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

import { agentCatalog } from "../projectMethodology";
import {
  addAgent, addStackAgents, bmadRootOf, detectOnDisk, foldersUpTo, hasBmad, isComplete, isSettingUp, methodologyOf, normRoot, removeAgent,
  removedAgents, setUpProject, setupDeclined, setupRootOf, undoSetup, wasSetUp,
  type SetupStatus,
} from "../projectSetup";

const lastApply = () => tauri.applies[tauri.applies.length - 1];

beforeEach(() => {
  localStorage.clear();
  tauri.applies.length = 0;
  tauri.methodology = null;
  tauri.byDir = {};
  tauri.roots = {};
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

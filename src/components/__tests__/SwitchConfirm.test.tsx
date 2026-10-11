import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { OpenInProject, SwitchPlan } from "../../lib/bmadSwitch";

const ARCHIVE = ".ade/archive/bmad-v4-2026-10-11";
const RESULT = { archive: ARCHIVE, moved: 3, setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true };

const tauri = vi.hoisted(() => ({
  /** Overrides for the next plans. */
  plan: {} as Record<string, unknown>,
  plans: [] as Record<string, unknown>[],
  applies: [] as Record<string, unknown>[],
  applyGate: null as Promise<void> | null,
  applyError: null as string | null,
  /** Holds a plan request back until the returned promise settles. */
  hold: null as null | ((documents: string[]) => Promise<void> | undefined),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string, args: Record<string, unknown> = {}) => {
    switch (command) {
      case "bmad_switch_plan": {
        tauri.plans.push(args);
        const ticked = args.documents as string[];
        await tauri.hold?.(ticked);
        return {
          from: "v4",
          to: args.to,
          archive: ".ade/archive/bmad-v4-2026-10-11",
          moves: [
            { from: ".bmad-core", to: ".ade/archive/bmad-v4-2026-10-11/.bmad-core", files: 2, ignored: "none" },
            { from: ".ade/stage", to: ".ade/archive/bmad-v4-2026-10-11/.ade/stage", files: 1, ignored: "none" },
          ],
          documents: [
            { path: "docs/prd.md", files: 1, ticked: ticked.includes("docs/prd.md"), warning: "ADE's rules use this file (the PRD). The new version starts without it.", linkTo: null },
            { path: "docs/stories", files: 4, ticked: ticked.includes("docs/stories"), warning: null, linkTo: null },
          ],
          leftovers: [],
          leftInPlace: [],
          dirty: false,
          archiveIgnored: false,
          blocked: null,
          ...tauri.plan,
        };
      }
      case "project_setup_status":
        return { isGit: true, missing: [], needsImport: false, bmadInstalled: true, stacks: [], methodology: "v4" };
      case "bmad_switch_apply":
        tauri.applies.push(args);
        if (tauri.applyGate) await tauri.applyGate;
        if (tauri.applyError) throw tauri.applyError;
        return { archive: ".ade/archive/bmad-v4-2026-10-11", moved: 3, setup: { created: [], appendedImport: false, agents: 8, bmadFiles: 0 }, rulesAppended: true, archiveDenied: true };
      default:
        throw new Error(`unexpected command: ${command}`);
    }
  }),
}));

// What is open in the project is the lib's to work out; here it is given.
const open = vi.hoisted(() => ({ value: { panes: [], agents: [] } as OpenInProject }));
vi.mock("../../lib/bmadSwitch", async (original) => ({
  ...(await original<typeof import("../../lib/bmadSwitch")>()),
  openInProject: vi.fn(async () => open.value),
}));

import SwitchConfirm from "../SwitchConfirm";
import { useEscapeToClose } from "../useEscapeToClose";

const dialog = () => screen.getByRole("dialog", { name: "Switch to BMAD v6" });
const confirm = () => screen.getByRole("button", { name: /Archive and switch|Switching…/ }) as HTMLButtonElement;
const renderConfirm = (leaveLabel: "Back" | "Cancel" = "Back") => {
  const onLeave = vi.fn();
  const onDone = vi.fn();
  render(<SwitchConfirm root="/code/shop" to="v6" leaveLabel={leaveLabel} onLeave={onLeave} onDone={onDone} />);
  return { onLeave, onDone };
};
/** The dry run has come back and is on screen. */
const planned = () => screen.findByText(`${ARCHIVE}/`);
/** The part of the dialog that scrolls: what is in it can be below the fold. */
const scrolls = (el: Element) => el.closest(".switch-confirm__body") !== null;
const warnings = () => [...dialog().querySelectorAll(".switch-confirm__warning")].map((el) => el.textContent);
/** `a` comes before `b` on screen. */
const precedes = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

beforeEach(() => {
  localStorage.clear();
  tauri.plan = {};
  tauri.plans.length = 0;
  tauri.applies.length = 0;
  tauri.applyGate = null;
  tauri.applyError = null;
  tauri.hold = null;
  open.value = { panes: [], agents: [] };
});

describe("SwitchConfirm", () => {
  it("shows the archive folder, what moves with its file count, and what the new version installs", async () => {
    renderConfirm();
    await planned();
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    const moves = screen.getByRole("region", { name: "Moves to the archive" });
    expect(moves.textContent).toContain(".bmad-core");
    expect(moves.textContent).toContain("2 files");
    expect(moves.textContent).toContain(".ade/stage");
    expect(moves.textContent).toContain("1 file");
    expect(screen.getByRole("region", { name: "The new version installs" }).textContent).toContain(".claude/skills/");
    expect(confirm().textContent).toBe("Archive and switch");
    expect(confirm().disabled).toBe(false);
  });

  it("leaves the documents where they are unless ticked, and re-plans when a box changes", async () => {
    renderConfirm();
    await planned();
    const docs = screen.getByRole("region", { name: "Your documents (stay)" });
    const prd = screen.getByRole("checkbox", { name: /docs\/prd\.md/ }) as HTMLInputElement;
    expect(docs.textContent).toContain("Archive this too");
    expect(prd.checked).toBe(false);
    expect(tauri.plans).toEqual([{ root: "/code/shop", to: "v6", documents: [] }]);
    expect(screen.queryByText(/ADE's rules use this file/)).toBeNull();

    fireEvent.click(prd);
    await waitFor(() => expect(tauri.plans).toHaveLength(2));
    expect(tauri.plans[1].documents).toEqual(["docs/prd.md"]);
    expect(await screen.findByText("ADE's rules use this file (the PRD). The new version starts without it.")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/stories/ }));
    await waitFor(() => expect(tauri.plans).toHaveLength(3));
    expect(tauri.plans[2].documents).toEqual(["docs/prd.md", "docs/stories"]);

    fireEvent.click(prd);
    await waitFor(() => expect(tauri.plans).toHaveLength(4));
    expect(tauri.plans[3].documents).toEqual(["docs/stories"]);
    await waitFor(() => expect(screen.queryByText(/ADE's rules use this file/)).toBeNull());
  });

  it("says why a blocked switch can't go ahead, and disables the button", async () => {
    tauri.plan = { blocked: "An earlier switch here didn't finish. See .ade/archive/bmad-v6-2026-10-01/ARCHIVE.md." };
    renderConfirm();
    await planned();
    expect(screen.getByRole("alert").textContent).toContain("didn't finish");
    expect(confirm().disabled).toBe(true);
    fireEvent.click(confirm());
    expect(tauri.applies).toHaveLength(0);
  });

  it("keeps the blocked reason out of the scrolling part, right above the buttons", async () => {
    tauri.plan = { blocked: "An earlier switch here didn't finish. See .ade/archive/bmad-v6-2026-10-01/ARCHIVE.md." };
    renderConfirm();
    await planned();
    const reason = screen.getByRole("alert");
    expect(dialog().contains(reason)).toBe(true);
    expect(scrolls(reason)).toBe(false);
    expect(precedes(dialog().querySelector(".switch-confirm__body")!, reason)).toBe(true);
    expect(precedes(reason, confirm())).toBe(true);
    expect(confirm().disabled).toBe(true);
  });

  it("lists what is left in place, with why, and leftovers", async () => {
    tauri.plan = {
      leftInPlace: [{ path: "/shared/out", reason: "The output folder is outside the project, so it stays where it is." }],
      leftovers: [{ from: "_bmad", to: `${ARCHIVE}/leftovers-v6/_bmad`, files: 5, ignored: "none" }],
    };
    renderConfirm();
    await planned();
    const left = screen.getByRole("region", { name: "Left in place" });
    expect(left.textContent).toContain("/shared/out");
    expect(left.textContent).toContain("outside the project");
    const leftovers = screen.getByRole("region", { name: "Leftovers" });
    expect(leftovers.textContent).toContain("_bmad");
    expect(leftovers.textContent).toContain(`${ARCHIVE}/leftovers-v6/`);
  });

  it("gives the git notes: uncommitted changes, ignored paths, and whether the archive is ignored", async () => {
    tauri.plan = {
      dirty: true,
      archiveIgnored: true,
      moves: [{ from: "_bmad-output", to: `${ARCHIVE}/_bmad-output`, files: 9, ignored: "all" }, { from: "_bmad", to: `${ARCHIVE}/_bmad`, files: 3, ignored: "some" }],
    };
    renderConfirm();
    await planned();
    const git = screen.getByRole("region", { name: "Git" });
    expect(git.textContent).toContain("They stay as they are. Commit first if you want the move in its own commit.");
    expect(git.textContent).toContain("Git ignores _bmad-output, _bmad today");
    expect(git.textContent).toContain("/_bmad-output/");
    expect(git.textContent).toContain("no longer matches once they move");
    // What the back end asked git about: the archive, not all of `.ade/`.
    expect(git.textContent).toContain(".ade/archive/ is ignored by git, so the archive won't be committed.");
    expect(git.textContent).not.toContain(".ade/ is ignored by git");
    expect(screen.getByRole("region", { name: "Moves to the archive" }).textContent).toContain("9 files, ignored by git");
  });

  it("marks as warnings what can't be got back: uncommitted changes, and rows git ignores", async () => {
    tauri.plan = {
      dirty: true,
      moves: [{ from: "_bmad-output", to: `${ARCHIVE}/_bmad-output`, files: 9, ignored: "all" }, { from: "_bmad", to: `${ARCHIVE}/_bmad`, files: 3, ignored: "some" }],
      leftovers: [{ from: ".bmad-core", to: `${ARCHIVE}/leftovers-v4/.bmad-core`, files: 5, ignored: "none" }],
    };
    renderConfirm();
    await planned();
    expect(warnings()).toEqual([
      "This project has uncommitted changes. They stay as they are. Commit first if you want the move in its own commit.",
      "ignored by git",
      "partly ignored by git",
    ]);
  });

  it("says Couldn't check git when git is missing, and nothing else about git", async () => {
    tauri.plan = { dirty: null, archiveIgnored: null };
    renderConfirm();
    await planned();
    expect(screen.getByRole("region", { name: "Git" }).textContent).toBe("GitCouldn't check git.");
  });

  it("lists the panes and agents open in the project, and says to stop agents first", async () => {
    open.value = { panes: [{ tab: "shop", cwd: "/code/shop/src" }], agents: [{ name: "Verify story 1.2", cwd: "/code/shop" }] };
    renderConfirm();
    await planned();
    const section = await screen.findByRole("region", { name: "Open in this project" });
    expect(section.textContent).toContain("shop");
    expect(section.textContent).toContain("/code/shop/src");
    expect(section.textContent).toContain("Verify story 1.2");
    expect(section.textContent).toContain("Stop agents before switching: they may keep writing into moved folders");
  });

  it("puts what is open first, with its warning, then git, then what moves", async () => {
    open.value = { panes: [], agents: [{ name: "Verify story 1.2", cwd: "/code/shop" }] };
    renderConfirm();
    await planned();
    const section = await screen.findByRole("region", { name: "Open in this project" });
    expect(section.parentElement!.firstElementChild).toBe(section);
    expect(section.nextElementSibling).toBe(screen.getByRole("region", { name: "Git" }));
    expect(precedes(screen.getByRole("region", { name: "Git" }), screen.getByRole("region", { name: "Moves to the archive" }))).toBe(true);
    expect(warnings()).toEqual(["Stop agents before switching: they may keep writing into moved folders."]);
  });

  it("has no Open in this project section when nothing is open there", async () => {
    renderConfirm();
    await planned();
    expect(screen.queryByRole("region", { name: "Open in this project" })).toBeNull();
  });

  it.each(["Back", "Cancel"] as const)("has a way back: %s, and Escape", async (label) => {
    const { onLeave } = renderConfirm(label);
    await planned();
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("doesn't let Escape reach a panel beneath it", async () => {
    const under = vi.fn();
    function Under() { useEscapeToClose(under); return null; }
    render(<Under />);
    renderConfirm();
    await planned();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(under).not.toHaveBeenCalled();
  });

  it("does not switch on Enter: the button has to be clicked", async () => {
    renderConfirm();
    await planned();
    fireEvent.keyDown(dialog(), { key: "Enter" });
    expect(tauri.applies).toHaveLength(0);
  });

  it("switches with the plan that is on screen, and hands back the result", async () => {
    const { onDone } = renderConfirm();
    await planned();
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/prd\.md/ }));
    // The warning comes from the new plan: once it shows, that plan is the one on screen.
    await screen.findByText(/ADE's rules use this file/);
    fireEvent.click(confirm());
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(RESULT));
    expect(tauri.applies).toHaveLength(1);
    const sent = tauri.applies[0].plan as SwitchPlan;
    expect(sent.archive).toBe(ARCHIVE);
    expect(sent.documents.find((d) => d.path === "docs/prd.md")!.ticked).toBe(true);
  });

  it("disables both buttons while the switch runs, so a second click and Escape do nothing", async () => {
    let finish!: () => void;
    tauri.applyGate = new Promise<void>((r) => { finish = r; });
    const { onLeave, onDone } = renderConfirm();
    await planned();
    fireEvent.click(confirm());
    await waitFor(() => expect(confirm().textContent).toBe("Switching…"));
    expect(confirm().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onLeave).not.toHaveBeenCalled();
    await act(async () => { finish(); });
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(tauri.applies).toHaveLength(1);
  });

  it("shows why a switch failed, plans again, and lets the person go back", async () => {
    tauri.applyError = "Couldn't move .ade/stage: the file is in use";
    const { onLeave, onDone } = renderConfirm();
    await planned();
    fireEvent.click(confirm());
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn't move .ade/stage: the file is in use");
    expect(onDone).not.toHaveBeenCalled();
    // The project was put back; what would move is worked out afresh.
    await waitFor(() => expect(tauri.plans).toHaveLength(2));
    await waitFor(() => expect(confirm().disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it("keeps a failed switch's error out of the scrolling part, and takes the keyboard back", async () => {
    let finish!: () => void;
    tauri.applyGate = new Promise<void>((r) => { finish = r; });
    tauri.applyError = "Couldn't move .ade/stage: the file is in use";
    renderConfirm();
    await planned();
    confirm().focus();
    fireEvent.click(confirm());
    await waitFor(() => expect(confirm().disabled).toBe(true));
    // What a browser does to a focused button once it is disabled: focus is
    // nowhere. jsdom leaves it on the button, so it is taken away here.
    const elsewhere = document.body.appendChild(document.createElement("button"));
    elsewhere.focus();
    elsewhere.remove();
    expect(document.activeElement).toBe(document.body);
    await act(async () => { finish(); });

    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toContain("the file is in use");
    expect(scrolls(failure)).toBe(false);
    expect(precedes(failure, confirm())).toBe(true);
    expect(document.activeElement).toBe(dialog());
  });

  it("shows the failure beside the reason when the plan made after it is blocked", async () => {
    tauri.applyError = "Couldn't move .ade/stage. It couldn't be put back.";
    renderConfirm();
    await planned();
    tauri.plan = { blocked: "An earlier switch here didn't finish." };
    fireEvent.click(confirm());
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    const said = screen.getAllByRole("alert").map((el) => el.textContent);
    expect(said).toEqual(["Couldn't move .ade/stage. It couldn't be put back.", "An earlier switch here didn't finish."]);
    expect(screen.getAllByRole("alert").some(scrolls)).toBe(false);
    expect(confirm().disabled).toBe(true);
  });

  it("says so when the dry run itself fails", async () => {
    tauri.plan = {};
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValueOnce("/code/shop isn't a folder.");
    renderConfirm();
    expect((await screen.findByRole("alert")).textContent).toContain("isn't a folder");
    expect(confirm().disabled).toBe(true);
  });

  it("offers Try again after a failed dry run, which plans again", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValueOnce("/code/shop couldn't be read.");
    renderConfirm();
    const failure = await screen.findByRole("alert");
    expect(failure.textContent).toBe("/code/shop couldn't be read.");
    expect(scrolls(failure)).toBe(false);
    expect(tauri.plans).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await planned();
    expect(tauri.plans).toHaveLength(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await waitFor(() => expect(confirm().disabled).toBe(false));
  });

  it("clears a dry run's error as soon as the next one starts", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValueOnce("/code/shop couldn't be read.");
    renderConfirm();
    await screen.findByRole("alert");
    let release!: () => void;
    tauri.hold = () => new Promise<void>((r) => { release = r; });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getByText("Checking what would move…")).toBeTruthy();
    expect(dialog().getAttribute("aria-busy")).toBe("true");
    expect(confirm().disabled).toBe(true);
    await act(async () => { release(); });
    await planned();
  });

  it("has no Try again when the plan came back, blocked or not", async () => {
    tauri.plan = { blocked: "An earlier switch here didn't finish." };
    renderConfirm();
    await planned();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("offers the documents going to v4 too, labelled as the output folder", async () => {
    tauri.plan = {
      from: "v6",
      moves: [{ from: "_bmad", to: `${ARCHIVE}/_bmad`, files: 3, ignored: "none" }],
      documents: [{ path: "docs/out", files: 6, ticked: false, warning: null, linkTo: null }],
    };
    render(<SwitchConfirm root="/code/shop" to="v4" leaveLabel="Back" onLeave={vi.fn()} onDone={vi.fn()} />);
    await planned();
    const docs = screen.getByRole("region", { name: "Your documents (stay)" });
    expect(docs.textContent).toContain("Output folder:");
    expect(docs.textContent).toContain("docs/out");
    expect(docs.textContent).toContain("Archive this too");
    expect(screen.getByRole("dialog", { name: "Switch to BMAD v4" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/out/ }));
    await waitFor(() => expect(tauri.plans).toHaveLength(2));
    expect(tauri.plans[1]).toEqual({ root: "/code/shop", to: "v4", documents: ["docs/out"] });
  });

  it("says only the link moves when a document is a link", async () => {
    tauri.plan = { documents: [{ path: "docs", files: 0, ticked: false, warning: null, linkTo: "realdocs" }] };
    renderConfirm();
    await planned();
    const docs = screen.getByRole("region", { name: "Your documents (stay)" });
    expect(docs.textContent).toContain("docs is a link to realdocs. Only the link moves; the documents stay in realdocs.");
    expect(docs.textContent).not.toMatch(/archived/i);
  });

  it("shows a folder's warning only once it is ticked, as the backend worded it", async () => {
    const warning = "This folder holds docs/prd.md, which ADE's rules use (the PRD). The new version starts without it.";
    tauri.plan = { documents: [{ path: "docs", files: 3, ticked: false, warning, linkTo: null }] };
    renderConfirm();
    await planned();
    expect(screen.queryByText(warning)).toBeNull();
  });

  it("shows a capped count as 50,000+", async () => {
    tauri.plan = { moves: [{ from: ".bmad-core", to: `${ARCHIVE}/.bmad-core`, files: 50000, ignored: "none" }] };
    renderConfirm();
    await planned();
    expect(screen.getByRole("region", { name: "Moves to the archive" }).textContent).toContain("50,000+ files");
  });

  it("shows left-in-place notes as given, and a dangling link note", async () => {
    tauri.plan = { leftInPlace: [{ path: "logs", reason: "`logs` is a link to `.bmad-core`, which moves; the link is left in place." }] };
    renderConfirm();
    await planned();
    expect(screen.getByRole("region", { name: "Left in place" }).textContent).toContain("which moves; the link is left in place.");
  });

  it("says Couldn't check beside what is known when only one answer is missing", async () => {
    tauri.plan = { dirty: true, archiveIgnored: null };
    renderConfirm();
    await planned();
    const note = screen.getByRole("region", { name: "Git" }).textContent;
    expect(note).toContain("Couldn't check git.");
    expect(note).toContain("uncommitted changes");
  });

  it("keeps a later re-plan when an earlier one answers last, and loses no tick made meanwhile", async () => {
    renderConfirm();
    await planned();
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    tauri.hold = (docs) => (docs.length === 1 ? gate : undefined);
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/prd\.md/ }));
    // The first re-plan is still out: the button waits for a plan that matches the boxes.
    await waitFor(() => expect(tauri.plans).toHaveLength(2));
    expect(confirm().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/stories/ }));
    await waitFor(() => expect(tauri.plans).toHaveLength(3));
    expect(tauri.plans[2].documents).toEqual(["docs/prd.md", "docs/stories"]);
    await waitFor(() => expect(confirm().disabled).toBe(false));
    await act(async () => { release(); });
    expect(confirm().disabled).toBe(false);
    fireEvent.click(confirm());
    await waitFor(() => expect(tauri.applies).toHaveLength(1));
    const sent = tauri.applies[0].plan as SwitchPlan;
    expect(sent.documents.map((d) => d.ticked)).toEqual([true, true]);
  });

  it("focuses the dialog when it opens", async () => {
    renderConfirm();
    await planned();
    expect(document.activeElement).toBe(dialog());
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The guide tells people when ADE asks which BMAD version and which commands
 * set a project up. Those are claims about the app, so they are checked
 * against it: a renamed command or a removed one must not outlive itself here.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "..", path), "utf8");
const guide = read("docs/guide/project-setup.md");
const settings = read("docs/guide/settings.md");
const palette = read("src/components/CommandPalette.tsx");

describe("the project setup guide", () => {
  it("names a palette command that exists", () => {
    const label = "Project: Set up BMAD, methodology and agents";
    expect(palette).toContain(`label: "${label}"`);
    expect(guide).toContain(label);
  });

  it("does not send anyone to the removed command", () => {
    for (const page of [guide, settings, read("docs/guide/agents.md")]) {
      expect(page).not.toContain("BMAD: Initialize");
    }
  });

  it("says how each entry point asks", () => {
    expect(guide).toContain("## Choosing and switching the BMAD version");
    const section = guide.slice(guide.indexOf("## Choosing and switching the BMAD version"), guide.indexOf("## When it runs"));
    expect(section).toContain("**BMAD v6 (default)**");
    expect(section).toContain("**BMAD v4**");
    expect(section).toContain("*Set up shop with BMAD?*");
    for (const button of ["**v6**", "**v4**"]) expect(section).toContain(button);
    expect(section).toContain("**Set up now**");
    expect(section).toMatch(/never asked/);
    expect(section).toContain("`.ade/methodology`");
  });

  it("says the question must be answered, and the two ways not to have BMAD", () => {
    const section = guide.slice(guide.indexOf("## Choosing and switching the BMAD version"), guide.indexOf("## When it runs"));
    expect(section).toMatch(/must be answered/);
    expect(section).toMatch(/no Cancel button/);
    expect(section).toMatch(/does nothing/);
    expect(section).toContain("**Set up every project I open**");
    expect(section).toContain("**Undo**");
  });

  it("says a setup that fails partway is cleaned up, as the app does", () => {
    const section = guide.slice(guide.indexOf("## When it runs"), guide.indexOf("## By project type"));
    expect(section).toContain("If setup fails partway, ADE removes what it had written.");
    expect(read("src-tauri/src/projectsetup.rs")).toMatch(/\n\s+apply_or_clean\(/);
  });

  it("describes no way to skip the question", () => {
    for (const page of [guide, settings]) {
      expect(page).not.toContain("Not now");
      expect(page).not.toMatch(/again until it is restarted|asks again next launch/);
      expect(page).not.toMatch(/Esc<\/kbd> (opens|cancels)/);
    }
  });

  it("no longer says a project is set up on v6 without a question", () => {
    expect(guide).not.toMatch(/without a question/);
    expect(guide).not.toMatch(/Only that dialog asks/);
    expect(settings).not.toMatch(/it gets v6/);
  });

  it("links the settings page to the section that exists", () => {
    expect(settings).toContain("#choosing-and-switching-the-bmad-version");
    expect(settings).not.toContain("#choosing-the-bmad-version");
    expect(guide).not.toContain("#choosing-the-bmad-version");
    expect(settings).not.toContain("#v6-or-v4");
  });

  const section = () =>
    guide.slice(guide.indexOf("## Choosing and switching the BMAD version"), guide.indexOf("## When it runs"));

  it("says when a project that has BMAD is asked to keep or switch", () => {
    expect(section()).toContain("### Keeping or switching");
    expect(section()).toContain("*shop uses BMAD v4.* **Keep v4** (default) · **Switch to v6…**");
    expect(section()).toMatch(/never asks from a terminal/);
    expect(section()).toMatch(/has to be answered/);
    expect(read("src/components/MethodologyPrompt.tsx")).toContain("(default) · <b>Switch to {other}…</b>");
  });

  it("names the two ways to switch on demand, as the app spells them", () => {
    expect(section()).toContain("*BMAD: Switch to v6…*");
    expect(palette).toContain("label: `BMAD: Switch to ${");
    expect(section()).toContain("**Switch to BMAD v6…**");
    expect(read("src/components/board/BoardPanel.tsx")).toContain("Switch to BMAD {otherVersion(methodology)}…");
    expect(section()).toContain("**Archive and switch**");
    expect(read("src/components/SwitchConfirm.tsx")).toContain('"Archive and switch"');
    // Back or Cancel, as the dialog labels them.
    expect(section()).toContain("**Back**");
    expect(section()).toContain("**Cancel**");
    expect(read("src/components/SwitchConfirm.tsx")).toContain('leaveLabel: "Back" | "Cancel"');
  });

  it("says what moves in each direction, and that documents stay unless ticked", () => {
    expect(section()).toContain("### What a switch moves");
    for (const path of ["`.bmad-core/`", "`.claude/commands/BMad/`", "`.ade/stage`", "`_bmad/`", "`.ade/approvals/`", "`.ade/gates/`", "`.ade/methodology`"]) {
      expect(section(), path).toContain(path);
    }
    expect(section()).toMatch(/Nothing is deleted/);
    expect(section()).toMatch(/your documents/i);
    expect(section()).toContain("Archive this too");
    expect(read("src/components/SwitchConfirm.tsx")).toContain("Archive this too");
    expect(section()).toMatch(/leftovers-v6/);
  });

  it("says a v6 output folder that holds documents stays unless ticked, in both directions", () => {
    const text = section();
    expect(text).toMatch(/\| v6 → v4 \|[^\n]*unless it holds your documents/);
    expect(text).toMatch(/a switch never moves it as a whole/);
    expect(text).toMatch(/It never offers `docs` itself/);
    expect(text).toMatch(/Leaving v4, it offers the document places that exist, such as `docs\/stories`/);
    expect(text).toMatch(/Leaving v6, it offers only the output folder/);
    expect(text).toContain("*Output folder: `<path>`*");
    // The source agrees: `docs` is filtered out of what v4 offers, and a v6 output folder is offered.
    const rust = read("src-tauri/src/bmadswitch.rs");
    expect(rust).toContain('rel.to_lowercase() != "docs"');
    expect(rust).toContain("offered.push(rel);");
    // The dialog's row for it: the label, and a box that is ticked only when ticked.
    const dialog = read("src/components/SwitchConfirm.tsx");
    expect(dialog).toContain("<span>Output folder:</span>");
    expect(dialog).toContain("checked={ticked.includes(d.path)}");
  });

  it("says the person's own agents, skills and commands are never moved", () => {
    expect(section()).toMatch(/never moves your own entries in `\.claude\/agents`, `\.claude\/skills` or `\.claude\/commands`/);
    expect(section()).toMatch(/the switch is refused and names the path/);
    const rust = read("src-tauri/src/bmadswitch.rs");
    for (const folder of [".claude/agents", ".claude/skills", ".claude/commands"]) expect(rust).toContain(`("${folder}", `);
    expect(rust).toContain("would take your own {what} in {own} with it, so it stays.");
  });

  it("describes the archive, its journal and what a pending switch means", () => {
    expect(section()).toContain("### The archive");
    expect(section()).toContain("`.ade/archive/bmad-v4-2026-10-11/`");
    expect(section()).toContain("`ARCHIVE.md`");
    for (const status of ["`status: incomplete`", "`status: in-progress`", "`status: abandoned`"]) {
      expect(section(), status).toContain(status);
    }
    expect(section()).toMatch(/neither sets the project up nor switches it/);
    // The permission rule, as the app writes it.
    expect(section()).toContain("`Edit(/.ade/archive/**)`");
    expect(read("src-tauri/src/usage.rs")).toContain('pub const ARCHIVE_DENY_RULE: &str = "Edit(/.ade/archive/**)";');
    expect(section()).toMatch(/until you restart them/);
  });

  it("describes a failed switch's rollback in the journal's own words", () => {
    const text = section();
    expect(text).toContain("If a step fails, ADE puts everything back and removes the archive.");
    expect(text).toMatch(/but only when nothing has taken its place/);
    expect(text).toMatch(/`\.claude\/settings\.json` and `\.ade\/methodology`, but only if they are still as the switch left them/);
    expect(text).toMatch(/\*\*It puts back\*\*/);
    expect(text).toMatch(/\*\*It leaves, and reports,\*\* anything it can't put back/);
    expect(text).toMatch(/or a file changed since/);
    expect(text).toMatch(/\*\*If it can't record the rollback\*\* in `ARCHIVE\.md`[^\n]*undoes nothing[^\n]*`status: in-progress`/);
    expect(text).toMatch(/\*pending\*, \*moving\*, \*moved\* or \*moved back\*/);
    expect(text).toMatch(/Move the paths marked \*moved\* back/);
    expect(text).toMatch(/marked \*moving\* may be at either place/);
    const rust = read("src-tauri/src/bmadswitch.rs");
    for (const label of ['"pending"', '"moving"', '"moved"', '"moved back"']) expect(rust).toContain(`=> ${label},`);
    expect(rust).toContain("a path marked *moving* may be at either place");
    expect(rust).toContain("marked *moved*: it is in this archive. Move it back to its place.");
    expect(rust).toContain("so nothing was undone. {JOURNAL} describes the project as it is.");
    expect(rust).toContain("changed after the switch edited it, so it was left as it is");
    // The board's warning.
    expect(read("src/components/board/BoardPanel.tsx")).toContain("A BMAD switch didn't finish here.");
  });

  it("says the person resolves an unfinished switch, and how for each status", () => {
    const text = section();
    // Editing ARCHIVE.md is the person's: the deny rule keeps Claude Code's tools out.
    expect(text).toMatch(/You make this edit yourself: the permission rule keeps Claude Code's file-editing tools out of the archive/);
    expect(read("src-tauri/src/usage.rs")).toContain("ARCHIVE_DENY_RULE");
    expect(text).toMatch(/At `status: incomplete`, use the words `ARCHIVE\.md` puts beside each path/);
    expect(text).toMatch(/At `status: in-progress`[^\n]*follow the steps `ARCHIVE\.md` gives for its `phase` instead/);
    const rust = read("src-tauri/src/bmadswitch.rs");
    expect(rust).toContain("Look at `phase` above:");
    expect(rust).toContain("so ignore `phase` and use each move's state in the list above");
    // What tells the person after a restart.
    expect(text).toMatch(/a toast with an \*\*Open ARCHIVE\.md\*\* button/);
    expect(read("src/hooks/useProjectSetup.ts")).toContain('label: "Open ARCHIVE.md"');
  });

  it("suggests committing before a switch, where the dialog is described", () => {
    expect(section()).toMatch(/\*\*Archive and switch\*\* runs it\.[^\n]*Commit your work before you switch/);
  });

  it("says what a shell mv does to a folder that is already there", () => {
    expect(section()).toMatch(/a shell `mv` puts the folder inside the one that is there, and a file manager merges them and replaces files with the same name/);
    expect(section()).toMatch(/Either way, move what is there out of the way first/);
  });

  it("says how to go back, and promises no restore button", () => {
    expect(section()).toContain("### Going back");
    expect(section()).toMatch(/git add -A/);
    expect(section()).toMatch(/no button that restores an archive/);
    // Move what the second switch set up out of the way first, naming what it really creates.
    expect(section()).toMatch(/Before you move a path back, move whatever is at its place out of the way, including the fresh `\.bmad-core\/`, `\.claude\/commands\/BMad\/`/);
    expect(section()).toMatch(/merges them and replaces files with the same name/);
    expect(section()).toMatch(/document folder you ticked may have a new folder of the same name/);
    expect(read("src-tauri/src/bmad.rs")).toContain('project.join(".claude").join("commands").join("BMad")');
  });

  it("says skills are matched by name, and a large count is capped", () => {
    expect(section()).toMatch(/share a name with one of ADE's BMAD skills \(a skill of your own with the same name moves too\)/);
    expect(read("src-tauri/src/bmadswitch.rs")).toContain("bundled.contains(&name.to_lowercase())");
    expect(section()).toContain('"50,000+"');
    expect(read("src/lib/bmadSwitch.ts")).toMatch(/50[_,]?000/);
  });

  it("lists the archive in the file layout", () => {
    expect(guide).toMatch(/\.ade\/archive\/ +earlier BMAD versions/);
  });

  it("no longer says role files stay on the old version after a move", () => {
    expect(guide).not.toMatch(/those files still name v4 tasks/);
  });
});

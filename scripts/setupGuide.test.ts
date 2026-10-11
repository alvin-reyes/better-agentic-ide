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
    expect(guide).toContain("## Choosing the BMAD version");
    const section = guide.slice(guide.indexOf("## Choosing the BMAD version"), guide.indexOf("## When it runs"));
    expect(section).toContain("**BMAD v6 (default)**");
    expect(section).toContain("**BMAD v4**");
    expect(section).toContain("*Set up shop with BMAD?*");
    for (const button of ["**v6**", "**v4**"]) expect(section).toContain(button);
    expect(section).toContain("**Set up now**");
    expect(section).toMatch(/never asked/);
    expect(section).toContain("`.ade/methodology`");
  });

  it("says the question must be answered, and the two ways not to have BMAD", () => {
    const section = guide.slice(guide.indexOf("## Choosing the BMAD version"), guide.indexOf("## When it runs"));
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
    expect(settings).toContain("#choosing-the-bmad-version");
    expect(settings).not.toContain("#v6-or-v4");
  });
});

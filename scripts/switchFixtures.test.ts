import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseBmadConfig } from "../src/lib/bmadConfig";
import { loadCentralConfig } from "../src/lib/bmadRuntime/config";
import { memFs } from "../src/lib/bmadRuntime/fs";
import { ROLES } from "../src/lib/projectMethodology";

/**
 * The switch reads two configs in Rust that the app reads in TypeScript. If
 * the two readers disagreed, the dialog would list one folder and the board
 * would watch another. Both are run over the same fixtures, and both are held
 * to the same expected.json (src-tauri/src/bmadconfig.rs has the Rust half).
 *
 * The fixtures are LF files (see .gitattributes); the CRLF case is built from
 * the YAML fixture inside the test, and both readers accept it.
 */
const FIXTURES = resolve(__dirname, "..", "src-tauri/src/fixtures/switch");
const read = (name: string) => readFileSync(resolve(FIXTURES, name), "utf8");
const expected = JSON.parse(read("expected.json"));

describe("the switch's shared config fixtures", () => {
  it("core-config.yaml: the TS reader finds what the Rust reader finds", () => {
    const paths = parseBmadConfig(read("core-config.yaml"));
    for (const [key, value] of Object.entries(expected.yaml)) {
      expect(paths[key as keyof typeof paths], key).toBe(value);
    }
  });

  it("core-config.yaml with Windows line endings reads the same", () => {
    const crlf = read("core-config.yaml").replace(/\r?\n/g, "\r\n");
    const paths = parseBmadConfig(crlf);
    expect(paths.usedDefaults).toBe(false);
    for (const [key, value] of Object.entries(expected.yaml)) {
      expect(paths[key as keyof typeof paths], key).toBe(value);
    }
  });

  it("the v6 layers:the TS reader merges them as the Rust reader does", async () => {
    const root: string = expected.toml.root;
    const fs = memFs();
    await fs.mkdir(`${root}/_bmad/custom`);
    await fs.writeText(`${root}/_bmad/config.toml`, read("config.toml"));
    await fs.writeText(`${root}/_bmad/custom/config.toml`, read("config.team.toml"));
    await fs.writeText(`${root}/_bmad/custom/config.user.toml`, read("config.user.toml"));
    const config = (await loadCentralConfig(root, fs)) as Record<string, any>;
    expect(config.core.project_name).toBe(expected.toml.projectName);
    expect(config.core.communication_language).toBe(expected.toml.communicationLanguage);
    expect(config.modules.demo.enabled).toBe(expected.toml.demoEnabled);
    expect(config.modules.demo.level).toBe(expected.toml.demoLevel);
    // The test substitutes `{project-root}` itself, so this pins the merged
    // value, not the substitution.
    expect(String(config.core.output_folder).replaceAll("{project-root}", root)).toBe(expected.toml.outputFolder);
  });
});

describe("the core roles, as the switch knows them", () => {
  it("are the roles setup writes", () => {
    const rust = readFileSync(resolve(__dirname, "..", "src-tauri/src/bmadswitch.rs"), "utf8");
    const list = /const CORE_ROLES: \[&str; \d+\] = \[([^\]]*)\]/.exec(rust);
    expect(list, "CORE_ROLES not found in bmadswitch.rs").not.toBeNull();
    const names = [...list![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(ROLES.map((r) => r.name));
  });
});

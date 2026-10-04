import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * appimage.github.io refused to list ADE:
 *
 *   FATAL: .DirIcon is missing in /tmp/.mount_runtim…
 *
 * Every AppImage must carry a .DirIcon at its root. Tauri derives each hicolor
 * directory from an icon's real pixel size, appending "@2" when the filename
 * says @2x — so 128x128@2x.png, which is 256px, installs to 256x256@2 and the
 * plain 256x256 directory never exists.
 *
 * Observed across 0.18.1 -> 0.18.2: with no plain 256x256 directory, no
 * .DirIcon was produced; adding a 256x256.png (no @2x in the name) created the
 * directory and .DirIcon appeared. The .DirIcon the bundler writes is actually
 * the 512px icon, so this 256px entry is what makes it emit the file at all
 * rather than being the file it copies.
 *
 * The release workflow asserts the built AppImage really contains .DirIcon;
 * this keeps the input that produces it from being dropped in the meantime.
 */
const REPO = resolve(__dirname, "..");
const conf = JSON.parse(readFileSync(resolve(REPO, "src-tauri/tauri.conf.json"), "utf8"));
const icons: string[] = conf.bundle.icon;

/** Width and height from a PNG's IHDR, without pulling in an image library. */
function pngSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("the AppImage can build a .DirIcon", () => {
  it("ships an icon that lands in a plain 256x256 directory", () => {
    const plain256 = icons.filter((i) => !i.includes("@2x") && i.endsWith(".png"))
      .filter((i) => existsSync(resolve(REPO, "src-tauri", i)))
      .find((i) => pngSize(resolve(REPO, "src-tauri", i)).w === 256);

    expect(
      plain256,
      "no 256px icon without @2x in its name: Tauri will not create hicolor/256x256 and .DirIcon goes missing",
    ).toBeTruthy();
  });

  it("every configured icon actually exists", () => {
    const missing = icons.filter((i) => !existsSync(resolve(REPO, "src-tauri", i)));
    expect(missing, `configured but absent: ${missing.join(", ")}`).toEqual([]);
  });

  it("the 256px icon keeps its transparency", () => {
    const p = resolve(REPO, "src-tauri/icons/256x256.png");
    // PNG colour type lives at byte 25; 6 is RGBA, 4 is grey+alpha.
    const colourType = readFileSync(p)[25];
    expect([4, 6], `colour type ${colourType} has no alpha channel`).toContain(colourType);
  });

  it("the release workflow still verifies the built AppImage", () => {
    // The config above is only the input; this is the check that proves it.
    const wf = readFileSync(resolve(REPO, ".github/workflows/release.yml"), "utf8");
    expect(wf).toContain("--appimage-extract");
    expect(wf).toContain(".DirIcon");
  });
});

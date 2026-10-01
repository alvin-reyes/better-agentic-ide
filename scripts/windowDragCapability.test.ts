import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * The tab bar and the detached window's header are marked
 * `data-tauri-drag-region`, which makes the webview call
 * `plugin:window|start_dragging` when you drag them. Without the matching
 * permission the call is denied by the ACL and the rejection is unhandled:
 *
 *   unhandled rejection: Command plugin:window|start_dragging not allowed by ACL
 *
 * Nothing is shown to the user — the window simply refuses to move by its
 * title bar. So any drag region in the UI needs the capability to back it.
 */
const ROOT = resolve(__dirname, "..");
const CAPS = resolve(ROOT, "src-tauri/capabilities");

function allPermissions(): string[] {
  return readdirSync(CAPS)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => JSON.parse(readFileSync(join(CAPS, f), "utf8")).permissions ?? []);
}

function sourcesWithDragRegion(): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && readFileSync(p, "utf8").includes("data-tauri-drag-region")) hits.push(p);
    }
  };
  walk(resolve(ROOT, "src"));
  return hits;
}

describe("window dragging is permitted where the UI offers it", () => {
  it("has at least one drag region, so this test is not vacuous", () => {
    expect(sourcesWithDragRegion().length).toBeGreaterThan(0);
  });

  it("grants core:window:allow-start-dragging", () => {
    expect(
      allPermissions(),
      "a data-tauri-drag-region without this permission fails silently at runtime"
    ).toContain("core:window:allow-start-dragging");
  });
});

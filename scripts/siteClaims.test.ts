import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CURATED_ITEMS, PICKER_ITEMS, ROLE_ITEMS } from "../src/data/pickerItems";

/**
 * The landing page claimed "47 agent profiles" beside a screenshot whose own
 * footer read "22 agents" — the catalogue had grown and neither the number nor
 * the picture followed. Counting by hand is what let them drift apart, so the
 * numbers the page prints are checked against the data the app actually loads.
 *
 * The picker footer renders `{filtered.length} agents`, which unfiltered is
 * every curated pair plus every bare role — that total is what a screenshot of
 * the picker will show, so the page has to agree with it.
 */
const html = readFileSync(resolve(__dirname, "..", "docs", "index.html"), "utf8");

/** Every standalone integer the page states, so a stale one cannot hide. */
function claims(): number[] {
  return [...html.matchAll(/\b(\d{2,3})\b(?=\s*(?:agent|role|profile))/gi)].map((m) => Number(m[1]));
}

describe("the site's agent numbers match the app", () => {
  it("every agent/role count on the page is one the data supports", () => {
    const real = new Set([CURATED_ITEMS.length, ROLE_ITEMS.length, PICKER_ITEMS.length]);
    const wrong = claims().filter((n) => !real.has(n));
    expect(
      wrong,
      `page states ${wrong.join(", ")}; the data has ${[...real].sort((a, b) => a - b).join(", ")}`,
    ).toEqual([]);
  });

  it("states the total a picker screenshot would show", () => {
    // Guards against quietly dropping the headline number entirely.
    expect(html).toContain(`${PICKER_ITEMS.length} agents`);
  });

  it("the screenshot's declared size matches the file on disk", () => {
    // A wrong width/height makes the browser reserve the wrong box and the
    // card jumps on load; it also signals the image was swapped without care.
    const img = readFileSync(resolve(__dirname, "..", "docs/assets/img/agents.webp"));
    // VP8 (lossy) webp: dimensions sit at byte 26, 14 bits each, stored as-is.
    const w = img.readUInt16LE(26) & 0x3fff;
    const h = img.readUInt16LE(28) & 0x3fff;
    const tag = /<img src="\{\{ img \}\}agents\.webp" width="(\d+)" height="(\d+)"/.exec(html);
    expect(tag, "agents.webp img tag not found").toBeTruthy();
    expect(
      [Number(tag![1]), Number(tag![2])],
      `file is ${w}x${h}, page declares ${tag![1]}x${tag![2]}`,
    ).toEqual([w, h]);
  });
});

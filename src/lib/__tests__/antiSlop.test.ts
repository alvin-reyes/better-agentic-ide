import { describe, expect, it } from "vitest";
import { SLOP_RULES, checkDiff, fixPrompt } from "../slopCheck";
import { lintPrompt } from "../promptLint";
import { deslop } from "../deslop";

const DIFF = [
  "diff --git a/src/app.ts b/src/app.ts",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -10,0 +11,6 @@",
  "+  // TODO handle overflow",
  "+  console.log(\"debug\", a);",
  "+  // const old = a - b;",
  "+  // This function is used to add numbers",
  "+  return a + b; // clamp: callers pass cents",
  "+  // implement this later",
  "+++ b/README.md",
  "+# Fast start 🚀",
  "+We leverage a robust engine.",
  "+A todo list app.",
  "+++ b/package-lock.json",
  "+  \"todo\": \"1.0.0\"",
].join("\n");

describe("slop check", () => {
  it("loads the plugin's rules", () => {
    expect(SLOP_RULES.map((r) => r.id)).toEqual(expect.arrayContaining(["todo", "stub", "debug", "ai-words"]));
  });

  it("flags added lines by scope, with line numbers", () => {
    const f = checkDiff(DIFF);
    expect(f.map((x) => `${x.file}:${x.line}:${x.rule}`)).toEqual([
      "src/app.ts:11:todo",
      "src/app.ts:12:debug",
      "src/app.ts:13:commented-js",
      "src/app.ts:14:narration",
      "src/app.ts:16:stub",
      "README.md:1:emoji-heading",
      "README.md:2:ai-words",
    ]);
  });

  it("builds a fix prompt", () => {
    const p = fixPrompt(checkDiff(DIFF));
    expect(p).toContain("src/app.ts:11 Unfinished-work marker");
    expect(p).not.toContain("\n");
  });
});

describe("prompt lint", () => {
  it("passes a specific prompt", () => {
    expect(lintPrompt("In src/lib/deslop.ts, keep the case of swapped words; the test in __tests__ should pass.")).toEqual([]);
  });

  it("flags vague, targetless prompts without a finish line", () => {
    const ids = lintPrompt("make it better and also faster and also nicer and also cleaner please thanks a lot").map((h) => h.id);
    expect(ids).toEqual(["vague", "target", "done", "split"]);
  });

  it("ignores slash commands and short replies", () => {
    expect(lintPrompt("/compact keep the plan")).toEqual([]);
    expect(lintPrompt("yes, go ahead")).toEqual([]);
  });
});

describe("deslop", () => {
  it("drops filler and swaps AI-tell words, keeping case", () => {
    const r = deslop("In today's fast-paced world, we leverage caching. Utilize the seamless API in order to delve into logs. I hope this helps!");
    expect(r.text).toBe("We use caching. Use the smooth API to look into logs. ");
    expect(r.changes).toBe(7);
  });

  it("leaves code and lowercase lines alone", () => {
    const text = "npm install\n- item one\n`leverage` stays? no";
    expect(deslop("npm install\n- item one").text).toBe("npm install\n- item one");
    expect(deslop(text).changes).toBe(1);
  });
});

describe("deslop verb forms", () => {
  it("keeps -ing, -s and -ed forms grammatical", () => {
    expect(deslop("By leveraging caching we cut costs.").text).toBe("By using caching we cut costs.");
    expect(deslop("We are delving into the logs.").text).toBe("We are looking into the logs.");
    expect(deslop("It utilized the cache and leverages it.").text).toBe("It used the cache and uses it.");
  });
});

describe("vendored BMAD is not judged by our rules", () => {
  // src-tauri/resources/bmad/ is the copy this repo ships BMAD from, and
  // .bmad-core/ is where it lands in a user's project. Both are BMAD's prose.
  // Flagging it is noise: it is not ours to rewrite, and re-vendoring would
  // restore the wording anyway.
  it("skips the vendored source as well as the installed copy", () => {
    const diff = [
      "+++ b/src-tauri/resources/bmad/bmad-core/data/bmad-kb.md",
      "@@ -1,0 +1,2 @@",
      "+Leverage multiple agents for brainstorming.",
      "+This enables seamless operation across environments.",
      "+++ b/.bmad-core/data/bmad-kb.md",
      "@@ -1,0 +1,1 @@",
      "+A robust, seamless way to delve into it.",
    ].join("\n");
    expect(checkDiff(diff)).toEqual([]);
  });

  it("still flags the same wording in our own docs", () => {
    const diff = [
      "+++ b/docs/guide/something.md",
      "@@ -1,0 +1,1 @@",
      "+This enables seamless operation across environments.",
    ].join("\n");
    expect(checkDiff(diff).map((f) => f.rule)).toEqual(["ai-words"]);
  });
});

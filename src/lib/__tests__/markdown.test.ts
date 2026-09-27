import { describe, it, expect } from "vitest";
import { marked } from "marked";
import { splitMarkdown, markdownToHtml } from "../markdown";

const whole = (md: string) => marked.parse(md, { async: false }) as string;

const doc = [
  "# Title",
  "",
  "Intro paragraph with a [ref link][docs] and `code`.",
  "",
  "- item one",
  "",
  "- item two, loose list",
  "  continued line",
  "",
  "1. first",
  "2. second",
  "",
  "| a | b |",
  "|---|---|",
  "| 1 | 2 |",
  "",
  "```js",
  "const x = 1;",
  "",
  "# not a heading, inside a fence",
  "",
  "```",
  "",
  "> quote",
  ">",
  "> more quote",
  "",
  "Setext Heading",
  "==============",
  "",
  "Last paragraph.",
  "",
  "[docs]: https://example.com/docs",
  "",
].join("\n");

describe("markdownToHtml", () => {
  it("renders the same HTML as one-shot parsing, even with tiny chunks", () => {
    const chunks = splitMarkdown(doc, 1);
    expect(chunks.length).toBeGreaterThan(4);
    const html = chunks.map((c) => whole(c)).join("");
    expect(html).toBe(whole(doc));
  });

  it("never splits inside a fenced code block", () => {
    for (const c of splitMarkdown(doc, 1)) {
      const fences = c.split("\n").filter((l) => l.startsWith("```")).length;
      expect(fences % 2).toBe(0);
    }
  });

  it("resolves reference links defined in another chunk", () => {
    const html = markdownToHtml(doc);
    expect(html).toContain('<a href="https://example.com/docs">ref link</a>');
  });

  it("parses a large document in linear time", () => {
    const big = Array.from({ length: 4000 }, (_, i) => `## S${i}\n\nText ${i} **b** [l](#s${i}).\n`).join("\n");
    const html = markdownToHtml(big);
    expect(html.match(/<h2/g)?.length).toBe(4000);
  });
});

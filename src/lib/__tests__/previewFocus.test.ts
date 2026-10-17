import { describe, it, expect, afterEach } from "vitest";
import { closePreviewFocus } from "../previewFocus";

afterEach(() => { document.body.innerHTML = ""; });

function setup() {
  document.body.innerHTML = `
    <textarea class="xterm-helper-textarea"></textarea>
    <div id="panel"><button id="inside">x</button></div>
    <button id="outside">y</button>`;
  const q = (s: string) => document.querySelector(s) as HTMLElement;
  return { term: q(".xterm-helper-textarea"), panel: q("#panel"), inside: q("#inside"), outside: q("#outside") };
}

describe("closePreviewFocus", () => {
  it("closing returns focus to the terminal", () => {
    const { term, panel, inside } = setup();
    inside.focus();
    closePreviewFocus(panel);
    expect(document.activeElement).toBe(term);
  });

  it("leaves focus alone when it is elsewhere", () => {
    const { panel, outside } = setup();
    outside.focus();
    closePreviewFocus(panel);
    expect(document.activeElement).toBe(outside);
  });

  it("does nothing without a panel", () => {
    const { outside } = setup();
    outside.focus();
    closePreviewFocus(null);
    expect(document.activeElement).toBe(outside);
  });
});

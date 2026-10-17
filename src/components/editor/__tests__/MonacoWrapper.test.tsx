import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("@monaco-editor/react", () => import("./monacoStub"));
// Its `?worker` imports don't load under vitest.
vi.mock("../monacoSetup", () => ({}));

import { stub } from "./monacoStub";
import MonacoWrapper from "../MonacoWrapper";

const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

beforeEach(() => stub.reset());

describe("MonacoWrapper read-only", () => {
  it("read-only content never goes through value", () => {
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="one" readOnly />);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="two" readOnly />);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="three" readOnly />);
    expect(stub.renders.length).toBeGreaterThanOrEqual(3);
    for (const p of stub.renders) expect("value" in p).toBe(false);
    expect(stub.renders[0].defaultValue).toBe("one");
  });

  it("a reload keeps the reader's place", () => {
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content={"a\nb\nc"} readOnly />);
    const ed = stub.editors[0];
    ed.setScrollTop(420);
    ed.setPosition({ lineNumber: 3, column: 2 });
    ed.calls = [];
    rerender(<MonacoWrapper filePath="/r/a.ts" content={"a\nb\nc\nd"} readOnly />);
    expect(ed.calls).toEqual(["saveViewState", "setValue", "restoreViewState"]);
    expect(ed.value).toBe("a\nb\nc\nd");
    expect(ed.scrollTop).toBe(420);
    expect(ed.position).toEqual({ lineNumber: 3, column: 2 });
  });

  it("does nothing when the content is what the editor holds", () => {
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="same" readOnly />);
    const ed = stub.editors[0];
    ed.calls = [];
    rerender(<MonacoWrapper filePath="/r/a.ts" content="same" readOnly ariaLabel="x" />);
    expect(ed.calls).toEqual([]);
  });

  it("a write before mount is not lost", async () => {
    stub.asyncMount = true;
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="first" readOnly autoFocus={false} />);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="second" readOnly autoFocus={false} />);
    expect(stub.editors).toHaveLength(0);
    await tick();
    expect(stub.editors).toHaveLength(1);
    expect(stub.editors[0].getValue()).toBe("second");
  });

  it("read-only mode", () => {
    render(<MonacoWrapper filePath="/r/a.ts" content="x" readOnly autoFocus={false} ariaLabel="a.ts, read-only" />);
    const opts = stub.renders[0].options as Record<string, unknown>;
    expect(opts.readOnly).toBe(true);
    expect(opts.domReadOnly).toBe(true);
    expect((opts.minimap as { enabled: boolean }).enabled).toBe(false);
    expect(opts.renderValidationDecorations).toBe("off");
    expect(opts.ariaLabel).toBe("a.ts, read-only");
    const ed = stub.editors[0];
    expect(ed.actions).toHaveLength(0);
    expect(ed.focusCount).toBe(0);
  });

  it("defaults are the file tab's", () => {
    const onChange = vi.fn();
    const onSave = vi.fn();
    render(<MonacoWrapper filePath="/r/a.ts" content="x" onChange={onChange} onSave={onSave} />);
    const p = stub.renders[0];
    expect(p.value).toBe("x");
    expect("defaultValue" in p).toBe(false);
    expect(p.options).toEqual({
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      minimap: { enabled: true },
      lineNumbers: "on",
      wordWrap: "off",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      renderWhitespace: "selection",
      bracketPairColorization: { enabled: true },
      padding: { top: 8 },
    });
    const ed = stub.editors[0];
    expect(ed.actions).toHaveLength(1);
    expect((ed.actions[0] as { id: string }).id).toBe("save-file");
    (ed.actions[0] as { run: () => void }).run();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(ed.focusCount).toBe(1);
  });

  it("save uses the latest onSave after a re-render", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="x" onChange={vi.fn()} onSave={first} />);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="x" onChange={vi.fn()} onSave={latest} />);
    (stub.editors[0].actions[0] as { run: () => void }).run();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("reports once the editor has taken focus", async () => {
    const onFocused = vi.fn();
    stub.asyncMount = true;
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="x" readOnly autoFocus onFocused={onFocused} />);
    expect(onFocused).not.toHaveBeenCalled();
    await tick();
    expect(stub.editors[0].focusCount).toBe(1);
    expect(onFocused).toHaveBeenCalledTimes(1);

    const late = vi.fn();
    stub.reset();
    const second = render(<MonacoWrapper filePath="/r/b.ts" content="x" readOnly autoFocus={false} onFocused={late} />);
    await tick();
    expect(late).not.toHaveBeenCalled();
    second.rerender(<MonacoWrapper filePath="/r/b.ts" content="x" readOnly autoFocus onFocused={late} />);
    expect(late).toHaveBeenCalledTimes(1);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="y" readOnly autoFocus onFocused={onFocused} />);
    expect(onFocused).toHaveBeenCalledTimes(1);
  });

  it("focuses once when autoFocus turns on after mount", () => {
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="x" readOnly autoFocus={false} />);
    const ed = stub.editors[0];
    expect(ed.focusCount).toBe(0);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="x" readOnly autoFocus />);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="y" readOnly autoFocus />);
    expect(ed.focusCount).toBe(1);
  });

  it("focuses once when autoFocus turns on before an asynchronous mount", async () => {
    stub.asyncMount = true;
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content="x" readOnly autoFocus={false} />);
    rerender(<MonacoWrapper filePath="/r/a.ts" content="x" readOnly autoFocus />);
    await tick();
    expect(stub.editors[0].focusCount).toBe(1);
  });
});

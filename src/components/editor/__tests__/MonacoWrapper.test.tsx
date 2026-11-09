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

describe("MonacoWrapper reveal", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

  it("reveals the target line once per click", () => {
    const onRevealed = vi.fn();
    const text = lines(100);
    const { rerender } = render(
      <MonacoWrapper filePath="/r/a.ts" content={text} readOnly autoFocus={false} reveal={{ line: 42, nonce: 1 }} onRevealed={onRevealed} />,
    );
    const ed = stub.editors[0];
    expect(ed.positions).toEqual([{ lineNumber: 42, column: 1 }]);
    expect(ed.revealed).toEqual([42]);
    expect(onRevealed.mock.calls).toEqual([[1]]);

    // A reload with the same nonce: the place is kept, nothing re-revealed.
    ed.calls = [];
    rerender(
      <MonacoWrapper filePath="/r/a.ts" content={text + "\nmore"} readOnly autoFocus={false} reveal={{ line: 42, nonce: 1 }} onRevealed={onRevealed} />,
    );
    expect(ed.calls).toEqual(["saveViewState", "setValue", "restoreViewState"]);
    expect(ed.position).toEqual({ lineNumber: 42, column: 1 });
    expect(onRevealed).toHaveBeenCalledTimes(1);

    // The same line clicked again is a new nonce: revealed again.
    rerender(
      <MonacoWrapper filePath="/r/a.ts" content={text + "\nmore"} readOnly autoFocus={false} reveal={{ line: 42, nonce: 2 }} onRevealed={onRevealed} />,
    );
    expect(ed.positions).toEqual([{ lineNumber: 42, column: 1 }, { lineNumber: 42, column: 1 }]);
    expect(ed.revealed).toEqual([42, 42]);
    expect(onRevealed.mock.calls).toEqual([[1], [2]]);

    // With a column; and the reveal going away changes nothing.
    rerender(
      <MonacoWrapper filePath="/r/a.ts" content={text + "\nmore"} readOnly autoFocus={false} reveal={{ line: 10, col: 5, nonce: 3 }} onRevealed={onRevealed} />,
    );
    expect(ed.positions[2]).toEqual({ lineNumber: 10, column: 5 });
    rerender(<MonacoWrapper filePath="/r/a.ts" content={text + "\nmore"} readOnly autoFocus={false} onRevealed={onRevealed} />);
    expect(ed.revealed).toEqual([42, 42, 10]);
    // A reveal never takes focus.
    expect(ed.focusCount).toBe(0);
  });

  it("a reveal and a reload in the same render: content first, then the line, and the next reload keeps it", () => {
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content={lines(5)} readOnly autoFocus={false} />);
    const ed = stub.editors[0];
    ed.calls = [];
    rerender(<MonacoWrapper filePath="/r/a.ts" content={lines(300)} readOnly autoFocus={false} reveal={{ line: 300, nonce: 7 }} />);
    expect(ed.calls).toEqual(["saveViewState", "setValue", "restoreViewState", "layout", "setPosition", "revealLineInCenter"]);
    expect(ed.position).toEqual({ lineNumber: 300, column: 1 });
    rerender(<MonacoWrapper filePath="/r/a.ts" content={lines(301)} readOnly autoFocus={false} reveal={{ line: 300, nonce: 7 }} />);
    expect(ed.position).toEqual({ lineNumber: 300, column: 1 });
    expect(ed.revealed).toEqual([300]);
  });

  it("a reveal waits for an asynchronous mount and lands after the latest content", async () => {
    stub.asyncMount = true;
    const onRevealed = vi.fn();
    const { rerender } = render(
      <MonacoWrapper filePath="/r/a.ts" content={lines(5)} readOnly autoFocus={false} reveal={{ line: 250, nonce: 4 }} onRevealed={onRevealed} />,
    );
    rerender(
      <MonacoWrapper filePath="/r/a.ts" content={lines(300)} readOnly autoFocus={false} reveal={{ line: 250, nonce: 4 }} onRevealed={onRevealed} />,
    );
    expect(onRevealed).not.toHaveBeenCalled();
    await tick();
    const ed = stub.editors[0];
    expect(ed.calls).toEqual(["saveViewState", "setValue", "restoreViewState", "layout", "setPosition", "revealLineInCenter"]);
    // Not clamped to the first content's 5 lines: it waited for the 300.
    expect(ed.positions).toEqual([{ lineNumber: 250, column: 1 }]);
    expect(onRevealed.mock.calls).toEqual([[4]]);
    expect(ed.focusCount).toBe(0);
  });

  it("lays the editor out before revealing, so the line is centered in the real viewport", () => {
    // @monaco-editor/react creates the editor in a display:none container, so
    // at onMount its layout is a few pixels tall; centering then puts the line
    // on the top row. layout() first measures the real size.
    render(<MonacoWrapper filePath="/r/a.ts" content={lines(400)} readOnly autoFocus={false} reveal={{ line: 300, nonce: 1 }} />);
    const ed = stub.editors[0];
    expect(ed.calls).toEqual(["layout", "setPosition", "revealLineInCenter"]);
  });

  it("clamps a line past the end", () => {
    const { rerender } = render(<MonacoWrapper filePath="/r/a.ts" content={lines(3)} readOnly autoFocus={false} reveal={{ line: 50, nonce: 1 }} />);
    const ed = stub.editors[0];
    expect(ed.positions).toEqual([{ lineNumber: 3, column: 1 }]);
    expect(ed.revealed).toEqual([3]);
    rerender(<MonacoWrapper filePath="/r/a.ts" content={lines(3)} readOnly autoFocus={false} reveal={{ line: 0, col: 0, nonce: 2 }} />);
    expect(ed.positions[1]).toEqual({ lineNumber: 1, column: 1 });
    expect(ed.revealed).toEqual([3, 1]);
  });
});

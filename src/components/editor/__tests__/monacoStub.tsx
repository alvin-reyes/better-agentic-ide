/**
 * A stand-in for `@monaco-editor/react` that behaves like 4.7.0 where it
 * matters: a changed `value` prop is applied by the Editor itself, in its own
 * effect (which runs before the parent's), with `setValue`, and `setValue`
 * puts the cursor on line 1 and the scroll at the top. A test that passes
 * against this stub therefore cannot rely on the parent's effect winning.
 *
 * Use it from a test file with:
 *   vi.mock("@monaco-editor/react", () => import("<path>/monacoStub"));
 * and set `stub.asyncMount = true` to call onMount on a later tick, as the
 * real editor does after Monaco loads.
 */
import { useEffect, useRef } from "react";

type Position = { lineNumber: number; column: number };
type ViewState = { scrollTop: number; position: Position };

export interface FakeEditor {
  value: string;
  scrollTop: number;
  position: Position;
  /** Every method call in order, by name. */
  calls: string[];
  getValue(): string;
  setValue(v: string): void;
  saveViewState(): ViewState;
  restoreViewState(vs: ViewState): void;
  getPosition(): Position;
  setPosition(p: Position): void;
  revealLineInCenter(line: number): void;
  getModel(): { getLineCount(): number };
  setScrollTop(n: number): void;
  getScrollTop(): number;
  focus(): void;
  addAction(a: unknown): void;
  /** Counts, for assertions that read better than filtering `calls`. */
  focusCount: number;
  actions: unknown[];
  /** Arguments of every setPosition and revealLineInCenter call. */
  positions: Position[];
  revealed: number[];
}

export function makeFakeEditor(initial: string): FakeEditor {
  const ed: FakeEditor = {
    value: initial,
    scrollTop: 0,
    position: { lineNumber: 1, column: 1 },
    calls: [],
    focusCount: 0,
    actions: [],
    positions: [],
    revealed: [],
    getValue() { return ed.value; },
    setValue(v) {
      ed.calls.push("setValue");
      ed.value = v;
      // What the real setValue does to the view.
      ed.scrollTop = 0;
      ed.position = { lineNumber: 1, column: 1 };
    },
    saveViewState() {
      ed.calls.push("saveViewState");
      return { scrollTop: ed.scrollTop, position: { ...ed.position } };
    },
    restoreViewState(vs) {
      ed.calls.push("restoreViewState");
      ed.scrollTop = vs.scrollTop;
      ed.position = { ...vs.position };
    },
    getPosition() { return { ...ed.position }; },
    setPosition(p) { ed.calls.push("setPosition"); ed.positions.push({ ...p }); ed.position = { ...p }; },
    revealLineInCenter(line) { ed.calls.push("revealLineInCenter"); ed.revealed.push(line); },
    getModel() { return { getLineCount: () => ed.value.split("\n").length }; },
    setScrollTop(n) { ed.scrollTop = n; },
    getScrollTop() { return ed.scrollTop; },
    focus() { ed.calls.push("focus"); ed.focusCount += 1; },
    addAction(a) { ed.calls.push("addAction"); ed.actions.push(a); },
  };
  return ed;
}

export const stub: {
  /** Props of every render, in order. */
  renders: Record<string, unknown>[];
  /** Fake editors, one per mounted Editor, in mount order. */
  editors: FakeEditor[];
  asyncMount: boolean;
  reset(): void;
} = {
  renders: [],
  editors: [],
  asyncMount: false,
  reset() {
    stub.renders = [];
    stub.editors = [];
    stub.asyncMount = false;
  },
};

const fakeMonaco = { KeyMod: { CtrlCmd: 2048 }, KeyCode: { KeyS: 49 } };

export default function Editor(props: Record<string, unknown>) {
  stub.renders.push({ ...props });
  const editorRef = useRef<FakeEditor | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Mount: the model starts from `value`, else `defaultValue`.
  useEffect(() => {
    let cancelled = false;
    const mount = () => {
      if (cancelled) return;
      const p = propsRef.current;
      const start = (p.value as string | undefined) ?? (p.defaultValue as string | undefined) ?? "";
      const ed = makeFakeEditor(start);
      editorRef.current = ed;
      stub.editors.push(ed);
      (p.onMount as ((e: FakeEditor, m: typeof fakeMonaco) => void) | undefined)?.(ed, fakeMonaco);
    };
    if (stub.asyncMount) setTimeout(mount, 0);
    else mount();
    return () => { cancelled = true; };
  }, []);

  // The library's own value effect: setValue when read-only, which resets
  // the view, before any parent effect gets a say.
  const value = props.value as string | undefined;
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed || value === undefined) return;
    if (value !== ed.getValue()) ed.setValue(value);
  }, [value]);

  return <div data-testid="monaco-stub" data-language={String(props.language ?? "")} />;
}

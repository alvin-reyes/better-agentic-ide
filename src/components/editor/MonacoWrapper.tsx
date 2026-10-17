import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";
import "./monacoSetup";

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "typescript", tsx: "typescript",
  js: "javascript", jsx: "javascript",
  rs: "rust", py: "python", go: "go",
  java: "java", c: "c", cpp: "cpp", h: "c",
  rb: "ruby", swift: "swift", kt: "kotlin",
  json: "json", yaml: "yaml", yml: "yaml",
  toml: "toml", ini: "ini",
  css: "css", scss: "scss", less: "less",
  html: "html", htm: "html",
  md: "markdown", markdown: "markdown",
  sh: "shell", bash: "shell", zsh: "shell",
  sql: "sql", graphql: "graphql",
  xml: "xml", svg: "xml",
  dockerfile: "dockerfile",
  mmd: "markdown", mermaid: "markdown",
  txt: "plaintext", log: "plaintext", csv: "plaintext",
  env: "plaintext", lock: "json", conf: "plaintext", cfg: "plaintext",
  proto: "protobuf",
  sol: "sol", vy: "python", move: "rust", cairo: "rust",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const basename = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (basename === "dockerfile") return "dockerfile";
  return EXT_TO_LANGUAGE[ext] || "plaintext";
}

interface MonacoWrapperProps {
  filePath: string;
  content: string;
  onChange?: (value: string) => void;
  onSave?: () => void;
  /**
   * Read-only (the side panel). The editor is then uncontrolled: it starts
   * from `defaultValue` and never gets a `value` prop, because
   * @monaco-editor/react 4.7.0 applies a changed `value` itself, in its own
   * effect before ours, with a `setValue` that jumps to the top. A later
   * `content` is applied here instead, with the view state kept around it.
   */
  readOnly?: boolean;
  /**
   * Whether the editor takes focus when it mounts (default true). Turning it
   * on after mount focuses the editor once.
   */
  autoFocus?: boolean;
  /** Monaco's `ariaLabel`, what a screen reader calls the editor. */
  ariaLabel?: string;
  /** Called each time `autoFocus` has focused the editor. */
  onFocused?: () => void;
  /**
   * A line to land on (a `path:line` click). Applied once per `nonce`, after
   * mount and with the latest content in the model: the line is clamped to
   * the model, the cursor put on it and the line scrolled to the center.
   * Never takes focus.
   */
  reveal?: { line: number; col?: number; nonce: number };
  /** Called with the nonce once a reveal has been applied. */
  onRevealed?: (nonce: number) => void;
}

const BASE_OPTIONS = {
  fontSize: 13,
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  minimap: { enabled: true },
  lineNumbers: "on" as const,
  wordWrap: "off" as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  renderWhitespace: "selection" as const,
  bracketPairColorization: { enabled: true },
  padding: { top: 8 },
};

const READ_ONLY_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  minimap: { enabled: false },
  // The TS worker can't see the project, so its squiggles would be wrong.
  renderValidationDecorations: "off" as const,
};

/** A whole number of at least 1; anything else (NaN, 0, -3) is 1. */
function atLeastOne(n: number | undefined): number {
  return n !== undefined && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Replace the text without moving the reader: scroll, cursor, selection. */
function setKeepingView(editor: monacoEditor.IStandaloneCodeEditor, content: string) {
  const vs = editor.saveViewState();
  editor.setValue(content);
  if (vs) editor.restoreViewState(vs);
}

export default function MonacoWrapper({
  filePath,
  content,
  onChange,
  onSave,
  readOnly = false,
  autoFocus = true,
  ariaLabel,
  onFocused,
  reveal,
  onRevealed,
}: MonacoWrapperProps) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const language = detectLanguage(filePath);
  // The save action is registered once, on mount. Calling onSave directly
  // from it would keep the first render's closure, whose `content` is the
  // file as opened, so Cmd+S would drop every edit.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  // The latest content, for a mount that lands after it changed: Monaco
  // mounts asynchronously, and a read-only editor starts from the first one.
  const contentRef = useRef(content);
  contentRef.current = content;
  // Read once: the editor is not remade when these change.
  const initialContent = useRef(content).current;
  const readOnlyAtMount = useRef(readOnly).current;
  // Latest, so a mount that lands late still sees a focus asked for meanwhile.
  const autoFocusRef = useRef(autoFocus);
  autoFocusRef.current = autoFocus;
  const onFocusedRef = useRef(onFocused);
  onFocusedRef.current = onFocused;
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;
  // The nonce last applied: a reveal is applied once, never again on a reload.
  const appliedNonce = useRef<number | null>(null);

  // Called on mount and after the content effect, so the model already holds
  // the latest content: a reload never undoes a reveal it raced, and the
  // reveal is clamped to the text it lands in.
  const applyReveal = useCallback(() => {
    const editor = editorRef.current;
    const r = revealRef.current;
    if (!editor || !r || r.nonce === appliedNonce.current) return;
    appliedNonce.current = r.nonce;
    const lineCount = editor.getModel()?.getLineCount() ?? 1;
    const lineNumber = Math.min(atLeastOne(r.line), lineCount);
    editor.setPosition({ lineNumber, column: atLeastOne(r.col) });
    editor.revealLineInCenter(lineNumber);
    onRevealedRef.current?.(r.nonce);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    if (readOnlyAtMount) {
      if (editor.getValue() !== contentRef.current) setKeepingView(editor, contentRef.current);
    } else {
      editor.addAction({
        id: "save-file",
        label: "Save File",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => onSaveRef.current?.(),
      });
    }
    applyReveal();
    if (autoFocusRef.current) {
      editor.focus();
      onFocusedRef.current?.();
    }
  }, [readOnlyAtMount, applyReveal]);

  // Off to on after mount: focus once. Before mount, onMount does it.
  const prevAutoFocus = useRef(autoFocus);
  useEffect(() => {
    if (autoFocus && !prevAutoFocus.current && editorRef.current) {
      editorRef.current.focus();
      onFocusedRef.current?.();
    }
    prevAutoFocus.current = autoFocus;
  }, [autoFocus]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.getValue() === content) return;
    if (readOnlyAtMount) {
      setKeepingView(editor, content);
    } else {
      const pos = editor.getPosition();
      editor.setValue(content);
      if (pos) editor.setPosition(pos);
    }
  }, [content, readOnlyAtMount]);

  // After the content effect above, which has to run first.
  const revealNonce = reveal?.nonce;
  useEffect(() => {
    applyReveal();
  }, [revealNonce, applyReveal]);

  const contentProps = readOnlyAtMount ? { defaultValue: initialContent } : { value: content };
  const options = {
    ...BASE_OPTIONS,
    ...(readOnlyAtMount ? READ_ONLY_OPTIONS : {}),
    ...(ariaLabel !== undefined ? { ariaLabel } : {}),
  };

  return (
    <Editor
      height="100%"
      language={language}
      {...contentProps}
      theme="vs-dark"
      onChange={(value) => onChange?.(value ?? "")}
      onMount={handleMount}
      options={options}
    />
  );
}

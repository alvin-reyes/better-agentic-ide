import { useRef, useCallback, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor as monacoEditor } from "monaco-editor";

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
  onChange: (value: string) => void;
  onSave: () => void;
}

export default function MonacoWrapper({ filePath, content, onChange, onSave }: MonacoWrapperProps) {
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const language = detectLanguage(filePath);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    editor.addAction({
      id: "save-file",
      label: "Save File",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => onSave(),
    });
    editor.focus();
  }, [onSave]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== content) {
      const pos = editor.getPosition();
      editor.setValue(content);
      if (pos) editor.setPosition(pos);
    }
  }, [content]);

  return (
    <Editor
      height="100%"
      language={language}
      value={content}
      theme="vs-dark"
      onChange={(value) => onChange(value ?? "")}
      onMount={handleMount}
      options={{
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
      }}
    />
  );
}

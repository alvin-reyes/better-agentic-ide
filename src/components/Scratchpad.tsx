import { useState, useRef, useEffect, useCallback, useMemo, useDeferredValue, forwardRef, useImperativeHandle } from "react";
import { claimKeyboard } from "../lib/keyboardOwner";
import { IS_MAC, SHORTCUTS, keyName, matches, shortcutLabel } from "../lib/shortcuts";
import { invoke } from "@tauri-apps/api/core";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { useTabStore } from "../stores/tabStore";
import { isPaneActive } from "../hooks/useTerminal";
import { writePty } from "../lib/terminalCommands";
import { compactText, estimateTokens, type CompactResult } from "../lib/compactText";
import { fmtInt } from "../lib/tokenUsage";
import { lintPrompt } from "../lib/promptLint";
import { deslop } from "../lib/deslop";

// In the scratchpad plain Ctrl+Enter / Ctrl+S work on every platform.
const SEND_KEY = IS_MAC ? "⌘↵" : "Ctrl+Enter";
/** Pastes smaller than this aren't worth offering to compact unless they carry escape codes. */
const COMPACT_MIN_TOKENS = 500;
const SAVE_KEY = IS_MAC ? "⌘S" : "Ctrl+S";

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

export interface ScratchpadHandle {
  toggle: () => void;
  send: () => void;
  copy: () => void;
  focus: () => void;
  close: () => void;
  saveNote: () => void;
  isOpen: boolean;
  isFocused: () => boolean;
}

const HISTORY_KEY = "better-terminal-prompt-history";
const NOTES_KEY = "better-terminal-saved-notes";
/** Unsent scratchpad text, so a draft survives restarts and crashes. */
const DRAFT_KEY = "ade-scratchpad-draft";

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

interface SavedNote {
  id: string;
  text: string;
  createdAt: number;
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

function loadNotes(): SavedNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistNotes(notes: SavedNote[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Show a confirmation state (e.g. "Copied!") briefly. */
function flash(set: (on: boolean) => void) {
  set(true);
  setTimeout(() => set(false), 1500);
}

/** Prompts separated by a `---` line run one after another. */
function splitChain(text: string): string[] {
  return text.split(/\n---\n/).filter((s) => s.trim());
}

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 200;

interface PromptTemplate {
  name: string;
  category: string;
  prompt: string;
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
  // Code Generation
  { name: "Implement Feature", category: "Code", prompt: "Implement the following feature:\n\n**Feature:** \n**Requirements:**\n- \n**Files to modify:**\n- \n\nPlease write clean, well-tested code." },
  { name: "Write Tests", category: "Code", prompt: "Write comprehensive tests for the following:\n\n**Module/Function:** \n**Test cases to cover:**\n- Happy path\n- Edge cases\n- Error handling\n\nUse the existing test framework in this project." },
  { name: "Refactor Code", category: "Code", prompt: "Refactor the following code to improve:\n\n**File:** \n**Issues:** \n**Goals:**\n- Better readability\n- DRY principles\n- Performance\n\nKeep the same behavior, just improve the implementation." },
  { name: "Fix Bug", category: "Debug", prompt: "Fix the following bug:\n\n**Bug description:** \n**Steps to reproduce:**\n1. \n**Expected behavior:** \n**Actual behavior:** \n\nPlease identify the root cause and provide a fix." },
  { name: "Explain Code", category: "Debug", prompt: "Explain this code in detail:\n\n```\n\n```\n\nCover:\n- What it does\n- How it works step by step\n- Any potential issues or improvements" },
  { name: "Debug Error", category: "Debug", prompt: "I'm getting this error:\n\n```\n\n```\n\n**Context:** \n**What I've tried:** \n\nPlease help me understand and fix this error." },
  // Architecture
  { name: "Design Component", category: "Arch", prompt: "Design a component/module for:\n\n**Purpose:** \n**Inputs:** \n**Outputs:** \n**Constraints:**\n- \n\nProvide the interface/API design and implementation approach." },
  { name: "Code Review", category: "Arch", prompt: "Review the following code changes:\n\n**Files changed:** \n**Purpose of changes:** \n\nCheck for:\n- Correctness\n- Security issues\n- Performance\n- Code style\n- Edge cases" },
  // Git / DevOps
  { name: "Write Commit", category: "Git", prompt: "Write a commit message for these changes:\n\n**Changes made:**\n- \n\nUse conventional commits format (feat/fix/refactor/docs/chore)." },
  { name: "Write PR Description", category: "Git", prompt: "Write a pull request description:\n\n**Title:** \n**Changes:**\n- \n**Testing:**\n- \n**Screenshots:** (if applicable)" },
  // AI Agent
  { name: "Spec Document", category: "AI", prompt: "Write a technical specification for:\n\n**Feature:** \n**Goal:** \n\nInclude:\n- Overview\n- Technical approach\n- API design\n- Data model\n- Edge cases\n- Testing strategy" },
  { name: "Step-by-Step Plan", category: "AI", prompt: "Create a step-by-step implementation plan for:\n\n**Task:** \n\nBreak it down into small, testable steps. For each step:\n1. What to do\n2. Which files to touch\n3. How to verify it works" },
  // Code Generation (more)
  { name: "Add API Endpoint", category: "Code", prompt: "Create a new API endpoint:\n\n**Method & Path:** \n**Request body/params:** \n**Response format:** \n**Authentication:** \n**Validation rules:**\n- \n\nInclude error handling and input validation." },
  { name: "Database Migration", category: "Code", prompt: "Create a database migration for:\n\n**Change:** \n**Tables affected:** \n**New columns/indexes:** \n**Rollback plan:** \n\nEnsure backward compatibility." },
  { name: "Type Definitions", category: "Code", prompt: "Define TypeScript types/interfaces for:\n\n**Domain:** \n**Entities:**\n- \n**Relationships:**\n- \n\nUse strict types, avoid `any`. Add JSDoc where helpful." },
  // Debug (more)
  { name: "Performance Issue", category: "Debug", prompt: "I have a performance issue:\n\n**What's slow:** \n**Current timing:** \n**Expected timing:** \n**Environment:** \n\nHelp me profile and optimize this." },
  { name: "Investigate Logs", category: "Debug", prompt: "Help me understand these logs:\n\n```\n\n```\n\n**What I expected to see:** \n**What's concerning:** \n\nIdentify the issue and suggest next steps." },
  // Architecture (more)
  { name: "System Design", category: "Arch", prompt: "Design the architecture for:\n\n**System:** \n**Scale requirements:** \n**Key constraints:**\n- \n\nCover:\n- High-level components\n- Data flow\n- Technology choices\n- Trade-offs" },
  { name: "Security Review", category: "Arch", prompt: "Review the security of:\n\n**Component:** \n**Auth mechanism:** \n**Data sensitivity:** \n\nCheck for:\n- OWASP Top 10\n- Input validation\n- Authentication/authorization\n- Data exposure\n- Dependency vulnerabilities" },
  // Git (more)
  { name: "Release Notes", category: "Git", prompt: "Write release notes for version:\n\n**Version:** \n**Changes since last release:**\n- \n\nFormat with sections: Features, Bug Fixes, Breaking Changes, Dependencies." },
  { name: "Git Workflow", category: "Git", prompt: "Help me with this git situation:\n\n**Current state:** \n**What I want to achieve:** \n**Branches involved:** \n\nProvide the exact git commands needed." },
  // AI (more)
  { name: "Brainstorm Ideas", category: "AI", prompt: "Help me brainstorm solutions for:\n\n**Problem:** \n**Constraints:**\n- \n**What I've considered:** \n\nGive me 3-5 different approaches with pros/cons for each." },
  { name: "Write Documentation", category: "AI", prompt: "Write documentation for:\n\n**Component/API:** \n**Audience:** (developer/end-user)\n**Include:**\n- Overview\n- Quick start\n- API reference\n- Examples\n- Common pitfalls" },
  { name: "Convert/Translate", category: "AI", prompt: "Convert this code:\n\n```\n\n```\n\n**From:** \n**To:** \n\nPreserve the logic and use idiomatic patterns in the target language." },
  // Prompt Chains
  { name: "Design Session", category: "Chain", prompt: "Analyze the current codebase structure. List the key files, architecture patterns, and tech stack being used.\n---\nBased on your analysis, propose 2-3 approaches for implementing: [DESCRIBE FEATURE]. Include trade-offs for each approach.\n---\nWrite a detailed technical spec for the recommended approach. Include: components, data flow, API design, and edge cases.\n---\nCreate a step-by-step implementation plan with exact file paths and code changes for each step." },
  { name: "Code Review Chain", category: "Chain", prompt: "Review all recent changes in this project. List every file that was modified.\n---\nFor each changed file, analyze: correctness, security issues, performance concerns, and code style.\n---\nWrite a summary of findings with severity ratings (critical/warning/info) and specific fix recommendations." },
  { name: "Debug Chain", category: "Chain", prompt: "Investigate the following issue: [DESCRIBE BUG]. Start by reading the relevant source files and understanding the current behavior.\n---\nIdentify the root cause. Show the exact lines of code causing the issue and explain why.\n---\nImplement a fix for the bug. Write tests to prevent regression." },
];

const CATEGORY_COLORS: Record<string, string> = {
  Code: "var(--accent)",
  Debug: "#ff7b72",
  Arch: "#bc8cff",
  Git: "#3fb950",
  AI: "#d29922",
  Chain: "#8b5cf6",
  Ops: "#56d4dd",
};

interface PastedImage {
  id: string;
  dataUrl: string;   // for preview
  tempPath: string;  // saved file path for CLI consumption
}

type Panel = "history" | "notes" | "templates";

const headerToggleStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--accent-subtle)" : "none",
  border: "1px solid var(--border)",
  color: active ? "var(--accent)" : "var(--text-muted)",
  cursor: "pointer",
  padding: "2px 8px",
  borderRadius: "var(--radius-sm)",
  fontSize: "11px",
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: "4px",
});

const LIST_PANEL_STYLE: React.CSSProperties = {
  borderBottom: "1px solid var(--border)",
  maxHeight: "140px",
  overflowY: "auto",
  flexShrink: 0,
};

const LIST_EMPTY_STYLE: React.CSSProperties = {
  padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic",
};

const LIST_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 16px",
  borderBottom: "1px solid var(--border)",
  cursor: "pointer",
  fontSize: "12px",
  color: "var(--text-secondary)",
};

const LIST_ROW_TEXT_STYLE: React.CSSProperties = {
  flex: 1, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const ROW_DELETE_STYLE: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  padding: "2px 4px",
  borderRadius: "3px",
  fontSize: "10px",
  flexShrink: 0,
};

const KBD_STYLE: React.CSSProperties = { fontSize: "10px", opacity: 0.5, fontFamily: "monospace" };

const rowHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = "var(--bg-tertiary)"; },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = "transparent"; },
};

const rowDeleteHover = {
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
    e.currentTarget.style.color = "var(--text-primary)";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.backgroundColor = "transparent";
    e.currentTarget.style.color = "var(--text-muted)";
  },
};

/** Hover for the secondary action buttons; skipped while `busy` shows a flash state. */
const secondaryHover = (busy = false) => ({
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
    if (busy) return;
    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
    e.currentTarget.style.color = "var(--text-primary)";
  },
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
    if (busy) return;
    e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
    e.currentTarget.style.color = "var(--text-secondary)";
  },
});

const Scratchpad = forwardRef<ScratchpadHandle>((_props, ref) => {
  const [isOpen, setIsOpen] = useState(true);
  // Hold the keyboard while this panel is open, so a click on a
  // non-focusable part of it does not send typing to the terminal behind.
  useEffect(() => claimKeyboard("scratchpad"), []);
  const [text, setText] = useState(loadDraft);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const tokens = useMemo(() => estimateTokens(text), [text]);
  // Prompt tips and the local de-slop, on the text as it settles.
  const settled = useDeferredValue(text);
  const hints = useMemo(() => lintPrompt(settled), [settled]);
  const [hintsHidden, setHintsHidden] = useState(false);
  useEffect(() => { if (!text) setHintsHidden(false); }, [text]);
  const cleaned = useMemo(() => deslop(settled), [settled]);
  // Undo lasts while the text is still what de-slop produced.
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  // A long or noisy paste that compacting would shrink: offered, never applied silently.
  const [pasteOffer, setPasteOffer] = useState<{ original: string; at: number; result: CompactResult } | null>(null);
  // Drop the offer once the pasted text is gone (sent, cleared or edited away).
  useEffect(() => {
    if (pasteOffer && !text.includes(pasteOffer.original)) setPasteOffer(null);
  }, [text, pasteOffer]);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [notes, setNotes] = useState<SavedNote[]>(loadNotes);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [isListening, setIsListening] = useState(false);
  const [chainRunning, setChainRunning] = useState(false);
  const [chainStep, setChainStep] = useState(0);
  const [chainTotal, setChainTotal] = useState(0);
  const chainCancelledRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(DEFAULT_HEIGHT);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);
  const getActivePtyId = useTabStore((s) => s.getActivePtyId);

  // Persist the draft (debounced); auto-save mirrors it to disk.
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        if (text) localStorage.setItem(DRAFT_KEY, text);
        else localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Storage full: the draft just isn't persisted.
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [text]);

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const speechAvailable = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    if (!speechAvailable) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Rebuild from the text as it was when dictation started: each result
    // carries the whole transcript so far, so appending to the current text
    // would repeat it.
    const startText = text === "" || text.endsWith("\n") ? text : text + " ";
    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interim = transcript;
        }
      }
      setText(startText + finalTranscript + interim);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (finalTranscript.trim()) {
        setText((prev) => prev.trimEnd() + " ");
      }
    };

    recognition.onerror = (event) => {
      console.warn("Speech recognition error:", event.error);
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onstart = () => {
      setIsListening(true);
      finalTranscript = "";
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, speechAvailable, text]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  // Drag-to-resize; blur/visibilitychange also end the drag so an interrupted one doesn't stick.
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = height;

    const cleanup = () => {
      draggingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", cleanup);
      document.removeEventListener("visibilitychange", cleanup);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startYRef.current - ev.clientY;
      setHeight(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta)));
    };
    const onUp = () => cleanup();

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", cleanup);
    document.addEventListener("visibilitychange", cleanup);
  }, [height]);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const sendEnter = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;
    await writePty(ptyId, "\r").catch(() => {});
  }, [getActivePtyId]);

  const saveImageFromBase64 = useCallback(async (base64: string, ext: string = "png") => {
    try {
      const tempPath = await invoke<string>("save_temp_image", {
        base64Data: base64,
        extension: ext,
      });
      const dataUrl = `data:image/${ext};base64,${base64}`;
      setPastedImages((prev) => [...prev, { id: newId(), dataUrl, tempPath }]);
    } catch (err) {
      console.error("Failed to save image:", err);
    }
  }, []);

  const saveImageBlob = useCallback(async (blob: File | Blob) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const ext = blob.type?.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
      await saveImageFromBase64(base64, ext);
    };
    reader.readAsDataURL(blob);
  }, [saveImageFromBase64]);

  // Tauri clipboard plugin: covers macOS screenshots and other system copies.
  const pasteImageFromClipboard = useCallback(async () => {
    try {
      const img = await readImage();
      const rgba = await img.rgba();
      const width = (img as unknown as { width: number }).width;
      const height = (img as unknown as { height: number }).height;

      // RGBA -> PNG via canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
      await saveImageFromBase64(canvas.toDataURL("image/png").split(",")[1], "png");
    } catch {
      // No image in the clipboard.
    }
  }, [saveImageFromBase64]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;

    // Web clipboard first (files pasted from a browser).
    if (clipboardData?.files && clipboardData.files.length > 0) {
      for (const file of Array.from(clipboardData.files)) {
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          await saveImageBlob(file);
          return;
        }
      }
    }
    if (clipboardData?.items) {
      for (const item of Array.from(clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            await saveImageBlob(blob);
            return;
          }
        }
      }
    }

    // Fall back to the native clipboard only when the paste carries no text.
    if (!clipboardData?.types?.includes("text/plain")) {
      e.preventDefault();
      await pasteImageFromClipboard();
      return;
    }

    const pasted = clipboardData.getData("text/plain");
    if (estimateTokens(pasted) >= COMPACT_MIN_TOKENS || /\x1b\[|\r(?!\n)/.test(pasted)) {
      const result = compactText(pasted);
      if (result.after > result.before * 0.8) return;
      // The textarea stores line breaks as \n; match what it will hold.
      const original = pasted.replace(/\r\n?/g, "\n");
      const at = (e.currentTarget as HTMLTextAreaElement).selectionStart;
      // Offer once the browser has inserted the paste and onChange has run.
      setTimeout(() => setPasteOffer({ original, at, result }), 0);
    }
  }, [saveImageBlob, pasteImageFromClipboard]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        await saveImageBlob(file);
      }
    }
  }, [saveImageBlob]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const removeImage = useCallback((id: string) => {
    setPastedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const addToHistory = useCallback((entry: string) => {
    const newHistory = [entry, ...history.filter((h) => h !== entry)];
    setHistory(newHistory);
    saveHistory(newHistory);
  }, [history]);

  const send = useCallback(async () => {
    // An orchestrator tab gets the text in its chat instead of a terminal.
    const tabState = useTabStore.getState();
    const activeTab = tabState.tabs.find((t) => t.id === tabState.activeTabId);
    if (activeTab?.type === "orchestrator" && (text.trim() || pastedImages.length > 0)) {
      const images = pastedImages.map((img) => ({
        dataUrl: img.dataUrl,
        mediaType: (img.dataUrl.startsWith("data:image/jpeg") ? "image/jpeg"
          : img.dataUrl.startsWith("data:image/gif") ? "image/gif"
          : img.dataUrl.startsWith("data:image/webp") ? "image/webp"
          : "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
      }));
      window.dispatchEvent(new CustomEvent("orchestrator-send", { detail: { text: text.trim(), images } }));
      if (text.trim()) addToHistory(text.trim());
      flash(setSent);
      setText("");
      setPastedImages([]);
      return;
    }

    const ptyId = getActivePtyId();
    if (ptyId === null) {
      console.warn("No active PTY to send to");
      return;
    }
    // Nothing to send: just press Enter in the terminal.
    if (!text.trim() && pastedImages.length === 0) {
      await sendEnter();
      return;
    }

    // Attached images go after the text as file paths for the CLI to read.
    let fullText = text;
    if (pastedImages.length > 0) {
      const imagePaths = pastedImages.map((img) => img.tempPath).join(" ");
      fullText = fullText.trim()
        ? `${fullText.trim()} ${imagePaths}`
        : imagePaths;
    }

    // \r presses Enter in the terminal.
    try {
      await writePty(ptyId, fullText + "\r");
    } catch (err) {
      console.error("write_pty failed:", err);
      return;
    }

    // History keeps the text only, not image paths.
    if (text.trim()) addToHistory(text.trim());
    flash(setSent);
    setText("");
    setPastedImages([]);
  }, [text, pastedImages, getActivePtyId, addToHistory, sendEnter]);

  const chainSteps = splitChain(text);
  const isChain = chainSteps.length > 1;

  const sendChain = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;

    const steps = splitChain(text);
    if (steps.length <= 1) {
      send();
      return;
    }

    // Polled for activity between steps.
    const activePane = useTabStore.getState().getActivePane();
    if (!activePane) return;

    setChainRunning(true);
    setChainTotal(steps.length);
    setChainStep(0);
    chainCancelledRef.current = false;

    addToHistory(text.trim());

    for (let i = 0; i < steps.length; i++) {
      if (chainCancelledRef.current) break;

      setChainStep(i + 1);
      try {
        await writePty(ptyId, steps[i].trim() + "\r");
      } catch {
        break;
      }

      // Before the next step, wait for the agent to finish: give output a
      // moment to start, then poll until the pane goes idle (~10 min cap).
      if (i < steps.length - 1 && !chainCancelledRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        let idleChecks = 0;
        const maxWait = 600;
        while (idleChecks < maxWait && !chainCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 1000));
          if (!isPaneActive(activePane.id)) {
            // Confirm it stays idle.
            await new Promise((r) => setTimeout(r, 1500));
            if (!isPaneActive(activePane.id)) {
              break;
            }
          }
          idleChecks++;
        }
      }
    }

    setChainRunning(false);
    setChainStep(0);
    setChainTotal(0);
    if (!chainCancelledRef.current) {
      setText("");
      flash(setSent);
    }
  }, [text, getActivePtyId, addToHistory, send]);

  const cancelChain = useCallback(() => {
    chainCancelledRef.current = true;
    setChainRunning(false);
    setChainStep(0);
    setChainTotal(0);
  }, []);

  const copy = useCallback(async () => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    flash(setCopied);
  }, [text]);

  const saveNote = useCallback(() => {
    if (!text.trim()) return;
    const note: SavedNote = { id: newId(), text: text.trim(), createdAt: Date.now() };
    const updated = [note, ...notes];
    setNotes(updated);
    persistNotes(updated);
    flash(setSavedFlash);
  }, [text, notes]);

  const deleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    persistNotes(updated);
  };

  /** Put text in the box (from history, a note or a template) and close the panel. */
  const loadText = (value: string) => {
    setText(value);
    setPanel(null);
    textareaRef.current?.focus();
  };

  const focus = useCallback(() => textareaRef.current?.focus(), []);
  const close = useCallback(() => setIsOpen(false), []);
  const isFocused = useCallback(() => document.activeElement === textareaRef.current, []);

  useImperativeHandle(ref, () => ({
    toggle,
    send,
    copy,
    focus,
    close,
    saveNote,
    isFocused,
    get isOpen() { return isOpen; },
  }), [toggle, send, copy, focus, close, saveNote, isFocused, isOpen]);

  // Focus on reopen, but not on the initial mount.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isOpen) textareaRef.current?.focus();
  }, [isOpen]);

  const deleteHistoryItem = (idx: number) => {
    const newHistory = history.filter((_, i) => i !== idx);
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  if (!isOpen) return null;

  const effectiveHeight = panel ? Math.max(height, 320) : height;

  return (
    <div
      data-scratchpad
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
        height: `${effectiveHeight}px`,
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          position: "absolute",
          top: "-3px",
          left: 0,
          right: 0,
          height: "6px",
          cursor: "row-resize",
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget.firstChild as HTMLElement).style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget.firstChild as HTMLElement).style.opacity = "0";
        }}
      >
        <div style={{
          width: "40px",
          height: "3px",
          borderRadius: "2px",
          backgroundColor: "var(--text-muted)",
          margin: "2px auto 0",
          opacity: 0,
          transition: "opacity 0.15s",
        }} />
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2V14M2 8H14" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            Thoughts
          </span>
          <button
            onClick={() => togglePanel("history")}
            style={headerToggleStyle(panel === "history")}
            onMouseEnter={(e) => {
              if (panel !== "history") e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (panel !== "history") e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 4V8L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            History ({history.length})
          </button>
          <button
            onClick={() => togglePanel("notes")}
            style={headerToggleStyle(panel === "notes")}
            onMouseEnter={(e) => {
              if (panel !== "notes") e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (panel !== "notes") e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5.5 5.5H10.5M5.5 8H10.5M5.5 10.5H8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Notes ({notes.length})
          </button>
          <button
            onClick={() => togglePanel("templates")}
            style={headerToggleStyle(panel === "templates")}
            onMouseEnter={(e) => {
              if (panel !== "templates") e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (panel !== "templates") e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M2 3H14M2 7H10M2 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Templates
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            {SEND_KEY} send &nbsp; {SAVE_KEY} save &nbsp; esc close
          </span>
          <button
            onClick={() => setIsOpen(false)}
            title="Close scratchpad"
            aria-label="Close scratchpad"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px",
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {panel === "history" && (
        <div style={LIST_PANEL_STYLE}>
          {history.length === 0 ? (
            <div style={LIST_EMPTY_STYLE}>
              No prompts saved yet. Sent prompts will appear here.
            </div>
          ) : (
            history.map((item, idx) => (
              <div key={idx} style={LIST_ROW_STYLE} {...rowHover} onClick={() => loadText(item)}>
                <span style={LIST_ROW_TEXT_STYLE}>
                  {item}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteHistoryItem(idx); }}
                  style={ROW_DELETE_STYLE}
                  {...rowDeleteHover}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {panel === "notes" && (
        <div style={LIST_PANEL_STYLE}>
          {notes.length === 0 ? (
            <div style={LIST_EMPTY_STYLE}>
              No notes saved yet. Press {SAVE_KEY} to save the current text as a note.
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} style={LIST_ROW_STYLE} {...rowHover} onClick={() => loadText(note.text)}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                  <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <span style={LIST_ROW_TEXT_STYLE}>
                  {note.text}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, opacity: 0.5 }}>
                  {new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  style={ROW_DELETE_STYLE}
                  {...rowDeleteHover}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {panel === "templates" && (
        <div style={{ ...LIST_PANEL_STYLE, maxHeight: "160px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "8px 12px" }}>
            {PROMPT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                onClick={() => loadText(tmpl.prompt)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.borderColor = "var(--accent)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <span style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: CATEGORY_COLORS[tmpl.category] ?? "var(--text-muted)",
                  backgroundColor: (CATEGORY_COLORS[tmpl.category] ?? "var(--text-muted)") + "20",
                  padding: "1px 4px",
                  borderRadius: "3px",
                }}>
                  {tmpl.category}
                </span>
                {tmpl.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "8px 12px", gap: "8px", minHeight: 0 }}>
        {hints.length > 0 && !hintsHidden && !pasteOffer && (
          <div className="prompt-hints" role="note" aria-label="Prompt tips">
            <span className="prompt-hints__label">Tip</span>
            <span>{hints.slice(0, 2).map((h) => h.message).join(" ")}</span>
            <button onClick={() => setHintsHidden(true)} aria-label="Hide prompt tips" title="Hide tips for this draft">✕</button>
          </div>
        )}
        {pasteOffer && (
          <div className="compact-offer" role="status">
            <span>
              Pasted about {fmtInt(pasteOffer.result.before)} tokens. Compacted: about{" "}
              <b>{fmtInt(pasteOffer.result.after)}</b> (colors, progress bars and repeated lines removed
              {pasteOffer.result.text.includes("lines omitted") ? ", long middle trimmed to errors and warnings" : ""}).
            </span>
            <button
              className="compact-offer__apply"
              onClick={() => {
                const { original, at, result } = pasteOffer;
                setText((t) => {
                  // Where it was pasted; failing that (the draft was edited), its first copy.
                  const i = t.startsWith(original, at) ? at : t.indexOf(original);
                  return i < 0 ? t : t.slice(0, i) + result.text + t.slice(i + original.length);
                });
                setPasteOffer(null);
              }}
            >
              Compact paste
            </button>
            <button className="compact-offer__dismiss" onClick={() => setPasteOffer(null)} aria-label="Keep the paste as is">Keep</button>
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Linux: plain Ctrl+Enter and Ctrl+S work here too. The
            // Ctrl+Shift forms exist because the terminal needs plain Ctrl;
            // in this text box nothing else wants them.
            const plainCtrl = (key: string) =>
              !IS_MAC && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && keyName(e.nativeEvent) === key;
            // Escape: hand focus back to the terminal
            if (e.key === "Escape") {
              e.preventDefault();
              textareaRef.current?.blur();
              const xtermEl = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
              xtermEl?.focus();
            }
            // ⌘↵: send to terminal (or run chain)
            if (matches(e.nativeEvent, SHORTCUTS.send) || plainCtrl("Enter")) {
              e.preventDefault();
              e.stopPropagation(); // prevent global handler from firing too
              if (isChain) sendChain();
              else send();
            }
            // ⌘⇧↵: copy to clipboard
            if (matches(e.nativeEvent, SHORTCUTS.copy)) {
              e.preventDefault();
              e.stopPropagation();
              copy();
            }
            // ⌘E: send Enter to terminal
            if (matches(e.nativeEvent, SHORTCUTS.sendEnter)) {
              e.preventDefault();
              e.stopPropagation();
              sendEnter();
            }
            // ⌘S: save as note
            if (matches(e.nativeEvent, SHORTCUTS.saveNote) || plainCtrl("s")) {
              e.preventDefault();
              e.stopPropagation();
              saveNote();
            }
            // Cmd+Arrow keys left free for standard text editing (home/end of line)
          }}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          placeholder={`Type your thoughts here... ${SEND_KEY} to send to terminal. Use --- to chain multiple prompts.`}
          style={{
            flex: 1,
            resize: "none",
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            outline: "none",
            padding: "10px 12px",
            fontSize: "13px",
            lineHeight: "1.5",
            color: "var(--text-primary)",
            fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-subtle)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />

        {/* Pasted images preview */}
        {pastedImages.length > 0 && (
          <div style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            flexShrink: 0,
          }}>
            {pastedImages.map((img) => (
              <div
                key={img.id}
                style={{
                  position: "relative",
                  width: "64px",
                  height: "64px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <img
                  src={img.dataUrl}
                  alt="Pasted"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <button
                  onClick={() => removeImage(img.id)}
                  style={{
                    position: "absolute",
                    top: "2px",
                    right: "2px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    border: "none",
                    backgroundColor: "rgba(0,0,0,0.7)",
                    color: "#fff",
                    fontSize: "10px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
                <div style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  fontSize: "8px",
                  padding: "1px 4px",
                  textAlign: "center",
                  fontFamily: "monospace",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {img.tempPath.split("/").pop()}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chain progress bar */}
        {chainRunning && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 12px",
            backgroundColor: "var(--accent-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--accent)",
            flexShrink: 0,
          }}>
            <div style={{
              flex: 1,
              height: "4px",
              backgroundColor: "var(--bg-elevated)",
              borderRadius: "2px",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${(chainStep / chainTotal) * 100}%`,
                backgroundColor: "var(--accent)",
                transition: "width 0.5s ease",
                borderRadius: "2px",
              }} />
            </div>
            <span style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--accent)",
              fontFamily: "monospace",
              whiteSpace: "nowrap",
            }}>
              Step {chainStep}/{chainTotal}
            </span>
            <button
              onClick={cancelChain}
              style={{
                padding: "3px 10px",
                borderRadius: "var(--radius-sm)",
                fontSize: "11px",
                fontWeight: 500,
                border: "1px solid #ef4444",
                cursor: "pointer",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button
            onClick={isChain ? sendChain : send}
            disabled={chainRunning}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 600,
              border: "none",
              cursor: chainRunning ? "not-allowed" : "pointer",
              backgroundColor: sent ? "var(--green)" : chainRunning ? "var(--bg-elevated)" : isChain ? "#8b5cf6" : "var(--accent)",
              color: chainRunning ? "var(--text-muted)" : "#fff",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              opacity: chainRunning ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!sent && !chainRunning) e.currentTarget.style.filter = "brightness(1.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none";
            }}
          >
            {sent ? "Sent!" : isChain ? (
              <>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4H13M3 8H13M3 12H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="7" cy="4" r="1.5" fill="currentColor"/>
                  <circle cx="10" cy="8" r="1.5" fill="currentColor"/>
                  <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
                </svg>
                Run Chain ({chainSteps.length} steps)
              </>
            ) : "Send to Terminal"}
          </button>
          <button
            onClick={copy}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              backgroundColor: copied ? "var(--green-subtle)" : "var(--bg-elevated)",
              color: copied ? "var(--green)" : "var(--text-secondary)",
            }}
            {...secondaryHover(copied)}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={saveNote}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              backgroundColor: savedFlash ? "var(--green-subtle)" : "var(--bg-elevated)",
              color: savedFlash ? "var(--green)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            {...secondaryHover(savedFlash)}
            title={`Save as note (${SAVE_KEY})`}
          >
            {savedFlash ? "Saved!" : "Save"}
            <kbd style={KBD_STYLE}>{SAVE_KEY}</kbd>
          </button>
          <button
            onClick={sendEnter}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius-sm)",
              fontSize: "12px",
              fontWeight: 500,
              border: "1px solid var(--border-strong)",
              cursor: "pointer",
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            {...secondaryHover()}
            title={`Send Enter to terminal (${shortcutLabel("sendEnter")})`}
          >
            Send ↵
            <kbd style={KBD_STYLE}>{shortcutLabel("sendEnter")}</kbd>
          </button>
          {speechAvailable && (
            <button
              onClick={toggleVoice}
              style={{
                padding: "6px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: "12px",
                fontWeight: 500,
                border: isListening ? "1px solid #ef4444" : "1px solid var(--border-strong)",
                cursor: "pointer",
                backgroundColor: isListening ? "rgba(239, 68, 68, 0.15)" : "var(--bg-elevated)",
                color: isListening ? "#ef4444" : "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                animation: isListening ? "voice-pulse 1.5s ease-in-out infinite" : "none",
              }}
              {...secondaryHover(isListening)}
              title={isListening ? "Stop listening" : "Start voice dictation"}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="5.5" y="1" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M3 7.5C3 10.2614 5.23858 12.5 8 12.5C10.7614 12.5 13 10.2614 13 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M8 12.5V15M6 15H10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {isListening ? "Listening..." : "Voice"}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {isListening && (
              <span style={{ color: "#ef4444", marginRight: "8px" }}>
                ● REC
              </span>
            )}
            {undo && undo.after === text ? (
              <button className="deslop-btn" onClick={() => { setText(undo.before); setUndo(null); }} title="Put the text back as it was">
                Undo de-slop
              </button>
            ) : cleaned.changes > 0 && settled === text && (
              <button
                className="deslop-btn"
                onClick={() => { setUndo({ before: text, after: cleaned.text }); setText(cleaned.text); }}
                title="Swap AI-sounding words for plain ones and drop filler phrases. For a full rewrite, ask the agent: /ade:deslop"
              >
                De-slop ({cleaned.changes})
              </button>
            )}
            {text.length > 0 && (
              <span className="token-count" data-level={tokens >= 20_000 ? "high" : tokens >= 4_000 ? "medium" : "ok"} title="Rough estimate: about 4 characters per token">
                ~{fmtInt(tokens)} tokens · {fmtInt(text.length)} chars
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
});

Scratchpad.displayName = "Scratchpad";
export default Scratchpad;

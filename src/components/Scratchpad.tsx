import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { invoke } from "@tauri-apps/api/core";
import { readImage } from "@tauri-apps/plugin-clipboard-manager";
import { useTabStore } from "../stores/tabStore";
import { isPaneActive } from "../hooks/useTerminal";

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

const Scratchpad = forwardRef<ScratchpadHandle>((_props, ref) => {
  const [isOpen, setIsOpen] = useState(true);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [notes, setNotes] = useState<SavedNote[]>(loadNotes);
  const [showNotes, setShowNotes] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
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

  // Check if Speech Recognition is available
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
      // Append finalized text + show interim preview
      setText((prev) => {
        const base = prev.endsWith("\n") || prev === "" ? prev : prev + " ";
        const finalized = finalTranscript;
        return base + finalized + (interim ? interim : "");
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Clean up: commit any final transcript
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
  }, [isListening, speechAvailable]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  // Drag-to-resize handler — also handle blur/visibility to clean up interrupted drags
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
      const newHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta));
      setHeight(newHeight);
    };

    const onUp = () => cleanup();

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", cleanup);
    document.addEventListener("visibilitychange", cleanup);
  }, [height]);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const sendEnter = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;
    const data = Array.from(new TextEncoder().encode("\r"));
    await invoke("write_pty", { id: ptyId, data }).catch(() => {});
  }, [getActivePtyId]);

  // Save image from base64 data
  const saveImageFromBase64 = useCallback(async (base64: string, ext: string = "png") => {
    try {
      const tempPath = await invoke<string>("save_temp_image", {
        base64Data: base64,
        extension: ext,
      });
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const dataUrl = `data:image/${ext};base64,${base64}`;
      setPastedImages((prev) => [...prev, { id, dataUrl, tempPath }]);
    } catch (err) {
      console.error("Failed to save image:", err);
    }
  }, []);

  // Save image from a File/Blob (drag-and-drop)
  const saveImageBlob = useCallback(async (blob: File | Blob) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const ext = blob.type?.split("/")[1]?.replace("jpeg", "jpg") || "png";
      await saveImageFromBase64(base64, ext);
    };
    reader.readAsDataURL(blob);
  }, [saveImageFromBase64]);

  // Paste from clipboard using Tauri clipboard plugin
  const pasteImageFromClipboard = useCallback(async () => {
    try {
      const img = await readImage();
      // readImage returns an Image object with rgba() and size()
      const rgba = await img.rgba();
      const width = (img as unknown as { width: number }).width;
      const height = (img as unknown as { height: number }).height;

      // Convert RGBA to PNG using canvas
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
      ctx.putImageData(imageData, 0, 0);

      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];
      await saveImageFromBase64(base64, "png");
      return true;
    } catch {
      // No image in clipboard — that's fine
      return false;
    }
  }, [saveImageFromBase64]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;

    // First try standard web clipboard (for files dragged/pasted from browser)
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

    // Fallback: use Tauri clipboard plugin (handles macOS screenshots, system copies)
    // Only try if the paste event didn't have text content
    const hasText = clipboardData?.types?.includes("text/plain");
    if (!hasText) {
      e.preventDefault();
      const success = await pasteImageFromClipboard();
      if (!success) {
        // No image found anywhere — let the default paste behavior happen
        // (but we already prevented default, so nothing happens)
      }
    }
  }, [saveImageBlob, pasteImageFromClipboard]);

  // Handle drag-and-drop of image files
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

  const send = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) {
      console.warn("No active PTY to send to");
      return;
    }
    // If empty and no images, just send Enter to the terminal
    if (!text.trim() && pastedImages.length === 0) {
      await sendEnter();
      return;
    }

    // Build the command — if images are attached, include them as file paths
    let fullText = text;
    if (pastedImages.length > 0) {
      const imagePaths = pastedImages.map((img) => img.tempPath).join(" ");
      // Prepend image paths for Claude to read
      fullText = fullText.trim()
        ? `${fullText.trim()} ${imagePaths}`
        : imagePaths;
    }

    // Append \r (carriage return) to simulate pressing Enter in the terminal
    const textWithNewline = fullText + "\r";
    const data = Array.from(new TextEncoder().encode(textWithNewline));
    try {
      await invoke("write_pty", { id: ptyId, data });
    } catch (err) {
      console.error("write_pty failed:", err);
      return;
    }

    // Save to history (text only, not image paths)
    if (text.trim()) {
      const newHistory = [text.trim(), ...history.filter((h) => h !== text.trim())];
      setHistory(newHistory);
      saveHistory(newHistory);
    }

    setSent(true);
    setTimeout(() => setSent(false), 1500);
    setText("");
    setPastedImages([]);
  }, [text, pastedImages, getActivePtyId, history, sendEnter]);

  // Detect if text contains chain separators
  const chainSteps = text.split(/\n---\n/).filter((s) => s.trim());
  const isChain = chainSteps.length > 1;

  const sendChain = useCallback(async () => {
    const ptyId = getActivePtyId();
    if (ptyId === null) return;

    const steps = text.split(/\n---\n/).filter((s) => s.trim());
    if (steps.length <= 1) {
      // Not a chain — use normal send
      send();
      return;
    }

    // Get the active pane ID for activity polling
    const activePane = useTabStore.getState().getActivePane();
    if (!activePane) return;

    setChainRunning(true);
    setChainTotal(steps.length);
    setChainStep(0);
    chainCancelledRef.current = false;

    // Save the full chain to history
    if (text.trim()) {
      const newHistory = [text.trim(), ...history.filter((h) => h !== text.trim())];
      setHistory(newHistory);
      saveHistory(newHistory);
    }

    for (let i = 0; i < steps.length; i++) {
      if (chainCancelledRef.current) break;

      setChainStep(i + 1);
      const step = steps[i].trim();

      // Send the step
      const stepData = Array.from(new TextEncoder().encode(step + "\r"));
      try {
        await invoke("write_pty", { id: ptyId, data: stepData });
      } catch {
        break;
      }

      // Wait for the agent to finish processing (if not last step)
      if (i < steps.length - 1 && !chainCancelledRef.current) {
        // First wait a moment for output to start
        await new Promise((r) => setTimeout(r, 2000));

        // Then poll until the pane is idle (no output for 3s)
        let idleChecks = 0;
        const maxWait = 600; // 10 minutes max (600 * 1s)
        while (idleChecks < maxWait && !chainCancelledRef.current) {
          await new Promise((r) => setTimeout(r, 1000));
          if (!isPaneActive(activePane.id)) {
            // Pane idle — wait one more second to be safe
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
      setSent(true);
      setTimeout(() => setSent(false), 1500);
    }
  }, [text, getActivePtyId, history, send]);

  const cancelChain = useCallback(() => {
    chainCancelledRef.current = true;
    setChainRunning(false);
    setChainStep(0);
    setChainTotal(0);
  }, []);

  const copy = useCallback(async () => {
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  const saveNote = useCallback(() => {
    if (!text.trim()) return;
    const note: SavedNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text.trim(),
      createdAt: Date.now(),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    persistNotes(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }, [text, notes]);

  const deleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    persistNotes(updated);
  };

  const loadNote = (note: SavedNote) => {
    setText(note.text);
    setShowNotes(false);
    textareaRef.current?.focus();
  };

  const focus = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const isFocused = useCallback(() => {
    return document.activeElement === textareaRef.current;
  }, []);

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

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const deleteHistoryItem = (idx: number) => {
    const newHistory = history.filter((_, i) => i !== idx);
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  const useHistoryItem = (item: string) => {
    setText(item);
    setShowHistory(false);
    textareaRef.current?.focus();
  };

  if (!isOpen) return null;

  const effectiveHeight = (showHistory || showNotes || showTemplates) ? Math.max(height, 320) : height;

  return (
    <div
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
            onClick={() => { setShowHistory(!showHistory); if (showNotes) setShowNotes(false); if (showTemplates) setShowTemplates(false); }}
            style={{
              background: showHistory ? "var(--accent-subtle)" : "none",
              border: "1px solid var(--border)",
              color: showHistory ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!showHistory) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!showHistory) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M8 4V8L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            History ({history.length})
          </button>
          <button
            onClick={() => { setShowNotes(!showNotes); if (showHistory) setShowHistory(false); if (showTemplates) setShowTemplates(false); }}
            style={{
              background: showNotes ? "var(--accent-subtle)" : "none",
              border: "1px solid var(--border)",
              color: showNotes ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!showNotes) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!showNotes) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M5.5 5.5H10.5M5.5 8H10.5M5.5 10.5H8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            Notes ({notes.length})
          </button>
          <button
            onClick={() => { setShowTemplates(!showTemplates); if (showHistory) setShowHistory(false); if (showNotes) setShowNotes(false); }}
            style={{
              background: showTemplates ? "var(--accent-subtle)" : "none",
              border: "1px solid var(--border)",
              color: showTemplates ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              fontSize: "11px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            onMouseEnter={(e) => {
              if (!showTemplates) e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
            }}
            onMouseLeave={(e) => {
              if (!showTemplates) e.currentTarget.style.backgroundColor = "transparent";
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
            ⌘↵ send &nbsp; ⌘S save &nbsp; ⌘←→ panels &nbsp; esc close
          </span>
          <button
            onClick={() => setIsOpen(false)}
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

      {/* History panel */}
      {showHistory && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "140px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {history.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
              No prompts saved yet. Sent prompts will appear here.
            </div>
          ) : (
            history.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => useHistoryItem(item)}
              >
                <span style={{ flex: 1, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteHistoryItem(idx); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Notes panel */}
      {showNotes && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "140px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {notes.length === 0 ? (
            <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
              No notes saved yet. Press ⌘S to save the current text as a note.
            </div>
          ) : (
            notes.map((note) => (
              <div
                key={note.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 16px",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => loadNote(note)}
              >
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                  <path d="M4 2H12C12.5523 2 13 2.44772 13 3V13C13 13.5523 12.5523 14 12 14H4C3.44772 14 3 13.5523 3 13V3C3 2.44772 3.44772 2 4 2Z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <span style={{ flex: 1, fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {note.text}
                </span>
                <span style={{ fontSize: "10px", color: "var(--text-muted)", flexShrink: 0, opacity: 0.5 }}>
                  {new Date(note.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "2px 4px",
                    borderRadius: "3px",
                    fontSize: "10px",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Templates panel */}
      {showTemplates && (
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            maxHeight: "160px",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "8px 12px" }}>
            {PROMPT_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                onClick={() => {
                  setText(tmpl.prompt);
                  setShowTemplates(false);
                  textareaRef.current?.focus();
                }}
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
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            const meta = e.metaKey || e.ctrlKey;
            // Escape: switch focus to terminal (don't close scratchpad)
            if (e.key === "Escape") {
              e.preventDefault();
              // Blur the textarea — focus will return to terminal
              textareaRef.current?.blur();
              // Find and focus the active terminal
              const xtermEl = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
              xtermEl?.focus();
            }
            // Cmd+Enter: send to terminal (or run chain)
            if (meta && !e.shiftKey && e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation(); // prevent global handler from firing too
              if (isChain) {
                sendChain();
              } else {
                send();
              }
            }
            // Cmd+Shift+Enter: copy to clipboard
            if (meta && e.shiftKey && e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              copy();
            }
            // Cmd+E: send Enter to terminal
            if (meta && !e.shiftKey && e.key === "e") {
              e.preventDefault();
              e.stopPropagation();
              sendEnter();
            }
            // Cmd+S: save as note
            if (meta && !e.shiftKey && e.key === "s") {
              e.preventDefault();
              e.stopPropagation();
              saveNote();
            }
            // Cmd+Arrow Left/Right: cycle through History / Notes / Templates
            const panels = ["history", "notes", "templates"] as const;
            if (meta && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
              e.preventDefault();
              e.stopPropagation();
              const current = showHistory ? 0 : showNotes ? 1 : showTemplates ? 2 : -1;
              const dir = e.key === "ArrowRight" ? 1 : -1;
              const next = current === -1
                ? (e.key === "ArrowRight" ? 0 : 2)
                : (current + dir + panels.length) % panels.length;
              // If clicking same panel, close it
              if (current === next) {
                setShowHistory(false);
                setShowNotes(false);
                setShowTemplates(false);
              } else {
                setShowHistory(next === 0);
                setShowNotes(next === 1);
                setShowTemplates(next === 2);
              }
            }
          }}
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          placeholder="Type your thoughts here... ⌘+Enter to send to terminal. Use --- to chain multiple prompts."
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
            onMouseEnter={(e) => {
              if (!copied) {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!copied) {
                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
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
            onMouseEnter={(e) => {
              if (!savedFlash) {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!savedFlash) {
                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }
            }}
            title="Save as note (⌘S)"
          >
            {savedFlash ? "Saved!" : "Save"}
            <kbd style={{ fontSize: "10px", opacity: 0.5, fontFamily: "monospace" }}>⌘S</kbd>
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
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title="Send Enter to terminal (⌘E)"
          >
            Send ↵
            <kbd style={{ fontSize: "10px", opacity: 0.5, fontFamily: "monospace" }}>⌘E</kbd>
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
              onMouseEnter={(e) => {
                if (!isListening) {
                  e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isListening) {
                  e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
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
            {text.length > 0 ? `${text.length} chars` : ""}
          </span>
        </div>
      </div>
    </div>
  );
});

Scratchpad.displayName = "Scratchpad";
export default Scratchpad;

import { create } from "zustand";
import { setRecordingTap, getTerminalDimensions } from "./useTerminal";
import { readJson } from "../lib/storage";

export interface RecordingEvent {
  t: number; // relative ms from start
  d: string; // base64 encoded data
}

export interface TerminalRecording {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  cols: number;
  rows: number;
  events: RecordingEvent[];
}

interface RecordingState {
  activeRecordings: Map<string, {
    startTime: number;
    events: RecordingEvent[];
    cols: number;
    rows: number;
  }>;
  recordings: TerminalRecording[];

  startRecording: (paneId: string) => void;
  stopRecording: (paneId: string, name?: string) => TerminalRecording | null;
  isRecording: (paneId: string) => boolean;
  loadRecordings: () => void;
  deleteRecording: (id: string) => void;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const STORAGE_KEY = "ade-recordings-index";
const REC_PREFIX = "ade-rec-";

const readIndex = () => readJson<string[]>(STORAGE_KEY, []);

function saveRecordingToStorage(rec: TerminalRecording) {
  try {
    localStorage.setItem(REC_PREFIX + rec.id, JSON.stringify(rec));
    const index = readIndex();
    if (!index.includes(rec.id)) {
      index.push(rec.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(index));
    }
  } catch {
    // Storage full
  }
}

function loadRecordingsFromStorage(): TerminalRecording[] {
  try {
    const recordings: TerminalRecording[] = [];
    for (const id of readIndex()) {
      const data = localStorage.getItem(REC_PREFIX + id);
      if (data) {
        recordings.push(JSON.parse(data));
      }
    }
    return recordings.sort((a, b) => b.startTime - a.startTime);
  } catch {
    return [];
  }
}

function removeRecordingFromStorage(id: string) {
  localStorage.removeItem(REC_PREFIX + id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readIndex().filter((i) => i !== id)));
  } catch {
    // Storage full
  }
}

export const useRecordingStore = create<RecordingState>((set, get) => {
  setRecordingTap((paneId, data) => {
    const recording = get().activeRecordings.get(paneId);
    recording?.events.push({ t: Date.now() - recording.startTime, d: toBase64(data) });
  });

  return {
    activeRecordings: new Map(),
    recordings: [],

    startRecording: (paneId) => {
      const dims = getTerminalDimensions(paneId);
      const cols = dims?.cols || 80;
      const rows = dims?.rows || 24;
      set((state) => ({
        activeRecordings: new Map(state.activeRecordings).set(paneId, { startTime: Date.now(), events: [], cols, rows }),
      }));
    },

    stopRecording: (paneId, name) => {
      const recording = get().activeRecordings.get(paneId);
      if (!recording) return null;

      const rec: TerminalRecording = {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name || `Recording ${new Date().toLocaleString()}`,
        startTime: recording.startTime,
        duration: Date.now() - recording.startTime,
        cols: recording.cols,
        rows: recording.rows,
        events: recording.events,
      };

      set((state) => {
        const newMap = new Map(state.activeRecordings);
        newMap.delete(paneId);
        return {
          activeRecordings: newMap,
          recordings: [...state.recordings, rec],
        };
      });

      saveRecordingToStorage(rec);
      return rec;
    },

    isRecording: (paneId) => get().activeRecordings.has(paneId),

    loadRecordings: () => set({ recordings: loadRecordingsFromStorage() }),

    deleteRecording: (id) => {
      removeRecordingFromStorage(id);
      set((state) => ({
        recordings: state.recordings.filter((r) => r.id !== id),
      }));
    },
  };
});

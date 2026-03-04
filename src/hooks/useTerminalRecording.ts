import { create } from "zustand";
import { setRecordingTap, getTerminalDimensions } from "./useTerminal";

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

function saveRecordingToStorage(rec: TerminalRecording) {
  try {
    localStorage.setItem(REC_PREFIX + rec.id, JSON.stringify(rec));
    // Update index
    const index: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
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
    const index: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    const recordings: TerminalRecording[] = [];
    for (const id of index) {
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
    const index: string[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(index.filter((i) => i !== id)));
  } catch {
    // ignore
  }
}

export const useRecordingStore = create<RecordingState>((set, get) => {
  // Install the global recording tap
  setRecordingTap((paneId: string, data: Uint8Array) => {
    const state = get();
    const recording = state.activeRecordings.get(paneId);
    if (!recording) return;

    const t = Date.now() - recording.startTime;
    const d = toBase64(data);
    recording.events.push({ t, d });
  });

  return {
    activeRecordings: new Map(),
    recordings: [],

    startRecording: (paneId: string) => {
      const dims = getTerminalDimensions(paneId);
      const cols = dims?.cols || 80;
      const rows = dims?.rows || 24;

      set((state) => {
        const newMap = new Map(state.activeRecordings);
        newMap.set(paneId, {
          startTime: Date.now(),
          events: [],
          cols,
          rows,
        });
        return { activeRecordings: newMap };
      });
    },

    stopRecording: (paneId: string, name?: string) => {
      const state = get();
      const recording = state.activeRecordings.get(paneId);
      if (!recording) return null;

      const id = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = Date.now() - recording.startTime;

      const rec: TerminalRecording = {
        id,
        name: name || `Recording ${new Date().toLocaleString()}`,
        startTime: recording.startTime,
        duration,
        cols: recording.cols,
        rows: recording.rows,
        events: recording.events,
      };

      // Remove from active
      set((state) => {
        const newMap = new Map(state.activeRecordings);
        newMap.delete(paneId);
        return {
          activeRecordings: newMap,
          recordings: [...state.recordings, rec],
        };
      });

      // Save to localStorage
      saveRecordingToStorage(rec);
      return rec;
    },

    isRecording: (paneId: string) => {
      return get().activeRecordings.has(paneId);
    },

    loadRecordings: () => {
      const recordings = loadRecordingsFromStorage();
      set({ recordings });
    },

    deleteRecording: (id: string) => {
      removeRecordingFromStorage(id);
      set((state) => ({
        recordings: state.recordings.filter((r) => r.id !== id),
      }));
    },
  };
});

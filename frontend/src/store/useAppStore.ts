import { create } from "zustand";
import type {
  QAPhase,
  Report,
  Screenshot,
  LogEntry,
  RunStatus,
  SitemapUrl,
} from "@/lib/types";

export type AppStatus = "idle" | "running" | "completed" | "error";

interface PhaseState {
  status: "pending" | "active" | "completed";
}

interface AppState {
  // Run state
  status: AppStatus;
  currentRunId: string | null;
  error: string | null;

  // Timer
  startTime: number | null;
  elapsedSeconds: number;

  // Phases
  phases: Record<QAPhase, PhaseState>;

  // Progress
  currentStep: number;
  totalSteps: number;

  // Sitemap
  sitemapUrls: SitemapUrl[];
  sitemapSource: string | null;
  sitemapTotalPages: number;

  // Logs
  logs: LogEntry[];

  // Screenshots
  screenshots: Screenshot[];

  // Results
  report: Report | null;

  // History
  history: RunStatus[];
  selectedHistoryId: string | null;

  // Actions
  startRun: (runId: string) => void;
  setError: (error: string) => void;
  setPhaseActive: (phase: QAPhase) => void;
  setPhaseComplete: (phase: QAPhase) => void;
  setPlanCreated: (totalSteps: number) => void;
  setStepProgress: (current: number, total: number) => void;
  setSitemap: (urls: SitemapUrl[], source: string, totalPages: number) => void;
  addLog: (level: "info" | "warn" | "error", message: string) => void;
  addScreenshot: (screenshot: Screenshot) => void;
  setComplete: (report: Report) => void;
  reset: () => void;
  tick: () => void;

  // History actions
  setHistory: (runs: RunStatus[]) => void;
  addToHistory: (run: RunStatus) => void;
  updateHistoryItem: (
    runId: string,
    updates: Partial<Pick<RunStatus, "status" | "score">>
  ) => void;
  selectHistory: (runId: string | null) => void;
  loadHistoryRun: (run: RunStatus) => void;
}

const initialPhases: Record<QAPhase, PhaseState> = {
  init: { status: "pending" },
  discovery: { status: "pending" },
  planning: { status: "pending" },
  execution: { status: "pending" },
  traversal: { status: "pending" },
  evaluation: { status: "pending" },
};

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  status: "idle",
  currentRunId: null,
  error: null,
  startTime: null,
  elapsedSeconds: 0,
  phases: { ...initialPhases },
  currentStep: 0,
  totalSteps: 0,
  sitemapUrls: [],
  sitemapSource: null,
  sitemapTotalPages: 0,
  logs: [],
  screenshots: [],
  report: null,
  history: [],
  selectedHistoryId: null,

  // Actions
  startRun: (runId) =>
    set({
      status: "running",
      currentRunId: runId,
      error: null,
      startTime: Date.now(),
      elapsedSeconds: 0,
      phases: { ...initialPhases },
      currentStep: 0,
      totalSteps: 0,
      sitemapUrls: [],
      sitemapSource: null,
      sitemapTotalPages: 0,
      logs: [],
      screenshots: [],
      report: null,
      selectedHistoryId: null,
    }),

  setError: (error) =>
    set({
      status: "error",
      error,
      startTime: null,
    }),

  setPhaseActive: (phase) =>
    set((state) => ({
      phases: {
        ...state.phases,
        [phase]: { status: "active" },
      },
    })),

  setPhaseComplete: (phase) =>
    set((state) => ({
      phases: {
        ...state.phases,
        [phase]: { status: "completed" },
      },
    })),

  setPlanCreated: (totalSteps) =>
    set({
      totalSteps,
      currentStep: 0,
    }),

  setStepProgress: (current, total) =>
    set({
      currentStep: current,
      totalSteps: total,
    }),

  setSitemap: (urls, source, totalPages) =>
    set({
      sitemapUrls: urls,
      sitemapSource: source,
      sitemapTotalPages: totalPages,
    }),

  addLog: (level, message) =>
    set((state) => ({
      logs: [
        ...state.logs,
        {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          level,
          message,
          timestamp: new Date(),
        },
      ],
    })),

  addScreenshot: (screenshot) =>
    set((state) => ({
      screenshots: [...state.screenshots, screenshot],
    })),

  setComplete: (report) =>
    set({
      status: "completed",
      report,
      startTime: null,
    }),

  reset: () =>
    set({
      status: "idle",
      currentRunId: null,
      error: null,
      startTime: null,
      elapsedSeconds: 0,
      phases: { ...initialPhases },
      currentStep: 0,
      totalSteps: 0,
      sitemapUrls: [],
      sitemapSource: null,
      sitemapTotalPages: 0,
      logs: [],
      screenshots: [],
      report: null,
      selectedHistoryId: null,
    }),

  tick: () => {
    const { startTime } = get();
    if (startTime) {
      set({ elapsedSeconds: Math.floor((Date.now() - startTime) / 1000) });
    }
  },

  // History actions
  setHistory: (runs) => set({ history: runs }),

  addToHistory: (run) =>
    set((state) => ({
      history: [run, ...state.history],
    })),

  updateHistoryItem: (runId, updates) =>
    set((state) => ({
      history: state.history.map((run) =>
        run._id === runId ? { ...run, ...updates } : run
      ),
    })),

  selectHistory: (runId) => set({ selectedHistoryId: runId }),

  loadHistoryRun: (run) => {
    if (run.status === "completed" && run.report) {
      set({
        status: "completed",
        report: run.report,
        screenshots: run.screenshots || [],
        selectedHistoryId: run._id,
        error: null,
        logs: [],
        phases: { ...initialPhases },
      });
    } else if (run.status === "failed") {
      set({
        status: "error",
        error: run.error || "Test failed",
        selectedHistoryId: run._id,
      });
    }
  },
}));

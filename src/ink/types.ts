import type { Report, Evidence, Step, ExecutedStepStatus } from "../qa/types.js";
import type { QAPhase, SSEEvent, SitemapUrl } from "../qa/progress-types.js";

// App state machine
export type AppMode = "setup" | "input" | "running" | "complete" | "error";

// Task status for UI display
export type TaskStatus = "pending" | "running" | "success" | "failed" | "skipped";

// Individual task for display
export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  detail?: string;
  children?: Task[];
}

// Page testing progress
export interface PageProgress {
  url: string;
  pageIndex: number;
  status: TaskStatus;
  stepsExecuted?: number;
  error?: string;
}

// Main app state
export interface AppState {
  mode: AppMode;
  url: string;
  goals: string;

  // Phase tracking
  currentPhase: QAPhase | null;
  completedPhases: QAPhase[];

  // Task tracking
  tasks: Task[];

  // Sitemap discovery
  sitemap: SitemapUrl[];
  sitemapSource: string;

  // Page testing progress
  pages: PageProgress[];
  pagesProgress: {
    tested: number;
    skipped: number;
    remaining: number;
    total: number;
  };

  // Step execution
  currentStep: {
    index: number;
    step: Step;
    totalSteps: number;
  } | null;
  executedSteps: number;
  totalSteps: number;

  // Logs
  logs: Array<{
    message: string;
    level: "info" | "warn" | "error";
    timestamp: number;
  }>;
  logScrollOffset: number;

  // Results
  report: Report | null;
  evidence: Evidence | null;

  // Error state
  error: string | null;
}

// Initial state
export const initialState: AppState = {
  mode: "input",
  url: "",
  goals: "",
  currentPhase: null,
  completedPhases: [],
  tasks: [],
  sitemap: [],
  sitemapSource: "",
  pages: [],
  pagesProgress: {
    tested: 0,
    skipped: 0,
    remaining: 0,
    total: 0,
  },
  currentStep: null,
  executedSteps: 0,
  totalSteps: 0,
  logs: [],
  logScrollOffset: 0,
  report: null,
  evidence: null,
  error: null,
};

// Action types for reducer
export type AppAction =
  | { type: "SET_MODE"; mode: AppMode }
  | { type: "SET_URL"; url: string }
  | { type: "SET_GOALS"; goals: string }
  | { type: "START_RUN" }
  | { type: "PROCESS_EVENT"; event: SSEEvent }
  | { type: "SET_ERROR"; error: string }
  | { type: "RESET" }
  | { type: "SCROLL_LOGS"; delta: number };

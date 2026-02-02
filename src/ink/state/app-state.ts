import type { AppState, AppAction, Task, TaskStatus } from "../types.js";
import type { SSEEvent, QAPhase } from "../../qa/progress-types.js";
import { initialState } from "../types.js";

export const LOG_LINES = 6;

const phaseLabels: Record<QAPhase, string> = {
  init: "Initializing browser",
  discovery: "Discovering site structure",
  planning: "Creating test plan",
  traversal: "Testing pages",
  execution: "Executing additional tests",
  evaluation: "Evaluating results",
};

function createPhaseTask(phase: QAPhase, status: TaskStatus, detail?: string): Task {
  return {
    id: `phase-${phase}`,
    label: phaseLabels[phase],
    status,
    detail,
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_URL":
      return { ...state, url: action.url };

    case "SET_GOALS":
      return { ...state, goals: action.goals };

    case "SET_EXPLORATION_MODE":
      return { ...state, explorationMode: action.explorationMode };

    case "START_RUN":
      return {
        ...state,
        mode: "running",
        tasks: [],
        logs: [],
        logScrollOffset: 0,
        error: null,
        currentPhase: null,
        completedPhases: [],
        sitemap: [],
        pages: [],
        pagesProgress: { tested: 0, skipped: 0, remaining: 0, total: 0 },
        currentStep: null,
        executedSteps: 0,
        totalSteps: 0,
        report: null,
        evidence: null,
      };

    case "SET_ERROR":
      return { ...state, mode: "error", error: action.error };

    case "RESET":
      return { ...initialState, url: state.url, goals: state.goals, explorationMode: state.explorationMode };

    case "PROCESS_EVENT":
      return processEvent(state, action.event);

    case "SCROLL_LOGS": {
      const maxOffset = Math.max(0, state.logs.length - LOG_LINES);
      const newOffset = Math.max(0, Math.min(maxOffset, state.logScrollOffset + action.delta));
      return { ...state, logScrollOffset: newOffset };
    }

    default:
      return state;
  }
}

export function processEvent(state: AppState, event: SSEEvent): AppState {
  switch (event.type) {
    case "phase_start": {
      const newTasks = [...state.tasks];
      const existingIndex = newTasks.findIndex((t) => t.id === `phase-${event.phase}`);
      if (existingIndex >= 0) {
        newTasks[existingIndex] = createPhaseTask(event.phase, "running");
      } else {
        newTasks.push(createPhaseTask(event.phase, "running"));
      }
      return {
        ...state,
        currentPhase: event.phase,
        tasks: newTasks,
      };
    }

    case "phase_complete": {
      const newTasks = [...state.tasks];
      const existingIndex = newTasks.findIndex((t) => t.id === `phase-${event.phase}`);
      if (existingIndex >= 0) {
        newTasks[existingIndex] = createPhaseTask(event.phase, "success");
      }
      return {
        ...state,
        completedPhases: [...state.completedPhases, event.phase],
        tasks: newTasks,
      };
    }

    case "sitemap": {
      return {
        ...state,
        sitemap: event.urls,
        sitemapSource: event.source,
        pagesProgress: {
          ...state.pagesProgress,
          total: event.totalPages,
          remaining: event.totalPages,
        },
      };
    }

    case "plan_created": {
      return {
        ...state,
        totalSteps: event.totalSteps,
      };
    }

    case "page_start": {
      const newPages = [...state.pages];
      const existingIndex = newPages.findIndex((p) => p.pageIndex === event.pageIndex);
      if (existingIndex >= 0) {
        newPages[existingIndex] = {
          ...newPages[existingIndex],
          status: "running",
        };
      } else {
        newPages.push({
          url: event.url,
          pageIndex: event.pageIndex,
          status: "running",
        });
      }
      return { ...state, pages: newPages };
    }

    case "page_complete": {
      const newPages = [...state.pages];
      const existingIndex = newPages.findIndex((p) => p.pageIndex === event.pageIndex);
      const status: TaskStatus =
        event.status === "success" ? "success" : event.status === "skipped" ? "skipped" : "failed";
      if (existingIndex >= 0) {
        newPages[existingIndex] = {
          ...newPages[existingIndex],
          status,
          stepsExecuted: event.stepsExecuted,
          error: event.error,
        };
      }
      return { ...state, pages: newPages };
    }

    case "pages_progress": {
      return {
        ...state,
        pagesProgress: {
          tested: event.tested,
          skipped: event.skipped,
          remaining: event.remaining,
          total: event.total,
        },
      };
    }

    case "step_start": {
      return {
        ...state,
        currentStep: {
          index: event.stepIndex,
          step: event.step,
          totalSteps: event.totalSteps,
        },
      };
    }

    case "step_complete": {
      return {
        ...state,
        executedSteps: state.executedSteps + 1,
        currentStep: null,
      };
    }

    case "log": {
      const newLogs = [
        ...state.logs,
        {
          message: event.message,
          level: event.level,
          timestamp: event.timestamp,
        },
      ].slice(-50);
      const maxOffset = Math.max(0, newLogs.length - LOG_LINES);
      return { ...state, logs: newLogs, logScrollOffset: maxOffset };
    }

    case "complete": {
      return {
        ...state,
        mode: "complete",
        report: event.report,
        evidence: event.evidence,
      };
    }

    case "error": {
      return {
        ...state,
        mode: "error",
        error: event.message,
      };
    }

    default:
      return state;
  }
}

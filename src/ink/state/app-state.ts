import type { AppState, AppAction, Task, TaskStatus } from "../types.js";
import type { SSEEvent, QAPhase } from "../../qa/progress-types.js";
import { initialState } from "../types.js";

export const LOG_LINES = 6;

const phaseLabels: Record<QAPhase, string> = {
  discovery: "Discovering site pages",
  analysis: "Analyzing pages for test scenarios",
  execution: "Running test scenarios",
  evaluation: "Generating QA report",
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
        scenarios: [],
        totalScenarios: 0,
        report: null,
        evidence: null,
      };

    case "SET_ERROR":
      return { ...state, mode: "error", error: action.error };

    case "RESET":
      return { ...initialState, url: state.url, goals: state.goals };

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
      };
    }

    case "scenarios_generated": {
      return {
        ...state,
        totalScenarios: event.totalScenarios,
      };
    }

    case "scenario_start": {
      const newScenarios = [...state.scenarios];
      newScenarios.push({
        scenarioId: event.scenarioId,
        title: event.title,
        index: event.index,
        status: "running",
      });
      return { ...state, scenarios: newScenarios };
    }

    case "scenario_complete": {
      const newScenarios = [...state.scenarios];
      const idx = newScenarios.findIndex((s) => s.scenarioId === event.scenarioId);
      if (idx >= 0) {
        const status: TaskStatus =
          event.status === "pass" ? "success" : event.status === "fail" ? "failed" : "failed";
        newScenarios[idx] = { ...newScenarios[idx], status };
      }
      return { ...state, scenarios: newScenarios };
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

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

    case "SET_LOG_VIEW_LINES":
      return { ...state, logViewLines: Math.max(3, action.lines) };

    case "START_RUN":
      return {
        ...state,
        mode: "running",
        tasks: [],
        logs: [],
        logScrollOffset: 0,
        autoFollowLogs: true,
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

    case "PROCESS_EVENTS_BATCH": {
      let s = state;
      for (const event of action.events) {
        s = processEvent(s, event);
      }
      return s;
    }

    case "SCROLL_LOGS": {
      const maxOffset = Math.max(0, state.logs.length - state.logViewLines);
      const newOffset = Math.max(0, Math.min(maxOffset, state.logScrollOffset + action.delta));
      return { ...state, logScrollOffset: newOffset, autoFollowLogs: false };
    }

    case "JUMP_LOGS": {
      const maxOffset = Math.max(0, state.logs.length - state.logViewLines);
      if (action.position === "start") {
        return { ...state, logScrollOffset: 0, autoFollowLogs: false };
      }
      return { ...state, logScrollOffset: maxOffset, autoFollowLogs: true };
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
      const pendingScenarios = event.scenarios.map((s, i) => ({
        scenarioId: s.id,
        title: s.title,
        index: i,
        status: "pending" as const,
      }));
      return {
        ...state,
        totalScenarios: event.totalScenarios,
        scenarios: pendingScenarios,
      };
    }

    case "scenario_start": {
      const newScenarios = [...state.scenarios];
      const idx = newScenarios.findIndex((s) => s.scenarioId === event.scenarioId);
      if (idx >= 0) {
        newScenarios[idx] = { ...newScenarios[idx], status: "running" };
      } else {
        newScenarios.push({
          scenarioId: event.scenarioId,
          title: event.title,
          index: event.index,
          status: "running",
        });
      }
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
      const maxOffset = Math.max(0, newLogs.length - state.logViewLines);
      const nextOffset = state.autoFollowLogs
        ? maxOffset
        : Math.max(0, Math.min(maxOffset, state.logScrollOffset));
      return { ...state, logs: newLogs, logScrollOffset: nextOffset };
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

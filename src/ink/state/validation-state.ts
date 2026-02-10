import type React from "react";
import type { ValidateAppState, ValidateAppAction } from "../validate-types.js";
import { initialValidateState } from "../validate-types.js";
import type { SSEEvent } from "../../qa/progress-types.js";

export const LOG_LINES = 6;

export function validateAppReducer(
  state: ValidateAppState,
  action: ValidateAppAction
): ValidateAppState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "SET_SPEC_FILE":
      return { ...state, specFile: action.specFile };

    case "SET_URL":
      return { ...state, url: action.url };

    case "SET_LOG_VIEW_LINES":
      return { ...state, logViewLines: Math.max(3, action.lines) };

    case "START_RUN":
      return {
        ...state,
        mode: "running",
        currentPhase: null,
        completedPhases: [],
        requirements: [],
        rubric: null,
        sitemap: [],
        results: [],
        validatedCount: 0,
        logs: [],
        logScrollOffset: 0,
        autoFollowLogs: true,
        report: null,
        reportPath: null,
        markdownPath: null,
        error: null,
      };

    case "PROCESS_VALIDATION_PHASE_START":
      return { ...state, currentPhase: action.phase };

    case "PROCESS_VALIDATION_PHASE_COMPLETE":
      return {
        ...state,
        completedPhases: [...state.completedPhases, action.phase],
        currentPhase: null,
      };

    case "SET_REQUIREMENTS":
      return { ...state, requirements: action.requirements };

    case "SET_RUBRIC":
      return { ...state, rubric: action.rubric };

    case "SET_SITEMAP":
      return {
        ...state,
        sitemap: action.sitemap,
        pagesProgress: {
          ...state.pagesProgress,
          total: action.sitemap.length,
          remaining: action.sitemap.length,
        },
      };

    case "UPDATE_PAGES_PROGRESS":
      return { ...state, pagesProgress: action.progress };

    case "ADD_RESULT":
      return {
        ...state,
        results: [...state.results, action.result],
        validatedCount: action.index + 1,
      };

    case "SET_REPORT":
      return {
        ...state,
        mode: "complete",
        report: action.report,
        reportPath: action.reportPath,
        markdownPath: action.markdownPath,
      };

    case "ADD_LOG": {
      const newLogs = [
        ...state.logs,
        {
          message: action.message,
          level: action.level,
          timestamp: Date.now(),
        },
      ].slice(-50);
      const maxOffset = Math.max(0, newLogs.length - state.logViewLines);
      const nextOffset = state.autoFollowLogs
        ? maxOffset
        : Math.max(0, Math.min(maxOffset, state.logScrollOffset));
      return { ...state, logs: newLogs, logScrollOffset: nextOffset };
    }

    case "SET_ERROR":
      return { ...state, mode: "error", error: action.error };

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

    case "RESET":
      return {
        ...initialValidateState,
        specFile: state.specFile,
        url: state.url,
      };

    default:
      return state;
  }
}

export function processValidationEvent(
  event: SSEEvent,
  dispatch: React.Dispatch<ValidateAppAction>
): void {
  switch (event.type) {
    case "validation_phase_start":
      dispatch({
        type: "PROCESS_VALIDATION_PHASE_START",
        phase: event.phase,
      });
      break;

    case "validation_phase_complete":
      dispatch({
        type: "PROCESS_VALIDATION_PHASE_COMPLETE",
        phase: event.phase,
      });
      break;

    case "requirements_extracted":
      dispatch({
        type: "SET_REQUIREMENTS",
        requirements: event.requirements,
      });
      break;

    case "rubric_generated":
      dispatch({
        type: "SET_RUBRIC",
        rubric: event.rubric,
      });
      break;

    case "sitemap":
      dispatch({
        type: "SET_SITEMAP",
        sitemap: event.urls,
      });
      break;

    case "requirement_validated":
      dispatch({
        type: "ADD_RESULT",
        result: event.result,
        index: event.index,
        total: event.total,
      });
      break;

    case "validation_complete":
      dispatch({
        type: "SET_REPORT",
        report: event.report,
        reportPath: event.reportPath,
        markdownPath: event.markdownPath,
      });
      break;

    case "validation_error":
      dispatch({
        type: "SET_ERROR",
        error: event.message,
      });
      break;

    case "log":
      dispatch({
        type: "ADD_LOG",
        message: event.message,
        level: event.level,
      });
      break;

    default:
      break;
  }
}

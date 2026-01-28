/**
 * Main app component for validation mode
 */

import React, { useReducer, useEffect, useCallback, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type {
  ValidateAppState,
  ValidateAppAction,
  ValidateAppMode,
} from "./validate-types.js";
import { initialValidateState, validationPhaseLabels } from "./validate-types.js";
import type { SSEEvent } from "../qa/progress-types.js";
import type { ValidationPhase } from "../validation/types.js";
import { Header } from "./components/Header.js";
import { LogStream } from "./components/LogStream.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { SitemapDisplay } from "./components/SitemapDisplay.js";
import { RequirementList } from "./components/RequirementList.js";
import { RubricDisplay } from "./components/RubricDisplay.js";
import { ValidationProgress } from "./components/ValidationProgress.js";
import { TraceabilityReport } from "./components/TraceabilityReport.js";
import { useValidationRunner } from "./hooks/useValidationRunner.js";

interface ValidateAppProps {
  specFile: string;
  url: string;
  outputDir: string;
}

// Reducer for validation app state
function validateAppReducer(
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
      const maxOffset = Math.max(0, newLogs.length - LOG_LINES);
      return { ...state, logs: newLogs, logScrollOffset: maxOffset };
    }

    case "SET_ERROR":
      return { ...state, mode: "error", error: action.error };

    case "SCROLL_LOGS": {
      const maxOffset = Math.max(0, state.logs.length - LOG_LINES);
      const newOffset = Math.max(
        0,
        Math.min(maxOffset, state.logScrollOffset + action.delta)
      );
      return { ...state, logScrollOffset: newOffset };
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

// Process SSE events and dispatch appropriate actions
function processEvent(
  event: SSEEvent,
  dispatch: React.Dispatch<ValidateAppAction>
) {
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

    case "pages_progress":
      dispatch({
        type: "UPDATE_PAGES_PROGRESS",
        progress: {
          tested: event.tested,
          skipped: event.skipped,
          remaining: event.remaining,
          total: event.total,
        },
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
        reportPath: "", // Will be set by runner
        markdownPath: "",
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

    // Handle standard QA events that may also be emitted
    case "page_start":
    case "page_complete":
      // These are handled by pages_progress
      break;

    default:
      // Ignore other events
      break;
  }
}

const LOG_LINES = 6;

export function ValidateApp({
  specFile,
  url,
  outputDir,
}: ValidateAppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalHeight, setTerminalHeight] = useState(stdout.rows || 24);

  // Update terminal height on resize
  useEffect(() => {
    const handleResize = () => {
      setTerminalHeight(stdout.rows || 24);
    };
    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  const [state, dispatch] = useReducer(validateAppReducer, {
    ...initialValidateState,
    specFile,
    url,
  });

  // Event handler for validation runner
  const handleEvent = useCallback((event: SSEEvent) => {
    processEvent(event, dispatch);
  }, []);

  // Validation runner hook
  const { startRun, isRunning } = useValidationRunner(handleEvent);

  // Start validation automatically
  useEffect(() => {
    if (state.mode === "input" && specFile && url) {
      dispatch({ type: "START_RUN" });
      startRun(specFile, url, outputDir);
    }
  }, []);

  // Keyboard shortcuts
  useInput((input, key) => {
    // Quit on 'q' (except during running)
    if (input === "q" && state.mode !== "running") {
      exit();
    }

    // Retry on 'r' after error
    if (input === "r" && state.mode === "error") {
      dispatch({ type: "RESET" });
      dispatch({ type: "START_RUN" });
      startRun(specFile, url, outputDir);
    }

    // Scroll logs with arrow keys during running
    if (state.mode === "running") {
      if (key.upArrow) {
        dispatch({ type: "SCROLL_LOGS", delta: -1 });
      }
      if (key.downArrow) {
        dispatch({ type: "SCROLL_LOGS", delta: 1 });
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Header />

      <Box marginTop={1}>
        <Text dimColor>Validating: </Text>
        <Text color="cyan">{url}</Text>
        <Text dimColor> against </Text>
        <Text color="yellow">{specFile}</Text>
      </Box>

      {state.mode === "running" && (
        <Box flexDirection="column" marginTop={1}>
          <ValidationProgress
            currentPhase={state.currentPhase}
            completedPhases={state.completedPhases}
          />

          {state.requirements.length > 0 &&
            state.completedPhases.includes("extraction") && (
              <RequirementList
                requirements={state.requirements}
                maxHeight={5}
              />
            )}

          {state.rubric && state.completedPhases.includes("rubric") && (
            <RubricDisplay rubric={state.rubric} maxHeight={4} />
          )}

          {state.sitemap.length > 0 &&
            state.completedPhases.includes("discovery") && (
              <SitemapDisplay
                sitemap={state.sitemap}
                source="discovered"
                maxHeight={5}
              />
            )}

          {state.pagesProgress.total > 0 && (
            <Box marginTop={1}>
              <ProgressBar
                value={state.pagesProgress.tested + state.pagesProgress.skipped}
                total={state.pagesProgress.total}
                label="Pages"
              />
            </Box>
          )}

          {state.validatedCount > 0 && (
            <Box marginTop={1}>
              <ProgressBar
                value={state.validatedCount}
                total={state.requirements.length}
                label="Validating"
              />
            </Box>
          )}

          <LogStream
            logs={state.logs}
            scrollOffset={state.logScrollOffset}
            maxLines={LOG_LINES}
          />
        </Box>
      )}

      {state.mode === "complete" && state.report && (
        <TraceabilityReport
          report={state.report}
          reportPath={state.reportPath}
          markdownPath={state.markdownPath}
        />
      )}

      {state.mode === "error" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text color="red">{"[!]"}</Text>
            <Text> Error: {state.error}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Press 'r' to retry, 'q' to quit</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

import React, { useReducer, useEffect, useCallback, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { AppState, AppAction, AppMode, Task, TaskStatus } from "./types.js";
import { initialState } from "./types.js";
import type { SSEEvent, QAPhase } from "../qa/progress-types.js";
import type { UpdateInfo } from "../updates/types.js";
import { Header } from "./components/Header.js";
import { SetupPrompt } from "./components/SetupPrompt.js";
import { UrlInput } from "./components/UrlInput.js";
import { TaskList } from "./components/TaskList.js";
import { PhaseIndicator } from "./components/PhaseIndicator.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { LogStream } from "./components/LogStream.js";
import { ResultsSummary } from "./components/ResultsSummary.js";
import { SitemapDisplay } from "./components/SitemapDisplay.js";
import { UpdateNotification } from "./components/UpdateNotification.js";
import { useQARunner } from "./hooks/useQARunner.js";

interface AppProps {
  initialUrl?: string;
  initialGoals?: string;
  updateInfo?: UpdateInfo | null;
}

// Phase labels for display
const phaseLabels: Record<QAPhase, string> = {
  init: "Initializing browser",
  discovery: "Discovering site structure",
  planning: "Creating test plan",
  traversal: "Testing pages",
  execution: "Executing additional tests",
  evaluation: "Evaluating results",
};

// Create task from phase
function createPhaseTask(phase: QAPhase, status: TaskStatus, detail?: string): Task {
  return {
    id: `phase-${phase}`,
    label: phaseLabels[phase],
    status,
    detail,
  };
}

// Reducer for app state
function appReducer(state: AppState, action: AppAction): AppState {
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

// Process SSE events and update state
function processEvent(state: AppState, event: SSEEvent): AppState {
  switch (event.type) {
    case "phase_start": {
      const newTasks = [...state.tasks];
      // Add or update the phase task
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
      ].slice(-50); // Keep last 50 logs
      // Auto-scroll to bottom when new logs arrive
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

// Fixed heights for layout components to prevent terminal reflow
const HEADER_HEIGHT = 3; // Header + padding
const PHASE_HEIGHT = 2; // Phase indicator
const PROGRESS_HEIGHT = 2; // Progress bar
const LOG_HEADER_HEIGHT = 2; // "Logs" label + margin
const LOG_LINES = 6; // Visible log lines
const PADDING = 2; // Top/bottom padding

export function App({ initialUrl, initialGoals, updateInfo }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalHeight, setTerminalHeight] = useState(stdout.rows || 24);
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;

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

  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    mode: hasApiKey ? "input" : "setup",
    url: initialUrl || "",
    goals: initialGoals || "",
  });

  // Event handler for QA runner
  const handleEvent = useCallback((event: SSEEvent) => {
    dispatch({ type: "PROCESS_EVENT", event });
  }, []);

  // QA runner hook
  const { startRun, isRunning } = useQARunner(handleEvent);

  // Start run automatically if URL provided via CLI
  useEffect(() => {
    if (initialUrl && hasApiKey && state.mode === "input") {
      handleStartRun(initialUrl, initialGoals);
    }
  }, []);

  // Handle starting the QA run
  const handleStartRun = useCallback(
    async (url: string, goals?: string) => {
      dispatch({ type: "SET_URL", url });
      if (goals) dispatch({ type: "SET_GOALS", goals });
      dispatch({ type: "START_RUN" });

      try {
        await startRun(url, goals);
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [startRun]
  );

  // Handle URL submit from input
  const handleUrlSubmit = useCallback(
    (url: string) => {
      handleStartRun(url, state.goals || undefined);
    },
    [handleStartRun, state.goals]
  );

  // Keyboard shortcuts
  useInput((input, key) => {
    // Quit on 'q' or Ctrl+C (except during running)
    if (input === "q" && state.mode !== "running") {
      exit();
    }

    // Retry on 'r' after error
    if (input === "r" && state.mode === "error") {
      dispatch({ type: "RESET" });
    }

    // Return on Enter after setup
    if (key.return && state.mode === "setup") {
      if (process.env.OPENROUTER_API_KEY) {
        dispatch({ type: "SET_MODE", mode: "input" });
      }
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
      {updateInfo && <UpdateNotification updateInfo={updateInfo} />}
      <Header />

      {state.mode === "setup" && <SetupPrompt />}

      {state.mode === "input" && (
        <UrlInput
          value={state.url}
          onChange={(url) => dispatch({ type: "SET_URL", url })}
          onSubmit={handleUrlSubmit}
        />
      )}

      {state.mode === "running" && (
        <Box 
          flexDirection="column" 
          marginTop={1}
          height={Math.max(20, terminalHeight - HEADER_HEIGHT - PADDING)}
          overflowY="hidden"
        >
          <PhaseIndicator
            currentPhase={state.currentPhase}
            completedPhases={state.completedPhases}
          />

          {/* Show full sitemap after discovery phase */}
          {state.sitemap.length > 0 && state.completedPhases.includes("discovery") && (
            <SitemapDisplay 
              sitemap={state.sitemap} 
              source={state.sitemapSource}
              maxHeight={Math.min(10, Math.floor((terminalHeight - HEADER_HEIGHT - PADDING) / 3))}
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

          <TaskList tasks={state.tasks} pages={state.pages} />

          <LogStream 
            logs={state.logs} 
            scrollOffset={state.logScrollOffset}
            maxLines={LOG_LINES}
          />
        </Box>
      )}

      {state.mode === "complete" && state.report && (
        <ResultsSummary report={state.report} />
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

import React, { useReducer, useEffect, useCallback, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { initialState } from "./types.js";
import type { AppState } from "./types.js";
import type { SSEEvent } from "../qa/progress-types.js";
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
import { ScenarioList } from "./components/ScenarioList.js";
import { UpdateNotification } from "./components/UpdateNotification.js";
import { KeyHints } from "./components/primitives/KeyHints.js";
import { useQARunner } from "./hooks/useQARunner.js";
import { appReducer } from "./state/app-state.js";
import { useViewportBudget } from "./layout/useViewportBudget.js";
import type { ViewportBudget } from "./layout/types.js";

interface AppProps {
  initialUrl?: string;
  initialGoals?: string;
  updateInfo?: UpdateInfo | null;
  jsonLogs?: boolean;
}

export const QA_RUNNING_HINTS = [
  { key: "↑/k", label: "scroll up" },
  { key: "↓/j", label: "scroll down" },
  { key: "PgUp/PgDn", label: "page" },
  { key: "g/G", label: "top/bottom" },
] as const;

interface AppRunningViewProps {
  state: AppState;
  budget: ViewportBudget;
}

export function AppRunningView({ state, budget }: AppRunningViewProps): React.ReactElement {
  const { sitemap: sitemapH, scenarios: scenariosH, tasks: tasksH, logs: logsH } = budget.sectionHeights;
  const completedCount = state.scenarios.filter((s) => s.status === "success" || s.status === "failed").length;

  return (
    <Box flexDirection="column" marginTop={1} height={budget.runningHeight} overflowY="hidden">
      {/* Phase indicator: always 2 lines (spinner row + badge row) */}
      <Box height={2} overflowY="hidden">
        <PhaseIndicator currentPhase={state.currentPhase} completedPhases={state.completedPhases} />
      </Box>

      {/* Sitemap: fixed-height slot (density-dependent, stable during run) */}
      {budget.visible.sitemap && (
        <Box flexDirection="column" marginTop={1} height={sitemapH} overflowY="hidden">
          {state.sitemap.length > 0 && state.completedPhases.includes("discovery") && (
            <SitemapDisplay
              sitemap={state.sitemap}
              source={state.sitemapSource}
              maxHeight={sitemapH}
              maxWidth={budget.columns - 4}
            />
          )}
        </Box>
      )}

      {/* Progress bar: always 1 line */}
      <Box marginTop={1} height={1}>
        <ProgressBar
          value={completedCount}
          total={state.totalScenarios}
          label="Scenarios"
        />
      </Box>

      {/* Scenarios: fixed-height slot */}
      {budget.visible.scenarios && (
        <Box flexDirection="column" marginTop={1} height={scenariosH} overflowY="hidden">
          {state.scenarios.length > 0 && (
            <ScenarioList
              scenarios={state.scenarios}
              maxHeight={scenariosH}
              maxWidth={budget.columns - 4}
            />
          )}
        </Box>
      )}

      {/* Tasks: fixed-height slot */}
      {budget.visible.tasks && (
        <Box flexDirection="column" marginTop={1} height={tasksH} overflowY="hidden">
          <TaskList tasks={state.tasks} maxHeight={tasksH} />
        </Box>
      )}

      {/* Key hints: always 1 line when visible */}
      {budget.showKeyHints && (
        <Box marginTop={1} height={1}>
          <KeyHints hints={[...QA_RUNNING_HINTS]} />
        </Box>
      )}

      {/* Log stream: fixed-height slot (logs = content lines, +2 for header) */}
      <Box flexDirection="column" marginTop={1} height={logsH + 2} overflowY="hidden">
        <LogStream
          logs={state.logs}
          scrollOffset={state.logScrollOffset}
          maxLines={logsH}
          autoFollow={state.autoFollowLogs}
        />
      </Box>
    </Box>
  );
}

export function App({ initialUrl, initialGoals, updateInfo, jsonLogs }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState({ rows: stdout.rows || 24, columns: stdout.columns || 80 });
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;
  const budget = useViewportBudget(terminalSize.rows, terminalSize.columns);

  useEffect(() => {
    const handleResize = () => {
      setTerminalSize({ rows: stdout.rows || 24, columns: stdout.columns || 80 });
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

  useEffect(() => {
    dispatch({ type: "SET_LOG_VIEW_LINES", lines: budget.sectionHeights.logs });
  }, [budget.sectionHeights.logs]);

  // Batch rapid SSE events into single reducer dispatches (~12 fps)
  const pendingEvents = useRef<SSEEvent[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushEvents = useCallback(() => {
    const events = pendingEvents.current;
    pendingEvents.current = [];
    flushTimer.current = null;
    if (events.length === 1) {
      dispatch({ type: "PROCESS_EVENT", event: events[0] });
    } else if (events.length > 1) {
      dispatch({ type: "PROCESS_EVENTS_BATCH", events });
    }
  }, []);

  const handleEvent = useCallback((event: SSEEvent) => {
    pendingEvents.current.push(event);
    if (!flushTimer.current) {
      flushTimer.current = setTimeout(flushEvents, 80);
    }
  }, [flushEvents]);

  useEffect(() => {
    return () => {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushEvents();
      }
    };
  }, [flushEvents]);

  const { startRun } = useQARunner(handleEvent, { jsonLogs });

  const handleStartRun = useCallback(
    async (url: string, goals?: string) => {
      dispatch({ type: "SET_URL", url });
      if (goals) dispatch({ type: "SET_GOALS", goals });
      dispatch({ type: "START_RUN" });

      try {
        await startRun({ url, goals });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [startRun]
  );

  useEffect(() => {
    if (initialUrl && hasApiKey && state.mode === "input") {
      dispatch({ type: "SET_URL", url: initialUrl });
      if (initialGoals) dispatch({ type: "SET_GOALS", goals: initialGoals });
      handleStartRun(initialUrl, initialGoals);
    }
  }, []);

  const handleUrlSubmit = useCallback(
    (url: string) => {
      handleStartRun(url, state.goals || undefined);
    },
    [handleStartRun, state.goals]
  );

  useInput((input, key) => {
    if (input === "q" && state.mode !== "running") {
      exit();
    }

    if (input === "r" && state.mode === "error") {
      dispatch({ type: "RESET" });
    }

    if (key.return && state.mode === "setup") {
      if (process.env.OPENROUTER_API_KEY) {
        dispatch({ type: "SET_MODE", mode: "input" });
      }
    }

    if (state.mode === "running") {
      const pageStep = Math.max(3, state.logViewLines - 1);

      if (key.upArrow || input === "k") {
        dispatch({ type: "SCROLL_LOGS", delta: -1 });
      }
      if (key.downArrow || input === "j") {
        dispatch({ type: "SCROLL_LOGS", delta: 1 });
      }
      if (key.pageUp) {
        dispatch({ type: "SCROLL_LOGS", delta: -pageStep });
      }
      if (key.pageDown) {
        dispatch({ type: "SCROLL_LOGS", delta: pageStep });
      }
      if (input === "g") {
        dispatch({ type: "JUMP_LOGS", position: "start" });
      }
      if (input === "G") {
        dispatch({ type: "JUMP_LOGS", position: "end" });
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

      {state.mode === "running" && <AppRunningView state={state} budget={budget} />}

      {state.mode === "complete" && state.report && <ResultsSummary report={state.report} />}

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

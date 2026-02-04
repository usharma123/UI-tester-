import React, { useReducer, useEffect, useCallback, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { initialState } from "./types.js";
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
import { useQARunner } from "./hooks/useQARunner.js";
import { appReducer, LOG_LINES } from "./state/app-state.js";

interface AppProps {
  initialUrl?: string;
  initialGoals?: string;
  updateInfo?: UpdateInfo | null;
  jsonLogs?: boolean;
}

// Fixed heights for layout components to prevent terminal reflow
const HEADER_HEIGHT = 3;
const PADDING = 2;

export function App({ initialUrl, initialGoals, updateInfo, jsonLogs }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalHeight, setTerminalHeight] = useState(stdout.rows || 24);
  const hasApiKey = !!process.env.OPENROUTER_API_KEY;

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

  const handleEvent = useCallback((event: SSEEvent) => {
    dispatch({ type: "PROCESS_EVENT", event });
  }, []);

  const { startRun, isRunning } = useQARunner(handleEvent, { jsonLogs });

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

  // Auto-start if URL provided via CLI
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

  // Keyboard shortcuts
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

          {state.sitemap.length > 0 && state.completedPhases.includes("discovery") && (
            <SitemapDisplay
              sitemap={state.sitemap}
              source={state.sitemapSource}
              maxHeight={Math.min(10, Math.floor((terminalHeight - HEADER_HEIGHT - PADDING) / 3))}
            />
          )}

          {state.totalScenarios > 0 && (
            <Box marginTop={1}>
              <ProgressBar
                value={state.scenarios.filter((s) => s.status === "success" || s.status === "failed").length}
                total={state.totalScenarios}
                label="Scenarios"
              />
            </Box>
          )}

          {state.scenarios.length > 0 && (
            <ScenarioList
              scenarios={state.scenarios}
              maxHeight={Math.min(15, Math.floor((terminalHeight - HEADER_HEIGHT - PADDING) / 3))}
            />
          )}

          <TaskList tasks={state.tasks} />

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

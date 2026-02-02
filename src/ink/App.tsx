import React, { useReducer, useEffect, useCallback, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { ExplorationMode } from "./types.js";
import { initialState } from "./types.js";
import type { SSEEvent } from "../qa/progress-types.js";
import type { UpdateInfo } from "../updates/types.js";
import { Header } from "./components/Header.js";
import { SetupPrompt } from "./components/SetupPrompt.js";
import { UrlInput } from "./components/UrlInput.js";
import { ModeSelector } from "./components/ModeSelector.js";
import { TaskList } from "./components/TaskList.js";
import { PhaseIndicator } from "./components/PhaseIndicator.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { LogStream } from "./components/LogStream.js";
import { ResultsSummary } from "./components/ResultsSummary.js";
import { SitemapDisplay } from "./components/SitemapDisplay.js";
import { UpdateNotification } from "./components/UpdateNotification.js";
import { useQARunner } from "./hooks/useQARunner.js";
import { appReducer, LOG_LINES } from "./state/app-state.js";

interface AppProps {
  initialUrl?: string;
  initialGoals?: string;
  initialExplorationMode?: ExplorationMode;
  updateInfo?: UpdateInfo | null;
}

// Fixed heights for layout components to prevent terminal reflow
const HEADER_HEIGHT = 3; // Header + padding
const PHASE_HEIGHT = 2; // Phase indicator
const PROGRESS_HEIGHT = 2; // Progress bar
const LOG_HEADER_HEIGHT = 2; // "Logs" label + margin
const PADDING = 2; // Top/bottom padding

export function App({ initialUrl, initialGoals, initialExplorationMode, updateInfo }: AppProps): React.ReactElement {
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
    explorationMode: initialExplorationMode || "coverage_guided",
  });

  // Event handler for QA runner
  const handleEvent = useCallback((event: SSEEvent) => {
    dispatch({ type: "PROCESS_EVENT", event });
  }, []);

  // QA runner hook
  const { startRun, isRunning } = useQARunner(handleEvent);

  // Handle URL provided via CLI
  useEffect(() => {
    if (initialUrl && hasApiKey && state.mode === "input") {
      dispatch({ type: "SET_URL", url: initialUrl });
      if (initialGoals) dispatch({ type: "SET_GOALS", goals: initialGoals });
      if (initialExplorationMode) {
        // Mode explicitly specified via CLI - skip mode selection and start
        dispatch({ type: "SET_EXPLORATION_MODE", explorationMode: initialExplorationMode });
        handleStartRun(initialUrl, initialGoals, initialExplorationMode);
      } else {
        // No mode specified - show mode selection screen
        dispatch({ type: "SET_MODE", mode: "mode_select" });
      }
    }
  }, []);

  // Handle starting the QA run
  const handleStartRun = useCallback(
    async (url: string, goals?: string, explorationMode?: ExplorationMode) => {
      dispatch({ type: "SET_URL", url });
      if (goals) dispatch({ type: "SET_GOALS", goals });
      dispatch({ type: "START_RUN" });

      try {
        await startRun({
          url,
          goals,
          explorationMode: explorationMode || state.explorationMode,
        });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [startRun, state.explorationMode]
  );

  // Handle URL submit from input - go to mode selection
  const handleUrlSubmit = useCallback(
    (url: string) => {
      dispatch({ type: "SET_URL", url });
      dispatch({ type: "SET_MODE", mode: "mode_select" });
    },
    []
  );

  // Handle mode selection submit - start the run
  const handleModeSubmit = useCallback(() => {
    handleStartRun(state.url, state.goals || undefined, state.explorationMode);
  }, [handleStartRun, state.url, state.goals, state.explorationMode]);

  // Handle exploration mode change
  const handleModeChange = useCallback((mode: ExplorationMode) => {
    dispatch({ type: "SET_EXPLORATION_MODE", explorationMode: mode });
  }, []);

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

      {state.mode === "mode_select" && (
        <Box flexDirection="column" marginTop={1}>
          <Box>
            <Text>URL: </Text>
            <Text color="cyan">{state.url}</Text>
          </Box>
          <ModeSelector
            selectedMode={state.explorationMode}
            onModeChange={handleModeChange}
            onSubmit={handleModeSubmit}
          />
        </Box>
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

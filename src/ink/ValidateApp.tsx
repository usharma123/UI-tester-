/**
 * Main app component for validation mode
 */

import React, { useReducer, useEffect, useCallback, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { initialValidateState } from "./validate-types.js";
import type { SSEEvent } from "../qa/progress-types.js";
import { Header } from "./components/Header.js";
import { LogStream } from "./components/LogStream.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { SitemapDisplay } from "./components/SitemapDisplay.js";
import { RequirementList } from "./components/RequirementList.js";
import { RubricDisplay } from "./components/RubricDisplay.js";
import { ValidationProgress } from "./components/ValidationProgress.js";
import { TraceabilityReport } from "./components/TraceabilityReport.js";
import { useValidationRunner } from "./hooks/useValidationRunner.js";
import { LOG_LINES, processValidationEvent, validateAppReducer } from "./state/validation-state.js";

interface ValidateAppProps {
  specFile: string;
  url: string;
  outputDir: string;
  jsonLogs?: boolean;
}


export function ValidateApp({
  specFile,
  url,
  outputDir,
  jsonLogs,
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
    processValidationEvent(event, dispatch);
  }, []);

  // Validation runner hook
  const { startRun, isRunning } = useValidationRunner(handleEvent, { jsonLogs });

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

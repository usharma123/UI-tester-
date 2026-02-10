/**
 * Main app component for validation mode
 */

import React, { useReducer, useEffect, useCallback, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { initialValidateState } from "./validate-types.js";
import type { ValidateAppState } from "./validate-types.js";
import type { SSEEvent } from "../qa/progress-types.js";
import { Header } from "./components/Header.js";
import { LogStream } from "./components/LogStream.js";
import { ProgressBar } from "./components/ProgressBar.js";
import { SitemapDisplay } from "./components/SitemapDisplay.js";
import { RequirementList } from "./components/RequirementList.js";
import { RubricDisplay } from "./components/RubricDisplay.js";
import { ValidationProgress } from "./components/ValidationProgress.js";
import { TraceabilityReport } from "./components/TraceabilityReport.js";
import { KeyHints } from "./components/primitives/KeyHints.js";
import { useValidationRunner } from "./hooks/useValidationRunner.js";
import { processValidationEvent, validateAppReducer } from "./state/validation-state.js";
import { useViewportBudget } from "./layout/useViewportBudget.js";
import type { ViewportBudget } from "./layout/types.js";

interface ValidateAppProps {
  specFile: string;
  url: string;
  outputDir: string;
  jsonLogs?: boolean;
}

export const VALIDATION_RUNNING_HINTS = [
  { key: "↑/k", label: "scroll up" },
  { key: "↓/j", label: "scroll down" },
  { key: "PgUp/PgDn", label: "page" },
  { key: "g/G", label: "top/bottom" },
] as const;

interface ValidateRunningViewProps {
  state: ValidateAppState;
  budget: ViewportBudget;
}

export function ValidateRunningView({ state, budget }: ValidateRunningViewProps): React.ReactElement {
  const { requirements: reqH, rubric: rubricH, sitemap: sitemapH, logs: logsH } = budget.sectionHeights;

  return (
    <Box flexDirection="column" marginTop={1} height={budget.runningHeight} overflowY="hidden">
      {/* Phase indicator: always 2 lines (spinner row + badge row) */}
      <Box height={2} overflowY="hidden">
        <ValidationProgress
          currentPhase={state.currentPhase}
          completedPhases={state.completedPhases}
        />
      </Box>

      {/* Requirements: fixed-height slot */}
      {budget.visible.requirements && (
        <Box flexDirection="column" marginTop={1} height={reqH} overflowY="hidden">
          {state.requirements.length > 0 && state.completedPhases.includes("extraction") && (
            <RequirementList
              requirements={state.requirements}
              maxHeight={reqH}
              maxWidth={budget.columns - 4}
            />
          )}
        </Box>
      )}

      {/* Rubric: fixed-height slot */}
      {budget.visible.rubric && (
        <Box flexDirection="column" marginTop={1} height={rubricH} overflowY="hidden">
          {state.rubric && state.completedPhases.includes("rubric") && (
            <RubricDisplay
              rubric={state.rubric}
              maxHeight={rubricH}
              maxWidth={budget.columns - 4}
            />
          )}
        </Box>
      )}

      {/* Sitemap: fixed-height slot */}
      {budget.visible.sitemap && (
        <Box flexDirection="column" marginTop={1} height={sitemapH} overflowY="hidden">
          {state.sitemap.length > 0 && state.completedPhases.includes("discovery") && (
            <SitemapDisplay
              sitemap={state.sitemap}
              source="discovered"
              maxHeight={sitemapH}
              maxWidth={budget.columns - 4}
            />
          )}
        </Box>
      )}

      {/* Progress bars: always 2 lines */}
      <Box marginTop={1} height={1}>
        <ProgressBar
          value={state.pagesProgress.tested + state.pagesProgress.skipped}
          total={state.pagesProgress.total}
          label="Pages"
        />
      </Box>
      <Box marginTop={1} height={1}>
        <ProgressBar
          value={state.validatedCount}
          total={state.requirements.length}
          label="Validating"
        />
      </Box>

      {/* Key hints: always 1 line when visible */}
      {budget.showKeyHints && (
        <Box marginTop={1} height={1}>
          <KeyHints hints={[...VALIDATION_RUNNING_HINTS]} />
        </Box>
      )}

      {/* Log stream: fixed-height slot */}
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

export function ValidateApp({
  specFile,
  url,
  outputDir,
  jsonLogs,
}: ValidateAppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [terminalSize, setTerminalSize] = useState({ rows: stdout.rows || 24, columns: stdout.columns || 80 });
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

  const [state, dispatch] = useReducer(validateAppReducer, {
    ...initialValidateState,
    specFile,
    url,
  });

  useEffect(() => {
    dispatch({ type: "SET_LOG_VIEW_LINES", lines: budget.sectionHeights.logs });
  }, [budget.sectionHeights.logs]);

  const handleEvent = useCallback((event: SSEEvent) => {
    processValidationEvent(event, dispatch);
  }, []);

  const { startRun } = useValidationRunner(handleEvent, { jsonLogs });

  useEffect(() => {
    if (state.mode === "input" && specFile && url) {
      dispatch({ type: "START_RUN" });
      startRun(specFile, url, outputDir);
    }
  }, []);

  useInput((input, key) => {
    if (input === "q" && state.mode !== "running") {
      exit();
    }

    if (input === "r" && state.mode === "error") {
      dispatch({ type: "RESET" });
      dispatch({ type: "START_RUN" });
      startRun(specFile, url, outputDir);
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
      <Header />

      <Box marginTop={1}>
        <Text dimColor>Validating: </Text>
        <Text color="cyan">{url}</Text>
        <Text dimColor> against </Text>
        <Text color="yellow">{specFile}</Text>
      </Box>

      {state.mode === "running" && <ValidateRunningView state={state} budget={budget} />}

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

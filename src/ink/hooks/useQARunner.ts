import { useState, useCallback, useRef } from "react";
import { join } from "node:path";
import { runQAStreaming, type StreamingRunOptions } from "../../qa/run-streaming.js";
import { loadConfig } from "../../config.js";
import type { SSEEvent } from "../../qa/progress-types.js";
import { createJsonEventLogger } from "../../core/events/json-logger.js";
import * as localStorage from "../../storage/local.js";

type EventHandler = (event: SSEEvent) => void;

interface StartRunOptions {
  url: string;
  goals?: string;
}

interface UseQARunnerOptions {
  jsonLogs?: boolean;
}

interface UseQARunnerResult {
  startRun: (options: StartRunOptions) => Promise<void>;
  isRunning: boolean;
  error: string | null;
}

export function useQARunner(onEvent: EventHandler, options: UseQARunnerOptions = {}): UseQARunnerResult {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const startRun = useCallback(
    async ({ url, goals }: StartRunOptions) => {
      if (isRunning) {
        return;
      }

      setIsRunning(true);
      setError(null);
      abortRef.current = false;
      const convexRunId = `cli-${Date.now()}`;
      const jsonLogsEnabled = options.jsonLogs || process.env.JSON_LOGS !== "false";
      const eventsFilePath = jsonLogsEnabled
        ? join(localStorage.getLocalStorageDir(), convexRunId, "events.jsonl")
        : undefined;
      const logEvent = jsonLogsEnabled
        ? createJsonEventLogger({ runId: convexRunId, filePath: eventsFilePath })
        : null;

      try {
        const config = loadConfig(goals ? { goals } : {});

        const runOptions: StreamingRunOptions = {
          config,
          url,
          goals: goals || config.goals,
          convexRunId,
          eventsFilePath,
          onProgress: (event: SSEEvent) => {
            if (!abortRef.current) {
              logEvent?.(event);
              onEvent(event);
            }
          },
        };

        await runQAStreaming(runOptions);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        const errorEvent: SSEEvent = {
          type: "error",
          message: errorMessage,
          timestamp: Date.now(),
        };
        logEvent?.(errorEvent);
        onEvent(errorEvent);
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, onEvent, options.jsonLogs]
  );

  return {
    startRun,
    isRunning,
    error,
  };
}

/**
 * Hook for running validation
 */

import { useState, useCallback, useRef } from "react";
import { join } from "node:path";
import { runValidation, type ValidationRunOptions } from "../../validation/run-validation.js";
import type { ValidationConfig } from "../../validation/types.js";
import { loadValidationConfig } from "../../validation/config.js";
import type { SSEEvent } from "../../qa/progress-types.js";
import { createJsonEventLogger } from "../../core/events/json-logger.js";
import * as localStorage from "../../storage/local.js";

type EventHandler = (event: SSEEvent) => void;

interface UseValidationRunnerResult {
  startRun: (specFile: string, url: string, outputDir: string) => Promise<void>;
  isRunning: boolean;
  error: string | null;
}

interface UseValidationRunnerOptions {
  jsonLogs?: boolean;
}

export function useValidationRunner(
  onEvent: EventHandler,
  options: UseValidationRunnerOptions = {}
): UseValidationRunnerResult {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const startRun = useCallback(
    async (specFile: string, url: string, outputDir: string) => {
      if (isRunning) {
        return;
      }

      setIsRunning(true);
      setError(null);
      abortRef.current = false;
      const runId = `validation-${Date.now()}`;
      const jsonLogsEnabled = options.jsonLogs || process.env.JSON_LOGS === "true";
      const eventsFilePath = jsonLogsEnabled
        ? join(localStorage.getLocalStorageDir(), runId, "events.jsonl")
        : undefined;
      const logEvent = jsonLogsEnabled && eventsFilePath
        ? createJsonEventLogger({ runId, filePath: eventsFilePath })
        : null;

      try {
        // Build config from environment
        const config: ValidationConfig = loadValidationConfig({ specFile, url, outputDir });

        if (!config.openRouterApiKey) {
          throw new Error("OPENROUTER_API_KEY is required");
        }

        const runOptions: ValidationRunOptions = {
          config,
          runId,
          eventsFilePath,
          onProgress: (event: SSEEvent) => {
            if (!abortRef.current) {
              logEvent?.(event);
              onEvent(event);
            }
          },
        };

        await runValidation(runOptions);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);

        // Emit error event
        const errorEvent: SSEEvent = {
          type: "validation_error",
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

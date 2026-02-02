/**
 * Hook for running validation
 */

import { useState, useCallback, useRef } from "react";
import { runValidation, type ValidationRunOptions } from "../../validation/run-validation.js";
import type { ValidationConfig } from "../../validation/types.js";
import { loadValidationConfig } from "../../validation/config.js";
import type { SSEEvent } from "../../qa/progress-types.js";

type EventHandler = (event: SSEEvent) => void;

interface UseValidationRunnerResult {
  startRun: (specFile: string, url: string, outputDir: string) => Promise<void>;
  isRunning: boolean;
  error: string | null;
}

export function useValidationRunner(onEvent: EventHandler): UseValidationRunnerResult {
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

      try {
        // Build config from environment
        const config: ValidationConfig = loadValidationConfig({ specFile, url, outputDir });

        if (!config.openRouterApiKey) {
          throw new Error("OPENROUTER_API_KEY is required");
        }

        const options: ValidationRunOptions = {
          config,
          onProgress: (event: SSEEvent) => {
            if (!abortRef.current) {
              onEvent(event);
            }
          },
        };

        await runValidation(options);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);

        // Emit error event
        onEvent({
          type: "validation_error",
          message: errorMessage,
          timestamp: Date.now(),
        });
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, onEvent]
  );

  return {
    startRun,
    isRunning,
    error,
  };
}

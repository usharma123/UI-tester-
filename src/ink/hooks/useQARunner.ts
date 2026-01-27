import { useState, useCallback, useRef } from "react";
import { runQAStreaming, type StreamingRunOptions } from "../../qa/run-streaming.js";
import { loadConfig } from "../../config.js";
import type { SSEEvent } from "../../qa/progress-types.js";

type EventHandler = (event: SSEEvent) => void;

interface UseQARunnerResult {
  startRun: (url: string, goals?: string) => Promise<void>;
  isRunning: boolean;
  error: string | null;
}

export function useQARunner(onEvent: EventHandler): UseQARunnerResult {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const startRun = useCallback(
    async (url: string, goals?: string) => {
      if (isRunning) {
        return;
      }

      setIsRunning(true);
      setError(null);
      abortRef.current = false;

      try {
        // Load config from environment
        const config = loadConfig(goals ? { goals } : {});

        // Generate a unique run ID for this CLI session
        // Since we're running locally, we don't have a Convex run ID
        // We'll use a timestamp-based ID
        const convexRunId = `cli-${Date.now()}`;

        const options: StreamingRunOptions = {
          config,
          url,
          goals: goals || config.goals,
          convexRunId,
          onProgress: (event: SSEEvent) => {
            if (!abortRef.current) {
              onEvent(event);
            }
          },
        };

        await runQAStreaming(options);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);

        // Emit error event
        onEvent({
          type: "error",
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

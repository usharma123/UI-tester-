import { useState, useCallback, useRef } from "react";
import { runQAStreaming, type StreamingRunOptions } from "../../qa/run-streaming.js";
import { loadConfig } from "../../config.js";
import type { SSEEvent } from "../../qa/progress-types.js";

type EventHandler = (event: SSEEvent) => void;

interface StartRunOptions {
  url: string;
  goals?: string;
}

interface UseQARunnerResult {
  startRun: (options: StartRunOptions) => Promise<void>;
  isRunning: boolean;
  error: string | null;
}

export function useQARunner(onEvent: EventHandler): UseQARunnerResult {
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

      try {
        const config = loadConfig(goals ? { goals } : {});
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

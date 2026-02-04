import type { Config } from "../config.js";
import type { Report, Evidence } from "./types.js";
import type { ProgressCallback } from "./progress-types.js";
import { emit } from "../core/events/emit.js";
import { runQAPipeline } from "./orchestrator.js";

export interface StreamingRunOptions {
  config: Config;
  url: string;
  goals?: string;
  convexRunId?: string;
  onProgress: ProgressCallback;
}

export interface StreamingRunResult {
  report: Report;
  evidence: Evidence;
}

export async function runQAStreaming(options: StreamingRunOptions): Promise<StreamingRunResult> {
  const { config, url, goals, onProgress } = options;
  const runId = options.convexRunId || `cli-${Date.now()}`;

  try {
    const { report, evidence } = await runQAPipeline({
      config,
      url,
      goals: goals || config.goals,
      runId,
      onProgress,
    });

    emit(onProgress, {
      type: "complete",
      report,
      evidence,
    });

    return { report, evidence };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    emit(onProgress, {
      type: "error",
      message: errorMessage,
    });

    throw error;
  }
}

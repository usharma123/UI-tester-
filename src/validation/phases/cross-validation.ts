import type { ProgressCallback } from "../../qa/progress-types.js";
import type { Requirement, Rubric, RequirementResult } from "../types.js";
import type { TestExecutionSummary } from "../cross-validator.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { crossValidate } from "../cross-validator.js";

export interface CrossValidationPhaseOptions {
  requirements: Requirement[];
  rubric: Rubric;
  testExecution: TestExecutionSummary;
  openRouterApiKey: string;
  openRouterModel: string;
  onProgress: ProgressCallback;
}

export async function runCrossValidationPhase(
  options: CrossValidationPhaseOptions
): Promise<RequirementResult[]> {
  const {
    requirements,
    rubric,
    testExecution,
    openRouterApiKey,
    openRouterModel,
    onProgress,
  } = options;

  emitValidationPhaseStart(onProgress, "cross_validation");
  emit(onProgress, {
    type: "log",
    message: "Cross-validating results against requirements...",
    level: "info",
  });

  const heartbeatIntervalMs = 15000;
  let elapsedMs = 0;
  const heartbeat = setInterval(() => {
    elapsedMs += heartbeatIntervalMs;
    emit(onProgress, {
      type: "log",
      message: `Cross-validation in progress... ${Math.round(elapsedMs / 1000)}s elapsed`,
      level: "info",
    });
  }, heartbeatIntervalMs);

  const results = await crossValidate(
    requirements,
    rubric.criteria,
    testExecution,
    openRouterApiKey,
    openRouterModel
  )
    .then((crossValidationResult) => crossValidationResult.results)
    .finally(() => clearInterval(heartbeat));

  for (let i = 0; i < results.length; i++) {
    emit(onProgress, {
      type: "requirement_validated",
      result: results[i],
      index: i,
      total: results.length,
    });
  }

  emitValidationPhaseComplete(onProgress, "cross_validation");

  return results;
}

import type { ProgressCallback } from "../../qa/progress-types.js";
import type { Requirement, Rubric } from "../types.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { generateRubric } from "../rubric-generator.js";

export interface RubricPhaseOptions {
  requirements: Requirement[];
  openRouterApiKey: string;
  openRouterModel: string;
  onProgress: ProgressCallback;
}

export async function runRubricPhase(options: RubricPhaseOptions): Promise<Rubric> {
  const { requirements, openRouterApiKey, openRouterModel, onProgress } = options;

  emitValidationPhaseStart(onProgress, "rubric");
  emit(onProgress, {
    type: "log",
    message: "Generating test rubric...",
    level: "info",
  });

  const rubricResult = await generateRubric(requirements, openRouterApiKey, openRouterModel);
  const rubric = rubricResult.rubric;

  emit(onProgress, {
    type: "rubric_generated",
    rubric,
  });
  emit(onProgress, {
    type: "log",
    message: `Generated rubric with ${rubric.criteria.length} criteria (max score: ${rubric.maxScore})`,
    level: "info",
  });

  emitValidationPhaseComplete(onProgress, "rubric");

  return rubric;
}

import type { ProgressCallback } from "../../qa/progress-types.js";
import type { ParsedDocument } from "../parsers/types.js";
import type { Requirement } from "../types.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { extractRequirements } from "../extractor.js";

export interface ExtractionPhaseOptions {
  document: ParsedDocument;
  openRouterApiKey: string;
  openRouterModel: string;
  onProgress: ProgressCallback;
}

export async function runExtractionPhase(options: ExtractionPhaseOptions): Promise<Requirement[]> {
  const { document, openRouterApiKey, openRouterModel, onProgress } = options;

  emitValidationPhaseStart(onProgress, "extraction");
  emit(onProgress, {
    type: "log",
    message: "Extracting requirements via LLM...",
    level: "info",
  });

  const extractionResult = await extractRequirements(
    document,
    openRouterApiKey,
    openRouterModel
  );
  const requirements = extractionResult.requirements;

  emit(onProgress, {
    type: "requirements_extracted",
    requirements,
    totalCount: requirements.length,
  });
  emit(onProgress, {
    type: "log",
    message: `Extracted ${requirements.length} requirements`,
    level: "info",
  });

  emitValidationPhaseComplete(onProgress, "extraction");

  return requirements;
}

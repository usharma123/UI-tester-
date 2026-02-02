import type { ProgressCallback } from "../../qa/progress-types.js";
import type { Requirement, Rubric, RequirementResult, TraceabilityReport } from "../types.js";
import { emit, emitValidationPhaseStart, emitValidationPhaseComplete } from "../../core/events/emit.js";
import { generateTraceabilityReport, saveTraceabilityReport, saveMarkdownSummary } from "../traceability.js";

export interface ReportingPhaseOptions {
  specFile: string;
  url: string;
  requirements: Requirement[];
  rubric: Rubric;
  results: RequirementResult[];
  outputDir: string;
  onProgress: ProgressCallback;
}

export interface ReportingPhaseResult {
  report: TraceabilityReport;
  reportPath: string;
  markdownPath: string;
}

export async function runReportingPhase(options: ReportingPhaseOptions): Promise<ReportingPhaseResult> {
  const { specFile, url, requirements, rubric, results, outputDir, onProgress } = options;

  emitValidationPhaseStart(onProgress, "reporting");
  emit(onProgress, {
    type: "log",
    message: "Generating traceability report...",
    level: "info",
  });

  const report = generateTraceabilityReport({
    specFile,
    url,
    requirements,
    rubric,
    results,
  });

  const reportPath = await saveTraceabilityReport(report, outputDir);
  const markdownPath = await saveMarkdownSummary(report, outputDir);

  emit(onProgress, {
    type: "log",
    message: `Report saved to ${reportPath}`,
    level: "info",
  });

  emit(onProgress, {
    type: "validation_complete",
    report,
  });

  emitValidationPhaseComplete(onProgress, "reporting");

  return { report, reportPath, markdownPath };
}

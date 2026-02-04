import { join } from "node:path";
import type { Config } from "../../config.js";
import type { ProgressCallback } from "../progress-types.js";
import type { Report, Evidence } from "../types.js";
import { emit, emitPhaseStart, emitPhaseComplete } from "../../core/events/emit.js";
import { evaluateEvidence } from "../judge.js";
import * as localStorage from "../../storage/local.js";

export interface EvaluationPhaseOptions {
  config: Config;
  onProgress: ProgressCallback;
  runId: string;
  evidence: Evidence;
  screenshotUrlMap: Record<string, string>;
}

export interface EvaluationPhaseResult {
  report: Report;
  evidence: Evidence;
}

export async function runEvaluationPhase(options: EvaluationPhaseOptions): Promise<EvaluationPhaseResult> {
  const { config, onProgress, runId, evidence, screenshotUrlMap } = options;

  emitPhaseStart(onProgress, "evaluation");
  emit(onProgress, { type: "log", message: "Evaluating test results...", level: "info" });

  const evidenceFilePath = join(localStorage.getLocalStorageDir(), runId, "screenshots");

  const { report: evaluatedReport } = await evaluateEvidence(config, evidence, evidenceFilePath);

  const reportWithUrls: Report = {
    ...evaluatedReport,
    artifacts: {
      ...evaluatedReport.artifacts,
      screenshots: evaluatedReport.artifacts.screenshots.map((path) => screenshotUrlMap[path] || path),
    },
  };

  reportWithUrls.issues = reportWithUrls.issues.map((issue) => ({
    ...issue,
    evidence: issue.evidence.map((path) => screenshotUrlMap[path] || path),
  }));

  const evidenceWithUrls: Evidence = {
    ...evidence,
    screenshotMap: Object.fromEntries(
      Object.entries(evidence.screenshotMap).map(([path, idx]) => [
        screenshotUrlMap[path] || path,
        idx,
      ])
    ),
  };

  try {
    await localStorage.completeLocalRun(
      runId,
      reportWithUrls.score,
      reportWithUrls.summary,
      reportWithUrls,
      evidenceWithUrls
    );

    const reportMdPath = await localStorage.generateReportMarkdown(runId, reportWithUrls);
    const llmFixPath = await localStorage.generateLlmFixFile(runId, reportWithUrls);

    reportWithUrls.artifacts.reportFile = reportMdPath;
    reportWithUrls.artifacts.llmFixFile = llmFixPath;

    emit(onProgress, {
      type: "log",
      message: `Results saved to ${localStorage.getLocalStorageDir()}/${runId}`,
      level: "info",
    });
    emit(onProgress, {
      type: "log",
      message: `Report: ${reportMdPath}`,
      level: "info",
    });
    emit(onProgress, {
      type: "log",
      message: `LLM Fix Guide: ${llmFixPath}`,
      level: "info",
    });
  } catch (error) {
    emit(onProgress, {
      type: "log",
      message: `Failed to save locally: ${error}`,
      level: "warn",
    });
  }

  emitPhaseComplete(onProgress, "evaluation");

  return { report: reportWithUrls, evidence: evidenceWithUrls };
}

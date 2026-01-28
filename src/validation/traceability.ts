/**
 * Traceability report generation
 */

import { promises as fs } from "fs";
import { join } from "path";
import type {
  Requirement,
  Rubric,
  RequirementResult,
  TraceabilityReport,
} from "./types.js";

export interface TraceabilityInput {
  specFile: string;
  url: string;
  requirements: Requirement[];
  rubric: Rubric;
  results: RequirementResult[];
}

/**
 * Calculate overall score based on weighted results
 */
function calculateOverallScore(
  results: RequirementResult[],
  rubric: Rubric
): number {
  if (results.length === 0 || rubric.maxScore === 0) {
    return 0;
  }

  const criteriaMap = new Map(
    rubric.criteria.map((c) => [c.requirementId, c.weight])
  );

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const result of results) {
    const weight = criteriaMap.get(result.requirementId) || 1;
    totalWeightedScore += (result.score / 100) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return 0;
  }

  return Math.round((totalWeightedScore / totalWeight) * 100);
}

/**
 * Calculate coverage score (% of requirements tested)
 */
function calculateCoverageScore(results: RequirementResult[]): number {
  if (results.length === 0) {
    return 0;
  }

  const tested = results.filter((r) => r.status !== "not_tested").length;
  return Math.round((tested / results.length) * 100);
}

/**
 * Generate summary text
 */
function generateSummary(
  results: RequirementResult[],
  overallScore: number,
  coverageScore: number
): string {
  const total = results.length;
  const passed = results.filter((r) => r.status === "pass").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const notTested = results.filter((r) => r.status === "not_tested").length;

  const tested = total - notTested;
  const parts: string[] = [];

  parts.push(`${tested}/${total} requirements tested.`);

  const statusParts: string[] = [];
  if (passed > 0) statusParts.push(`${passed} passed`);
  if (partial > 0) statusParts.push(`${partial} partial`);
  if (failed > 0) statusParts.push(`${failed} failed`);

  if (statusParts.length > 0) {
    parts.push(statusParts.join(", ") + ".");
  }

  parts.push(`Overall score: ${overallScore}/100.`);
  parts.push(`Coverage: ${coverageScore}%.`);

  return parts.join(" ");
}

/**
 * Generate a traceability report from validation results
 */
export function generateTraceabilityReport(
  input: TraceabilityInput
): TraceabilityReport {
  const overallScore = calculateOverallScore(input.results, input.rubric);
  const coverageScore = calculateCoverageScore(input.results);
  const summary = generateSummary(input.results, overallScore, coverageScore);

  return {
    specFile: input.specFile,
    url: input.url,
    requirements: input.requirements,
    rubric: input.rubric,
    results: input.results,
    overallScore,
    coverageScore,
    summary,
    timestamp: Date.now(),
  };
}

/**
 * Save traceability report to disk
 */
export async function saveTraceabilityReport(
  report: TraceabilityReport,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = new Date(report.timestamp)
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `traceability-report-${timestamp}.json`;
  const filePath = join(outputDir, filename);

  // Write report
  await fs.writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");

  return filePath;
}

/**
 * Generate a markdown summary of the traceability report
 */
export function generateMarkdownSummary(report: TraceabilityReport): string {
  const lines: string[] = [];

  lines.push(`# Traceability Report`);
  lines.push("");
  lines.push(`**Specification:** ${report.specFile}`);
  lines.push(`**URL:** ${report.url}`);
  lines.push(`**Date:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- **Overall Score:** ${report.overallScore}/100`);
  lines.push(`- **Coverage:** ${report.coverageScore}%`);
  lines.push(`- ${report.summary}`);
  lines.push("");
  lines.push(`## Results by Requirement`);
  lines.push("");

  for (const req of report.requirements) {
    const result = report.results.find((r) => r.requirementId === req.id);
    if (!result) continue;

    const statusEmoji =
      result.status === "pass"
        ? "[PASS]"
        : result.status === "partial"
          ? "[PARTIAL]"
          : result.status === "fail"
            ? "[FAIL]"
            : "[NOT TESTED]";

    lines.push(`### ${req.id}: ${req.summary}`);
    lines.push("");
    lines.push(`**Status:** ${statusEmoji} (Score: ${result.score}/100)`);
    lines.push("");
    lines.push(`**Reasoning:** ${result.reasoning}`);
    lines.push("");

    if (result.evidence.length > 0) {
      lines.push(`**Evidence:**`);
      for (const e of result.evidence) {
        lines.push(`- ${e}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Save markdown summary to disk
 */
export async function saveMarkdownSummary(
  report: TraceabilityReport,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = new Date(report.timestamp)
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19);
  const filename = `traceability-report-${timestamp}.md`;
  const filePath = join(outputDir, filename);

  // Generate and write markdown
  const markdown = generateMarkdownSummary(report);
  await fs.writeFile(filePath, markdown, "utf-8");

  return filePath;
}

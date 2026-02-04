// =============================================================================
// Reporter: aggregates test results, asks LLM for summary/score
// =============================================================================

import type { TestResult, Report, QAReport } from "./types.js";
import type { LLMClient, LLMMessage } from "./llm.js";
import { extractJson } from "./llm.js";
import { REPORTER_SYSTEM_PROMPT, buildReporterPrompt } from "./prompts.js";
import { safeParseReport } from "./schemas.js";

export interface GenerateReportOptions {
  url: string;
  results: TestResult[];
  llm: LLMClient;
  evidenceFilePath: string;
}

export async function generateReport(options: GenerateReportOptions): Promise<{ report: Report; qaReport: QAReport }> {
  const { url, results, llm, evidenceFilePath } = options;

  // Format results for the LLM
  const formattedResults = results.map((r) => ({
    title: r.scenario.title,
    status: r.status,
    summary: r.summary,
    steps: r.steps.map((s) => ({
      action: `${s.action.type}${s.action.selector ? `(${s.action.selector})` : ""}${s.action.value ? ` "${s.action.value}"` : ""}`,
      success: s.success,
      error: s.error,
    })),
    screenshots: r.evidence.screenshots,
  }));

  const allScreenshots = results.flatMap((r) => r.evidence.screenshots);

  const userPrompt = buildReporterPrompt(url, formattedResults, evidenceFilePath);
  const messages: LLMMessage[] = [
    { role: "system", content: REPORTER_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const retryMessages = [...messages];
    if (attempt > 0 && lastError) {
      retryMessages.push({
        role: "user",
        content: `Previous response was invalid JSON: ${lastError.message}\nPlease output ONLY valid JSON.`,
      });
    }

    const raw = await llm.chat(retryMessages, { temperature: 0.1, maxTokens: 6000 });

    try {
      const json = extractJson(raw);
      const parsed = JSON.parse(json);

      // Ensure artifacts exist
      parsed.artifacts = parsed.artifacts || {};
      parsed.artifacts.screenshots = allScreenshots;
      parsed.artifacts.evidenceFile = evidenceFilePath;

      const validated = safeParseReport(parsed);
      if (validated.success) {
        const report = validated.data;

        // Build QAReport from results
        const qaReport: QAReport = {
          url,
          timestamp: new Date().toISOString(),
          scenarios: results,
          summary: report.summary,
          overallScore: report.score,
          issueCount: {
            critical: report.issues.filter((i) => i.severity === "blocker").length,
            high: report.issues.filter((i) => i.severity === "high").length,
            medium: report.issues.filter((i) => i.severity === "medium").length,
            low: report.issues.filter((i) => i.severity === "low" || i.severity === "nit").length,
          },
        };

        return { report, qaReport };
      }

      lastError = new Error(`Schema validation: ${validated.error.issues.map((e: { message: string }) => e.message).join(", ")}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Failed to generate report after 2 attempts: ${lastError?.message}`);
}

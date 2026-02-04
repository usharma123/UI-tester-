// =============================================================================
// Judge: LLM evaluation of test evidence (simplified — reporter handles most)
// =============================================================================

import type { Config } from "../config.js";
import type { Report, Evidence } from "./types.js";
import { createLLMClient, extractJson } from "./llm.js";
import { safeParseReport } from "./schemas.js";
import { REPORTER_SYSTEM_PROMPT, buildReporterPrompt } from "./prompts.js";

export interface JudgeResult {
  report: Report;
  rawResponse: string;
}

export async function evaluateEvidence(
  config: Config,
  evidence: Evidence,
  evidenceFilePath: string
): Promise<JudgeResult> {
  const llm = createLLMClient(config);

  const formattedResults = evidence.scenarios.map((r) => ({
    title: r.scenario.title,
    status: r.status,
    summary: r.summary,
    steps: r.steps.map((s) => ({
      action: `${s.action.type}${s.action.selector ? `(${s.action.selector})` : ""}`,
      success: s.success,
      error: s.error,
    })),
    screenshots: r.evidence.screenshots,
  }));

  const allScreenshots = evidence.scenarios.flatMap((r) => r.evidence.screenshots);
  const url = evidence.scenarios[0]?.scenario.startUrl ?? "";

  const userPrompt = buildReporterPrompt(url, formattedResults, evidenceFilePath);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await llm.chat(
      [
        { role: "system", content: REPORTER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
        ...(attempt > 0 && lastError
          ? [{ role: "user" as const, content: `Previous was invalid JSON: ${lastError.message}. Output ONLY valid JSON.` }]
          : []),
      ],
      { temperature: 0.1, maxTokens: 6000 }
    );

    try {
      const json = extractJson(raw);
      const parsed = JSON.parse(json);

      parsed.artifacts = parsed.artifacts || {};
      parsed.artifacts.screenshots = allScreenshots;
      parsed.artifacts.evidenceFile = evidenceFilePath;

      const validated = safeParseReport(parsed);
      if (validated.success) {
        return { report: validated.data, rawResponse: raw };
      }

      lastError = new Error(
        `Schema validation: ${validated.error.issues.map((e: { message: string }) => e.message).join(", ")}`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(`Failed to generate report after 2 attempts: ${lastError?.message}`);
}

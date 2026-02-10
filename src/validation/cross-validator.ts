/**
 * Cross-validation of test results against requirements
 */

import OpenAI from "openai";
import type { Requirement, RubricCriterion, RequirementResult } from "./types.js";
import type { ValidationProbeResult } from "./probes/types.js";
import { safeParseCrossValidationResults } from "./schemas.js";
import {
  CROSS_VALIDATOR_SYSTEM_PROMPT,
  buildCrossValidatorPrompt,
} from "../prompts/cross-validator.js";

export interface ScenarioRunSummary {
  scenarioId: string;
  title: string;
  status: string;
  summary: string;
  requirementIds: string[];
  steps: Array<{
    action: string;
    success: boolean;
    error?: string;
  }>;
}

export interface TestExecutionSummary {
  pagesVisited: string[];
  stepsExecuted: Array<{
    type: string;
    selector?: string;
    result: string;
    screenshot?: string;
  }>;
  errors: string[];
  screenshots: string[];
  scenarioRuns: ScenarioRunSummary[];
  probeResults: ValidationProbeResult[];
}

export interface CrossValidationResult {
  results: RequirementResult[];
  rawResponse: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Extract JSON from a response that may contain markdown code blocks
 */
function extractJson(text: string): string {
  // Try to find JSON in markdown code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Fall back to finding raw JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return text;
}

/**
 * Cross-validate test results against requirements using LLM
 */
export async function crossValidate(
  requirements: Requirement[],
  rubricCriteria: RubricCriterion[],
  testResults: TestExecutionSummary,
  apiKey: string,
  model: string
): Promise<CrossValidationResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const userPrompt = buildCrossValidatorPrompt(
    requirements,
    rubricCriteria,
    testResults
  );

  let lastError: Error | null = null;
  const maxRetries = 3;
  const timeoutMs = parseInt(process.env.CROSS_VALIDATION_TIMEOUT_MS ?? process.env.LLM_TIMEOUT_MS ?? "90000", 10);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: CROSS_VALIDATOR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ];

    if (attempt > 0 && lastError) {
      messages.push({
        role: "user",
        content: `Your previous response was invalid JSON. Error: ${lastError.message}\n\nPlease output ONLY valid JSON matching the schema. No markdown, no explanation.`,
      });
    }

    try {
      const response = await withTimeout(
        client.chat.completions.create({
          model,
          messages,
          temperature: 0.2,
          max_tokens: 8000,
        }),
        timeoutMs,
        "Cross-validation request"
      );

      const rawResponse = response.choices[0]?.message?.content ?? "";
      const jsonStr = extractJson(rawResponse);
      const parsed = JSON.parse(jsonStr);
      const validated = safeParseCrossValidationResults(parsed);

      if (validated.success) {
        // Ensure all requirements have results
        const resultMap = new Map(
          validated.data.results.map((r) => [r.requirementId, r])
        );

        const results: RequirementResult[] = requirements.map((req) => {
          const existing = resultMap.get(req.id);
          if (existing) {
            return existing;
          }
          // Default result for missing requirements
          return {
            requirementId: req.id,
            status: "not_tested" as const,
            score: 0,
            evidence: [],
            reasoning: "Requirement was not covered by test execution",
          };
        });

        return {
          results,
          rawResponse,
        };
      }

      lastError = new Error(
        `Schema validation failed: ${validated.error.issues.map((e: { message: string }) => e.message).join(", ")}`
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    `Failed to cross-validate after ${maxRetries} attempts: ${lastError?.message}`
  );
}

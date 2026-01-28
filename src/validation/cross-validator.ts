/**
 * Cross-validation of test results against requirements
 */

import OpenAI from "openai";
import type { Requirement, RubricCriterion, RequirementResult } from "./types.js";
import { safeParseCrossValidationResults } from "./schemas.js";
import {
  CROSS_VALIDATOR_SYSTEM_PROMPT,
  buildCrossValidatorPrompt,
} from "../prompts/cross-validator.js";

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
}

export interface CrossValidationResult {
  results: RequirementResult[];
  rawResponse: string;
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
  const maxRetries = 2;

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

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 8000,
    });

    const rawResponse = response.choices[0]?.message?.content ?? "";

    try {
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
        `Schema validation failed: ${validated.error.errors.map((e) => e.message).join(", ")}`
      );
    } catch (parseError) {
      lastError =
        parseError instanceof Error ? parseError : new Error(String(parseError));
    }
  }

  throw new Error(
    `Failed to cross-validate after ${maxRetries} attempts: ${lastError?.message}`
  );
}

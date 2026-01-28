/**
 * LLM-based rubric generation from requirements
 */

import OpenAI from "openai";
import type { Requirement, Rubric } from "./types.js";
import { safeParseRubric } from "./schemas.js";
import { RUBRIC_SYSTEM_PROMPT, buildRubricPrompt } from "../prompts/rubric.js";

export interface RubricGenerationResult {
  rubric: Rubric;
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
 * Generate a test rubric from requirements using LLM
 */
export async function generateRubric(
  requirements: Requirement[],
  apiKey: string,
  model: string
): Promise<RubricGenerationResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const userPrompt = buildRubricPrompt(requirements);

  let lastError: Error | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: RUBRIC_SYSTEM_PROMPT },
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
      max_tokens: 4000,
    });

    const rawResponse = response.choices[0]?.message?.content ?? "";

    try {
      const jsonStr = extractJson(rawResponse);
      const parsed = JSON.parse(jsonStr);
      const validated = safeParseRubric(parsed);

      if (validated.success) {
        // Ensure maxScore is correctly calculated
        const totalWeight = validated.data.criteria.reduce(
          (sum, c) => sum + c.weight,
          0
        );

        const rubric: Rubric = {
          ...validated.data,
          maxScore: totalWeight,
        };

        return {
          rubric,
          rawResponse,
        };
      }

      lastError = new Error(
        `Schema validation failed: ${validated.error.issues.map((e: { message: string }) => e.message).join(", ")}`
      );
    } catch (parseError) {
      lastError =
        parseError instanceof Error ? parseError : new Error(String(parseError));
    }
  }

  throw new Error(
    `Failed to generate rubric after ${maxRetries} attempts: ${lastError?.message}`
  );
}

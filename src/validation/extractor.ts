/**
 * LLM-based requirement extraction from specification documents
 */

import OpenAI from "openai";
import type { Requirement } from "./types.js";
import type { ParsedDocument } from "./parsers/types.js";
import { safeParseRequirements } from "./schemas.js";
import {
  EXTRACTOR_SYSTEM_PROMPT,
  buildExtractorPrompt,
} from "../prompts/extractor.js";

export interface ExtractionResult {
  requirements: Requirement[];
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
 * Extract requirements from a parsed document using LLM
 */
export async function extractRequirements(
  document: ParsedDocument,
  apiKey: string,
  model: string
): Promise<ExtractionResult> {
  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const sections = document.sections.map((s) => ({
    heading: s.heading,
    content: s.content,
    startLine: s.startLine,
  }));

  const userPrompt = buildExtractorPrompt(
    document.filePath,
    document.rawContent,
    sections
  );

  let lastError: Error | null = null;
  const maxRetries = 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: EXTRACTOR_SYSTEM_PROMPT },
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
      temperature: 0.2, // Lower temperature for more consistent extraction
      max_tokens: 8000, // Requirements can be lengthy
    });

    const rawResponse = response.choices[0]?.message?.content ?? "";

    try {
      const jsonStr = extractJson(rawResponse);
      const parsed = JSON.parse(jsonStr);
      const validated = safeParseRequirements(parsed);

      if (validated.success) {
        // Ensure IDs are sequential
        const requirements = validated.data.requirements.map((req, index) => ({
          ...req,
          id: `REQ-${String(index + 1).padStart(3, "0")}`,
          sourceLocation: {
            ...req.sourceLocation,
            file: document.filePath,
          },
        }));

        return {
          requirements,
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
    `Failed to extract requirements after ${maxRetries} attempts: ${lastError?.message}`
  );
}
